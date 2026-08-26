# -*- coding: utf-8 -*-
"""Loop2·切片2.0：think_then_json 迁移版三态验证（围栏json/裸花括号/纯文本兜底）。"""
from engine.llm_io import think_then_json


class _OneShot:
    def __init__(self, raw):
        self.raw = raw

    def chat_stream(self, messages, on_token, **kw):
        on_token(self.raw)


def test_fenced_json():
    thinking, result = think_then_json(
        _OneShot('我先想想\n```json\n{"a": 1}\n```'), "sys", "usr", "测试")
    assert result == {"a": 1}
    assert thinking == "我先想想"


def test_bare_braces():
    _, result = think_then_json(_OneShot('前言 {"b": [1,2]} 后记'), "s", "u", "t")
    assert result == {"b": [1, 2]}


def test_no_json_falls_back_to_content():
    thinking, result = think_then_json(_OneShot("就是一段普通话"), "s", "u", "t")
    assert result == {"content": "就是一段普通话"}
    assert thinking == "就是一段普通话"


def test_silent_blocks_on_token_but_llm_error_caught():
    class _Boom:
        def chat_stream(self, *a, **k):
            raise RuntimeError("网络炸了")

    seen = []
    thinking, result = think_then_json(
        _Boom(), "s", "u", "t", silent=True, on_delta=lambda c: seen.append(c))
    assert result == {} and "执行异常" in thinking
