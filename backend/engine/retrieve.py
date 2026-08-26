# -*- coding: utf-8 -*-
"""Retrieve 阶段（Loop2）：豆包式三步——改写→并行取回→批量筛选。
取回双源并行（KB向量 ∥ 公网web_search），失败软着陆矩阵见各步骤注释。
P1 增补：多路排名 RRF 融合（公式照抄 llama-index QueryFusionRetriever，k=60）
+ 优质源标注（rules.py 池）进筛选提示词。
测试接缝：_web_search / _kb_search 可被 monkeypatch 替换。"""
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout

from rules import QUALITY_SOURCE_POOL
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
    """R2 并行取回。返回 (web_groups, kb_out)：
    web_groups 与 queries 等长，每组保持该查询的引擎排名序——这是 RRF 融合的输入契约；
    kb_out 为单列召回序。单路异常静默兜底为空列表（不冒泡）。"""
    web_groups: list[list] = [[] for _ in queries]
    kb_out: list = []

    def _safe(fn, *a):
        try:
            return fn(*a)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=max(1, min(len(queries), 6))) as ex:
        futs = {}
        for qi, q in enumerate(queries):
            futs[ex.submit(_safe, _web_search, q)] = ("web", qi)
        if use_kb and project_id:
            futs[ex.submit(_safe, _kb_search, queries[0], project_id)] = ("kb", 0)
        for fut, (kind, qi) in futs.items():
            try:
                rows = fut.result(timeout=per_call_timeout)
            except _FTimeout:
                continue
            except Exception:
                continue
            rows = rows or []
            if kind == "web":
                web_groups[qi] = list(rows)
            else:
                kb_out.extend(rows)
    return web_groups, kb_out


def _doc_key(row: dict) -> str:
    """融合去重键：url 优先；无 url 用规范化 title；双空退化为内容前缀（防不同空条目互撞）。"""
    u = str((row or {}).get("url") or "").strip()
    if u:
        return "u:" + u
    t = str((row or {}).get("title") or "").strip()
    if t:
        return "t:" + t.lower()
    return "n:" + str((row or {}).get("content") or "")[:64]


def rrf_merge(ranked_lists: list, k: float = 60.0) -> list[dict]:
    """多路已排名候选的倒数排名融合——公式与 k 照抄 llama-index-core
    QueryFusionRetriever._reciprocal_rerank_fusion：score += 1/(rank+k)，rank 从 0 起。
    同键跨列累加即天然跨查询/跨轮去重；返回按融合分降序的新列表（不改输入，
    同分保持首见顺序的稳定排序）。非 dict 条目跳过。"""
    scores: dict[str, float] = {}
    best: dict[str, dict] = {}
    for lst in ranked_lists or []:
        for rank, row in enumerate(lst or []):
            if not isinstance(row, dict):
                continue
            key = _doc_key(row)
            scores[key] = scores.get(key, 0.0) + 1.0 / (rank + k)
            best.setdefault(key, row)
    ordered = sorted(scores.items(), key=lambda kv: -kv[1])
    return [best[key] for key, _ in ordered]


def _is_quality_source(url: str) -> bool:
    """url 命中 rules.QUALITY_SOURCE_POOL 任一域名后缀 → 优质源。"""
    u = (url or "").lower()
    return any(d in u for d in QUALITY_SOURCE_POOL)


def filter_results(llm_fast, candidates: list, keep: int = 6) -> list:
    """R3 批量筛选：一次 flash 调用从候选中留 keep 条。异常→保留前keep条（不丢证据）。
    brief 携带优质源标注（rules.QUALITY_SOURCE_POOL 命中），提示词声明同等相关时优先。"""
    if len(candidates) <= keep:
        return candidates
    brief = [{"i": i,
              "title": c.get("title", ""),
              "snippet": str(c.get("content") or c.get("snippet") or "")[:160],
              "q": ("优质源" if _is_quality_source(str(c.get("url") or "")) else "")}
             for i, c in enumerate(candidates)]
    prompt = (
        f"以下是{len(brief)}条检索候选。挑出与学习问题最相关的 {keep} 条。\n"
        '只输出 JSON：{"keep": [序号列表]}，按相关性降序。\n'
        "标注[优质源]的条目来自权威站点，相关性相近时优先保留。\n"
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
                   use_kb: bool = True, rounds: int = 1, emit=None) -> dict:
    """阶段入口：rounds≥2 时执行多轮递归检索（研究档），候选按 url+title 去重合并后统一终筛。
    emit：可选观测回调 emit(type_, **payload)——里程碑（改写/取回/终筛）实时上报，
    供管线接 🛰 检索观察窗（subagent 帧 + 档案双写）；None 时零开销静默。
    返回 ctx.search_results 结构；极速档由调用方决定是否进入本阶段。"""
    queries_log: list = []
    ranked_lists: list = []  # RRF 输入：kb 一列 + 每 query 的 web 一列（跨轮累加，同键自动折叠去重）
    angle = ""
    actual_rounds = 0
    for rnd in range(1, max(1, rounds) + 1):
        rw = rewrite_queries(llm_fast, message, angle_hint=angle)
        if not rw["need_search"] or not rw["queries"]:
            break
        actual_rounds = rnd
        queries_log.extend(rw["queries"])
        if emit:
            emit("delta", text="改写查询：" + "、".join(rw["queries"]))
        web_groups, kb_rows = _fetch_all(rw["queries"], project_id, use_kb=use_kb)
        if emit:
            _wn = sum(len(g) for g in web_groups)
            emit("delta", text=f"第{rnd}轮取回：web {_wn} 条 / kb {len(kb_rows)} 条")
        for lst in ([kb_rows] if kb_rows else []) + [g for g in web_groups if g]:
            ranked_lists.append(lst)
        angle = (f"首轮已完成基础检索（关键词：{'、'.join(queries_log[-5:])}）。"
                 "请从补充角度给出与首轮不同的新查询。")

    # RRF 融合替代原 kb先/web后的隐式拼接；同键跨列/跨轮折叠即去重
    fused = rrf_merge(ranked_lists)
    candidates = []
    for r in fused:
        if isinstance(r, dict):
            candidates.append({
                "title": str(r.get("title") or "")[:120],
                "url": str(r.get("url") or ""),
                "content": str(r.get("content") or r.get("snippet") or "")[:600],
            })
    kept = filter_results(llm_fast, candidates)
    if emit:
        emit("delta", text=f"终筛留存 {len(kept)} 条（候选共 {len(candidates)}）")
    return {"search_results": kept,
            "search_meta": {"queries": queries_log, "raw_count": len(candidates),
                            "rounds": actual_rounds, "fused": True}}
