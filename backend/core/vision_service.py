# -*- coding: utf-8 -*-
"""视觉理解服务：调用 OpenAI 兼容多模态视觉接口（默认智谱 glm-4v-flash）识别图片内容。
地址/key/模型由动态配置（settings 表，前端「其他选择」可改）指定，未配置回退 .env。"""
import os
import base64
import requests


ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def _get_key():
    """从动态配置读视觉 API key（IMAGE_API_KEY 优先，回退 ZHIPU_API_KEY / .env）"""
    try:
        from core.config import config as _cfg
        if getattr(_cfg, "IMAGE_API_KEY", ""):
            return _cfg.IMAGE_API_KEY
        if getattr(_cfg, "ZHIPU_API_KEY", ""):
            return _cfg.ZHIPU_API_KEY
    except Exception:
        pass
    return os.getenv("IMAGE_API_KEY", "") or os.getenv("ZHIPU_API_KEY", "")


def _get_base_url() -> str:
    try:
        from core.config import config as _cfg
        return getattr(_cfg, "IMAGE_BASE_URL", "") or ZHIPU_BASE
    except Exception:
        return ZHIPU_BASE


def _get_model() -> str:
    try:
        from core.config import config as _cfg
        return getattr(_cfg, "IMAGE_MODEL", "") or "glm-4v-flash"
    except Exception:
        return "glm-4v-flash"


def describe_image(image_data: str, prompt: str = "请描述这张图片的内容") -> str:
    """识别图片，返回文字描述
    image_data: base64 字符串（不含 data: 前缀）或 http(s) URL
    """
    key = _get_key()
    if not key:
        return "[视觉服务] 未配置视觉 API Key，无法识图（请在 设置→AI 服务→其他选择 配置）"
    url = image_data if image_data.startswith("http") else ("data:image/png;base64," + image_data)
    try:
        resp = requests.post(_get_base_url(),
            json={"model": _get_model(), "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": url}}
            ]}]},
            headers={"Authorization": "Bearer " + key}, timeout=30)
        d = resp.json()
        if "choices" in d:
            return d["choices"][0]["message"]["content"] or ""
        return "[视觉服务] 识别失败: " + str(d.get("error", d))[:200]
    except Exception as e:
        return "[视觉服务] 异常: " + str(e)[:200]
