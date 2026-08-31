# -*- coding: utf-8 -*-
"""Retrieve 阶段（Loop2）：豆包式三步——改写→并行取回→批量筛选。
取回双源并行（KB向量 ∥ 公网web_search），失败软着陆矩阵见各步骤注释。
P1 增补：多路排名 RRF 融合（公式照抄 llama-index QueryFusionRetriever，k=60）
+ 优质源标注（rules.py 池）进筛选提示词。
闭环三 B2-lite 增补：研究档（rounds≥2）子问题分解 + 覆盖度判据 + 自适应补搜
（总轮次≤3封顶），替代旧"强制两轮 angle 递归"契约。
测试接缝：_web_search / _kb_search / _fetch_all 可被 monkeypatch 替换。"""
import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout

from rules import QUALITY_SOURCE_POOL
from engine.llm_io import think_then_json


# B2-lite 研究档分解提示词：few-shot 对照示例骨架移植自 llama-index-core
# SubQuestionQueryEngine（question_gen/prompts.py 的 EXAMPLES 段：对比题按实体拆
# 独立信息需求），砍 tool 维度；单面问题防碎片化规则为本仓约定。
_RESEARCH_DECOMPOSE_PROMPT = (
    "你是检索查询规划器，负责研究档的子问题分解：把多面问题拆成可独立检索的信息需求。\n"
    '只输出 JSON：{"need_search": true|false, "queries": ["子问题1", "子问题2", ...], '
    '"decomposed": true|false}\n'
    "对照示例：问题「对比 Uber 与 Lyft 的营收增长」按实体拆为独立需求：\n"
    '{"need_search": true, "queries": ["Uber 的营收增长情况", "Lyft 的营收增长情况"], '
    '"decomposed": true}\n'
    "规则：每条子问题须能独立检索出答案、互不包含；单面问题禁止碎片化——"
    "返回原问题单元素且 decomposed=false；子问题最多 4 条。只输出 JSON。"
)


