"""左侧项目栏 — 项目列表、新建、删除、右键菜单"""
from nicegui import ui
from backend.ui.theme import theme
from db.user_profile import create_profile
from typing import Callable


class ProjectSidebar:
    def __init__(self, on_select: Callable = None, on_new: Callable = None):
        self.projects = {}
        self.current_project = None
        self.on_select = on_select
        self.on_new = on_new
        self.container = None
        self.list_container = None

    def render(self):
        self.container = ui.column().classes("sidebar h-full p-3 gap-1 w-full")
        with self.container:
            ui.label("项目").classes("section-title")

            ui.button("+ 新建项目", on_click=self._show_create_dialog).props("size=sm").style(f"background-color: {theme.current['accent']} !important; color: white !important; border-radius: 8px;")

            ui.separator().classes("my-1")

            self.list_container = ui.column().classes("gap-0 w-full")
            self._refresh_list()

    def _refresh_list(self):
        if self.list_container is None:
            return
        self.list_container.clear()
        with self.list_container:
            if not self.projects:
                ui.label("暂无项目").classes("text-xs text-secondary px-3 py-4")
                return
            for name in self.projects:
                is_active = name == self.current_project
                with ui.row().classes(f"project-item w-full {'active' if is_active else ''}"):
                    with ui.row().classes("flex-1 items-center gap-2").on("click", lambda _, n=name: self._select(n)):
                        ui.icon("folder_open" if is_active else "folder", size="16px")
                        ui.label(name).classes("flex-1 truncate text-sm")
                    # 右键删除
                    ui.button(icon="more_vert", on_click=lambda _, n=name: self._confirm_delete(n)).props("flat dense size=sm").classes("opacity-50")

    def _select(self, name: str):
        self.current_project = name
        self._refresh_list()
        if self.on_select:
            self.on_select(name)

    def _show_create_dialog(self):
        name_input = None
        with ui.dialog(value=True) as d, ui.card().classes("w-96"):
            ui.label("新建项目").classes("text-lg font-semibold mb-3")
            name_input = ui.input(label="项目名称", placeholder="例如: LangGraph入门").classes("w-full mb-2")
            ui.label("学习目的、时间等可在后续补充。留空即为默认学习模式。").classes("text-xs text-secondary mb-3")

            def confirm():
                n = (name_input.value or "").strip()
                name = n if n else f"未命名项目 {len(self.projects) + 1}"
                if name in self.projects:
                    ui.notify(f"项目「{name}」已存在", type="warning")
                    return
                self.projects[name] = {"created_at": "now"}
                # 写入SQLite
                try:
                    create_profile(session_id=name, project_name=name)
                except Exception:
                    pass  # 界面不因数据库错误崩溃
                d.close()
                self._select(name)
                self._refresh_list()
                ui.notify(f"项目「{name}」已创建")
                if self.on_new:
                    self.on_new(name)

            with ui.row().classes("gap-2 justify-end w-full"):
                ui.button("取消", on_click=d.close).props("flat")
                ui.button("创建", on_click=confirm).style(f"background-color: {theme.current['accent']} !important; color: white !important;")

    def _confirm_delete(self, name: str):
        with ui.dialog(value=True) as d, ui.card().classes("w-80"):
            ui.label("确认删除").classes("text-lg font-semibold mb-2")
            ui.label(f"确定要删除项目「{name}」吗？\n删除后不可恢复。").classes("text-sm text-secondary mb-4")
            with ui.row().classes("gap-2 justify-end w-full"):
                ui.button("取消", on_click=d.close).props("flat")
                ui.button("删除", on_click=lambda: self._do_delete(name, d)).classes("text-red-600").props("flat")

    def _do_delete(self, name: str, dialog):
        del self.projects[name]
        if self.current_project == name:
            self.current_project = None
        dialog.close()
        self._refresh_list()
        ui.notify(f"项目「{name}」已删除")

    def get_current(self) -> str | None:
        return self.current_project
