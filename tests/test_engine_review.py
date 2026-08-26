# -*- coding: utf-8 -*-
"""Loop4·ReviewGate 验证：门控矩阵 / 判卷解析 / 异常跳过软着陆。"""
import pytest

from engine.review import (REVIEW_MAX_RETRY, pick_judge_llm, review_enabled,
                           review_once)
from tests._engine_helpers import ScriptedLLM


def test_review_enabled_matrix():
    assert review_enabled("极速", {"reviewEnabled": True}) is False   # 极速恒关
    assert review_enabled("研究", {}) is True                          # 研究恒开
    assert review_enabled("研究", {"reviewEnabled": False}) is True    # 研究不受配置降档
    assert review_enabled("思考", {}) is False                         # 思考默认关
    assert review_enabled("思考", {"reviewEnabled": True}) is True     # 思考可配开


class _Req:
    api_key = "dummy"
    base_url = None


def test_pick_judge_llm_by_mode():
    j1 = pick_judge_llm("思考", _Req())
    assert j1.model_name == "deepseek-v4-flash"
    j2 = pick_judge_llm("研究", _Req())
    assert j2.model_name == "qwen2.5-72b-instruct"


def test_review_once_pass():
    llm = ScriptedLLM(['{"passed": true, "reasons": ""}'])
    out = review_once(llm, "回答内容", "", "【输出策略指令】测试")
    assert out["passed"] is True and out["skipped"] is False


def test_review_once_fail_reasons():
    llm = ScriptedLLM(['{"passed": false, "reasons": "密度过高"}'])
    out = review_once(llm, "回答内容", "", "")
    assert out["passed"] is False and "密度" in out["reasons"]


def test_review_once_malformed_skips():
    llm = ScriptedLLM(["完全不是json"])
    out = review_once(llm, "回答内容", "", "")
    assert out["passed"] is True and out["skipped"] is True


def test_max_retry_constant():
    assert REVIEW_MAX_RETRY == 2
