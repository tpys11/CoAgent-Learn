# -*- coding: utf-8 -*-
"""RC3-S4：审核链加固——fail-open 文案诚实化 + 判卷 429 单次延迟重试。
根因链（owner 反馈③）：免费档 429 → base_llm 三连重试耗尽 raise RuntimeError
（带「免费模型限流」后缀，base_llm.py:180）→ think_then_json except 吞异常返回
("执行异常: …", {}) → result={} 缺 claims → fail-open 误报「审核器输出不可解析」
（实际是调用失败，不是解析失败——文案不诚实）。
指纹：thinking 以「执行异常」开头=调用失败（限流文案）；否则维持「不可解析」原文案。
重试：仅「执行异常」+「免费模型限流」双重指纹（=429 链路）触发，非 429 不重试；
sleep 经 monkeypatch 记录，不真等。"""
import sys
import pathlib

import pytest

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import engine.review as review_mod
from engine.review import review_claims, review_once
from tests._engine_helpers import ScriptedLLM

_429_MSG = ("chat_stream 全部3次重试均失败"
            "（免费模型限流：请稍后重试，或在 设置→AI服务 切换预设档/模型）")
_PLAIN_MSG = "chat_stream 全部3次重试均失败"


class _RaisingLLM:
    """chat_stream 恒抛指定异常——模拟 base_llm 重试耗尽后的真实指纹链。"""

    def __init__(self, msg: str):
        self._msg = msg
        self.calls = 0

    def chat_stream(self, messages, collect, **kw):
        self.calls += 1
        raise RuntimeError(self._msg)


class _FlakyThenOkLLM:
    """第 1 次调用抛 429 指纹异常，第 2 次返回合法判卷 JSON——验证单次重试恢复。"""

    def __init__(self):
        self.calls = 0

    def chat_stream(self, messages, collect, **kw):
        self.calls += 1
        if self.calls == 1:
            raise RuntimeError(_429_MSG)
        collect('{"claims": [], "instruction_ok": true, "instruction_note": ""}')


@pytest.fixture()
def no_wait(monkeypatch):
    """记录 review 层 sleep 调用并拦截真等待（20s 不能进测试墙钟）。"""
    sleeps: list[float] = []
    monkeypatch.setattr(review_mod.time, "sleep", lambda s: sleeps.append(s))
    return sleeps


def test_s4_review_once_429_fingerprint_rate_limit_copy(no_wait):
    """执行异常指纹 → 限流诚实文案（不再是「输出不可解析」谎报）；
    恒 429 场景判卷重试一次后仍失败 → 才 fail-open（calls==2）。"""
    llm = _RaisingLLM(_429_MSG)
    out = review_once(llm, "回答内容", "", "【输出策略指令】x")
    assert out["skipped"] is True and out["passed"] is True  # fail-open 语义不变
    assert out["reasons"] == "审核器暂不可用（免费档限流），本轮跳过"
    assert llm.calls == 2 and no_wait == [review_mod._RATE_LIMIT_SLEEP]


def test_s4_review_claims_429_fingerprint_rate_limit_copy(no_wait):
    llm = _RaisingLLM(_429_MSG)
    out = review_claims(llm, "回答内容", [], "【输出策略指令】x")
    assert out["skipped"] is True
    assert out["reasons"] == "本轮未经完整审核（审核器暂不可用（免费档限流））"
    assert llm.calls == 2


def test_s4_unparseable_keeps_original_copy():
    """真不可解析（调用成功但输出不合形）→ 维持原文案（诚实分界）。"""
    llm = ScriptedLLM(['{"unexpected": 1}'])
    out_once = review_once(llm, "回答内容", "", "【输出策略指令】x")
    assert out_once["reasons"] == "审核器输出不可解析，跳过本轮"
    out_claims = review_claims(llm, "回答内容", [], "【输出策略指令】x")
    assert out_claims["reasons"] == "本轮未经完整审核（审核器输出不可解析）"


def test_s4_429_retry_once_then_success(no_wait):
    """判卷撞 429 → 20s 延迟后单次重试 → 第二次成功则正常审核（不 fail-open）。"""
    llm = _FlakyThenOkLLM()
    out = review_claims(llm, "回答内容", [], "【输出策略指令】x")
    assert llm.calls == 2, "限流指纹应恰好重试一次"
    assert no_wait == [review_mod._RATE_LIMIT_SLEEP], "延迟重试等待=模块常量（20s）"
    assert out["skipped"] is False and out["passed"] is True


def test_s4_non_429_no_retry(no_wait):
    """非 429 异常（无「免费模型限流」后缀）不重试——重试只耐心给限流。"""
    llm = _RaisingLLM(_PLAIN_MSG)
    out = review_once(llm, "回答内容", "", "【输出策略指令】x")
    assert llm.calls == 1 and no_wait == []
    assert out["skipped"] is True
    assert out["reasons"] == "审核器暂不可用（免费档限流），本轮跳过"
