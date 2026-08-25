# -*- coding: utf-8 -*-
"""引擎测试公共件：脚本化假LLM（按调用次序回放响应，兼容位置收集器与on_content双通道）。"""


class ScriptedLLM:
    """responses 按调用次序弹出，整段文本经流式回调吐出。
    记录每次调用的 messages 与 kwargs 供断言（模型接缝多消费者场景）。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def chat_stream(self, messages, on_token, **kw):
        self.calls.append({"messages": messages, "kw": kw})
        resp = self.responses.pop(0) if self.responses else ""
        for ch in resp:
            on_token(ch)
            if kw.get("on_content"):
                kw["on_content"](ch)
