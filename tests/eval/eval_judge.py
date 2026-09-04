# -*- coding: utf-8 -*-
"""EVAL-1 Wave 2 裁判脚本（L1 引用核验 + L2 异厂商复判 + difficulty 评定 + fit/coverage）。

前置：PYTHONPATH=backend（复用 backend/eval/judges 三裁判 + eval.run_eval 汇总纯函数）。
判卷通道（--judge-provider）：
  zhipu（默认，go 决策）：智谱 glm-4-flash，免费真异厂；key 解析链
    --judge-key → 环境变量 JUDGE_API_KEY → evaluation/config.py（本地不入 git 的便利件）。
  sf：硅基流动（旧路径），必需 --replica-db 从副本库 settings 读凭据（内存用，绝不打印/落盘）。
陷阱事实：默认加载同目录 eval_annotations.json，L2 提示词注入错误说法清单，
  回答复述即记 trap_hits（文件缺失自动降级为无陷阱判卷）。
报告增强：审核门工作证据（resets/L0 结论/断言级 by_diag）+ difficulty 校准表
  （rubric 判分 vs 流内 level_score 偏差分布）+ 运行元信息（tier/models 进 meta）。
产出：evidence/cases/<id>/judge-L1.json|judge-L2.json|eval.json + results-final.json
      + evidence/summary/report-final-<stamp>.json|.md（存档）
      + evidence/summary/report-final.json|.md（固定路径最新版，查看同 evaluation 体验；
        雷达图跑 python tests/eval/eval_report_html.py）
用法：
  set PYTHONPATH=backend
  python tests/eval/eval_judge.py --evidence docs/submission/evidence
"""
import argparse
import glob
import json
import os
import re
import sqlite3
import sys
import time

import openai

from eval.judges import coverage, fit, hallucination
from eval.run_eval import evaluate, render_markdown

SF_BASE_DEFAULT = "https://api.siliconflow.cn/v1"
ZHIPU_BASE_DEFAULT = "https://open.bigmodel.cn/api/paas/v4"
ZHIPU_MODEL_DEFAULT = "glm-4-flash"
HERE = os.path.dirname(os.path.abspath(__file__))
ANNOTATIONS_PATH_DEFAULT = os.path.join(HERE, "eval_annotations.json")

DIFFICULTY_RUBRIC = (
    "你是学习资源难度评定员。对下面的回答按 0-1 评定内容难度（不是质量）：\n"
    "0.0-0.2 零基础可读（白话、生活化类比、无公式）\n"
    "0.2-0.4 有基础可读（少量术语且随文解释）\n"
    "0.4-0.6 需要专业基础（出现公式/参数级细节）\n"
    "0.6-0.8 需要熟练实践经验（工程权衡、边界条件、选型对比）\n"
    "0.8-1.0 专家级（研究型细节、性能/底层机制深挖）\n"
    # CALIB：锚定量表——glm-4-flash 无锚点时 9 例恒评 0.6 实证修复
    "评分锚点（按答案内容的实际深浅定位）：0.0-0.2=纯生活化类比科普，无公式、术语均有白话解释；\n"
    "0.3-0.4=定义加直观例子，少量术语且均有中文解释，无推导；\n"
    "0.5-0.6=系统性讲解，含公式或代码，术语较密集；\n"
    "0.7-0.8=含推导步骤或高阶专题，密度高；\n"
    "0.9-1.0=论文级。评分只依据答案内容本身的深浅，与提问者是谁无关。\n"
    "只输出 JSON：{\"difficulty\": 0到1的小数, \"basis\": \"一句话依据\"}\n"
)

L2_PROMPT = (
    "你是独立事实核查员（与回答生成者不同源）。依据参考上下文判断回答是否含虚构事实。\n"
    "参考上下文为该学习者知识库的文档清单（回答应能回指其中来源）。\n"
    "只输出 JSON：{\"hallucinated\": true|false, \"suspicious_claims\": [\"可疑断言\", ...]}\n"
)


def load_sf_creds(replica_db):
    """从副本库 settings 读硅基流动 key 与 base_url（只在内存传递）。"""
    con = sqlite3.connect(replica_db)
    kv = {k: v for k, v in con.execute("SELECT key, value FROM settings")}
    con.close()
    key = kv.get("VL_API_KEY") or kv.get("EMBEDDING_API_KEY") or ""
    base = kv.get("VL_BASE_URL") or kv.get("EMBEDDING_BASE_URL") or SF_BASE_DEFAULT
    if not key:
        raise SystemExit("[judge] 副本库无硅基流动 key（VL_API_KEY/EMBEDDING_API_KEY 均缺）")
    return key, base


