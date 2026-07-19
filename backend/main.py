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
        raise RuntimeError(
            f"缺少必需的环境变量: {', '.join(missing)}。"
            "请复制 .env.template 为 .env 并填写。"
        )
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
messages = []  # {"role": "user"/"assistant", "content": str}
current_project = None


def build_ui():
    # CSS全局注入
    ui.add_head_html(f"<style>{theme.css_var()}</style>")

    # 强制深色背景
    ui.query("body").style(f"background-color: {theme.current['bg']}; color: {theme.current['text']}; margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;")

    # --- 主体三栏布局 ---
    with ui.row().classes("w-screen h-screen no-wrap overflow-hidden").style("margin: 0; padding: 0;"):
        # ===== 左侧项目栏 =====
        left_panel = ui.column().classes("sidebar h-full").style("width: 260px; min-width: 260px; overflow-y: auto;")
        with left_panel:
            sidebar = ProjectSidebar(on_select=_on_project_select)
            sidebar.render()

            ui.space()

            # 设置按钮（左下角）
            with ui.row().classes("w-full p-2"):
                settings_panel = SettingsPanel(theme, _on_theme_change)
                settings_panel.render_button()

        # ===== 中间主区域 =====
        center_panel = ui.column().classes("flex-1 h-full").style("min-width: 0;")
        with center_panel:
            # 可收起的反馈横条
            stats_bar = StatsBar()
            stats_bar.render()

            # 消息列表
            messages_container = ui.column().classes("flex-1 w-full overflow-y-auto px-6 py-4 gap-4")

            def add_message(role: str, content: str):
                """向消息列表添加消息"""
                messages.append({"role": role, "content": content})
                with messages_container:
                    bg = theme.current["card"] if role == "user" else "transparent"
                    with ui.card().classes("w-full message-user" if role == "user" else "w-full message-assistant").style(
                        f"background-color: {bg}; max-width: 85%; align-self: {'flex-end' if role == 'user' else 'flex-start'};"
                    ):
                        ui.label(content).classes("text-sm whitespace-pre-wrap")
                messages_container.scroll_to(percent=1.0)

            # 欢迎消息
            with messages_container:
                with ui.column().classes("w-full items-center justify-center py-16 gap-3"):
                    ui.label("CoAgent-Learn").classes("text-2xl font-semibold")
                    ui.label("基于多智能体协同的AI学习助手。选择一个项目或新建项目开始。").classes("text-sm")

            # 输入区域（底部固定）
            input_container = ui.column().classes("w-full")
            with input_container:
                chat_input = ChatInput(on_send=_handle_message)
                chat_input.render()

        # ===== 右侧栏（占位） =====
        right_panel = ui.column().classes("right-panel h-full").style("width: 280px; min-width: 280px; overflow-y: auto;")
        with right_panel:
            with ui.column().classes("p-4 gap-3 w-full h-full justify-center items-center"):
                ui.icon("forum", size="32px").classes("text-secondary")
                ui.label("第二对话窗口").classes("text-sm font-medium")
                ui.label("此处将跟随主窗口内容，自动提供追问入口与概念解析。").classes("text-xs text-secondary text-center px-4")
                ui.label("功能暂未实现").classes("text-xs text-gray-400")

    return {
        "sidebar": sidebar,
        "stats_bar": stats_bar,
        "chat_input": chat_input,
        "settings": settings_panel,
        "add_message": add_message,
    }


def _on_project_select(name: str):
    global current_project
    current_project = name
    ui.notify(f"已切换到项目「{name}」", type="info")


def _handle_message(text: str):
    """发送消息的回调"""
    if not current_project:
        ui.notify("请先创建或选择一个项目", type="warning")
        return
    # 简单回显，后续接入Agent
    ui_ctx["add_message"]("user", text)
    ui_ctx["add_message"](
        "assistant",
        f"收到你的问题：「{text}」\n\n（Agent功能即将接入，届时将由学情诊断→知识生成→审核裁判三Agent协同生成回答。）",
    )


def _on_theme_change():
    ui.query("body").style(f"background-color: {theme.current['bg']}; color: {theme.current['text']};")
    ui.add_head_html(f"<style>{theme.css_var()}</style>")


# 全局上下文
ui_ctx = {}


@ui.page("/")
def main_page():
    ctx = build_ui()
    for k, v in ctx.items():
        ui_ctx[k] = v


ng_app.add_static_files("/static", "backend/static")

# NiceGUI挂载到FastAPI
ui.run_with(
    app,
    title="CoAgent-Learn · AI多智能体学习助手",
    favicon=None,
    dark=None,
    language="zh-CN",
    storage_secret="coagent-learn-dev",
)
