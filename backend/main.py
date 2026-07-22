"""
CoAgent-Learn 后端主入口
FastAPI + NiceGUI前端 + LangGraph多智能体协同调度 + RAG向量检索
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


from nicegui import ui, app as ng_app
from backend.ui.theme import theme
from backend.ui.sidebar import ProjectSidebar
from backend.ui.stats_bar import StatsBar
from backend.ui.chat_input import ChatInput
from backend.ui.diagnosis import DiagnosisDialog
from backend.ui.settings import SettingsPanel
from backend.ui.second_window import SecondWindow
from db.user_profile import update_knowledge_map, log_interaction

messages = []
current_project = None
diagnosis_skipped_forever = False
timer_started = False


def build_ui():
    ui.add_head_html(f"<style>{theme.css_var()}</style>")

    # ===== 三栏全屏容器 =====
    with ui.row().style(
        "width: 100vw; height: 100vh; margin: 0; padding: 8px;"
        "flex-wrap: nowrap; overflow: hidden; gap: 8px; box-sizing: border-box;"
    ):

        # ===== 左侧栏 =====
        with ui.column().classes("sidebar").style(
            "width: 240px; min-width: 240px; height: 100%;"
            "overflow-y: auto; padding: 8px 0; margin: 0;"
        ):
            sidebar = ProjectSidebar(on_select=_on_project_select, on_new=_on_project_created)
            sidebar.render()
            ui.space()
            with ui.row().style("padding: 6px 10px; justify-content: flex-end;"):
                settings_panel = SettingsPanel(theme, _on_theme_change)
                settings_panel.render_button()

        # ===== 中间 =====
        with ui.column().style(
            "flex: 1; height: 100%; min-width: 0; display: flex;"
            "flex-direction: column; padding: 0; margin: 0;"
        ):
            stats_bar = StatsBar(on_idle=_on_idle)
            stats_bar.render()

            # 工作过程
            progress_container = ui.row().style(
                "width: 100%; padding: 0 20px; gap: 8px; min-height: 22px; flex-wrap: wrap;"
            )
            progress_container.set_visibility(False)

            def show_progress(steps: list[str]):
                progress_container.clear()
                progress_container.set_visibility(True)
                with progress_container:
                    for i, step_text in enumerate(steps):
                        with ui.row().classes("step-row fade-in").style(
                            f"animation-delay: {i * 0.12}s;"
                        ):
                            dot = ui.element("div").classes("step-dot active")
                            ui.label(step_text).classes("step-label")
                            ui.timer(
                                0.8 + i * 0.4,
                                lambda d=dot: d.classes(remove="active").classes(add="done"),
                                once=True,
                            )

            def hide_progress():
                progress_container.clear()
                progress_container.set_visibility(False)

            # 消息列表
            messages_container = ui.column().style(
                "flex: 1; width: 100%; overflow-y: auto; padding: 8px 20px; gap: 6px;"
            )

            def add_message(role: str, content: str):
                messages.append({"role": role, "content": content})
                with messages_container:
                    align = "flex-end" if role == "user" else "flex-start"
                    with ui.card().classes(f"message-{role} fade-in").style(
                        f"max-width: 80%; align-self: {align};"
                    ):
                        ui.markdown(content).style("font-size: 14px;")
                messages_container.scroll_to(percent=1.0)

            # 欢迎页
            welcome_container = ui.column().style("width: 100%;")

            def render_welcome():
                welcome_container.clear()
                with welcome_container:
                    with ui.column().style(
                        "width: 100%; align-items: center; padding: 32px 0; gap: 6px;"
                    ):
                        ui.label("🤖").style("font-size: 48px;")
                        ui.label("CoAgent-Learn").style(
                            "font-size: 28px; font-weight: 700; color: #1a1a1a;"
                        )
                        ui.label("基于多智能体协同的AI学习助手").style(
                            "font-size: 14px; color: #888;"
                        )
                        if current_project:
                            ui.label(f"当前项目: {current_project}").style(
                                "font-size: 12px; color: #888; margin-top: 4px;"
                            )
                        else:
                            ui.label("选择或新建一个项目开始学习").style(
                                "font-size: 12px; color: #aaa; margin-top: 4px;"
                            )

            render_welcome()

            # 输入区
            with ui.column().style("width: 100%;"):
                chat_input = ChatInput(on_send=_handle_message)
                chat_input.render()

        # ===== 右侧栏 =====
        with ui.column().classes("right-panel").style(
            "width: 260px; min-width: 260px; height: 100%;"
            "overflow-y: auto; padding: 8px 0; margin: 0;"
        ):
            with ui.column().style("padding: 10px; gap: 6px; width: 100%;"):
                with ui.row().style("width: 100%; justify-content: space-between; align-items: center;"):
                    ui.label("知识图谱").style("font-size: 12px; font-weight: 600;")
                    ui.button(icon="open_in_new", on_click=_open_knowledge_graph).props(
                        "flat dense size=sm"
                    )

                with ui.card().classes("kg-placeholder").style(
                    "width: 100%; height: 90px; display: flex;"
                    "align-items: center; justify-content: center;"
                ):
                    ui.label("知识图谱预览").style("font-size: 12px; color: #aaa;")

            second_window = SecondWindow(on_follow_up=_on_follow_up)
            second_window.render(ui.column().style("width: 100%;"))

    return {
        "sidebar": sidebar,
        "stats_bar": stats_bar,
        "chat_input": chat_input,
        "settings": settings_panel,
        "add_message": add_message,
        "show_progress": show_progress,
        "hide_progress": hide_progress,
        "second_window": second_window,
        "welcome_container": welcome_container,
        "render_welcome": render_welcome,
    }


# ===== 回调 =====

def _on_project_select(name: str):
    global current_project
    current_project = name
    ui.notify(f"已切换到项目「{name}」", type="info")
    sb = ui_ctx.get("stats_bar")
    if sb and not timer_started:
        sb.start_timer()


def _on_project_created(name: str):
    global diagnosis_skipped_forever
    if diagnosis_skipped_forever:
        return

    def _ask_diagnosis():
        with ui.dialog(value=True) as d, ui.card().style("width: 320px;"):
            ui.label("开始知识诊断？").style("font-size: 16px; font-weight: 600; margin-bottom: 6px;")
            ui.label(
                "通过5分钟快速测试，系统能更准确地推荐适合你的学习内容。"
            ).style("font-size: 13px; color: #888; margin-bottom: 12px;")
            with ui.row().style("gap: 8px; justify-content: flex-end; width: 100%;"):
                ui.button("不再提示", on_click=lambda: _skip_forever(d)).props("flat").style("font-size: 12px;")
                ui.button("跳过", on_click=lambda: _skip_once(d)).props("flat").style("font-size: 12px;")
                ui.button("开始", on_click=lambda: _start(diagnosis_dialog, d)).style(
                    "background-color: #c75f1a !important; color: white !important; font-size: 12px; font-weight: 600;"
                )

    def _skip_once(dialog):
        dialog.close()
        ui.notify("已跳过知识诊断", type="info")

    def _skip_forever(dialog):
        global diagnosis_skipped_forever
        diagnosis_skipped_forever = True
        dialog.close()

    def _start(diag, dialog):
        dialog.close()
        diagnosis_dialog.open()

    diagnosis_dialog = DiagnosisDialog(on_complete=_on_diagnosis_complete)
    _ask_diagnosis()


def _on_diagnosis_complete(result: dict | None):
    if result is None:
        return
    try:
        update_knowledge_map(current_project, result.get("raw_answers", {}))
    except Exception:
        pass
    add_msg = ui_ctx.get("add_message")
    if add_msg:
        add_msg("user", "完成知识诊断")
        add_msg("assistant", f"**知识诊断报告**\n\n{result.get('summary', '')}")
    sb = ui_ctx.get("stats_bar")
    if sb:
        sb.start_timer()


def _on_follow_up(hint: str):
    ui.notify(f"追问: {hint}", type="info")


def _handle_message(text: str):
    if not current_project:
        ui.notify("请先创建或选择一个项目", type="warning")
        return
    add_msg = ui_ctx.get("add_message")
    show_progress = ui_ctx.get("show_progress")
    sb = ui_ctx.get("stats_bar")
    sw = ui_ctx.get("second_window")

    if add_msg:
        add_msg("user", text)
        try:
            log_interaction(current_project, "user", text[:200], "", 0)
        except Exception:
            pass

    if show_progress:
        show_progress(["分析输入", "检索知识库", "多智能体协同", "生成输出"])

    if add_msg:
        add_msg(
            "assistant",
            f"收到你的问题：「{text}」\n\nAgent 功能即将接入。",
        )

    if sw:
        sw.analyze_and_suggest(text)

    if sb:
        sb.record_activity()


def _on_theme_change():
    ui.add_head_html(f"<style>{theme.css_var()}</style>")


def _on_idle():
    ui.notify("已暂停计时 — 30秒无操作", type="info", position="top")


def _open_knowledge_graph():
    ui.notify("知识图谱功能即将实现", type="info")


ui_ctx = {}


@ui.page("/")
def main_page():
    ctx = build_ui()
    for k, v in ctx.items():
        ui_ctx[k] = v


ng_app.add_static_files("/static", "backend/static") if __import__("os").path.exists(
    "backend/static"
) else None

ui.run_with(
    app,
    title="CoAgent-Learn · AI多智能体学习助手",
    favicon=None,
    dark=None,
    language="zh-CN",
    storage_secret="coagent-learn-dev",
    tailwind=False,
)
