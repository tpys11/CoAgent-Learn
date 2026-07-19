"""
CoAgent-Learn 后端主入口
FastAPI + NiceGUI前端 + LangGraph多智能体协同调度 + RAG向量检索
统一Python全栈：NiceGUI运行在FastAPI之上
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    required = ["DEEPSEEK_API_KEY"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        import warnings
        warnings.warn(f"缺少环境变量: {', '.join(missing)}。进入界面预览模式。")
    yield


app = FastAPI(
    title="CoAgent-Learn",
    description="领域知识个性化生成与多智能体协同决策系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


# ------- NiceGUI 挂载 -------
from nicegui import ui, app as ng_app

from backend.ui.theme import theme
from backend.ui.sidebar import ProjectSidebar
from backend.ui.stats_bar import StatsBar
from backend.ui.chat_input import ChatInput
from backend.ui.diagnosis import DiagnosisDialog
from backend.ui.settings import SettingsPanel

# 全局状态
messages = []
current_project = None
diagnosis_skipped_forever = False  # "不再提示"记忆


def build_ui():
    ui.add_head_html(f"<style>{theme.css_var()}</style>")
    ui.query("body").style(
        f"background-color: {theme.current['bg']}; color: {theme.current['text']}; "
        "margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;"
    )

    with ui.row().classes("w-screen h-screen no-wrap overflow-hidden").style("margin: 0; padding: 0;"):

        # ===== 左侧栏 =====
        left_panel = ui.column().classes("sidebar h-full").style("width: 260px; min-width: 260px; overflow-y: auto;")
        with left_panel:
            sidebar = ProjectSidebar(on_select=_on_project_select, on_new=_on_project_created)
            sidebar.render()

            ui.space()

            with ui.row().classes("w-full p-2"):
                settings_panel = SettingsPanel(theme, _on_theme_change)
                settings_panel.render_button()

        # ===== 中间 =====
        center_panel = ui.column().classes("flex-1 h-full").style("min-width: 0;")
        with center_panel:
            # 反馈横条
            stats_bar = StatsBar()
            stats_bar.render()

            # 智能体工作过程可视化 — 设计文档中的"圈+文字"
            progress_container = ui.row().classes("w-full px-6 gap-3 hidden items-center").style("min-height: 28px;")

            def show_progress(steps: list[str]):
                """显示工作过程：小空圈+文字，完成后圈变绿"""
                progress_container.clear()
                progress_container.classes(remove="hidden")
                with progress_container:
                    for i, step in enumerate(steps):
                        with ui.row().classes("gap-1 items-center"):
                            circle = ui.icon("radio_button_unchecked", size="14px").classes("text-green-600")
                            ui.label(step).classes("text-xs")
                            # 模拟完成后变绿（真实接入后由Agent状态驱动）
                            # circle.set_name("check_circle")

            # 隐藏进度条
            def hide_progress():
                progress_container.clear()
                progress_container.classes(add="hidden")

            # 消息列表
            messages_container = ui.column().classes("flex-1 w-full overflow-y-auto px-6 py-4 gap-4")

            def add_message(role: str, content: str):
                messages.append({"role": role, "content": content})
                with messages_container:
                    bg = theme.current["card"] if role == "user" else "transparent"
                    align = "flex-end" if role == "user" else "flex-start"
                    with ui.card().classes(f"w-full message-{role}").style(
                        f"background-color: {bg}; max-width: 85%; align-self: {align};"
                    ):
                        ui.markdown(content).classes("text-sm")
                messages_container.scroll_to(percent=1.0)

            # 欢迎
            with messages_container:
                with ui.column().classes("w-full items-center justify-center py-16 gap-3"):
                    ui.label("CoAgent-Learn").classes("text-2xl font-semibold")
                    ui.label("基于多智能体协同的AI学习助手。选择一个项目或新建项目开始。").classes("text-sm")

            # 输入
            input_container = ui.column().classes("w-full")
            with input_container:
                chat_input = ChatInput(on_send=_handle_message)
                chat_input.render()

        # ===== 右侧栏 =====
        right_panel = ui.column().classes("right-panel h-full").style("width: 280px; min-width: 280px; overflow-y: auto;")
        with right_panel:
            with ui.column().classes("p-4 gap-3 w-full h-full"):
                ui.label("第二对话窗口").classes("text-sm font-medium mt-2")
                ui.label("主窗口输出后将自动分析内容，提供追问入口和概念解析。").classes("text-xs text-secondary")
                ui.separator().classes("my-2")
                # 占位追问
                with ui.column().classes("gap-2 w-full"):
                    for hint in ["🔍 查看相关概念", "💡 具体应用场景", "📚 深入学习此主题"]:
                        ui.button(hint, on_click=lambda h=hint: _on_follow_up(h)).props("flat dense size=sm").classes("w-full text-left text-xs")
                ui.separator().classes("my-2")
                ui.label("可在设置中开启更多窗口").classes("text-xs text-gray-400")
                # 窗口切换占位
                with ui.row().classes("gap-1"):
                    ui.button("1", on_click=None).props("flat dense size=sm").classes("text-xs font-bold")
                    ui.button("+", on_click=None).props("flat dense size=sm").classes("text-xs")

    return {
        "sidebar": sidebar,
        "stats_bar": stats_bar,


        "chat_input": chat_input,
        "settings": settings_panel,
        "add_message": add_message,
        "show_progress": show_progress,
        "hide_progress": hide_progress,
    }


def _on_project_select(name: str):
    global current_project
    current_project = name
    ui.notify(f"已切换到项目「{name}」", type="info")


def _on_project_created(name: str):
    """新建项目后弹出知识诊断"""
    global diagnosis_skipped_forever
    if diagnosis_skipped_forever:
        return

    def _ask_diagnosis():
        with ui.dialog(value=True) as d, ui.card().classes("w-96"):
            ui.label("开始知识诊断？").classes("text-lg font-semibold mb-2")
            ui.label("通过5分钟快速测试，系统能更准确地推荐适合你的学习内容。").classes("text-sm text-secondary mb-4")
            with ui.row().classes("gap-2 justify-end w-full"):
                ui.button("不再提示", on_click=lambda: _skip_forever(d)).props("flat").classes("text-xs")
                ui.button("跳过", on_click=lambda: _skip_once(d)).props("flat").classes("text-xs")
                ui.button("开始", on_click=lambda: _start(diagnosis_dialog, d)).classes("btn-primary").props("size=sm")

    def _skip_once(dialog):
        dialog.close()
        ui.notify("已跳过知识诊断。可随时在项目设置中重新开始。", type="info")

    def _skip_forever(dialog):
        global diagnosis_skipped_forever
        diagnosis_skipped_forever = True
        dialog.close()
        ui.notify("已记住你的选择。以后新建项目将不再提示。", type="info")

    def _start(diag, dialog):
        dialog.close()
        diagnosis_dialog.open()

    diagnosis_dialog = DiagnosisDialog(on_complete=_on_diagnosis_complete)
    _ask_diagnosis()


def _on_diagnosis_complete(result: dict | None):
    if result is None:
        return
    add_msg = ui_ctx.get("add_message")
    if add_msg:
        add_msg("user", "完成知识诊断")
        add_msg("assistant", f"**知识诊断报告**\n\n{result['summary']}\n\n系统已基于你的知识画像，为你准备学习内容。")


def _on_follow_up(hint: str):
    ui.notify(f"追问功能即将接入: {hint}", type="info")


def _handle_message(text: str):
    if not current_project:
        ui.notify("请先创建或选择一个项目", type="warning")
        return
    add_msg = ui_ctx.get("add_message")
    show_progress = ui_ctx.get("show_progress")
    hide_progress = ui_ctx.get("hide_progress")

    if add_msg:
        add_msg("user", text)
    if show_progress:
        show_progress(["分析问题", "检索知识库", "生成回答"])
    if add_msg:
        add_msg("assistant", f"收到你的问题：「{text}」\n\nAgent 功能即将接入，届时将由学情诊断 → 知识生成 → 审核裁判三 Agent 协同生成回答。")


def _on_theme_change():
    ui.query("body").style(f"background-color: {theme.current['bg']}; color: {theme.current['text']};")
    ui.add_head_html(f"<style>{theme.css_var()}</style>")


ui_ctx = {}


@ui.page("/")
def main_page():
    ctx = build_ui()
    for k, v in ctx.items():
        ui_ctx[k] = v


ng_app.add_static_files("/static", "backend/static") if __import__("os").path.exists("backend/static") else None

ui.run_with(
    app,
    title="CoAgent-Learn · AI多智能体学习助手",
    favicon=None,
    dark=None,
    language="zh-CN",
    storage_secret="coagent-learn-dev",
)
