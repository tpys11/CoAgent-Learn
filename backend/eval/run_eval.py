# -*- coding: utf-8 -*-
"""评估统一入口：读结果集 → 三 judge 汇总 → 报告落盘（JSON+Markdown）。

用法：
    python -m eval.run_eval --results path/to/results.json [--baseline reports/xxx.json]

results.json 格式（每条样例，runner 批量跑链路后产出；字段可缺省，judge 各取所需）：
[
  {
    "question": "角动量守恒的条件是什么",
    "answer": "……合外力矩为零时角动量守恒 [来源: 理论力学讲义]……",
    "level_score": 0.8,            // 该画像/该轮的学情分
    "difficulty": 0.7,             // 生成侧资源自标难度
    "kps": ["角动量", "合外力矩"],  // 本题核心知识点清单
    "sources": [{"title": "理论力学讲义", "url": "..."}]  // 检索留存
  }, ...
]

报告输出至 backend/eval/reports/<时间戳>.json|.md；--baseline 时附对比字段。
"""
import argparse
import datetime
import json
import os

from eval.judges import coverage, fit, hallucination


def evaluate(results: list) -> dict:
    """三指标汇总。纯逻辑，供 CLI 与单测复用。"""
    verifs = []
    fit_samples = []
    cov_items = []
    for r in results or []:
        r = r or {}
        verifs.append(hallucination.verify_citations(r.get("answer") or "",
                                                     r.get("sources") or []))
        fit_samples.append({"level_score": r.get("level_score"),
                            "difficulty": r.get("difficulty")})
        cov_items.append(coverage.hit_kps(r.get("answer") or "", r.get("kps") or []))
    return {
        "sample_total": len(results or []),
        "hallucination": hallucination.hallucination_summary(verifs),
        "fit": fit.fit_rate(fit_samples),
        "coverage": coverage.coverage_rate(cov_items),
    }


def _diff(cur: dict, base: dict) -> dict:
    out = {}
    for k in ("hallucination", "fit", "coverage"):
        c, b = cur.get(k, {}).get("rate"), (base or {}).get(k, {}).get("rate")
        if c is not None and b is not None:
            out[k] = round(c - b, 4)
    return out


def render_markdown(rep: dict) -> str:
    h, f, c = rep["hallucination"], rep["fit"], rep["coverage"]
    lines = [
        "# 评估报告",
        f"- 样例数：{rep['sample_total']}",
        f"- 幻觉率代理（无效引用占比）：{h['invalid_ratio']}（引用 {h['citation_total']} 条，"
        f"无效 {h['citation_invalid']} 条）——目标 <5%",
        f"- 适配一致率：{f['rate']}（有效 {f['valid_total']}，跳过 {f['skipped']}）——目标 ≥85%",
        f"- 知识点覆盖率：{c['rate']}（命中 {c['kp_hit']}/{c['kp_total']}）——目标 ≥90%",
    ]
    if rep.get("vs_baseline"):
        lines.append(f"- 对比 baseline 变化：{json.dumps(rep['vs_baseline'], ensure_ascii=False)}")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description="CoAgent-Learn 三硬指标评估")
    ap.add_argument("--results", required=True, help="results.json 路径")
    ap.add_argument("--baseline", default="", help="上次报告 JSON，用于对比")
    args = ap.parse_args()

    with open(args.results, encoding="utf-8-sig") as fh:
        results = json.load(fh)
    rep = evaluate(results)
    if args.baseline and os.path.exists(args.baseline):
        with open(args.baseline, encoding="utf-8-sig") as fh:
            rep["vs_baseline"] = _diff(rep, json.load(fh))

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = os.path.join(os.path.dirname(__file__), "reports")
    os.makedirs(out_dir, exist_ok=True)
    jpath = os.path.join(out_dir, f"report-{stamp}.json")
    mpath = os.path.join(out_dir, f"report-{stamp}.md")
    with open(jpath, "w", encoding="utf-8") as fh:
        json.dump(rep, fh, ensure_ascii=False, indent=2)
    with open(mpath, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(rep))
    print(render_markdown(rep))
    print(f"[saved] {jpath}\n[saved] {mpath}")


if __name__ == "__main__":
    main()
