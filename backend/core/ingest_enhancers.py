# -*- coding: utf-8 -*-
"""入库增强器：B1 每块问题生成 / B4-lite 先修关系抽取。
B1 拆分（2026-08-27，拍板 (b) 显式参数）：函数自 knowledge_service.py 迁入，
依赖 db 由调用方显式注入（缺省回退 get_kb_repo 单例）；测试补丁经门面命名空间
回收保持可用（ks.enhance_questions / ks.extract_kg_edges 照旧可 patch）。"""
import json
import logging
import re

logger = logging.getLogger("coagent.knowledge")

KG_REL_WHITELIST = ("先修", "相关")
KG_MAX_NAMES = 24      # 抽取输入的章节名清单上限（成本/防幻觉白名单可靠性）
KG_MAX_EDGES = 12      # 单文档关系边封顶


def _flatten_tree_names(tree: list) -> list[str]:
    """标题树拍平去重保序（父前子后），供 KG 抽取输入清单。"""
    out: list[str] = []
    seen: set = set()

    def walk(nodes):
        for n in nodes or []:
            if not isinstance(n, dict):
                continue
            name = str(n.get("name") or "").strip()
            if name and name not in seen:
                seen.add(name)
                out.append(name)
            walk(n.get("children"))

    walk(tree)
    return out


def enhance_questions(project_id: str, chunks: list, doc_ids: list, source: str = "",
                      api_key: str = "", group_size: int = 12, max_groups: int = 8,
                      llm_factory=None, db=None) -> int:
    """闭环四·B1 元数据增强：入库后为每块生成 ≤3 个「该块能具体回答、别处不易找到」的问题，
    存旁路表 kb_gen_questions 并拼入 BM25 语料（换说法提问可命中）。
    提示词骨架中文化移植自 llama-index QuestionsAnsweredExtractor（独特性约束保留）。
    预算：每 group_size 块一次 flash 调用，单文档封顶 max_groups 组（超出不增强不阻断）；
    组数≥4 时组间 4 线程并行（上传提速），LLM 网络调用并行、DB 写回主线程串行；
    任何组失败 = 该组无问题文本，绝不抛。门控：KB_META_ENHANCE=0 关；无 key 静默跳过。
    llm_factory(key)->llm 测试注入缝；生产走 DeepSeekLLM(thinking=False)。
    B1 拆分：db 显式注入（缺省 get_kb_repo 单例）——调用方传门面 _db 保持补丁面一致。
    返回成功写库的块数。"""
    from core.config import config as _cfg
    if not int(getattr(_cfg, "KB_META_ENHANCE", 1) or 0):
        return 0
    key = api_key or getattr(_cfg, "DEEPSEEK_API_KEY", "")
    if not key or not chunks or not doc_ids:
        return 0
    if db is None:
        from core.db import get_kb_repo
        db = get_kb_repo()
    if llm_factory is None:
        def llm_factory(k):
            from engine.pipeline_v2 import DEFAULT_MODEL
            from core.base_llm import DeepSeekLLM
            return DeepSeekLLM(api_key=k, model=DEFAULT_MODEL, thinking=False)
    try:
        llm = llm_factory(key)
    except Exception:
        logger.warning("[B1] 问题增强 LLM 构造失败，跳过", exc_info=True)
        return 0
    system = (
        "你是知识库预处理器。为以下每段文本各生成不超过3个问题：该段能具体回答、"
        "且在其他地方不易找到答案的问题。\n"
        '只输出 JSON：[{"i": 段落序号(从0), "questions": ["问题1", "问题2"]}]'
    )
    written = 0
    n_groups = min(max_groups, (len(chunks) + group_size - 1) // group_size)

    def _gen_rows(g: int) -> list:
        """单组：LLM 调用 + 解析（线程内只做网络 IO，不碰 DB）。组级失败返回空。"""
        lo, hi = g * group_size, min((g + 1) * group_size, len(chunks))
        batch = chunks[lo:hi]
        user = "\n".join(f"段{i}：{(c or '')[:400]}" for i, c in enumerate(batch))
        try:
            raw = llm.chat([{"role": "system", "content": system},
                            {"role": "user", "content": user}], temperature=0.2)
            m = re.search(r'\[[\s\S]*\]', raw or "")
            data = json.loads(m.group()) if m else []
        except Exception:
            logger.warning("[B1] 第%d组问题生成失败（该组无问题文本，继续）", g, exc_info=True)
            return []
        rows = []
        for item in data if isinstance(data, list) else []:
            try:
                i = int(item.get("i"))
                qs = [str(q).strip() for q in (item.get("questions") or []) if str(q).strip()][:3]
            except Exception:
                continue
            if qs and 0 <= i < len(batch):
                rows.append((project_id, source, doc_ids[lo + i],
                             json.dumps(qs, ensure_ascii=False)))
        return rows

    # 组间并行（上传提速·单步1）：LLM 调用是网络 IO，组数≥4 时 4 线程并行
    # （openai 客户端线程安全；组数少的串行保持脚本化测试"按序应答"确定性）。
    # DB 写回不并行：主线程按组序统一 upsert（SQLite 零锁竞争）。
    if n_groups >= 4:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=4) as ex:
            per_group = list(ex.map(_gen_rows, range(n_groups)))
    else:
        per_group = [_gen_rows(g) for g in range(n_groups)]
    for rows in per_group:
        if rows:
            db.upsert_gen_questions_bulk(rows)
            written += len(rows)
    return written


