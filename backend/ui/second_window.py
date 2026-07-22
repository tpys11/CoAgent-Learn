"""第二对话窗口 — 主窗口输出后的支线追问与分析"""

from nicegui import ui
from typing import Callable

# 预设追问模板（根据输出内容自动选择）
FOLLOW_UP_TEMPLATES = [
    {"icon": "🔍", "label": "查看相关概念", "desc": "展开输出中的核心概念"},
    {"icon": "💡", "label": "具体应用场景", "desc": "将知识应用到实际问题"},
    {"icon": "📚", "label": "深入学习此主题", "desc": "推荐进阶学习资源"},
    {"icon": "🔗", "label": "建立知识连接", "desc": "关联已有知识体系"},
    {"icon": "✏️", "label": "实践练习", "desc": "通过练习巩固理解"},
    {"icon": "❓", "label": "检验理解", "desc": "测试是否掌握要点"},
]


class SecondWindow:
    """第二对话窗口 — 支持多窗口切换、追问建议、内容分析"""

    def __init__(self, on_follow_up: Callable = None):
        self.on_follow_up = on_follow_up
        self.windows = {"默认": []}  # name -> [messages]
        self.active_window = "默认"
        self.container = None
        self.window_tabs = None
        self.suggestion_container = None

    def render(self, container):
        self.container = container
        with container:
            with ui.column().classes("p-4 gap-3 w-full h-full"):
                # 标题行
                with ui.row().classes("w-full items-center justify-between"):
                    ui.label("第二对话窗口").classes("text-sm font-medium")
                    ui.button(icon="add", on_click=self._add_window).props(
                        "flat dense size=sm"
                    ).classes("text-secondary")

                ui.label("主窗口输出后将自动分析内容，提供追问入口和概念解析。").classes(
                    "text-xs text-secondary"
                )
                ui.separator().classes("my-1")

                # 窗口标签
                self.window_tabs = ui.row().classes("w-full gap-1 flex-wrap")

                # 追问建议区
                self.suggestion_container = ui.column().classes("gap-2 w-full flex-1 overflow-y-auto")
                self._refresh_suggestions()

                # 窗口标签
                self._refresh_tabs()

    def _refresh_tabs(self):
        if not self.window_tabs:
            return
        self.window_tabs.clear()
        with self.window_tabs:
            for name in self.windows:
                is_active = name == self.active_window
                with ui.button(
                    text=name,
                    on_click=lambda n=name: self._switch_window(n),
                ).props(
                    f"flat dense size=sm {'color=orange' if is_active else ''}"
                ).classes("text-xs"):
                    if is_active:
                        ui.icon("close", size="12px").on(
                            "click.stop", lambda n=name: self._close_window(n)
                        )

    def _refresh_suggestions(self):
        if not self.suggestion_container:
            return
        self.suggestion_container.clear()
        with self.suggestion_container:
            # 如果当前窗口为空，显示默认追问
            current_msgs = self.windows.get(self.active_window, [])
            if not current_msgs:
                for tpl in FOLLOW_UP_TEMPLATES:
                    with ui.button(
                        f"{tpl['icon']} {tpl['label']}",
                        on_click=lambda t=tpl: self._on_suggestion(t),
                    ).props("flat dense size=sm").classes(
                        "w-full text-left text-xs"
                    ):
                        pass
            else:
                # 显示窗口内消息历史
                for msg in current_msgs[-5:]:  # 最近5条
                    with ui.card().classes("w-full p-2").style(
                        "background: var(--q-dark); border-radius: 8px;"
                    ):
                        ui.label(msg).classes("text-xs")

        # 底部控件
        with self.suggestion_container:
            ui.separator().classes("my-2")
            with ui.row().classes("gap-1 w-full"):
                if len(self.windows) > 1:
                    for name in self.windows:
                        if name != self.active_window:
                            ui.button(
                                f"切换到 {name}",
                                on_click=lambda n=name: self._switch_window(n),
                            ).props("flat dense size=sm").classes("text-xs")

    def _switch_window(self, name: str):
        self.active_window = name
        self._refresh_tabs()
        self._refresh_suggestions()

    def _add_window(self):
        count = len(self.windows)
        new_name = f"分支 {count}"
        self.windows[new_name] = []
        self.active_window = new_name
        self._refresh_tabs()
        self._refresh_suggestions()
        ui.notify(f"已创建新分支窗口「{new_name}」", type="info")

    def _close_window(self, name: str):
        if len(self.windows) <= 1:
            ui.notify("至少保留一个窗口", type="warning")
            return
        del self.windows[name]
        if self.active_window == name:
            self.active_window = next(iter(self.windows))
        self._refresh_tabs()
        self._refresh_suggestions()

    def add_suggestion(self, text: str):
        """当主窗口输出内容时，将分析结果添加到当前窗口"""
        current = self.windows.setdefault(self.active_window, [])
        current.append(text)
        self._refresh_suggestions()

    def analyze_and_suggest(self, content: str):
        """分析主窗口输出内容，生成追问建议（模拟）"""
        current = self.windows.setdefault(self.active_window, [])
        # 简化分析：提取关键词生成建议
        analysis = f"📝 内容分析: {content[:50]}..."
        current.append(analysis)
        self._refresh_suggestions()

    def _on_suggestion(self, tpl: dict):
        if self.on_follow_up:
            self.on_follow_up(tpl["label"])
        # 添加到当前窗口
        current = self.windows.setdefault(self.active_window, [])
        current.append(f"💬 已发起追问: {tpl['label']}")
        self._refresh_suggestions()
