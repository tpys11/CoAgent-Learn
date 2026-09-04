# -*- coding: utf-8 -*-
"""人工抽检标定 judge 可信度（协作者要求：10% 人工抽检）

用法：
  1. python calibrate.py            → 抽样约 10%，生成 calibrate_table.md（LLM 判分已填，人工判分列留空）
  2. 人工打开 calibrate_table.md，在『人工判分』列填：初级 / 中级 / 高级
  3. python calibrate.py --check    → 对比 LLM vs 人工，输出 judge 可信度（一致率）
"""
import json
import random
import sys


def _llm_judge(reply):
    from judges._common import zhipu_judge_text
    d = zhipu_judge_text(
        "下面是一段学习内容，请判断它面向学习者的难度档"
        "（考虑术语密度、前提假设、示例复杂度）：\n\n"
        + (reply or "")[:3000] + "\n\n只回答一个词：初级 或 中级 或 高级"
    )
    for lv in ["高级", "中级", "初级"]:
        if lv in d:
            return lv
    return "中级"


def export():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    random.seed(42)
    n = max(1, round(len(results) * 0.1))
    sample = random.sample(results, min(n, len(results)))
    lines = ["# 人工抽检复核表（judge 可信度标定）", ""]
    lines.append(f"- 共 {len(results)} 组，抽样 {len(sample)} 组（约 10%）")
    lines.append("- 请在『人工判分』列填入：初级 / 中级 / 高级")
    lines.append("")
    lines.append("| 组号 | 问题 | 画像(期望) | LLM判难度 | 人工判分 | 一致? |")
    lines.append("|------|------|-----------|----------|---------|-------|")
    for i, r in enumerate(sample):
        q = r["question"]["text"][:20]
        learner = r["learner"]["name"]
        expected = r["learner"].get("expected_level", "中级")
        llm = _llm_judge(r["reply"])
        lines.append(f"| {i+1} | {q} | {learner}({expected}) | {llm} |  |  |")
    lines.append("")
    lines.append("## 回答全文（供人工判断）")
    for i, r in enumerate(sample):
        lines.append(f"### 组 {i+1}：{r['question']['text']}")
        lines.append("")
        lines.append(r["reply"])
        lines.append("")
    open("calibrate_table.md", "w", encoding="utf-8").write("\n".join(lines))
    print(f"已生成 calibrate_table.md（抽样 {len(sample)} 组），请人工填写『人工判分』列")


def check():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    text = open("calibrate_table.md", encoding="utf-8").read()
    agree = 0
    total = 0
    for line in text.splitlines():
        if not line.startswith("| ") or "LLM判难度" in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 6:
            continue
        llm, human = cells[3], cells[4]  # 列：组号|问题|画像(期望)|LLM判难度|人工判分|一致?
        if not human:
            continue
        total += 1
        if llm == human:
            agree += 1
    if total == 0:
        print("未检测到人工判分，请先在 calibrate_table.md 填写『人工判分』列")
        return
    rate = agree / total
    print(f"人工抽检 {total} 组，LLM 与人工一致 {agree} 组")
    print(f"judge 可信度（一致率）= {rate:.1%}")
    print("结论：" + ("可信度高" if rate >= 0.8 else "建议复核 judge 提示词或换裁判模型"))


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        export()
