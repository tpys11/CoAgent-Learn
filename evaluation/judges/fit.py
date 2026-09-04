# -*- coding: utf-8 -*-
"""画像-难度适配（官方目标 ≥85%）：同一问题 × 3 画像各生成一次
judge 按 rubric 判两个维度：
  维度1 密度档位：回答的术语密度/假设前提匹配该画像的水平（初级/中级/高级）
  维度2 名词处理：面向初级画像时，是否对专业术语给出通俗解释
适配率 = 判对维度数 / (2 × 组数)
"""
from ._common import zhipu_judge_text


def calc(results):
    total_points = 0
    n = 0
    for r in results:
        expected = r["learner"].get("expected_level", "中级")
        reply = r["reply"] or ""
        # 维度1：密度档位
        d1 = zhipu_judge_text(
            "下面是一段学习内容，请判断它面向学习者的难度档"
            "（考虑术语密度、前提假设、示例复杂度）：\n\n"
            + reply[:3000] + "\n\n只回答一个词：初级 或 中级 或 高级"
        )
        ok1 = any(lv in d1 for lv in [expected])
        # 维度2：名词处理（仅初级画像要求解释术语，中/高级默认达标）
        ok2 = True
        if expected == "初级":
            d2 = zhipu_judge_text(
                "下面是一段面向初学者的学习内容，是否对专业术语给出了通俗解释"
                "（每个术语都说明它是什么意思）？\n\n"
                + reply[:3000] + "\n\n只回答：是 或 否"
            )
            ok2 = ("是" in d2)
        total_points += (1 if ok1 else 0) + (1 if ok2 else 0)
        n += 1
    return total_points / (2 * n) if n else 0.0
