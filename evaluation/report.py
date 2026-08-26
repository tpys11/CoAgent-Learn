# -*- coding: utf-8 -*-
"""出评测报告：md（给人看）+ json（导前端展示）"""
import json
from metrics import hallucination, adaptation, coverage


def main():
    results = json.load(open("datasets/results.json", encoding="utf-8"))
    annotations = json.load(open("datasets/annotations/annotations.json", encoding="utf-8"))

    m = {
        "hallucination": hallucination.calc(results, annotations),
        "adaptation": adaptation.calc(results, annotations),
        "coverage": coverage.calc(results, annotations),
    }

    md = f"""# 评测报告

| 指标 | 结果 | 目标 |
|------|------|------|
| 幻觉率 | {m['hallucination']:.1%} | <5% |
| 难度适配准确率 | {m['adaptation']:.1%} | ≥85% |
| 核心知识点覆盖率 | {m['coverage']:.1%} | ≥90% |

- 用例数：{len(results)}
- judge 模型：{__import__('config').JUDGE_MODEL}
"""
    open("report.md", "w", encoding="utf-8").write(md)
    json.dump(m, open("report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("报告已生成：report.md + report.json")
    print(md)


if __name__ == "__main__":
    main()