def _read_zhipu_key_from_local_config():
    """本机便利件：从 evaluation/config.py 抽 JUDGE_API_KEY（该目录不入 git，仅本地存在）。"""
    import re
    cand = os.path.join(HERE, "..", "..", "evaluation", "config.py")
    try:
        text = open(cand, encoding="utf-8").read()
        m = re.search(r'JUDGE_API_KEY\s*=\s*"([^"]+)"', text)
        return m.group(1) if m else ""
    except Exception:
        return ""


def build_judge_client(args):
    """判卷客户端装配。zhipu（默认，免费异厂）key 三级回退：
    --judge-key → 环境变量 JUDGE_API_KEY → evaluation/config.py；sf 走旧副本库路径。"""
    if args.judge_provider == "zhipu":
        key = args.judge_key or os.environ.get("JUDGE_API_KEY", "") \
            or _read_zhipu_key_from_local_config()
        if not key:
            raise SystemExit("[judge] 智谱 key 未配置：--judge-key / 环境变量 "
                             "JUDGE_API_KEY / evaluation/config.py 三者其一")
        base = args.judge_base_url or os.environ.get("JUDGE_BASE_URL", "") \
            or ZHIPU_BASE_DEFAULT
        model = args.judge_model or ZHIPU_MODEL_DEFAULT
        return openai.OpenAI(api_key=key, base_url=base), model
    key, base = load_sf_creds(args.replica_db)
    model = args.judge_model or "Qwen/Qwen2.5-7B-Instruct"
    return openai.OpenAI(api_key=key, base_url=base), model


def load_trap_facts(path):
    """读陷阱事实清单；文件缺失/格式不符 → 空表（L2 降级为无陷阱判卷，不阻断）。"""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return [t for t in (data.get("trap_facts") or [])
                if isinstance(t, dict) and (t.get("claim") or "").strip()]
    except Exception:
        return []


def _norm_text(s):
    import re
    # 去空白 + 常见中英标点——配对比较只看实词序列，防"句读差异"漏配
    return re.sub(r"[\s，。；：、,.;:\"'“”‘’（）()\[\]【】]+", "", str(s or "")).lower()


def match_trap_hits(suspicious, traps):
    """启发式配对：可疑断言 × 陷阱说法的归一化前缀包含（12 字符）双向匹配。"""
    hits = []
    sus_norms = [_norm_text(s) for s in suspicious or []]
    for t in traps or []:
        c = _norm_text(t.get("claim"))
        if not c:
            continue
        head = c[:12]
        if any(head and (head in s or (s[:12] and s[:12] in c)) for s in sus_norms):
            hits.append({"claim": str(t.get("claim"))[:120],
                         "truth": str(t.get("truth") or "")[:120]})
    return hits


def _chat(client, model, prompt, max_tokens=300):
    """温度 0 判卷；返回解析后的 dict 或 {'skipped': True}。"""
    try:
        resp = client.chat.completions.create(
            model=model, temperature=0, max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}])
        raw = resp.choices[0].message.content or ""
        import re
        m = re.search(r"\{[\s\S]*\}", raw)
        return json.loads(m.group()) if m else {"skipped": True}
    except Exception as e:  # noqa: BLE001 —— 跳过并留痕，不静默
        return {"skipped": True, "error": str(e)[:150]}


def extract_retrieval_sources(mindchain):
    """从思维链「知识库管理/召回审核」条目解析命中标题（_format_search_detail 行格式：
    'N. 标题（融合分 x）：摘要'）。L1 可核验源集合 = KB 清单 ∪ 这些当轮真实命中。"""
    import re
    titles = []
    for m in mindchain or []:
        if m.get("agent") in ("知识库管理", "召回审核"):
            for line in (m.get("content") or "").splitlines():
                mm = re.match(r"\s*\d+\.\s+(.+?)（融合分", line)
                if mm:
                    titles.append(mm.group(1).strip())
    return titles


