# -*- coding: utf-8 -*-
"""幻觉率 = 幻觉陈述数 / 总事实陈述数"""
from judge import judge_hallucination


def calc(results, annotations):
    total_facts = 0
    total_halluc = 0
    for r in results:
        ann = annotations.get(r["question"].get("kb_key", ""), {})
        facts = ann.get("核心事实清单", [])
        traps = ann.get("陷阱事实", [])
        if not facts:
            continue
        hallucinations = judge_hallucination(r["reply"], facts, traps)
        total_facts += len(facts)
        total_halluc += len(hallucinations)
    return total_halluc / total_facts if total_facts else 1.0
