# -*- coding: utf-8 -*-
"""A1：SSEBatcher 合批 / 心跳收敛 / drop_pending 守卫。

断言定位（决策 24）：
- 新行为断言（修复前必须能红——旧泵无合批器，本模块不存在即整体红）：
  首 token 直发、40ms 窗合批、256 字符阈值提前触发、帧格式与
  pipeline_v2._frame answer 分支逐字节一致、drop_pending 丢弃不产生帧、
  心跳 2s 收敛、等待时长有界。
- test_drop_pending_discards_unflushed：A2 answer_reset 的预留能力
  （当前尚无调用方）——按总领要求本步即写测试钉住，防 A2 落地时该能力
  已悄悄丢失（已知需求，非过度设计）。
- 帧格式比对是回归控制断言：合批只改发送节奏、不改 SSE 协议。

导入纪律（T33）：engine.sse_pump 纯逻辑（仅 time/json），collection 期 import
安全；与 pipeline_v2._frame 的格式比对放在测试函数执行期 import——避免
collection 期触发 core.config.load_dotenv 污染 test_db_path 导入期快照。

注意：json.dumps 默认 ensure_ascii=True，CJK 在帧内是 \\uXXXX 转义——
断言一律解析 JSON 后比较 chunk 内容，不做裸子串匹配。
"""
import json
import time

from engine.sse_pump import SSEBatcher   # 纯模块（仅 time/json），collection 期安全


def _chunk_of(frame: str) -> str:
    assert frame.startswith("data: ") and frame.endswith("\n\n")
    return json.loads(frame[len("data: "):])["chunk"]


def test_first_token_emits_immediately():
    """流内首个 answer token 直发：不进合批窗（首字延迟 +0ms）。"""
    b = SSEBatcher()
    frame = b.add("首")
    assert frame is not None
    assert json.loads(frame[len("data: "):])["type"] == "answer_token"
    assert _chunk_of(frame) == "首"
    # 首发后未开窗：等待时长只由心跳截止决定（≈2s），不是 40ms 窗
    assert b.wait_timeout() > 1.0


def test_window_batches_multiple_pieces():
    b = SSEBatcher()
    b.add("首")                       # 直发
    assert b.add("中") is None        # 进窗缓冲
    assert b.add("文") is None
    frame = b.flush(now=time.monotonic() + 1)   # 窗到期排空
    assert frame is not None and _chunk_of(frame) == "中文"
    assert b.flush() is None          # 已空：不再产生帧


def test_char_threshold_triggers_early():
    """256 字符阈值先于 40ms 时窗触发（快出块场景）。"""
    b = SSEBatcher()
    b.add("首")
    out = None
    for _ in range(100):              # 100 × 5 chars = 500 ≥ 256 → 中途触发
        out = b.add("x" * 5)
        if out is not None:
            break
    assert out is not None and _chunk_of(out).startswith("xxxxx")


def test_frame_format_matches_pipeline_frame():
    """回归控制：合批帧与 pipeline_v2._frame 的 answer 分支逐字节一致
    （只改发送节奏，不改协议——A2 的 answer_reset 扩展以此为基线）。"""
    from engine.pipeline_v2 import _frame   # T33：执行期导入
    b = SSEBatcher()
    assert b.add("首") is not None          # 首 token 直发（不进缓冲）
    b.add("中")
    b.add("后续")
    frame = b.flush(now=time.monotonic() + 1)
    expected, stop = _frame(("answer", "中后续"))
    assert stop is False
    assert frame == expected


def test_drop_pending_discards_unflushed():
    """A2 预留：reset 前丢弃未发旧稿——被丢弃 chunk 绝不出现在任何帧，
    且新稿首 token 恢复直发。"""
    b = SSEBatcher()
    b.add("首")
    b.add("旧稿甲")
    b.add("旧稿乙")
    b.drop_pending()
    assert b.flush() is None          # 旧稿合批块不再出现
    nxt = b.add("新稿")
    assert nxt is not None and _chunk_of(nxt) == "新稿"


def test_heartbeat_only_after_idle():
    """真空闲 2.0s 才心跳（旧泵 0.1s 一帧 → 60s 最多 30 帧）。"""
    b = SSEBatcher()
    now = time.monotonic()
    b.mark_emitted(now)
    assert not b.heartbeat_due(now + 1.9)
    assert b.heartbeat_due(now + 2.0)


def test_wait_timeout_bounded():
    """泵等待时长恒有界（≤2s）——断开/取消不会留下无限期阻塞。"""
    b = SSEBatcher()
    now = time.monotonic()
    b.mark_emitted(now)
    assert b.wait_timeout(now) <= 2.0
    b.add("首")
    b.add("开窗")                     # 开窗后等待 = 窗剩余 ≤ 40ms
    assert b.wait_timeout() <= 0.040 + 1e-6
