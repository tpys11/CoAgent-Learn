# -*- coding: utf-8 -*-
"""思维链持久化纯函数（Loop6）：显示名归一 + 连续同名合并。
语义与旧引擎 _merge_mindchain 对齐（合并连续同名、丢弃空内容），供 v2 各阶段采集后统一整形。"""
import re


def display_name(name: str) -> str:
    """思维链显示名：去掉 ·规划/·生成 阶段后缀；历史旧名/极速档伪标题统一为学习助手。"""
    if not name or not isinstance(name, str):
        return name
    m = re.match(r"^(.*?)·(规划|生成)$", name)
    base = m.group(1) if m else name
    if base in ("主 Agent", "主Agent", "综合概述性记忆"):
        return "学习助手"
    return base


def merge_consecutive(entries: list) -> list:
    """合并同名 agent 的连续思维链条目（同一 agent 规划→生成只保留一个标题），
    丢弃空内容条目；非连续同名各自保留。entries 元素形如 {"agent","content"}，
    返回新列表（不修改入参）。"""
    out: list = []
    for it in entries:
        if not isinstance(it, dict):
            continue
        name = it.get("agent", "")
        content = (it.get("content") or "").strip()
        if not content:
            continue
        dn = display_name(name)
        if out and display_name(out[-1].get("agent", "")) == dn and dn:
            last = out[-1]
            last["content"] = (last["content"] + "\n" + content).strip()
            continue
        out.append({"agent": name, "content": content})
    return out
