# -*- coding: utf-8 -*-
"""指标2 · 画像-难度适配准确率（目标 ≥85%）。

定义（评估体系设计稿 L2）：产出资源的难度档位与学习者 level_score 的一致率。
判定规则：|difficulty − level_score| ≤ 0.25 记为适配。
difficulty 来源：生成侧模型自标（0-1）；level_score 来源：Assess 每轮评估/画像缓存。
长期校准：分阶题答题正确率回流修正 difficulty 标定（赛后项）。
"""
DEFAULT_TOL = 0.25


def fit_consistent(level_score, difficulty, tol: float = DEFAULT_TOL) -> bool:
    """单对 (水平, 难度) 是否落在容差带内；任一缺失 → False（不计入有效样本时由调用方过滤）。"""
    try:
        ls = float(level_score)
        df = float(difficulty)
    except (TypeError, ValueError):
        return False
    if not (0 <= ls <= 1 and 0 <= df <= 1):
        return False
    return abs(df - ls) <= tol


def fit_rate(samples: list, tol: float = DEFAULT_TOL) -> dict:
    """批量一致率。samples: [{"level_score":0.x, "difficulty":0.y}, ...]。

    返回 {consistent, valid_total, skipped, rate}；skipped 为缺字段/越界样本数；
    valid_total==0 时 rate=None。"""
    ok = 0
    skipped = 0
    for s in samples or []:
        s = s or {}
        if s.get("level_score") is None or s.get("difficulty") is None:
            skipped += 1
            continue
        if fit_consistent(s.get("level_score"), s.get("difficulty"), tol):
            ok += 1
        else:
            skipped += 0  # 计入有效但不一致
    total = len(samples or []) - skipped
    return {"consistent": ok, "valid_total": total, "skipped": skipped,
            "rate": round(ok / total, 4) if total else None}
