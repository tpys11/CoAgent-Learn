# -*- coding: utf-8 -*-
"""官方提交件导出：「协同决策中间数据」IO 示例包（evaluation/export_archive.py 平移升级版）。

从 evidence/results-final.json（eval_judge 判卷后）按官方要求结构整理每例：
  输入（画像特征 + 问题）→ 协同决策中间数据（调度步骤/检索确认源/学情分/T值策略/
  审核结论/重稿）→ 最终生成资源（回答 + 判卷结论）。
产出：evidence/io-examples.json（全量，评委复现核对用）
      + evidence/io-examples.md（浏览版索引）
用法：python tests/eval/eval_export.py [--evidence docs/submission/evidence]
"""
import argparse
import json
import os

BATCH_NAMES = {"P1", "P2", "P3"}


def _wizard_of(cases, persona_key):
    p = (cases.get("personas") or {}).get(persona_key or "")
    return {"label": (p or {}).get("label", persona_key),
            "wizard": (p or {}).get("wizard", {})}


def build_item(entry, wizard):
    review = entry.get("review") or {}
    rd = entry.get("review_digest") or {}
    cov = entry.get("coverage") or {}
    return {
        "案例": entry.get("case_id"),
        "输入": {
            "学习者画像": wizard,
            "问题": entry.get("question"),
            "核心知识点": entry.get("expect_kps") or [],
        },
        "协同决策中间数据": {
            "调度步骤": entry.get("steps") or [],
            "检索确认源": entry.get("retrieval_confirmed_sources") or [],
            "学情分 level_score": entry.get("level_score"),
            "输出策略": {"t_value": entry.get("t_value"),
                         "strategy_id": entry.get("strategy_id"),
                         "strategy_name": entry.get("strategy_name")},
            "审核（L0）": {"passed": review.get("passed"),
                           "score": review.get("score"),
                           "suggestion": review.get("suggestion"),
                           "claims_total": rd.get("claims_total"),
                           "unsupported": rd.get("unsupported"),
                           "by_diag": rd.get("by_diag")},
            "审核打回重稿": entry.get("resets") or [],
        },
        "最终生成资源": {
            "回答": entry.get("answer"),
            "引用核验（L1）": {"invalid_ratio":
                               (entry.get("L1") or {}).get("invalid_ratio")},
            "异厂复判（L2）": {"hallucinated":
                               (entry.get("L2") or {}).get("hallucinated"),
                               "trap_hits": (entry.get("L2") or {}).get("trap_hits")},
            "难度评定": entry.get("difficulty"),
            "画像适配": entry.get("fit"),
            "知识点覆盖": cov.get("hit"),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default="docs/submission/evidence")
    ap.add_argument("--cases", default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "eval_cases.json"))
    args = ap.parse_args()

    final_path = os.path.join(args.evidence, "results-final.json")
    if not os.path.exists(final_path):
        raise SystemExit(f"[export] 未找到 {final_path}——先跑 eval_judge.py 判卷")
    results = json.load(open(final_path, encoding="utf-8"))
    cases = json.load(open(args.cases, encoding="utf-8"))

    items, skipped = [], 0
    for r in results:
        cid = r.get("case_id") or ""
        if cid.startswith("IF") or r.get("error") or not (r.get("answer") or "").strip():
            skipped += 1
            continue
        items.append(build_item(r, _wizard_of(cases, r.get("persona"))))

    jpath = os.path.join(args.evidence, "io-examples.json")
    with open(jpath, "w", encoding="utf-8") as fh:
        json.dump({"count": len(items), "skipped": skipped,
                   "note": "官方要求：差异化画像输入 + 多智能体协同决策中间数据 + "
                           "最终个性化资源完整 IO 示例",
                   "examples": items},
                  fh, ensure_ascii=False, indent=2)

    lines = [f"# IO 示例包（{len(items)} 例，跳过 {skipped}）", ""]
    lines.append("| 案例 | 画像 | 问题 | 难度 | 适配 | 覆盖命中 |")
    lines.append("|---|---|---|---|---|---|")
    for it in items:
        inp, res = it["输入"], it["最终生成资源"]
        lines.append(
            f"| {it['案例']} | {inp['学习者画像']['label']} "
            f"| {str(inp['问题'])[:24]}… | {res['难度评定']} "
            f"| {res['画像适配']} | {len(res['知识点覆盖'] or [])} |")
    lines.append("\n> 全量字段见 io-examples.json；每例含调度步骤/检索源/学情分/"
                 "T 值策略/审核结论等协同决策中间数据。")
    mpath = os.path.join(args.evidence, "io-examples.md")
    with open(mpath, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"[export] {len(items)} 例 → {os.path.abspath(jpath)}")
    print(f"[export] 索引 → {os.path.abspath(mpath)}")


if __name__ == "__main__":
    main()