def judge_case(entry, client, model, traps=None):
    cid = entry.get("case_id") or ""
    answer = entry.get("answer") or ""
    retrieval_sources = extract_retrieval_sources(entry.get("mindchain"))
    kb_sources = entry.get("kb_sources") or []
    sources = list(dict.fromkeys(kb_sources + retrieval_sources))
    out = {"case_id": cid, "retrieval_confirmed_sources": retrieval_sources}

    # L1 程序引用核验：源集合 = KB 入库文档 ∪ 当轮检索命中（思维链留存）。
    # 未匹配引用 ≠ 直接判幻觉——web 命中深于 top3 预览时清单截断，全部进 L3 定向裁决。
    out["L1"] = hallucination.verify_citations(answer, sources)
    out["L1"]["source_set_size"] = len(sources)
    out["L1"]["note"] = ("invalid 项=未匹配可核验源，交 L3 定向裁决（真实但未入预览的"
                         "web 命中不判幻觉）")

    # L2 异厂商复判（异厂模型判 DeepSeek 产出，温度 0；带陷阱事实主动诱捕）
    trap_block = ""
    if traps:
        trap_block = ("\n【陷阱事实·领域常见错误说法，回答若复述或附和即为判错】"
                      + "；".join(str(t.get("claim")) for t in traps[:20]))
    src_list = "\n".join(f"- {s}" for s in sources[:25])
    l2 = _chat(client, model,
               L2_PROMPT + trap_block
               + f"\n【知识库文档清单】\n{src_list}\n【待核查回答】{answer[:2000]}")
    suspicious = [str(x)[:120] for x in (l2.get("suspicious_claims") or [])]
    out["L2"] = {"hallucinated": l2.get("hallucinated"),
                 "suspicious_claims": suspicious,
                 "trap_hits": match_trap_hits(suspicious, traps),
                 "skipped": bool(l2.get("skipped")),
                 "error": l2.get("error")}

    # difficulty 独立评定（问答主链路无生成侧自标字段，口径偏离已在评估方案与报告声明）
    if answer.strip():
        d = _chat(client, model, DIFFICULTY_RUBRIC + f"【回答】{answer[:2500]}")
        try:
            out["difficulty"] = max(0.0, min(1.0, float(d.get("difficulty"))))
            out["difficulty_basis"] = str(d.get("basis"))[:120]
        except (TypeError, ValueError):
            out["difficulty"] = None
            out["difficulty_skipped"] = bool(d.get("skipped"))
    else:
        out["difficulty"] = None

    # fit（容差带）
    ls, df = entry.get("level_score"), out["difficulty"]
    if ls is not None and df is not None:
        out["fit"] = fit.fit_consistent(ls, df)
    else:
        out["fit"] = None

    # coverage（关键词通道）
    kps = entry.get("expect_kps") or []
    if kps and answer.strip():
        out["coverage"] = coverage.hit_kps(answer, kps)
    else:
        out["coverage"] = None
    return out


def summarize_denominator(results):
    """P0-S3 分母诚实化（单一事实源，main 与单测复用）：
    口径：基础口径=非 IF 样本；有效=无 error 且回答非空白；失败/空=基础口径中其余样本。
    三硬指标分母仍只取有效集（EVAL-1 协议不动），但失败/空总量与有效占比必须显性入
    汇总——堵「失败/空样本悄悄蒸发出分母」的两处灌水口（旧 :154-156 跳过失败条、
    :182-184 过滤空回答且汇总零呈现）。池空时 valid_ratio=None（不造 0 分母）。
    返回 (denom 字段 dict, 有效样本列表)，有效样本列表供 evaluate 沿用原口径。"""
    pool = [r for r in results or [] if not (r.get("case_id") or "").startswith("IF")]
    valid = [r for r in pool if not r.get("error") and (r.get("answer") or "").strip()]
    fields = {"base_total": len(pool), "failed_total": len(pool) - len(valid),
              "valid_ratio": round(len(valid) / len(pool), 4) if pool else None}
    return fields, valid


def render_denominator_lines(denom):
    """P0-S3：md 报告与 JSON 汇总同步呈现分母诚实化。render_markdown 只渲染固定键
    （run_eval 属他域禁改），故在 judge 侧追加两行，保证报告里灌水口可见。"""
    return [
        f"- 分母诚实化：基础口径 {denom['base_total']} 条，"
        f"失败/空 {denom['failed_total']} 条未计入三指标（failed_total）",
        f"- 有效样本占比（valid_ratio）：{denom['valid_ratio']}",
    ]


