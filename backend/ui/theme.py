"""主题定义 — Claude风格浅色(微黄) + 深色(黑灰)，高对比度优化版"""
from nicegui import ui

LIGHT = {
    "bg": "#faf8f5",
    "sidebar": "#f0ebe4",
    "card": "#ffffff",
    "border": "#dad4cd",
    "text": "#1a1a1a",
    "text_secondary": "#555555",
    "accent": "#c75f1a",
    "accent_hover": "#a84a10",
    "accent_light": "#fef3eb",
    "hover": "#e8e2d9",
    "input_bg": "#ffffff",
    "input_border": "#c4beb6",
    "shadow": "0 1px 3px rgba(0,0,0,0.06)",
}

DARK = {
    "bg": "#0d0d0d",
    "sidebar": "#181818",
    "card": "#1f1f1f",
    "border": "#333333",
    "text": "#ebebeb",
    "text_secondary": "#999999",
    "accent": "#e37234",
    "accent_hover": "#f58a4c",
    "accent_light": "#2d1c10",
    "hover": "#282828",
    "input_bg": "#1f1f1f",
    "input_border": "#404040",
    "shadow": "0 1px 3px rgba(0,0,0,0.45)",
}


class Theme:
    def __init__(self):
        self.current = LIGHT
        self.is_dark = False

    def toggle(self):
        self.is_dark = not self.is_dark
        self.current = DARK if self.is_dark else LIGHT
        return self.current

    def css_var(self) -> str:
        c = self.current
        return f"""
        :root {{
            --q-primary: {c['accent']};
            --q-secondary: {c['text_secondary']};
            --q-accent: {c['accent']};
        }}
        html, body, #app {{
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background-color: {c['bg']} !important;
            color: {c['text']};
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
        }}

        /* ---- 面板 ---- */
        .sidebar {{
            background-color: {c['sidebar']};
            border-right: 1px solid {c['border']};
            flex-shrink: 0;
        }}
        .right-panel {{
            background-color: {c['sidebar']};
            border-left: 1px solid {c['border']};
            flex-shrink: 0;
        }}

        /* ---- 卡片 ---- */
        .q-card {{
            background-color: {c['card']};
            border: 1px solid {c['border']};
            box-shadow: {c['shadow']};
        }}

        /* ---- 消息 ---- */
        .message-user {{
            background-color: {c['accent_light']} !important;
            border: 1px solid {c['accent']}40 !important;
            border-radius: 14px 14px 4px 14px !important;
            padding: 10px 14px !important;
        }}
        .message-assistant {{
            background-color: transparent !important;
            border: 1px solid transparent !important;
            border-radius: 14px 14px 14px 4px !important;
            padding: 10px 14px !important;
        }}

        /* ---- 输入区 ---- */
        .input-box {{
            background-color: {c['input_bg']};
            border: 1px solid {c['input_border']};
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 14px;
        }}
        .input-box:focus-within {{
            border-color: {c['accent']};
            box-shadow: 0 0 0 3px {c['accent']}25;
        }}

        /* ---- 项目列表 ---- */
        .section-title {{
            color: {c['text_secondary']};
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 10px 6px 4px;
        }}
        .project-item {{
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            color: {c['text']};
            font-size: 13px;
            transition: background-color 0.12s;
        }}
        .project-item:hover {{
            background-color: {c['hover']};
        }}
        .project-item.active {{
            background-color: {c['accent_light']};
            color: {c['accent']} !important;
            font-weight: 600;
        }}

        /* ---- 横条 ---- */
        .stats-bar {{
            background-color: {c['card']};
            border: 1px solid {c['border']};
            border-radius: 10px;
            margin: 6px 6px 4px;
        }}

        /* ---- 按钮通用 ---- */
        .q-btn {{
            font-weight: 500;
        }}
        /* flat按钮增加可见性 */
        .q-btn--flat {{
            color: {c['text']} !important;
        }}
        .q-btn--flat:hover {{
            background-color: {c['hover']} !important;
        }}

        /* ---- 分隔线 ---- */
        .q-separator {{
            background-color: {c['border']} !important;
        }}

        /* ---- 滚动条 ---- */
        ::-webkit-scrollbar {{ width: 5px; height: 5px; }}
        ::-webkit-scrollbar-track {{ background: transparent; }}
        ::-webkit-scrollbar-thumb {{ background: {c['border']}; border-radius: 3px; }}
        ::-webkit-scrollbar-thumb:hover {{ background: {c['text_secondary']}; }}

        /* ---- 动画 ---- */
        @keyframes fadeIn {{
            from {{ opacity: 0; transform: translateY(6px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        @keyframes pulse {{
            0% {{ opacity: 1; }}
            50% {{ opacity: 0.4; }}
            100% {{ opacity: 1; }}
        }}
        .fade-in {{ animation: fadeIn 0.25s ease; }}
        .pulse {{ animation: pulse 1.8s ease-in-out infinite; }}

        /* ---- 工作步骤 ---- */
        .step-row {{
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 1px 0;
        }}
        .step-dot {{
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: {c['border']};
            flex-shrink: 0;
            transition: all 0.3s;
        }}
        .step-dot.done {{
            background: #22c55e;
            box-shadow: 0 0 4px #22c55e;
        }}
        .step-dot.active {{
            background: {c['accent']};
            animation: pulse 1.5s ease-in-out infinite;
        }}
        .step-label {{
            font-size: 11px;
            color: {c['text_secondary']};
        }}

        /* ---- 右侧面板内部 ---- */
        .right-panel .q-card {{
            background-color: {c['card']};
            border: 1px solid {c['border']};
        }}

        /* ---- select下拉增强 ---- */
        .q-field--outlined .q-field__control {{
            border-color: {c['input_border']} !important;
        }}
        .q-field--outlined .q-field__control:hover {{
            border-color: {c['accent']} !important;
        }}

        /* ---- 知识图谱卡片 ---- */
        .kg-placeholder {{
            background-color: {c['card']};
            border: 1px dashed {c['accent']}50;
            border-radius: 8px;
        }}
        """


theme = Theme()
