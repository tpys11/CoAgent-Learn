# -*- coding: utf-8 -*-
"""RC3-S1：规划节点真思考——分类提示词要求先说理由再出围栏。
根因：旧 _CLASSIFY_PROMPT 末句「只输出 JSON」→ 模型纯 JSON 应答 → think_then_json
的 thinking=raw[:围栏起点] 恒空 → 规划节点无思考可流式/双写（owner 反馈①）。
mock 只回脚本不读提示词，故「提示词要求理由」用内容守卫钉住（变异①删句即红）；
提取/兜底行为用 mock 钉住（think_then_json 既有契约的回归守卫）。"""
import sys
import pathlib

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from engine.planning import _CLASSIFY_PROMPT, classify_intent


class _ScriptLLM:
    """按脚本原样回放的 mock：chat_stream 逐段喂给 collect（think_then_json 契约）。"""

    def __init__(self, reply: str):
        self._reply = reply

    def chat_stream(self, messages, collect, **kw):
        collect(self._reply)


def test_s1_classify_prompt_demands_reasoning_before_fence():
    """提示词必须先要 ≤3 句理由再要 json 围栏（变异①：删「先说明理由」句本条恰红）。"""
    assert "3句" in _CLASSIFY_PROMPT and "理由" in _CLASSIFY_PROMPT
    assert "```json" in _CLASSIFY_PROMPT, "提示词须给出围栏输出格式（thinking 取围栏前文本）"
    assert "只输出 JSON" not in _CLASSIFY_PROMPT, "旧行为（纯 JSON 应答）是 thinking 恒空根因"


def test_s1_classify_prefix_fence_thinking_nonempty():
    """mock 模拟新提示词下的真实输出（理由前缀+围栏）→ thinking 非空且 JSON 正确解析。"""
    llm = _ScriptLLM(
        "用户要求讲解原理，需检索知识库支撑；无多源交叉与时效诉求。standard 档即可。\n"
        '```json\n{"complexity": "standard"}\n```')
    thinking, plan = classify_intent(llm, "请讲解RAG原理", "思考")
    assert thinking.strip(), "围栏前理由文本应成为 thinking（规划节点真思考）"
    assert "讲解原理" in thinking
    assert plan == {"complexity": "standard"}


def test_s1_classify_pure_json_thinking_empty_fallback():
    """模型不给理由（纯 JSON）→ thinking 为空兜底，不伪造思考。"""
    llm = _ScriptLLM('{"complexity": "simple_direct"}')
    thinking, plan = classify_intent(llm, "你好", "极速")
    assert thinking == ""
    assert plan == {"complexity": "simple_direct"}


def test_s1_classify_invalid_complexity_falls_back_standard():
    """complexity 非法值回落 standard（simple_direct 判定语义不受提示词改动影响）。"""
    llm = _ScriptLLM('理由：无法判断。\n```json\n{"complexity": "ultra"}\n```')
    thinking, plan = classify_intent(llm, "随便聊聊近况", "标准")
    assert plan == {"complexity": "standard"}
