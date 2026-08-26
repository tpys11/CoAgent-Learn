# -*- coding: utf-8 -*-
"""覆盖率 = 平均(覆盖知识点 / 标注知识点清单)"""
from judge import judge_coverage


def calc(results, annotations):
    total_ratio = 0.0
    n = 0
    for r in results:
        ann = annotations.get(r["question"].get("kb_key", ""), {})
        kl = ann.get("知识点清单", [])
        if not kl:
            continue
        covered = judge_coverage(r["reply"], kl)
        total_ratio += len(covered) / len(kl)
        n += 1
    return total_ratio / n if n else 0.0
