# -*- coding: utf-8 -*-
"""EVAL-1 Wave 2 裁判脚本（L1 引用核验 + L2 异厂商复判 + difficulty 评定 + fit/coverage）。

前置：PYTHONPATH=backend（复用 backend/eval/judges 三裁判 + eval.run_eval 汇总纯函数）。
凭据：从副本库 settings 表读硅基流动 key（内存用，绝不打印/落盘）。
用法：
  set PYTHONPATH=backend
  python tests/eval/eval_judge.py --evidence docs/submission/evidence ^
      --replica-db <path> [--judge-model Qwen/Qwen2.5-7B-Instruct]
产出：evidence/cases/<id>/judge-L1.json|judge-L2.json|eval.json + results-final.json
      + evidence/summary/report-final.json|.md
"""
import argparse
import glob
import json
import os
import sqlite3
import sys
import time

import openai

from eval.judges import coverage, fit, hallucination
from eval.run_eval import evaluate, render_markdown

SF_BASE_DEFAULT = "https://api.siliconflow.cn/v1"

DIFFICULTY_RUBRIC = (
    "你是学习资源难度评定员。对下面的回答按 0-1 评定内容难度（不是质量）：\n"
    "0.0-0.2 零基础可读（白话、生活化类比、无公式）\n"
    "0.2-0.4 有基础可读（少量术语且随文解释）\n"
    "0.4-0.6 需要专业基础（出现公式/参数级细节）\n"
    "0.6-0.8 需要熟练实践经验（工程权衡、边界条件、选型对比）\n"
    "0.8-1.0 专家级（研究型细节、性能/底层机制深挖）\n"
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


def judge_case(entry, client, model):
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

    # L2 异厂商复判（qwen 判 deepseek，温度 0）
    src_list = "\n".join(f"- {s}" for s in sources[:25])
    l2 = _chat(client, model,
               L2_PROMPT + f"【知识库文档清单】\n{src_list}\n【待核查回答】{answer[:2000]}")
    out["L2"] = {"hallucinated": l2.get("hallucinated"),
                 "suspicious_claims": [str(x)[:120] for x in (l2.get("suspicious_claims") or [])],
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default="docs/submission/evidence")
    ap.add_argument("--replica-db", required=True)
    ap.add_argument("--judge-model", default="Qwen/Qwen2.5-7B-Instruct")
    args = ap.parse_args()

    key, base_url = load_sf_creds(args.replica_db)
    client = openai.OpenAI(api_key=key, base_url=base_url)
    print(f"[judge] model={args.judge_model} base={base_url} (key 不打印)")

    results = []
    for path in sorted(glob.glob(os.path.join(args.evidence, "results-*.json"))):
        with open(path, encoding="utf-8") as fh:
            batch = json.load(fh)
        name = os.path.basename(path)[8:-5]
        for entry in batch:
            if entry.get("error") and not entry.get("answer"):
                results.append(entry)
                continue
            j = judge_case(entry, client, args.judge_model)
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
                  f"L2 hall={j['L2']['hallucinated']} diff={j.get('difficulty')} "
                  f"fit={j.get('fit')} cov={(j.get('coverage') or {}).get('total')}",
                  flush=True)

    final_path = os.path.join(args.evidence, "results-final.json")
    with open(final_path, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)

    # 三指标汇总（复用 run_eval 纯函数；IF/记录型用例不计入基础口径分母）
    base_cases = [r for r in results
                  if not (r.get("case_id") or "").startswith("IF")
                  and not r.get("error") and (r.get("answer") or "").strip()]
    if_cases = [r for r in results if (r.get("case_id") or "").startswith("IF")
                and not r.get("error")]
    rep = evaluate(base_cases)
    rep["if_cases"] = {"total": len(if_cases),
                       "ids": [r.get("case_id") for r in if_cases]}
    skipped_l0 = sum(1 for r in base_cases
                     if (r.get("review") or {}).get("skipped"))
    rep["L0_skip_rate_note"] = f"研究档审核跳过 {skipped_l0}/{len(base_cases)}"
    os.makedirs(os.path.join(args.evidence, "summary"), exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    with open(os.path.join(args.evidence, "summary", f"report-final-{stamp}.json"),
              "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=2)
    md = render_markdown(rep)
    with open(os.path.join(args.evidence, "summary", f"report-final-{stamp}.md"),
              "w", encoding="utf-8") as fh:
        fh.write(md)
    print(md)


if __name__ == "__main__":
    sys.exit(main())