def summarize_review_gate(base_cases):
    """审核门工作证据聚合（幻觉防控有效性的直接素材，喂创新性评分）：
    resets=审核打回重生成次数；review=L0 结论计数；by_diag=研究档断言级诊断分布。"""
    resets_total = sum(len(r.get("resets") or []) for r in base_cases)
    passed = sum(1 for r in base_cases if (r.get("review") or {}).get("passed") is True)
    failed = sum(1 for r in base_cases if (r.get("review") or {}).get("passed") is False)
    by_diag = {"hallucination": 0, "retrieval_gap": 0, "no_evidence": 0}
    claims_total = unsupported = 0
    for r in base_cases:
        rd = r.get("review_digest") or {}
        claims_total += int(rd.get("claims_total") or 0)
        unsupported += int(rd.get("unsupported") or 0)
        for k, v in (rd.get("by_diag") or {}).items():
            if k in by_diag:
                by_diag[k] += int(v or 0)
    return {"resets_total": resets_total,
            "cases_with_resets": sum(1 for r in base_cases if r.get("resets")),
            "review_passed": passed, "review_failed": failed,
            "claims_total": claims_total, "unsupported": unsupported,
            "by_diag": by_diag}


def render_review_gate_lines(gate):
    return [
        f"- 审核门证据：打回重稿 {gate['resets_total']} 次（涉及 "
        f"{gate['cases_with_resets']} 例），L0 通过 {gate['review_passed']} / "
        f"未通过 {gate['review_failed']}",
        f"- 断言级审核（研究档）：claims {gate['claims_total']}，无证据支撑 "
        f"{gate['unsupported']}（幻觉 {gate['by_diag']['hallucination']} / "
        f"检索缺口 {gate['by_diag']['retrieval_gap']} / "
        f"无引用 {gate['by_diag']['no_evidence']}）",
    ]


def summarize_calibration(base_cases):
    """difficulty 校准表：rubric 判分 vs 流内 level_score 的偏差分布——
    适配率（目标 ≥85%）标定改进的数据源（dev = difficulty − level_score，容差 ±0.25）。"""
    pairs = []
    for r in base_cases:
        ls, df = r.get("level_score"), r.get("difficulty")
        if ls is None or df is None:
            continue
        pairs.append({"case_id": r.get("case_id"), "persona": r.get("persona"),
                      "level_score": ls, "difficulty": df,
                      "dev": round(float(df) - float(ls), 4)})
    if not pairs:
        return {"n": 0, "mean_dev": None, "mean_abs_dev": None,
                "within_tolerance": None, "pairs": []}
    devs = [p["dev"] for p in pairs]
    return {"n": len(pairs),
            "mean_dev": round(sum(devs) / len(devs), 4),
            "mean_abs_dev": round(sum(abs(d) for d in devs) / len(devs), 4),
            "within_tolerance": round(
                sum(1 for d in devs if abs(d) <= 0.25) / len(devs), 4),
            "pairs": pairs}


