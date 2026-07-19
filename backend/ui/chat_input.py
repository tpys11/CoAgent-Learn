"""输入区域 — 文本输入框 + 检索/输出设定按钮"""
from nicegui import ui


class ChatInput:
    def __init__(self, on_send=None):
        self.on_send = on_send
        self.container = None
        self.text_input = None

        # 检索设定
        self.search_mode = "auto"  # auto / enhanced / private
        self.search_options = [
            {"label": "默认", "value": "auto", "desc": "大模型自己决定是否检索"},
            {"label": "增强", "value": "enhanced", "desc": "倾向优质信息·多轮"},
            {"label": "私有", "value": "private", "desc": "仅检索上传的资料"},
        ]

        # 输出设定
        self.output_structured = False
        self.output_detail = "balanced"  # brief / balanced / deep
        self.show_thinking = False

    def render(self):
        self.container = ui.column().classes("input-area w-full px-6 pb-4 pt-2 gap-2")

        with self.container:
            # 检索 & 输出设定按钮行
            with ui.row().classes("w-full gap-2 justify-start"):
                # 检索模式
                current_mode = next((o["label"] for o in self.search_options if o["value"] == self.search_mode), "默认")
                with ui.button(f"🔍 {current_mode}", on_click=self._toggle_search_mode).props("flat dense size=sm").classes("text-xs"):
                    pass  # 占位实际切换逻辑

                # 结构化输出
                struct_label = "📋 结构化" if self.output_structured else "📋 自由格式"
                with ui.button(struct_label, on_click=self._toggle_structured).props("flat dense size=sm").classes("text-xs"):
                    pass

                # 深度
                with ui.button(f"📝 {self.output_detail}", on_click=self._toggle_detail).props("flat dense size=sm").classes("text-xs"):
                    pass

                # 思考过程
                think_label = "💭 思考:开" if self.show_thinking else "💭 思考:关"
                with ui.button(think_label, on_click=self._toggle_thinking).props("flat dense size=sm").classes("text-xs"):
                    pass

            # 输入框
            with ui.row().classes("w-full items-end gap-2"):
                self.text_input = (
                    ui.textarea(
                        placeholder="输入你的问题...（Shift+Enter 换行）",
                    )
                    .classes("input-box flex-1")
                    .props("outlined dense auto-grow rows=2")
                    .style("max-height: 200px")
                )

                ui.button(
                    "发送",
                    icon="send",
                    on_click=self._handle_send,
                ).classes("btn-primary self-end")

    def _handle_send(self):
        if self.text_input is None:
            return
        text = (self.text_input.value or "").strip()
        if not text:
            return
        self.text_input.value = ""
        if self.on_send:
            self.on_send(text)

    def _toggle_search_mode(self):
        modes = [o["value"] for o in self.search_options]
        idx = modes.index(self.search_mode)
        self.search_mode = modes[(idx + 1) % len(modes)]

    def _toggle_structured(self):
        self.output_structured = not self.output_structured

    def _toggle_detail(self):
        self.output_detail = {"brief": "balanced", "balanced": "deep", "deep": "brief"}[self.output_detail]

    def _toggle_thinking(self):
        self.show_thinking = not self.show_thinking
