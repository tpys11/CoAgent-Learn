# -*- coding: utf-8 -*-
"""记忆进度：遗忘曲线（可提取性/掌握度/稳定性）与学习节奏计算。"""
import math
import datetime


def compute_mastery_items(names: list, kind_map: dict, seen_days: dict, today) -> list:
    """遗忘曲线核心：按每个知识点最近出现日期计算掌握度/可提取性/稳定性。"""
    items = []
    for n in names:
        days = sorted(seen_days.get(n, set()))
        last = days[-1] if days else None
        dt = 999
        if last:
            try:
                dt = (today - datetime.date.fromisoformat(last)).days
            except Exception:
                dt = 999
        mentions = len(days)
        stability = min(30, mentions * 2 + 3)
        R = 0.0 if dt >= 999 else math.exp(-dt / max(stability, 1))
        mastery = int(min(95, 20 + mentions * 10) * R)
        items.append({
            "name": n,
            "kind": kind_map.get(n, "知识点"),
            "mastery": mastery,
            "retrievability": round(R, 2),
            "lastSeen": last,
            "daysSince": 999 if dt >= 999 else dt,
            "mentions": mentions,
            "stability": stability,
            "forgotten": dt >= 999 or R < 0.7,
        })
    items.sort(key=lambda x: -x["mastery"])
    return items


def compute_pace(daily: list) -> str:
    """学习节奏：本周 vs 上周对话数。"""
    def _sum(arr, start, end):
        return sum(x["count"] for x in arr[start:end])
    w7 = _sum(daily, 7, 14)
    prev7 = max(1, _sum(daily, 0, 7))
    ratio = w7 / prev7
    return "↗ 变快" if ratio > 1.3 else ("↘ 变慢" if ratio < 0.7 else "→ 平稳")
