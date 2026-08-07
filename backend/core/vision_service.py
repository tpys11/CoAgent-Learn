# -*- coding: utf-8 -*-
"""视觉理解服务：调用智谱 glm-4v-flash 识别图片内容"""
import os
import base64
import requests


ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4/chat/completions"


def _get_key():
    """从环境变量读智谱 key（.env 配置，不提交）"""
    return os.getenv("ZHIPU_API_KEY", "")


def describe_image(image_data: str, prompt: str = "请描述这张图片的内容") -> str:
    """识别图片，返回文字描述
    image_data: base64 字符串（不含 data: 前缀）或 http(s) URL
    """
    key = _get_key()
    if not key:
        return "[视觉服务] 未配置 ZHIPU_API_KEY，无法识图"
    url = image_data if image_data.startswith("http") else ("data:image/png;base64," + image_data)
    try:
        resp = requests.post(ZHIPU_BASE,
            json={"model": "glm-4v-flash", "messages": [{"role": "user", "content": [
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
