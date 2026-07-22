"""右上反馈横条 — 实时计时器、30秒空闲检测、卡通形象集成"""

import time
from nicegui import ui, app
from typing import Callable


class StatsBar:
    def __init__(self, on_idle: Callable = None):
        self.container = None
        self.expanded = True
        self.content_row = None
        self.period = "total"
        self.on_idle = on_idle

        # 实时计时状态
        self.session_seconds = 0
        self.daily_seconds = 0
        self.last_activity_time = None
        self.timer_running = False
        self.timer_job = None

        # 累计统计数据
        self.stats = {
            "total": {"time": "12h 36min", "tokens": "48,230"},
            "30d": {"time": "8h 10min", "tokens": "32,150"},
            "7d": {"time": "2h 45min", "tokens": "11,400"},
            "1d": {"time": "45min", "tokens": "3,200"},
            "single": {"time": "0min", "tokens": "0"},
        }

    def render(self):
        self.container = ui.column().classes("w-full")

        # 收起状态的迷你条
        self.collapsed_row = ui.row().classes("w-full justify-end px-3 py-1 hidden")
        with self.collapsed_row:
            ui.button(on_click=self._toggle).props("flat dense icon=expand_more size=sm")

        # 展开状态的内容
        self.expanded_card = ui.card().classes("w-full stats-bar").style(
            "border: 1px solid #333; border-radius: 10px; margin: 0 4px;"
        )
        with self.expanded_card:
            with ui.row().classes("w-full items-center justify-between px-3 py-2 gap-2"):
                # 时间选择下拉
                self.period_select = ui.select(
                    label=None,
                    options=["总时长", "30天", "7天", "1天", "本次会话"],
                    value="总时长",
                    on_change=lambda e: self._update_period(e.value),
                ).props("dense outlined").classes("w-24").style("min-width: 80px; background: #fff; border-radius: 4px;")

                # 实时显示数据
                self.time_label = ui.label("12h 36min").classes("text-sm font-medium")
                ui.label("专注时长").classes("text-xs text-secondary")
                ui.separator().props("vertical")
                self.token_label = ui.label("48,230").classes("text-sm font-medium")
                ui.label("Tokens").classes("text-xs text-secondary")

                # 实时计时指示器
                self.timer_dot = ui.icon("circle", size="8px").classes(
                    "text-green-500"
                )
                self.timer_label = ui.label("00:00").classes(
                    "text-xs font-mono text-secondary"
                )

                ui.space()

                # 收起按钮
                ui.button(on_click=self._toggle).props("flat dense icon=expand_less size=sm")

    def _update_period(self, label: str):
        key = {"总时长": "total", "30天": "30d", "7天": "7d", "1天": "1d", "本次会话": "single"}.get(
            label, "total"
        )
        self.period = key
        if key in self.stats:
            self.time_label.set_text(self.stats[key]["time"])
            self.token_label.set_text(self.stats[key]["tokens"])

    def _toggle(self):
        if self.expanded:
            self.expanded_card.classes(add="hidden")
            self.collapsed_row.classes(remove="hidden")
        else:
            self.expanded_card.classes(remove="hidden")
            self.collapsed_row.classes(add="hidden")
        self.expanded = not self.expanded

    # ---- 实时计时逻辑 ----

    def start_timer(self):
        """开始计时"""
        self.last_activity_time = time.time()
        if not self.timer_running:
            self.timer_running = True
            self._start_timer_loop()

    def _start_timer_loop(self):
        """启动计时循环（每秒更新）"""

        def tick():
            if not self.timer_running:
                return
            now = time.time()

            # 检测30秒空闲
            if self.last_activity_time and (now - self.last_activity_time) > 30:
                if self.timer_running:
                    self.timer_running = False
                    if self.timer_dot:
                        self.timer_dot.classes(remove="text-green-500")
                        self.timer_dot.classes(add="text-gray-400")
                    if self.timer_label:
                        self.timer_label.set_text("⏸ 暂停")
                    if self.on_idle:
                        self.on_idle()
                # 30秒后继续检查
                ui.timer(5, tick, once=True)
                return

            if self.timer_running:
                self.session_seconds += 1
                self.daily_seconds += 1
                mins, secs = divmod(self.session_seconds, 60)
                hours, mins = divmod(mins, 60)
                if hours > 0:
                    time_str = f"{hours:02d}:{mins:02d}:{secs:02d}"
                else:
                    time_str = f"{mins:02d}:{secs:02d}"
                if self.timer_label:
                    self.timer_label.set_text(time_str)

                # 更新本次会话统计
                mins_display = self.session_seconds // 60
                self.stats["single"]["time"] = f"{mins_display}min"
                if self.period == "single":
                    self.time_label.set_text(self.stats["single"]["time"])

                # 心跳
                if self.timer_dot:
                    self.timer_dot.classes(remove="text-gray-400")
                    self.timer_dot.classes(add="text-green-500")

            ui.timer(1, tick, once=True)

        ui.timer(1, tick, once=True)

    def record_activity(self):
        """记录用户活动（在输入等交互时调用）"""
        self.last_activity_time = time.time()
        if not self.timer_running:
            # 恢复计时
            self.timer_running = True
            if self.timer_dot:
                self.timer_dot.classes(remove="text-gray-400")
                self.timer_dot.classes(add="text-green-500")
            self._start_timer_loop()

    def add_tokens(self, count: int):
        """增加token计数"""
        current_tokens = int(self.stats["single"]["tokens"].replace(",", "") or "0")
        current_tokens += count
        self.stats["single"]["tokens"] = f"{current_tokens:,}"
        if self.period == "single":
            self.token_label.set_text(self.stats["single"]["tokens"])