def extract_kg_edges(project_id: str, source: str, tree: list, api_key: str = "",
                     llm_factory=None, db=None) -> int:
    """闭环五·B4-lite：从标题树推断章节间先修/相关关系，存 kg_edges。
    输入只喂章节名清单（≤24 名+来源标题，拍板③）——成本最低、端点白名单防幻觉最可靠。
    解析纪律照抄 DeepTutor spine（防御式 coerce：非 list→[]、逐项 strip、rel 白名单、
    端点必须逐字命中清单——防 LLM 幻觉出新名字）。任何失败→0 不阻断上传。
    llm_factory 注入缝/门控哲学与 B1 enhance_questions 同款。
    B1 拆分：db 显式注入（缺省 get_kb_repo 单例）。返回入库边数。"""
    from core.config import config as _cfg
    if not int(getattr(_cfg, "KB_KG_EDGES", 1) or 0):
        return 0
    key = api_key or getattr(_cfg, "DEEPSEEK_API_KEY", "")
    names = _flatten_tree_names(tree)[:KG_MAX_NAMES]
    if not key or len(names) < 2:
        return 0
    if db is None:
        from core.db import get_kb_repo
        db = get_kb_repo()
    if llm_factory is None:
        def llm_factory(k):
            from engine.pipeline_v2 import DEFAULT_MODEL
            from core.base_llm import DeepSeekLLM
            return DeepSeekLLM(api_key=k, model=DEFAULT_MODEL, thinking=False)
    try:
        llm = llm_factory(key)
    except Exception:
        logger.warning("[KG] 关系抽取 LLM 构造失败，跳过", exc_info=True)
        return 0
    system = (
        "你是课程设计专家。以下是一份文档《" + (source or "未命名") + "》的章节名清单"
        "（按文档顺序）。推断章节之间的概念依赖关系：rel 只能取「先修」（学 A 前需先学 B，"
        "输出 src=A, dst=B）或「相关」（同层关联）。\n"
        '只输出 JSON：{"edges": [{"src": "章节名", "dst": "章节名", "rel": "先修"}]}，'
        "最多 " + str(KG_MAX_EDGES) + " 条；src 和 dst 必须逐字取自清单，不许编造。"
    )
    user = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(names))
    name_set = set(names)
    try:
        raw = llm.chat([{"role": "system", "content": system},
                        {"role": "user", "content": user}], temperature=0.2)
        m = re.search(r'\{[\s\S]*\}', raw or "")
        data = json.loads(m.group()) if m else {}
        edges, seen = [], set()
        for e in (data.get("edges") or []) if isinstance(data, dict) else []:
            try:
                src = str(e.get("src") or "").strip()
                dst = str(e.get("dst") or "").strip()
                rel = str(e.get("rel") or "").strip()
            except Exception:
                continue
            if rel not in KG_REL_WHITELIST or src == dst:
                continue
            if src not in name_set or dst not in name_set:   # 白名单：端点幻觉直接丢弃
                continue
            pair = (src, dst, rel)
            if pair not in seen:
                seen.add(pair)
                edges.append(pair)
            if len(edges) >= KG_MAX_EDGES:
                break
        if edges:
            db.upsert_kg_edges_bulk(
                [(project_id, source, s, d, r) for s, d, r in edges])
        return len(edges)
    except Exception:
        logger.warning("[KG] 关系抽取失败（不阻断上传）source=%s", source, exc_info=True)
        return 0
