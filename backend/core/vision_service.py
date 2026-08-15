# -*- coding: utf-8 -*-
"""视觉理解服务：图片描述（多模态对话）。
优先走硅基流动视觉模型（复用硅基流动 Key，Qwen2.5-VL 等），
未配置时回退智谱 GLM-4V。地址/key/模型均可通过设置界面动态配置。"""
import os
import base64
import requests


SILICONFLOW_CHAT = "https://api.siliconflow.cn/v1/chat/completions"
ZHIPU_CHAT = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def _siliconflow_key():
    """硅基流动 Key（VL 卡或 BGE 卡任一）"""
    try:
        from core.config import config as _cfg
        return getattr(_cfg, "VL_API_KEY", "") or getattr(_cfg, "EMBEDDING_API_KEY", "")
    except Exception:
        return ""


def _zhipu_key():
    """智谱 Key（回退通道）"""
    try:
        from core.config import config as _cfg
        if getattr(_cfg, "IMAGE_API_KEY", ""):
            return _cfg.IMAGE_API_KEY
        if getattr(_cfg, "ZHIPU_API_KEY", ""):
            return _cfg.ZHIPU_API_KEY
    except Exception:
        pass
    return os.getenv("IMAGE_API_KEY", "") or os.getenv("ZHIPU_API_KEY", "")


def _desc_model() -> str:
    try:
        from core.config import config as _cfg
        return getattr(_cfg, "IMAGE_DESC_MODEL", "") or "Qwen/Qwen2.5-VL-72B-Instruct"
    except Exception:
        return "Qwen/Qwen2.5-VL-72B-Instruct"


def describe_image(image_data: str, prompt: str = "请描述这张图片的内容") -> str:
    """识别图片，返回文字描述（硅基流动优先，回退智谱）
    image_data: base64 字符串（不含 data: 前缀）或 http(s) URL
    """
    url = image_data if image_data.startswith("http") else ("data:image/png;base64," + image_data)
    content = [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": url}}]
    # 1) 硅基流动（复用已配的硅基流动 Key）
    key = _siliconflow_key()
    if key:
        try:
            resp = requests.post(SILICONFLOW_CHAT,
                json={"model": _desc_model(), "messages": [{"role": "user", "content": content}]},
                headers={"Authorization": "Bearer " + key}, timeout=40)
            d = resp.json()
            if resp.status_code == 200 and d.get("choices"):
                return d["choices"][0]["message"]["content"] or ""
            if resp.status_code == 401:
                pass  # key 无效，回退智谱
            else:
                return "[视觉服务] 识别失败: " + str(d.get("error", d))[:200]
        except Exception as e:
            return "[视觉服务] 异常: " + str(e)[:200]
    # 2) 智谱回退
    key = _zhipu_key()
    if not key:
        return "[视觉服务] 未配置视觉 Key（请填写硅基流动或智谱 Key）"
    try:
        resp = requests.post(ZHIPU_CHAT,
            json={"model": "glm-4v-flash", "messages": [{"role": "user", "content": content}]},
            headers={"Authorization": "Bearer " + key}, timeout=40)
        d = resp.json()
        if "choices" in d:
            return d["choices"][0]["message"]["content"] or ""
        return "[视觉服务] 识别失败: " + str(d.get("error", d))[:200]
    except Exception as e:
        return "[视觉服务] 异常: " + str(e)[:200]
