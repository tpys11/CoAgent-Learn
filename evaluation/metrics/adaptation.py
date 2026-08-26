# -*- coding: utf-8 -*-
"""难度适配准确率 = 判对难度数 / 总用例数"""
from judge import judge_difficulty


def calc(results, annotations):
    correct = 0
    for r in results:
        expected = r["learner"].get("expected_level", "中级")
        judged = judge_difficulty(r["reply"])
        if judged == expected:
            correct += 1
    return correct / len(results) if results else 0.0
