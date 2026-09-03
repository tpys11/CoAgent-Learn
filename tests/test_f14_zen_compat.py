# -*- coding: utf-8 -*-
"""F14-S4b：base_llm 非 DeepSeek 端点思考开关抑制+429 限流文案（红先行）。
T33：main / pipeline 一律 fixture 执行期导入。"""
import pytest
from unittest.mock import MagicMock, patch


def _make_llm(base_url, thinking=False, effort=None):
    """构造 DeepSeekLLM 实例（不触发真实 API 调用）"""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
    from core.base_llm import DeepSeekLLM
    llm = DeepSeekLLM(api_key="sk-test-only-fake", model="test-model", base_url=base_url, thinking=thinking, effort=effort)
    return llm


def test_zen_thinking_kwargs_suppressed():
    """F14-S4b①：Zen 端点不应透传 extra_body/reasoning_effort"""
    llm = _make_llm("https://opencode.ai/zen/v1", thinking=True, effort="high")
    kwargs = llm._thinking_kwargs()
    assert kwargs == {}


def test_deepseek_thinking_kwargs_passed():
    """F14-S4b②：DeepSeek 端点应透传 extra_body（回归钉）"""
    llm = _make_llm("https://api.deepseek.com/v1", thinking=True, effort="high")
    kwargs = llm._thinking_kwargs()
    assert "extra_body" in kwargs
    assert kwargs["extra_body"]["thinking"]["type"] == "enabled"
    assert kwargs["reasoning_effort"] == "high"


def test_429_error_message_contains_rate_limit():
    """F14-S4b③：429 异常文案含「限流」"""
    llm = _make_llm("https://api.deepseek.com/v1", thinking=False)
    mock_client = MagicMock()
    llm.client = mock_client
    # 三连抛 429 异常
    mock_client.chat.completions.create.side_effect = Exception("429 Too Many Requests")
    with pytest.raises(RuntimeError, match="限流"):
        llm.chat([{"role": "user", "content": "test"}])


def test_non_429_error_message_no_rate_limit():
    """F14-S4b④：非 429 异常文案不含「限流」"""
    llm = _make_llm("https://api.deepseek.com/v1", thinking=False)
    mock_client = MagicMock()
    llm.client = mock_client
    mock_client.chat.completions.create.side_effect = Exception("connection timeout")
    with pytest.raises(RuntimeError) as exc_info:
        llm.chat([{"role": "user", "content": "test"}])
    assert "限流" not in str(exc_info.value)