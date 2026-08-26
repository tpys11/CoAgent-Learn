# -*- coding: utf-8 -*-
"""LLM-as-Judge：用另一家厂商的模型当裁判，判幻觉/难度/覆盖"""
import json
import requests
import config


def _judge(prompt: str) -> str:
    resp = requests.post(
        config.JUDGE_BASE_URL + "/chat/completions",
        json={"model": config.JUDGE_MODEL, "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer " + config.JUDGE_API_KEY},
        timeout=120,
        proxies={"http": None, "https": None},  # 绕过系统代理（智谱国内直连）
    )
    d = resp.json()
    return d["choices"][0]["message"]["content"]


def _judge_json(prompt: str):
    """调裁判，要求返回 JSON，容错解析"""
    raw = _judge(prompt + "\n\n只输出 JSON，不要额外文字。")
    try:
        return json.loads(raw)
    except Exception:
        s = raw.find("["); e = raw.rfind("]")
        if s >= 0 and e > s:
            try:
                return json.loads(raw[s:e+1])
            except Exception:
                pass
        return []


def judge_hallucination(content: str, fact_list: list, trap_list: list) -> list:
    """判幻觉：返回内容里的幻觉陈述列表"""
    prompt = (
        "下面是一段 AI 生成的学习内容，请找出其中所有【幻觉陈述】（编造的、错误的、或与正确事实清单冲突的内容）。\n\n"
        "学习内容：\n" + content[:4000] + "\n\n"
        "正确事实清单：" + json.dumps(fact_list, ensure_ascii=False) + "\n"
        "陷阱事实（这些是错的，若被复述即为幻觉）：" + json.dumps(trap_list, ensure_ascii=False)
    )
    return _judge_json(prompt)


def judge_difficulty(content: str) -> str:
    """判难度：返回 初级/中级/高级"""
    prompt = (
        "下面是一段学习内容，请判断它面向学习者的难度档（考虑术语密度、前提假设、示例复杂度）：\n\n"
        + content[:3000] + "\n\n只回答一个词：初级 或 中级 或 高级。"
    )
    raw = _judge(prompt).strip()
    for level in ["高级", "中级", "初级"]:
        if level in raw:
            return level
    return "中级"


def judge_coverage(content: str, knowledge_list: list) -> list:
    """判覆盖：返回内容里实际覆盖到的知识点（只从清单里取）"""
    prompt = (
        "下面是一段 AI 生成的学习内容，请找出其中【实际覆盖到】的核心知识点（只从给定清单里选，用清单原文）。\n\n"
        "学习内容：\n" + content[:4000] + "\n\n"
        "核心知识点清单：" + json.dumps(knowledge_list, ensure_ascii=False)
    )
    return _judge_json(prompt)
