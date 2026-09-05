# -*- coding: utf-8 -*-
"""FIXPIPE 守卫：本轮实时评估分必须优先接线进生成提示词的 prev_score。

背景（E-46 全量跑数实证）：pipeline 生成提示词的 prev_score 原本只读画像缓存
（:343），而全新对话的缓存无 level_score →【难度适配】与【初学者模式·硬约束】
在首次提问上永久失明（P1 批适配 2/17 崩塌；真实新用户首问同踩）。
修复：S3 回收后 assess_score 非空则覆写 prev_score。守卫锁定三点：
①接线存在且形如 if assess_score is not None: prev_score = assess_score；
②位置在「S3 Assess 回收」标记之后（保证 assess_score 已回收）；
③位置在生成提示词两个条款使用点之前（保证条款读到的是更新后的值）。
"""
import os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                   "backend", "engine", "pipeline_v2.py")


def test_prev_score_prefers_inturn_assess():
    src = open(SRC, encoding="utf-8").read()
    fix = "if assess_score is not None:\n            prev_score = assess_score"
    assert fix in src, "接线缺失：S3 回收后未覆写 prev_score"
    recycle = src.index("S3 Assess 回收")
    fix_at = src.index(fix)
    assert fix_at > recycle, "接线必须位于 S3 回收之后（此刻 assess_score 才已到手）"
    for marker in ("【难度适配】", "初学者模式·硬约束"):
        use_at = src.index(marker, fix_at)
        assert use_at > fix_at, f"条款「{marker}」使用点必须位于接线之后（否则条款仍读旧值）"
