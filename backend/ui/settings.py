"""设置面板 — 主题切换、显示偏好"""
from nicegui import ui


class SettingsPanel:
    def __init__(self, theme_manager, on_theme_change=None):
        self.theme = theme_manager
        self.on_theme_change = on_theme_change
        self.container = None

    def render_button(self):
        """在左下角渲染设置按钮"""
        self.settings_btn = ui.button(
            icon="settings",
            on_click=self._show_panel,
        ).props("flat dense size=sm").classes("text-secondary")

    def _show_panel(self):
        with ui.dialog(value=True) as d, ui.card().classes("w-72"):
            ui.label("设置").classes("text-lg font-semibold mb-4")

            ui.label("主题").classes("text-sm font-medium mb-2")
            mode = "深色" if self.theme.is_dark else "浅色"
            ui.button(
                f"🌓 当前: {mode}（点击切换）",
                on_click=lambda: self._toggle_theme(),
            ).classes("w-full btn-secondary mb-4").props("size=sm")

            ui.separator().classes("mb-4")

            ui.label("界面").classes("text-sm font-medium mb-2")
            with ui.column().classes("gap-1"):
                ui.label("· 知识图谱: 暂未开启").classes("text-xs text-secondary")
                ui.label("· 第二窗口: 占位中").classes("text-xs text-secondary")
                ui.label("· 卡通形象: 暂未开启").classes("text-xs text-secondary")

            ui.separator().classes("my-4")

            with ui.row().classes("w-full justify-end"):
                ui.button("关闭", on_click=d.close).props("flat")

    def _toggle_theme(self):
        self.theme.toggle()
        if self.on_theme_change:
            self.on_theme_change()
        ui.notify("主题已切换，刷新后全局生效", type="info")
