# -*- coding: utf-8 -*-
"""D3：_strip_thinking 删除守卫。

实证（2026-08-30，真实 DeepSeek API 双样本，evidence 见 docs/progress/step-D.md）：
thinking=True 非流式响应中思考内容走独立 message.reasoning_content 字段，
message.content 为纯最终回答（不含 █ 也不含 <｜end▁of▁thinking｜>），
原 █████ 正则永不匹配 → _strip_thinking 是死代码，按决策 3 删除。

本文件断言定位（决策 24）：
- test_base_llm_has_no_strip_thinking / ..._no_dangling_reference：存在性守卫，
  结构性硬失败（有人把函数/引用加回来 → 恰这两条红）。
- test_chat_returns_stripped_content：新行为断言（chat() 原样返回 + 首尾 strip；
  若有人恢复「剥思考标记」逻辑 → 红）。
- test_chat_with_json_parses_verbatim：回归控制断言（结构上删前后都绿——
  _parse_json 内部自带 strip，仅守住 JSON 链路不回归）。
"""
from types import SimpleNamespace


def test_base_llm_has_no_strip_thinking():
    """存在性守卫（决策 18）：_strip_thinking 必须已删除，不留死代码。"""
    from core.base_llm import BaseLLM
    assert not hasattr(BaseLLM, "_strip_thinking")


def test_base_llm_source_no_dangling_reference():
    """存在性守卫（决策 18）：base_llm.py 源码不得残留 _strip_thinking 引用（防悬空调用）。"""
    import inspect
    import core.base_llm as mod
    src = inspect.getsource(mod)
    assert "_strip_thinking" not in src


class _FakeCompletions:
    @staticmethod
    def create(**kwargs):
        return SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(message=SimpleNamespace(content=_FakeCompletions.content))])


class _FakeChat:
    completions = _FakeCompletions()


class _FakeClient:
    chat = _FakeChat()


def _llm():
    from core.base_llm import DeepSeekLLM
    llm = DeepSeekLLM(api_key="test-key", thinking=False)
    llm.client = _FakeClient()
    return llm


def test_chat_returns_stripped_content():
    """新行为断言：chat() 返回 content 原样（仅首尾 strip）；历史思考标记即使出现
    也不再剥除（真实输出从不出现——原正则永不匹配）。"""
    _FakeCompletions.content = "  答案正文（████ 旧思考标记 ████ 也不会被剥）  "
    out = _llm().chat([{"role": "user", "content": "q"}])
    assert out == "答案正文（████ 旧思考标记 ████ 也不会被剥）"


def test_chat_with_json_parses_verbatim():
    """回归控制断言：chat_with_json 链路不受删除影响（_parse_json 自带 strip）。"""
    _FakeCompletions.content = '  {"a": 1, "b": "测"}  '
    out = _llm().chat_with_json(
        [{"role": "user", "content": "q"}],
        {"properties": {"a": {"type": "integer"}, "b": {"type": "string"}},
         "required": ["a", "b"]})
    assert out == {"a": 1, "b": "测"}