def rewrite_queries(llm_fast, message: str, angle_hint: str = "",
                    research: bool = False) -> dict:
    """R1 改写：flash 单次调用合并 need_search 判定与 queries 产出。
    research=True 切 B2-lite 分解契约：多面问题拆独立信息需求（≤4 条），
    单面问题返回原问题单元素（decomposed=false，防碎片化）。
    失败软着陆：任何异常 → {need_search: False, queries: [], decomposed: False}。"""
    prompt = _RESEARCH_DECOMPOSE_PROMPT if research else (
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
        return {"need_search": need, "queries": qs[:4 if research else 5],
                "decomposed": bool(result.get("decomposed"))}
    except Exception:
        return {"need_search": False, "queries": [], "decomposed": False}


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
    # F11-S1：融合分随行透传（浅拷贝附键，不改输入行）——供检索节点命中预览展示分数
    out: list[dict] = []
    for key, sc in ordered:
        row = dict(best[key])
        row["rrf_score"] = round(sc, 4)
        out.append(row)
    return out


def _coverage_missing(ranked_lists_cols: list, threshold: int = 2) -> list[int]:
    """B2-lite 覆盖度判据（自研，LI 无此机制）：逐列统计贡献的独特文档键数，
    低于 threshold 的列下标入返回列表。同键跨列只计入先见面——与 rrf_merge 的
    融合塌缩口径一致（v1 近似：跨面重复文档不计入后见面，docstring 声明）。
    键规范与 _doc_key 一致（url 优先/title 规范化/内容前缀兜底）；非 dict 条目跳过。"""
    seen: set = set()
    missing: list[int] = []
    for i, col in enumerate(ranked_lists_cols or []):
        novel = 0
        for row in col or []:
            if not isinstance(row, dict):
                continue
            key = _doc_key(row)
            if key not in seen:
                seen.add(key)
                novel += 1
        if novel < threshold:
            missing.append(i)
    return missing


def _is_quality_source(url: str) -> bool:
    """url 命中 rules.QUALITY_SOURCE_POOL 任一域名后缀 → 优质源。"""
    u = (url or "").lower()
    return any(d in u for d in QUALITY_SOURCE_POOL)


def _parse_section_path(content: str) -> str | None:
    """块首行 → 章节路径（knowledge_service._chunk_markdown 的"路径\\n正文"约定）。
    含 " > " 且不以 # 开头才认作路径；kb 命中之外的 web 条目天然不匹配。"""
    first = (content or "").lstrip().split("\n", 1)[0].strip()
    if not first or " > " not in first or first.startswith("#") or len(first) > 120:
        return None
    return first


def _expand_sections(kept: list, project_id: str, emit=None) -> int:
    """A1 父子块的"父"侧：kb 命中项按章节路径聚合兄弟块全文，条目挂 parent_context。
    仅对带 metadata.source 的 kb 条目生效；失败静默返回0，绝不扰检索主链。"""
    try:
        from core.knowledge_service import fetch_section_texts
        want: dict[str, str] = {}   # path -> source
        for c in kept:
            meta = (c or {}).get("metadata") or {}
            src = str(meta.get("source") or "")
            if not src:
                continue
            p = _parse_section_path(str((c or {}).get("content") or ""))
            if p:
                want[p] = src
        expanded = 0
        seen_pairs: set = set()
        for path, src in want.items():
            if (src, path) in seen_pairs:
                continue
            seen_pairs.add((src, path))
            texts = fetch_section_texts(project_id, src, {path})
            text = texts.get(path) or ""
            if not text:
                continue
            for c in kept:
                m = ((c or {}).get("metadata") or {})
                if m.get("source") == src and \
                        _parse_section_path(str(c.get("content") or "")) == path:
                    c["parent_context"] = {"path": path, "text": text}
                    expanded += 1
        if emit and expanded:
            emit("delta", text=f"章节展开 {expanded} 处")
        return expanded
    except Exception:
        return 0


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
    """阶段入口。rounds≥2 走 B2-lite 研究档（新契约，替代旧"强制两轮 angle 递归"）：
    子问题分解 → 首轮全并行取回（每子问一列）→ 覆盖度判据（列贡献独特键<2 记缺失，
    首见归属口径）→ 定向补搜至多一轮（重试集=未达标子问原句；总轮次≤3封顶）→ 统一终筛。
    rounds==1 保持原单轮路径（极速/思考档零改动）。
    emit：可选观测回调 emit(type_, **payload)——里程碑（分解/取回/补搜/终筛）实时上报，
    供管线接 🛰 检索观察窗（subagent 帧 + 档案双写）；None 时零开销静默。
    返回 ctx.search_results 结构；极速档由调用方决定是否进入本阶段。"""
    queries_log: list = []
    ranked_lists: list = []  # RRF 输入：kb 一列 + 每 query 的 web 一列（同键自动折叠去重）
    actual_rounds = 0
    meta_extra: dict = {}
    if max(1, rounds) >= 2:
        # --- B2-lite 研究档：分解 → 全并行 → 覆盖度 → 定向补搜（契约替代 D-新1） ---
        rw = rewrite_queries(llm_fast, message, research=True)
        if rw["need_search"] and rw["queries"]:
            subqs = rw["queries"]
            queries_log.extend(subqs)
            actual_rounds = 1
            if emit:
                emit("delta", text=f"子问题分解 {len(subqs)} 个：" + "、".join(subqs))
            web_groups, kb_rows = _fetch_all(subqs, project_id, use_kb=use_kb)
            if emit:
                _wn = sum(len(g) for g in web_groups)
                emit("delta", text=f"第1轮取回：web {_wn} 条 / kb {len(kb_rows)} 条")
            ranked_lists.extend(
                ([kb_rows] if kb_rows else []) + [g for g in web_groups if g])
            # 覆盖度判据：每子问一列（kb 为辅助通道不参与判据），
            # 列贡献独特键 <2 记缺失；跨面重复文档计入先见面（v1 近似，见 docstring）
            missing_idx = _coverage_missing(web_groups, threshold=2)
            extra_rounds = 0
            if missing_idx:
                missing_qs = [subqs[i] for i in missing_idx]
                extra_web, extra_kb = _fetch_all(missing_qs, project_id, use_kb=use_kb)
                extra_rounds = 1  # v1 定向补搜至多一轮（总轮次≤3封顶，余量留给后续扩展）
                actual_rounds = 2
                queries_log.extend(missing_qs)
                if emit:
                    emit("delta", text=f"补搜 {len(missing_qs)} 面：" + "、".join(missing_qs))
                    _wn2 = sum(len(g) for g in extra_web)
                    emit("delta", text=f"第2轮取回：web {_wn2} 条 / kb {len(extra_kb)} 条")
                ranked_lists.extend(
                    ([extra_kb] if extra_kb else []) + [g for g in extra_web if g])
            meta_extra = {"decomposed": bool(rw.get("decomposed")),
                          "sub_questions": subqs,
                          "adaptive_extra_rounds": extra_rounds}
        else:
            # 分解判无需检索：空契约与有检索时键形一致（消费方免 isinstance 探测）
            meta_extra = {"decomposed": bool(rw.get("decomposed")),
                          "sub_questions": [], "adaptive_extra_rounds": 0}
    else:
        angle = ""
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
                # A1：KB 命中携带原 metadata(source/chunk)，供兄弟聚合定位；web 条目无此键
                **({"metadata": r["metadata"]} if r.get("metadata") else {}),
                # F11-S1：融合分透传（rrf_merge 已随行附带）——检索内容事件展示分数用
                **({"rrf_score": r["rrf_score"]} if "rrf_score" in r else {}),
            })
    kept = filter_results(llm_fast, candidates)
    _expand_sections(kept, project_id, emit=emit)
    if emit:
        emit("delta", text=f"终筛留存 {len(kept)} 条（候选共 {len(candidates)}）")
    return {"search_results": kept,
            "search_meta": {"queries": queries_log, "raw_count": len(candidates),
                            "rounds": actual_rounds, "fused": True, **meta_extra}}
