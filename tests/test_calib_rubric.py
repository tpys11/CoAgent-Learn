# -*- coding: utf-8 -*-
"""CALIB 守卫（源级断言）：难度评定 prompt 锚定量表 + level_score 独立性红线 + JSON 回归锚。

红线机制：适配指标=|判卷 difficulty − 画像 level_score| ≤ 0.25（fit.DEFAULT_TOL 钦定口径）。
若 level_score 进入 DIFFICULTY_RUBRIC prompt，判卷 LLM 会直接锚定水平分作答，
difficulty ≈ level_score 恒成立 → 适配恒过 → 指标循环失义。
故源码级断言 DIFFICULTY_RUBRIC 块内禁止出现 level_score。
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
JUDGE_PATH = os.path.join(HERE, "eval", "eval_judge.py")


def _rubric_block():
    """提取 eval_judge.py 中 DIFFICULTY_RUBRIC 定义块的源码文本。"""
    with open(JUDGE_PATH, encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r"DIFFICULTY_RUBRIC\s*=\s*\((.*?)\n\)", src, re.S)
    assert m, "eval_judge.py 缺 DIFFICULTY_RUBRIC 定义块"
    return m.group(1)


def test_anchor_scale_present():
    """① 锚定量表存在：prompt 源码含「评分锚点」与「0.5-0.6=系统性讲解」。"""
    block = _rubric_block()
    assert "评分锚点" in block, "锚定量表缺失（防回归：删锚点块即红）"
    assert "0.5-0.6=系统性讲解" in block, "锚定量表关键档位缺失"


def test_no_level_score_in_rubric():
    """② 独立性红线：DIFFICULTY_RUBRIC 块内禁止出现 level_score。

    注意范围是 rubric 块而非全文件——judge 侧汇总/校准逻辑合法引用 level_score，
    但难度评定 prompt 必须独立于水平分（否则适配指标循环失义）。
    """
    assert "level_score" not in _rubric_block(), \
        "红线：level_score 注入难度评定 prompt（适配指标循环失义）"


def test_json_output_requirement_intact():
    """③ 回归锚：「只输出 JSON」输出格式要求原样存在。"""
    assert "只输出 JSON" in _rubric_block(), "JSON 输出要求行被改动（回归）"
