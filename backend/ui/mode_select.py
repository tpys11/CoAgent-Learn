"""模式选择 — 初始界面：企业培训 / 默认方式学习 / 结构化学习"""

from nicegui import ui
from typing import Callable

MODES = [
    {
        "id": "enterprise",
        "icon": "🏢",
        "title": "企业培训",
        "subtitle": "面向企业与团队",
        "desc": "定向培训方案，基于岗位需求和团队目标生成个性化学习路径，支持多人协作与进度追踪。",
        "features": ["岗位能力图谱", "团队协作学习", "进度追踪与报表"],
    },
    {
        "id": "default",
        "icon": "🎯",
        "title": "默认方式学习",
        "subtitle": "灵活自主探索",
        "desc": "智能体自动诊断你的知识水平，动态生成学习路径。支持任意领域知识探索，边学边问。",
        "features": ["AI知识诊断", "个性化内容推荐", "多模态交互提问"],
        "recommended": True,
    },
    {
        "id": "structured",
        "icon": "📚",
        "title": "结构化学习",
        "subtitle": "系统化课程体系",
        "desc": "按照预设课程大纲，从基础到进阶系统化学习。适合从零开始掌握一个完整知识领域。",
        "features": ["系统化课程大纲", "阶段考核与测评", "完整知识体系构建"],
    },
]


class ModeSelector:
    """模式选择器 — 在首次使用时展示三模式卡片供用户选择"""

    def __init__(self, on_mode_selected: Callable):
        self.on_mode_selected = on_mode_selected
        self.dialog = None

    def show(self):
        if self.dialog:
            self.dialog.close()
        with ui.dialog(value=True) as d, ui.card().classes(
            "w-full max-w-3xl"
        ).style("border-radius: 20px; padding: 0; overflow: hidden;"):
            self.dialog = d
            d.props("persistent")
            self._render_content()
        d.open()

    def _render_content(self):
        with ui.column().classes("w-full gap-0"):
            # 头部渐变横幅
            with ui.column().classes("w-full text-center py-10 px-8").style(
                "background: linear-gradient(135deg, #c75f1a 0%, #e8843d 100%);"
            ):
                ui.label("🚀 欢迎使用 CoAgent-Learn").classes("text-2xl font-bold text-white")
                ui.label("选择一种学习模式开始你的探索之旅").classes("text-sm text-white/80 mt-2")

            # 模式卡片
            with ui.row().classes("w-full justify-center gap-6 px-8 py-8").style(
                "background: var(--q-dark, #faf8f5);"
            ):
                for mode in MODES:
                    self._render_mode_card(mode)

            # 底部提示
            with ui.row().classes("w-full justify-center pb-8").style(
                "background: var(--q-dark, #faf8f5);"
            ):
                ui.label("💡 后续可在设置中切换学习模式").classes("text-xs text-secondary")

    def _render_mode_card(self, mode: dict):
        extra_class = "recommended" if mode.get("recommended") else ""
        border_color = "#c75f1a" if mode.get("recommended") else "transparent"
        with ui.card().classes(f"flex-1 cursor-pointer mode-card {extra_class}").style(
            "border-radius: 16px;"
            f"border: 2px solid {border_color};"
            "min-width: 200px;"
            "transition: all 0.2s ease;"
        ).on("click", lambda m=mode: self._select(m)):
            # 悬停动画CSS
            ui.add_head_html("""
            <style nonce="modeselect">
            .mode-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.1); }
            .mode-card.recommended { border-color: #c75f1a; }
            </style>
            """)
            with ui.column().classes("gap-3 p-5"):
                if mode.get("recommended"):
                    ui.badge("推荐", color="orange").props("outline")
                ui.label(mode["icon"]).classes("text-3xl")
                ui.label(mode["title"]).classes("text-lg font-bold")
                ui.label(mode["subtitle"]).classes("text-xs font-medium text-secondary")
                ui.separator().classes("my-1")
                ui.label(mode["desc"]).classes("text-xs text-secondary leading-relaxed")
                for feat in mode["features"]:
                    with ui.row().classes("gap-1 items-center"):
                        ui.icon("check_circle", size="14px").classes("text-green-600")
                        ui.label(feat).classes("text-xs")
                ui.button(
                    f"选择 {mode['title']}",
                    on_click=lambda m=mode: self._select(m),
                ).props("size=sm").style(
                    "background-color: #c75f1a !important;"
                    "color: white !important;"
                    "border-radius: 8px;"
                    "margin-top: 8px;"
                )

    def _select(self, mode: dict):
        if self.dialog:
            self.dialog.close()
        ui.notify(f"已选择「{mode['title']}」模式", type="positive")
        if self.on_mode_selected:
            self.on_mode_selected(mode["id"])
