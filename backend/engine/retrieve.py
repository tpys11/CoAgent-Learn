# -*- coding: utf-8 -*-
"""Retrieve 阶段（Loop2）：豆包式三步——改写→并行取回→批量筛选。
取回双源并行（KB向量 ∥ 公网web_search），失败软着陆矩阵见各步骤注释。
测试接缝：_web_search / _kb_search 可被 monkeypatch 替换。"""
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout

from engine.llm_io import think_then_json


def rewrite_queries(llm_fast, message: str, angle_hint: str = "") -> dict:
    """R1 改写：flash 单次调用合并 need_search 判定与 queries 产出。
    失败软着陆：任何异常 → {need_search: False, queries: []}。"""
    prompt = (
        "你是检索查询规划器。判断该消息是否需要外部检索，并产出搜索词。\n"
        '只输出 JSON：{"need_search": true|false, "queries": ["搜索词1", "搜索词2", ...]}\n'
        "规则：闲聊/纯创作/数学计算类 need_search=false；"
        "需要事实、教程、最新信息时给 3~5 条互不重复的高质量搜索词。只输出 JSON。"
    )
    if angle_hint:
        prompt += "\n" + angle_hint
    try:
        _, result = think_then_json(
            llm_fast, prompt, message[:1000], "知识库管理", silent=True)
        need = bool(result.get("need_search"))
        qs = [str(q).strip() for q in (result.get("queries") or []) if str(q).strip()]
        if need and not qs:
            need = False
        return {"need_search": need, "queries": qs[:5]}
    except Exception:
        return {"need_search": False, "queries": []}


def _web_search(query: str) -> list:
    from skills.registry import registry
    r = registry.execute("web_search", query=query)
    return list(r.get("results") or [])


def _kb_search(query: str, project_id: str) -> list:
    from skills.registry import registry
    r = registry.execute("knowledge_retrieval", query=query, project_id=project_id)
    return list(r.get("results") or [])


def _fetch_all(queries: list[str], project_id: str, use_kb: bool,
               per_call_timeout: int = 15) -> tuple[list, list]:
    """R2 并行取回：所有查询同时发出；返回 (web条目, kb条目)。单路异常静默兜底。"""
    web_out: list = []
    kb_out: list = []

    def _safe(fn, *a):
        try:
            return fn(*a)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=max(1, min(len(queries), 6))) as ex:
        futs = {ex.submit(_safe, _web_search, q): ("web", q) for q in queries}
        if use_kb and project_id:
            futs[ex.submit(_safe, _kb_search, queries[0], project_id)] = ("kb", queries[0])
        for fut, (kind, tag) in futs.items():
            try:
                rows = fut.result(timeout=per_call_timeout)
                target = web_out if kind == "web" else kb_out
                target.extend(rows or [])
            except _FTimeout:
                pass
            except Exception:
                pass
    return web_out, kb_out


def filter_results(llm_fast, candidates: list, keep: int = 6) -> list:
    """R3 批量筛选：一次 flash 调用从候选中留 keep 条。异常→保留前keep条（不丢证据）。"""
    if len(candidates) <= keep:
        return candidates
    brief = [{"i": i, "title": c.get("title", ""), "snippet": str(c.get("content") or c.get("snippet") or "")[:160]}
             for i, c in enumerate(candidates)]
    prompt = (
        f"以下是{len(brief)}条检索候选。挑出与学习问题最相关的 {keep} 条。\n"
        '只输出 JSON：{"keep": [序号列表]}，按相关性降序。\n'
        + json.dumps(brief, ensure_ascii=False)
    )
    try:
        _, result = think_then_json(llm_fast, prompt, "", "知识库管理", silent=True)
        idx = [int(i) for i in (result.get("keep") or []) if isinstance(i, (int, float))]
        picked = [candidates[i] for i in idx if 0 <= i < len(candidates)]
        return picked or candidates[:keep]  # 模型挑选为空才兜底截断；尊重挑选数量不填充
    except Exception:
        return candidates[:keep]


def retrieve_stage(llm_fast, message: str, template: str, project_id: str,
                   use_kb: bool = True, rounds: int = 1) -> dict:
    """阶段入口：rounds≥2 时执行多轮递归检索（研究档），候选按 url+title 去重合并后统一终筛。
    返回 ctx.search_results 结构；极速档由调用方决定是否进入本阶段。"""
    all_web: list = []
    all_kb: list = []
    seen: set = set()
    queries_log: list = []
    angle = ""
    actual_rounds = 0
    for rnd in range(1, max(1, rounds) + 1):
        rw = rewrite_queries(llm_fast, message, angle_hint=angle)
        if not rw["need_search"] or not rw["queries"]:
            break
        actual_rounds = rnd
        queries_log.extend(rw["queries"])
        web, kb = _fetch_all(rw["queries"], project_id, use_kb=use_kb)
        for r in kb:
            key = ("kb", str(r.get("title") or ""), str(r.get("url") or ""))
            if key in seen:
                continue
            seen.add(key)
            all_kb.append(r)
        for r in web:
            key = ("web", str(r.get("title") or ""), str(r.get("url") or ""))
            if key in seen:
                continue
            seen.add(key)
            all_web.append(r)
        angle = (f"首轮已完成基础检索（关键词：{'、'.join(queries_log[-5:])}）。"
                 "请从补充角度给出与首轮不同的新查询。")

    candidates = []
    for r in all_kb + all_web:
        if isinstance(r, dict):
            candidates.append({
                "title": str(r.get("title") or "")[:120],
                "url": str(r.get("url") or ""),
                "content": str(r.get("content") or r.get("snippet") or "")[:600],
            })
    kept = filter_results(llm_fast, candidates)
    return {"search_results": kept,
            "search_meta": {"queries": queries_log, "raw_count": len(candidates),
                            "rounds": actual_rounds}}
