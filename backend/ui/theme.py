"""主题定义 — Claude风格浅色(微黄) + 深色(黑灰)"""
from nicegui import ui

# Claude-style warm light theme
LIGHT = {
    "bg": "#faf8f5",
    "sidebar": "#f5f2ed",
    "card": "#ffffff",
    "border": "#e8e4e0",
    "text": "#1a1a1a",
    "text_secondary": "#6b6b6b",
    "accent": "#c75f1a",  # Claude橙
    "accent_hover": "#b35214",
    "hover": "#f0ece6",
    "input_bg": "#ffffff",
    "input_border": "#d4cfc9",
    "shadow": "0 1px 3px rgba(0,0,0,0.06)",
}

# Claude-style dark theme (black, not gray)
DARK = {
    "bg": "#0d0d0d",
    "sidebar": "#131313",
    "card": "#1a1a1a",
    "border": "#2a2a2a",
    "text": "#ececec",
    "text_secondary": "#999999",
    "accent": "#e06a2c",
    "accent_hover": "#f07a3c",
    "hover": "#222222",
    "input_bg": "#1a1a1a",
    "input_border": "#333333",
    "shadow": "0 1px 3px rgba(0,0,0,0.3)",
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
        body {{
            background-color: {c['bg']};
        }}
        .sidebar {{
            background-color: {c['sidebar']};
            border-right: 1px solid {c['border']};
        }}
        .chat-area {{
            background-color: {c['bg']};
        }}
        .message-user {{
            background-color: {c['card']};
            border: 1px solid {c['border']};
        }}
        .message-assistant {{
            background-color: transparent;
        }}
        .input-area {{
            background-color: {c['bg']};
            border-top: 1px solid {c['border']};
        }}
        .input-box {{
            background-color: {c['input_bg']};
            border: 1px solid {c['input_border']};
            border-radius: 12px;
        }}
        .input-box:focus-within {{
            border-color: {c['accent']};
            box-shadow: 0 0 0 2px {c['accent']}20;
        }}
        .btn-primary {{
            background-color: {c['accent']};
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            cursor: pointer;
            font-weight: 500;
            transition: background-color 0.2s;
        }}
        .btn-primary:hover {{
            background-color: {c['accent_hover']};
        }}
        .btn-secondary {{
            background-color: transparent;
            color: {c['text']};
            border: 1px solid {c['border']};
            border-radius: 8px;
            padding: 8px 16px;
            cursor: pointer;
            transition: background-color 0.2s;
        }}
        .btn-secondary:hover {{
            background-color: {c['hover']};
        }}
        .project-item {{
            padding: 10px 14px;
            border-radius: 8px;
            cursor: pointer;
            color: {c['text']};
            transition: background-color 0.15s;
            font-size: 14px;
        }}
        .project-item:hover {{
            background-color: {c['hover']};
        }}
        .project-item.active {{
            background-color: {c['hover']};
            font-weight: 600;
        }}
        .section-title {{
            color: {c['text_secondary']};
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 8px 4px;
        }}
        .stats-bar {{
            background-color: {c['card']};
            border: 1px solid {c['border']};
            border-radius: 10px;
        }}
        .right-panel {{
            background-color: {c['sidebar']};
            border-left: 1px solid {c['border']};
        }}
        a, .link {{
            color: {c['accent']};
        }}
        ::-webkit-scrollbar {{
            width: 6px;
        }}
        ::-webkit-scrollbar-track {{
            background: transparent;
        }}
        ::-webkit-scrollbar-thumb {{
            background: {c['border']};
            border-radius: 3px;
        }}
        """


theme = Theme()
