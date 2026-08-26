# -*- coding: utf-8 -*-
"""共用工具：调智谱裁判（异构 judge）+ 句子切分"""
import json
import re
import requests
import config


def zhipu_judge_json(prompt):
    """调智谱裁判，要求返回 JSON（容错解析）"""
    raw = zhipu_judge_text(prompt + "\n\n只输出 JSON，不要额外文字。")
    try:
        return json.loads(raw)
    except Exception:
        s, e = raw.find("["), raw.rfind("]")
        if s >= 0 and e > s:
            try:
                return json.loads(raw[s:e + 1])
            except Exception:
                pass
        s, e = raw.find("{"), raw.rfind("}")
        if s >= 0 and e > s:
            try:
                return json.loads(raw[s:e + 1])
            except Exception:
                pass
        return []


def zhipu_judge_text(prompt):
    """调智谱裁判，返回纯文本"""
    resp = requests.post(
        config.JUDGE_BASE_URL + "/chat/completions",
        json={"model": config.JUDGE_MODEL, "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer " + config.JUDGE_API_KEY},
        timeout=120,
        proxies={"http": None, "https": None},
    )
    return resp.json()["choices"][0]["message"]["content"]


def split_sentences(text):
    """按句号/问号/叹号/分号/换行切句"""
    parts = re.split(r"[。！？!?；;\n]", text or "")
    return [p.strip() for p in parts if p.strip()]
