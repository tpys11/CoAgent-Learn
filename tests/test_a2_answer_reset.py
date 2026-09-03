# -*- coding: utf-8 -*-
"""A2：answer_reset 帧协议守卫（后端）。

断言定位（决策 24）：
- test_answer_reset_frame_format / test_answer_token_carries_attempt：
  新行为断言——改前 _frame 无 answer_reset 分支（返回空串）且 answer 帧无
  attempt 字段，恰这两条红。
- test_answer_token_legacy_tuple_attempt_zero：回归控制——旧 2 元组
  ("answer", piece) 仍产出 attempt=0，A1 合批帧格式兼容（结构上由默认值保证）。

导入纪律（T33）：_frame 属 engine.pipeline_v2，一律延迟到测试函数执行期导入
——collection 期 import 会触发 core.config.load_dotenv 污染 test_db_path 快照。
"""
import json


def _event_of(msg) -> dict:
    from engine.pipeline_v2 import _frame   # T33：执行期导入
    text, stop = _frame(msg)
    assert text.startswith("data: ") and text.endswith("\n\n")
    return json.loads(text[len("data: "):]), stop


def test_answer_reset_frame_format():
    ev, stop = _event_of(("answer_reset", 1, "审核未通过"))
    assert stop is False
    assert ev["type"] == "answer_reset"
    assert ev["attempt"] == 1
    assert ev["reason"] == "审核未通过"


def test_answer_token_carries_attempt():
    ev, stop = _event_of(("answer", "片段", 2))
    assert stop is False
    assert ev["type"] == "answer_token"
    assert ev["chunk"] == "片段"
    assert ev["attempt"] == 2


def test_answer_token_legacy_tuple_attempt_zero():
    """回归控制：A1 时代的 2 元组 ("answer", piece) → attempt=0，
    合批帧（SSEBatcher 默认 attempt=0）与 _frame 逐字节一致不被破坏。"""
    ev, stop = _event_of(("answer", "片段"))
    assert stop is False
    assert ev["attempt"] == 0


def test_batcher_reset_frame_stamped_with_attempt():
    """合批路径的 attempt 透传：add(piece, attempt) → 帧内 attempt 一致。"""
    from engine.sse_pump import SSEBatcher   # 纯模块，执行期导入（与 A1 守卫同口径）
    b = SSEBatcher()
    b.add("首", attempt=0)                   # 直发帧 attempt=0
    b.add("新稿", attempt=1)                 # 进窗
    frame = b.flush(now=__import__("time").monotonic() + 1)
    ev = json.loads(frame[len("data: "):])
    assert ev["attempt"] == 1 and ev["chunk"] == "新稿"
