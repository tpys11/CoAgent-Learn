"""输入区域 — 文本输入框 + 检索/输出设定下拉框"""
from nicegui import ui


class ChatInput:
    def __init__(self, on_send=None):
        self.on_send = on_send
        self.text_input = None

        self.search_mode = "auto"
        self.search_mode_labels = {"auto": "默认检索", "enhanced": "增强检索", "private": "私有检索"}

        self.output_structured = "free"    # free / structured
        self.output_structured_labels = {"free": "自由格式", "structured": "结构化"}

        self.output_detail = "balanced"
        self.output_detail_labels = {"brief": "简洁", "balanced": "适中", "deep": "深入"}

        self.show_thinking = "off"
        self.thinking_labels = {"off": "思考:关", "on": "思考:开"}

    def render(self):
        self.container = ui.column().classes("input-area w-full pb-3 pt-2 gap-2").style("padding-left: 4px; padding-right: 4px;")

        with self.container:
            # 第一行：设定下拉框（黑边框包裹）
            with ui.row().style(
                "width: 100%; gap: 8px; align-items: center;"
                "border: 1px solid #d0d0d0; border-radius: 8px;"
                "padding: 6px 10px; background: #fff;"
            ):
                ui.select(
                    label=None,
                    options=list(self.search_mode_labels.values()),
                    value=self.search_mode_labels[self.search_mode],
                    on_change=lambda e: self._on_search_change(e.value),
                ).props("dense outlined").classes("w-24").style("font-size: 11px; background: #fff;")

                ui.select(
                    label=None,
                    options=list(self.output_structured_labels.values()),
                    value=self.output_structured_labels[self.output_structured],
                    on_change=lambda e: self._on_structured_change(e.value),
                ).props("dense outlined").classes("w-24").style("font-size: 11px; background: #fff;")

                ui.select(
                    label=None,
                    options=list(self.output_detail_labels.values()),
                    value=self.output_detail_labels[self.output_detail],
                    on_change=lambda e: self._on_detail_change(e.value),
                ).props("dense outlined").classes("w-20").style("font-size: 11px; background: #fff;")

                ui.select(
                    label=None,
                    options=list(self.thinking_labels.values()),
                    value=self.thinking_labels[self.show_thinking],
                    on_change=lambda e: self._on_thinking_change(e.value),
                ).props("dense outlined").classes("w-22").style("font-size: 11px; background: #fff;")

            # 第二行：输入框（左右延伸，发送按钮在右侧）
            with ui.row().style("width: 100%; align-items: flex-end; gap: 8px;"):
                self.text_input = (
                    ui.textarea(
                        placeholder="输入你的问题...（Shift+Enter 换行）",
                    )
                    .classes("input-box flex-1")
                    .props("outlined dense auto-grow rows=2")
                    .style("max-height: 160px; font-size: 14px;")
                )

                ui.button(
                    "发送",
                    icon="send",
                    on_click=self._handle_send,
                ).props("size=sm").style(
                    "background-color: #c75f1a !important; color: white !important; font-weight: 600; border-radius: 8px;"
                )

    def _handle_send(self):
        if self.text_input is None:
            return
        text = (self.text_input.value or "").strip()
        if not text:
            return
        self.text_input.value = ""
        if self.on_send:
            self.on_send(text)

    def _on_search_change(self, label: str):
        for k, v in self.search_mode_labels.items():
            if v == label:
                self.search_mode = k
                break

    def _on_structured_change(self, label: str):
        for k, v in self.output_structured_labels.items():
            if v == label:
                self.output_structured = k
                break

    def _on_detail_change(self, label: str):
        for k, v in self.output_detail_labels.items():
            if v == label:
                self.output_detail = k
                break

    def _on_thinking_change(self, label: str):
        for k, v in self.thinking_labels.items():
            if v == label:
                self.show_thinking = k
                break
