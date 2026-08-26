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


class RoutingFastLLM:
    """按 system 提示词特征分发的快模型假件——多消费者共享实例时顺序无关：
    意图分类器/学情评估器/查询规划器/检索候选筛选 各自命中固定响应。"""
    PROMPTS = {"意图分类器": '{"complexity": "standard"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [1, 0]}'}

    def __init__(self):
        self.calls = []

    def chat_stream(self, messages, on_token, **kw):
        sys_text = messages[0]["content"]
        self.calls.append(sys_text[:20])
        raw = next((v for k, v in self.PROMPTS.items() if k in sys_text), "")
        for ch in raw:
            on_token(ch)
