# -*- coding: utf-8 -*-
"""FIXLLM：base_llm 三缺陷守卫（全部假件注入，零真网、零真实 key）。

锚点证据：宿主 dev 栈日志 2026-09-04 实录（详见 docs/progress/step-FIXLLM.md）：
- ① chat() create(max_tokens=2000, **kwargs) 与显式 max_tokens 撞车 → TypeError；
- ② chat_stream 收到网关尾部空 choices chunk（usage-only）→ IndexError 崩流；
- ③ chat_stream except 块外引用 e（Python 在块尾 del e）→ UnboundLocalError，
  真实异常与 429 限流文案被吞、异常链丢失。

守卫与修复同笔 commit（保 CI 每个 ref 恒绿）；变异验证记录见 commit message。
构造方式：DeepSeekLLM(api_key="test-fake") 后覆写 .client——api_key 为假占位串，
仅本地假件，不触网。
"""
from types import SimpleNamespace

import pytest


# ---------- 守卫①：chat() max_tokens 单点供给 ----------

class _CaptureCompletions:
    """捕获 create() 实收 kwargs。若上游重复传 max_tokens（硬编码 + **kwargs），
    Python 在进入本方法前即抛 TypeError——调用能成功本身就证明无重复。"""

    captured: dict | None = None

    def create(self, **kwargs):
        _CaptureCompletions.captured = kwargs
        return SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))],
        )


class _CaptureChat:
    def __init__(self):
        self.completions = _CaptureCompletions()


class _CaptureClient:
    def __init__(self):
        self.chat = _CaptureChat()


def _chat_llm():
    from core.base_llm import DeepSeekLLM

    llm = DeepSeekLLM(api_key="test-fake")
    llm.client = _CaptureClient()
    return llm


def test_chat_explicit_max_tokens_reaches_create_once():
    """守卫①显式分支：chat(max_tokens=300) → create 恰收到一次 max_tokens 且值=300。
    若恢复 create 内硬编码 max_tokens=2000，重复关键字在调用点 TypeError → 本条恰红。"""
    _CaptureCompletions.captured = None
    out = _chat_llm().chat([{"role": "user", "content": "q"}], max_tokens=300)
    assert out == "ok"  # 调用成功 = 未发生 TypeError（重复传参会在此前炸掉）
    assert _CaptureCompletions.captured is not None
    assert _CaptureCompletions.captured["max_tokens"] == 300


def test_chat_default_max_tokens_is_2000():
    """守卫①缺省分支：不传 max_tokens → create 收到 2000（单点供给的缺省值）。"""
    _CaptureCompletions.captured = None
    _chat_llm().chat([{"role": "user", "content": "q"}])
    assert _CaptureCompletions.captured is not None
    assert _CaptureCompletions.captured["max_tokens"] == 2000


# ---------- 守卫②：chat_stream 空 choices 防御 ----------

class _StreamCompletions:
    """返回预设 chunk 列表作为假流（list 可迭代，for chunk in response 语义一致）。"""

    chunks: list = []

    def create(self, **kwargs):
        return list(_StreamCompletions.chunks)


class _StreamChat:
    def __init__(self):
        self.completions = _StreamCompletions()


class _StreamClient:
    def __init__(self):
        self.chat = _StreamChat()


def _stream_llm():
    from core.base_llm import DeepSeekLLM

    llm = DeepSeekLLM(api_key="test-fake")
    llm.client = _StreamClient()
    llm.retry_delays = [0, 0]  # 测试零等待（重试路径用）
    return llm


def test_chat_stream_skips_empty_choices_chunk():
    """守卫②：流含一个空 choices chunk（其后跟正常 chunk）→ 正常收完不抛、内容不受影响。
    若删掉空 choices continue 防御，chunk.choices[0] IndexError → 本条恰红。"""
    _StreamCompletions.chunks = [
        SimpleNamespace(choices=[]),  # 网关尾部空 choices chunk（usage-only 等）
        SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="你好", reasoning_content=None))]
        ),
    ]
    tokens: list[str] = []
    contents: list[str] = []
    _stream_llm().chat_stream(
        [{"role": "user", "content": "q"}],
        on_token=tokens.append,
        on_content=contents.append,
    )
    assert "".join(tokens) == "你好"
    assert "".join(contents) == "你好"


# ---------- 守卫③：chat_stream 重试耗尽异常链 ----------

class _BoomCompletions:
    """每次 create 都抛预设异常，打满 3 次重试。"""

    exc: Exception | None = None

    def create(self, **kwargs):
        raise _BoomCompletions.exc


class _BoomChat:
    def __init__(self):
        self.completions = _BoomCompletions()


class _BoomClient:
    def __init__(self):
        self.chat = _BoomChat()


def test_chat_stream_retry_exhausted_raises_runtimeerror_with_chain():
    """守卫③：3 次重试耗尽（非 429）→ RuntimeError，消息不含 UnboundLocalError、
    __cause__=原始异常；429 异常时消息含「免费模型限流」。
    两分支同一用例：变异③（还原块外 str(e)）须恰红本条。"""
    from core.base_llm import DeepSeekLLM

    llm = DeepSeekLLM(api_key="test-fake")
    llm.client = _BoomClient()
    llm.retry_delays = [0, 0]  # 测试零等待

    # 非 429：真实异常恢复可见、异常链保留
    orig = ValueError("网关 5xx 模拟")
    _BoomCompletions.exc = orig
    with pytest.raises(RuntimeError) as excinfo:
        llm.chat_stream([{"role": "user", "content": "q"}], on_token=lambda t: None)
    msg = str(excinfo.value)
    assert "UnboundLocalError" not in msg
    assert "重试均失败" in msg
    assert excinfo.value.__cause__ is orig

    # 429：限流文案行为不变
    orig429 = RuntimeError('Error code: 429 - {"error": "rate limit"}')
    _BoomCompletions.exc = orig429
    with pytest.raises(RuntimeError) as excinfo429:
        llm.chat_stream([{"role": "user", "content": "q"}], on_token=lambda t: None)
    assert "免费模型限流" in str(excinfo429.value)
    assert excinfo429.value.__cause__ is orig429
