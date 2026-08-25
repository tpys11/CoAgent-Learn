# -*- coding: utf-8 -*-
"""Loop2·切片2.1：planning 模块验证（规则判定/目标解析/意图分类与回落）。"""
from engine.planning import classify_intent, is_rule_simple, resolve_plan_targets
from tests._engine_helpers import ScriptedLLM


def test_rule_simple_greetings():
    assert is_rule_simple("你好")
    assert is_rule_simple("hi")
    assert is_rule_simple("谢谢")
    assert is_rule_simple("")


def test_rule_simple_short_or_hard():
    assert is_rule_simple("1+1等于几")           # ≤10字无硬词 → 简单
    assert not is_rule_simple("请讲解RAG的原理")  # 硬词"讲解""原理"
    assert not is_rule_simple("帮我总结一下这篇文档的核心内容，并给出学习建议")  # >30字


def test_resolve_plan_targets_modes():
    assert resolve_plan_targets("极速", []) == ["kb"]
    assert resolve_plan_targets("思考", []) == ["kb"]
    assert resolve_plan_targets("研究", []) == ["kb"]
    assert resolve_plan_targets("基础", ["知识库管理"]) == ["kb"]
    assert resolve_plan_targets("基础", ["其他"]) == ["generate"]


class _JsonLLM:
    def __init__(self, raw):
        self.raw = raw

    def chat_stream(self, messages, on_token, **kw):
        on_token(self.raw)


def test_classify_intent_ok():
    llm = _JsonLLM('{"complexity": "research_deep", "need_kb": false}')
    out = classify_intent(llm, "深入调研X", "研究")
    assert out == {"complexity": "research_deep", "need_kb": True}  # 研究档强制need_kb


def test_classify_intent_garbage_falls_back():
    llm = _JsonLLM("完全不是json")
    out = classify_intent(llm, "随便聊聊天气", "思考")
    assert out["complexity"] == "standard"
    assert out["need_kb"] is True  # 思考档默认要检索
