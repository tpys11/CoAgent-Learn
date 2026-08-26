# -*- coding: utf-8 -*-
"""指标3 · 核心知识点覆盖率（目标 ≥90%）。

定义（评估体系设计稿 L3）：被生成资源覆盖的核心知识点数 / 核心知识点总数。
数据源：kb_tree 标题树（知识点天然清单）× 生成资源文本命中。

双通道：
- 关键词通道（主，本文件实现）：知识点标题（含去空格归一）在回答文本中出现即命中。
  对中文标题足够稳；英文术语按词边界匹配避免子串误伤。
- 语义通道（接缝）：embed 相似度判定，接口预留 semantic_hit_fn 参数——
  离线测试注入确定性假函数，生产接入向量检索（复用 kb_vectors 管线）。
"""
import re


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", (s or ""))


def hit_kps(answer: str, kps: list, semantic_hit_fn=None) -> dict:
    """单条回答 × 知识点清单 → 命中明细。

    kps: ["角动量守恒", ...]；semantic_hit_fn(kp, answer) -> bool 为可选语义通道。
    返回 {hit: [命中的kp], miss: [未命中kp], total}。"""
    text = _norm(answer or "")
    low = (answer or "").lower()
    hit, miss = [], []
    for kp in kps or []:
        kp_s = str(kp or "").strip()
        if not kp_s:
            continue
        if re.search(r"[A-Za-z]", kp_s):
            # 含英文字母的知识点：按不区分大小写整词匹配，防子串误伤（"RAG"⊂"RAGE"）
            try:
                matched = re.search(r"\b" + re.escape(kp_s.strip()) + r"\b", low) is not None
            except re.error:
                matched = False
        else:
            # 纯中文/数字标题：归一去空格子串匹配
            matched = _norm(kp_s) in text
        if not matched and semantic_hit_fn is not None:
            try:
                matched = bool(semantic_hit_fn(kp_s, answer or ""))
            except Exception:
                matched = False
        (hit if matched else miss).append(kp_s)
    return {"hit": hit, "miss": miss, "total": len(hit) + len(miss)}


def coverage_rate(items: list) -> dict:
    """跨样例汇总：命中知识点总数 / 清单知识点总数。

    items: hit_kps 输出列表。返回 {kp_hit, kp_total, rate}；无知识点时 rate=None。"""
    h = sum(len(it["hit"]) for it in items or [])
    t = sum(it["total"] for it in items or [])
    return {"kp_hit": h, "kp_total": t, "rate": round(h / t, 4) if t else None}
