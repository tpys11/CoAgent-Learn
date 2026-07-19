"""右上反馈横条 — 可收起，按时间段显示专注时长和token用量"""
from nicegui import ui


class StatsBar:
    def __init__(self):
        self.container = None
        self.expanded = True
        self.content_row = None
        self.period = "total"

        # 模拟数据
        self.stats = {
            "total": {"time": "12h 36min", "tokens": "48,230"},
            "30d": {"time": "8h 10min", "tokens": "32,150"},
            "7d": {"time": "2h 45min", "tokens": "11,400"},
            "1d": {"time": "45min", "tokens": "3,200"},
            "single": {"time": "12min", "tokens": "890"},
        }

    def render(self):
        self.container = ui.column().classes("w-full")

        # 收起状态的迷你条
        self.collapsed_row = ui.row().classes("w-full justify-end px-3 py-1 hidden")
        with self.collapsed_row:
            ui.button(on_click=self._toggle).props("flat dense icon=expand_more size=sm")

        # 展开状态的内容
        self.expanded_card = ui.card().classes("w-full stats-bar")
        with self.expanded_card:
            with ui.row().classes("w-full items-center justify-between px-3 py-2 gap-2"):
                # 时间选择下拉
                self.period_select = ui.select(
                    label=None,
                    options=["总时长", "30天", "7天", "1天", "单次"],
                    value="总时长",
                    on_change=lambda e: self._update_period(e.value),
                ).props("dense outlined").classes("w-24").style("min-width: 80px")

                # 显示数据
                self.time_label = ui.label("12h 36min").classes("text-sm font-medium")
                ui.label("专注时长").classes("text-xs text-secondary")
                ui.separator().props("vertical")
                self.token_label = ui.label("48,230").classes("text-sm font-medium")
                ui.label("Tokens").classes("text-xs text-secondary")

                ui.space()

                # 收起按钮
                ui.button(on_click=self._toggle).props("flat dense icon=expand_less size=sm")

    def _update_period(self, label: str):
        key = {"总时长": "total", "30天": "30d", "7天": "7d", "1天": "1d", "单次": "single"}.get(label, "total")
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
