# -*- coding: utf-8 -*-
"""A1：answer 帧合批器 + 空闲心跳收敛（纯逻辑，无 IO、不依赖 core.config）。

背景：泵原来 50ms 固定轮询（get(timeout=0.05)+sleep(0.05)）——空闲即 ~10 帧/秒
心跳（A1 基线实测：61s 对话 83 帧心跳 ≈ 8.3s 空闲 × 10帧/s）+ 事件循环每秒
约 20 次空转唤醒。本模块把「发送节奏」显式化、可测化：
- answer token 进 40ms/256 字符合批窗（先到先触发）——帧数上限 =
  max(流式时长/40ms, 字符数/256)，把「上游 SDK 粒度的运气」换成显式可控上限；
- 流内首个 answer token 直发（不进窗，首字延迟 +0ms）；
- 真空闲（默认 2.0s 无任何帧）才发心跳（60s 对话 ≤30 帧，基线 83 帧）；
- drop_pending()：A2 answer_reset 预留——reset 前丢弃窗内未发旧稿 chunk，
  防「两稿拼接」以合批块形式复发；同时重置首 token 直发标记（新稿首字直发）。

本文件只 import time/json：可安全被测试在 collection 期 import，不触发
core.config.load_dotenv（T33 纪律，见 tests/test_a1_sse_pump.py 文件头）。
"""
import json
import time


class SSEBatcher:
    FLUSH_MS = 40            # 合批时间窗（ms）
    FLUSH_CHARS = 256        # 字符阈值：先到先触发
    IDLE_HEARTBEAT_S = 2.0   # 真空闲才心跳

    def __init__(self, flush_ms: float | None = None, flush_chars: int | None = None,
                 idle_heartbeat_s: float | None = None):
        self.flush_ms = self.FLUSH_MS if flush_ms is None else flush_ms
        self.flush_chars = self.FLUSH_CHARS if flush_chars is None else flush_chars
        self.idle_heartbeat_s = (self.IDLE_HEARTBEAT_S if idle_heartbeat_s is None
                                 else idle_heartbeat_s)
        self._buf: list[str] = []
        self._buf_len = 0
        self._window_deadline: float | None = None
        self._last_emit: float | None = None
        self._seen_any = False   # 流内首个 answer token 直发标记
        self._attempt = 0        # A2：当前稿号，随帧透传（重试稿区分用）

    # ---------- 泵调用面 ----------

    def mark_emitted(self, now: float | None = None) -> None:
        """记录「刚向客户端发过一帧」（start/step/token/heartbeat/合批块都算），
        空闲心跳从最近一次真实发射起算。"""
        self._last_emit = time.monotonic() if now is None else now

    def add(self, chunk: str, attempt: int = 0, now: float | None = None) -> str | None:
        """answer piece 入批（attempt 随帧透传，A2 重试稿区分用）。
        返回应立即发出的 answer_token 帧（无则 None）。"""
        if not chunk:
            return None
        now = time.monotonic() if now is None else now
        self._attempt = attempt
        if not self._seen_any:
            # 首个 token 直发：不进合批窗口，首字延迟 +0ms（A1 验收项）
            self._seen_any = True
            self.mark_emitted(now)
            return self._answer_frame(chunk)
        self._buf.append(chunk)
        self._buf_len += len(chunk)
        if self._window_deadline is None:
            self._window_deadline = now + self.flush_ms / 1000.0
        if self._buf_len >= self.flush_chars:
            return self.flush(now)
        return None

    def due(self, now: float | None = None) -> bool:
        """合批窗口是否已到期（到期但缓冲空 = 无事可做）。"""
        now = time.monotonic() if now is None else now
        return self._window_deadline is not None and now >= self._window_deadline

    def flush(self, now: float | None = None) -> str | None:
        """排空缓冲 → 单个合批 answer_token 帧（缓冲空返回 None）。帧格式与
        pipeline_v2._frame 的 answer 分支逐字节一致（测试逐字节比对）。"""
        now = time.monotonic() if now is None else now
        self._window_deadline = None
        if not self._buf:
            return None
        text = "".join(self._buf)
        self._buf.clear()
        self._buf_len = 0
        self.mark_emitted(now)
        return self._answer_frame(text)

    def heartbeat_due(self, now: float | None = None) -> bool:
        """真空闲（idle_heartbeat_s 内没有任何帧发射）才允许心跳。"""
        now = time.monotonic() if now is None else now
        return self._last_emit is None or (now - self._last_emit) >= self.idle_heartbeat_s

    def wait_timeout(self, now: float | None = None) -> float:
        """泵阻塞等待时长：min(合批窗剩余, 心跳剩余)。恒有界（≤2s）——
        客户端断开时泵协程最多 2s 内感知取消，不会留下无限期阻塞线程。"""
        now = time.monotonic() if now is None else now
        waits: list[float] = []
        if self._window_deadline is not None:
            waits.append(self._window_deadline - now)
        if self._last_emit is not None:
            waits.append(self.idle_heartbeat_s - (now - self._last_emit))
        return max(0.0, min(waits)) if waits else self.idle_heartbeat_s

    def drop_pending(self) -> None:
        """A2 预留：answer_reset 帧发出前必须先调——丢弃窗内未发的旧稿 chunk。
        被丢弃内容绝不产生帧；同时重置首 token 直发标记（新稿第一个 token 直发）。"""
        self._buf.clear()
        self._buf_len = 0
        self._window_deadline = None
        self._seen_any = False

    # ---------- 内部 ----------

    def _answer_frame(self, text: str) -> str:
        return f"data: {json.dumps({'type': 'answer_token', 'chunk': text, 'attempt': self._attempt})}\n\n"