def render_calibration_lines(cal):
    if not cal.get("n"):
        return ["- difficulty 校准：无有效 (level_score, difficulty) 配对"]
    return [
        f"- difficulty 校准：n={cal['n']}，平均偏差 {cal['mean_dev']}"
        f"（+ 表示判卷难度偏高），平均绝对偏差 {cal['mean_abs_dev']}，"
        f"容差带内 {cal['within_tolerance']}",
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default="docs/submission/evidence")
    ap.add_argument("--replica-db", default="",
                    help="provider=sf 时必需（读硅基流动凭据）；zhipu 通道不需要")
    ap.add_argument("--judge-provider", choices=["zhipu", "sf"], default="zhipu",
                    help="L2 判卷厂商：zhipu=智谱免费异厂（go 决策默认）/ sf=硅基流动")
    ap.add_argument("--judge-model", default="",
                    help="判卷模型；缺省按 provider 取默认")
    ap.add_argument("--judge-key", default="",
                    help="判卷 key；缺省走 JUDGE_API_KEY 环境变量或 evaluation/config.py")
    ap.add_argument("--judge-base-url", default="", help="判卷端点覆盖")
    ap.add_argument("--annotations", default=ANNOTATIONS_PATH_DEFAULT,
                    help="陷阱事实清单 JSON；文件缺失自动降级为无陷阱判卷")
    ap.add_argument("--tier-label", default="go", help="被测档位标注（进报告 meta）")
    ap.add_argument("--models-label",
                    default="main/fast=glm-5.3-flash review=qwen3.8-flash "
                            "embedding=bge-m3 rerank=bge-reranker-v2-m3",
                    help="被测模型实名标注（进报告 meta）")
    args = ap.parse_args()

    client, model_used = build_judge_client(args)
    traps = load_trap_facts(args.annotations)
    print(f"[judge] provider={args.judge_provider} model={model_used} "
          f"traps={len(traps)} (key 不打印)")

    results = []
    # 只认批次结果文件（P1/P2/P3/IF/smoke），其余 results-*（未来扩展）不误收
    batch_re = re.compile(r"results-(P1|P2|P3|IF|smoke)\.json$")
    for path in sorted(glob.glob(os.path.join(args.evidence, "results-*.json"))):
        if not batch_re.search(os.path.basename(path)):
            continue
        with open(path, encoding="utf-8") as fh:
            batch = json.load(fh)
        for entry in batch:
            if entry.get("error") and not entry.get("answer"):
                results.append(entry)
                continue
            j = judge_case(entry, client, model_used, traps)
            entry.update(j)
            cid = entry.get("case_id") or "unknown"
            d = os.path.join(args.evidence, "cases", cid)
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "judge-L1.json"), "w", encoding="utf-8") as fh:
                json.dump(j["L1"], fh, ensure_ascii=False, indent=2)
            with open(os.path.join(d, "judge-L2.json"), "w", encoding="utf-8") as fh:
                json.dump(j["L2"], fh, ensure_ascii=False, indent=2)
            with open(os.path.join(d, "eval.json"), "w", encoding="utf-8") as fh:
                json.dump({"difficulty": j.get("difficulty"),
                           "difficulty_basis": j.get("difficulty_basis"),
                           "fit": j.get("fit"), "coverage": j.get("coverage")},
                          fh, ensure_ascii=False, indent=2)
            results.append(entry)
            print(f"[judge] {cid}: L1 invalid={j['L1']['invalid']}/{j['L1']['total']} "
                  f"L2 hall={j['L2']['hallucinated']} "
                  f"traps={len(j['L2'].get('trap_hits') or [])} "
                  f"diff={j.get('difficulty')} "
                  f"fit={j.get('fit')} cov={(j.get('coverage') or {}).get('total')}",
                  flush=True)

    final_path = os.path.join(args.evidence, "results-final.json")
    with open(final_path, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)

    # 三指标汇总（复用 run_eval 纯函数；IF/记录型用例不计入基础口径分母）
    # P0-S3：base_cases 改由 summarize_denominator 供给（谓词与旧内联式逐字等价），
    # 同时产出 failed_total/valid_ratio 如实呈现被剔除样本。
    denom, base_cases = summarize_denominator(results)
    if_cases = [r for r in results if (r.get("case_id") or "").startswith("IF")
                and not r.get("error")]
    rep = evaluate(base_cases)
    rep["failed_total"] = denom["failed_total"]
    rep["valid_ratio"] = denom["valid_ratio"]
    rep["if_cases"] = {"total": len(if_cases),
                       "ids": [r.get("case_id") for r in if_cases]}
    skipped_l0 = sum(1 for r in base_cases
                     if (r.get("review") or {}).get("skipped"))
    rep["L0_skip_rate_note"] = f"研究档审核跳过 {skipped_l0}/{len(base_cases)}"
    # v1.1 增强：审核门证据 / difficulty 校准 / 陷阱命中 / 运行元信息
    gate = summarize_review_gate(base_cases)
    rep["review_gate"] = gate
    cal = summarize_calibration(base_cases)
    rep["difficulty_calibration"] = cal
    rep["trap_hits_total"] = sum(
        len((r.get("L2") or {}).get("trap_hits") or []) for r in base_cases)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rep["meta"] = {"tier": args.tier_label, "models": args.models_label,
                   "judge_provider": args.judge_provider,
                   "judge_model": model_used, "trap_facts": len(traps),
                   "generated_at": stamp}
    extra_lines = render_denominator_lines(denom) \
        + render_review_gate_lines(gate) + render_calibration_lines(cal)
    if traps:
        extra_lines.append(
            f"- 陷阱事实命中：{rep['trap_hits_total']}（预埋 {len(traps)} 条，"
            "命中=被测回答复述了错误说法）")
    sdir = os.path.join(args.evidence, "summary")
    os.makedirs(sdir, exist_ok=True)
    # 时间戳存档 + 固定路径最新版（evaluation 同款查看体验）
    for name in (f"report-final-{stamp}.json", "report-final.json"):
        with open(os.path.join(sdir, name), "w", encoding="utf-8") as fh:
            json.dump(rep, fh, ensure_ascii=False, indent=2)
    md = render_markdown(rep) + "\n".join(extra_lines) + "\n"
    for name in (f"report-final-{stamp}.md", "report-final.md"):
        with open(os.path.join(sdir, name), "w", encoding="utf-8") as fh:
            fh.write(md)
    print(md)
    print(f"[judge] 最新报告固定路径：{os.path.abspath(os.path.join(sdir, 'report-final.md'))}"
          "（雷达图：python tests/eval/eval_report_html.py --evidence "
          f"{args.evidence}）")


if __name__ == "__main__":
    sys.exit(main())
