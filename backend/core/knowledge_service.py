# -*- coding: utf-8 -*-
"""知识库服务门面：上传编排 → 向量化 → SQLite(sqlite-vec) 存储/检索（按项目隔离）。
embedding 用 bge-small-zh-v1.5（中文，512维）→ 现统一 Qwen3-VL-Embedding-8B@1024。

B1 拆分（2026-08-27）：按职责迁出三个模块并在本门面回收命名空间——
- core.chunkers      切块器族（句子级/markdown/语义断点 A3/标题树）
- core.embeddings    向量化族（本地/API/伪向量降级 + VL 跨模态）
- core.ingest_enhancers  入库增强器（B1 问题生成 / B4-lite 关系抽取，db 显式注入）
回收后 ks._embed / ks._chunk_semantic / ks.enhance_questions 等
测试补丁面照旧可 patch（运行时名解析走本模块命名空间）。
本文件保留：BM25 检索 / 上传编排 add_document / 混合检索 search / 重排 / 列表与删除。
"""
import hashlib
import logging
import re

from core.chunkers import (_chunk_markdown, _chunk_semantic, _chunk_text,
                            _extract_tree)
from core.embeddings import (_embed, _vl_key, embed_vl_images,
                             embed_vl_query)
from core.ingest_enhancers import (enhance_questions,
                                   extract_kg_edges)
# —— B1 门面命名空间回收·测试补丁面（勿删：tests 经本模块转手导入/patch，
#    见模块 docstring；noqa 压制 F401 属预期）——
from core.chunkers import _is_junk_heading  # noqa: F401
from core.chunkers import _percentile  # noqa: F401
from core.chunkers import _split_markdown_sections  # noqa: F401
from core.chunkers import _split_sentences  # noqa: F401
from core.embeddings import _embed_api  # noqa: F401
from core.embeddings import _embed_local  # noqa: F401
from core.embeddings import _embed_vl  # noqa: F401
from core.embeddings import _get_embedder  # noqa: F401
from core.ingest_enhancers import KG_MAX_EDGES  # noqa: F401
from core.ingest_enhancers import KG_MAX_NAMES  # noqa: F401
from core.ingest_enhancers import KG_REL_WHITELIST  # noqa: F401
from core.ingest_enhancers import _flatten_tree_names  # noqa: F401
from core.db import get_kb_repo

_db = get_kb_repo()
logger = logging.getLogger("coagent.knowledge")

# BM25 缓存：(project_id, table) -> (ids, tokenized_docs, bm25)；table 维度隔离不同索引代际
_bm25_cache = {}


def _tokenize(text: str) -> list:
    """中文分词（jieba），供 BM25 使用"""
    try:
        import jieba
        return [w for w in jieba.lcut((text or "").lower()) if w.strip() and w.strip() not in "，。！？、；：""''（）《》 "]
    except Exception:
        return list((text or "").lower())


def _get_bm25(project_id: str, table: str):
    """获取项目 BM25 索引（按版本表隔离缓存；数据变更后失效）"""
    key = (project_id, table)
    cache = _bm25_cache.get(key)
    if cache is not None:
        return cache
    try:
        rows = _db.get_kb_docs(project_id, table=table)
    except Exception:
        return None
    if not rows:
        return None
    try:
        qmap = _db.get_gen_questions(project_id)      # B1：每块问题拼入语料（换说法命中）
    except Exception:
        qmap = {}
    ids = [r["doc_id"] for r in rows]
    tokenized = [_tokenize(r["content"] + " " + str(qmap.get(r["doc_id"]) or ""))
                 for r in rows]
    from rank_bm25 import BM25Okapi
    bm25 = BM25Okapi(tokenized)
    _bm25_cache[key] = (ids, tokenized, bm25)
    return _bm25_cache[key]


def _invalidate_bm25(project_id: str):
    for key in [k for k in list(_bm25_cache) if k[0] == project_id]:
        _bm25_cache.pop(key, None)


# ── 上传进度（内存态：进程重启即清；仅 URL 摄取链路轮询用） ──────────────
_progress: dict = {}


def _set_progress(project_id: str, source: str, done: int, total: int,
                  stage: str = "embedding") -> None:
    _progress[(project_id, source)] = {"status": "ok", "done": int(done),
                                       "total": int(total), "stage": stage}


def _set_progress_error(project_id: str, source: str, msg: str) -> None:
    """上传链失败终态（前端轮询可见），替代静默吞错。"""
    _progress[(project_id, source)] = {"status": "error", "msg": str(msg)[:200]}


def get_progress(project_id: str, source: str) -> dict:
    return _progress.get((project_id, source)) or {"status": "none"}


def parse_section_path(content: str) -> str | None:
    """从块文本首行解析章节路径（_chunk_markdown 的"路径\\n正文"约定）。
    识别特征：首行含 " > " 且不含 markdown 标记 #；导语节/无前缀块返回 None。"""
    first = (content or "").lstrip().split("\n", 1)[0].strip()
    if not first or " > " not in first or first.startswith("#"):
        return None
    if len(first) > 120:   # 路径异常长多为普通句子误判
        return None
    return first


def fetch_section_texts(project_id: str, source: str,
                        want_paths: set[str], max_chars: int = 2000) -> dict:
    """兄弟块聚合（A1 父子块的"父"侧）：同源下首行路径命中 want_paths 的所有块，
    剥去重复路径行后按 chunk 序拼接为章节全文，每章封顶 max_chars。
    数据走 get_kb_docs 全量拉取（百级文档规模零压力）；任何失败返回空 dict 不抛。"""
    if not want_paths or not source:
        return {}
    try:
        docs = _db.get_kb_docs(project_id)
        by_sec: dict[str, list] = {}
        for d in docs or []:
            if (d.get("source") or "") != source:
                continue
            content = str(d.get("content") or "")
            path = parse_section_path(content)
            if path and path in want_paths:
                body = content.split("\n", 1)[1].strip() if "\n" in content else ""
                body_lines = [ln for ln in body.splitlines() if ln.strip() != path]
                by_sec.setdefault(path, []).append(
                    (int(d.get("chunk") or 0), "\n".join(body_lines).strip()))
        out = {}
        for path, parts in by_sec.items():
            parts.sort(key=lambda t: t[0])
            text = "\n\n".join(p for _, p in parts if p)
            out[path] = text[:max_chars]
        return out
    except Exception:
        logger.warning("章节全文聚合失败 project=%s source=%s", project_id, source, exc_info=True)
        return {}


def _make_doc_id(project_id: str, source: str, idx: int, chunk: str) -> str:
    """向量块主键（P0-2 根因2 修复）：必须含 project_id。

    不同项目上传同一文件时 chunks 完全相同，若键不含项目，
    upsert 的"先 DELETE 同 doc_id 再 INSERT"会把另一项目的块整批删掉
    （实测：ai Agent 项目 1408 块被"新课程1"重传覆盖归零，且经幽灵 hash 自愈形成乒乓互瞎）。
    长度保持 24 与历史一致；分隔符 "|" 避免 (source, idx) 拼接歧义。"""
    raw = project_id + "|" + source + "|" + str(idx) + "|" + chunk[:80]
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:24]


def add_document(project_id: str, text: str, source: str = "", session_id: str = "", api_key: str = "", skip_context: bool = False) -> int:
    """上传文本：切块 → 向量化 → 入库，返回入库块数。
    已移除「每块 LLM 生成上下文前缀」（_gen_context，2026-08-15 删除）。
    闭环四·B1：入库后按 KB_META_ENHANCE 门控做分组批量问题增强（默认开，
    失败不阻断、无 key 静默跳过）——「上传链路零 LLM 调用」旧约定就此有条件打破。
    上下文连续性由切块重叠保证，检索质量由 bge+BM25（含问题语料）+rerank 保证。
    skip_context 参数保留仅为兼容旧调用方，不再起作用。"""
    from core.config import config as _cfg
    size = int(getattr(_cfg, "KB_CHUNK_SIZE", 512) or 512)
    overlap = int(getattr(_cfg, "KB_CHUNK_OVERLAP", 50) or 0)
    mode = (getattr(_cfg, "KB_CHUNK_MODE", "auto") or "auto").lower()
    has_heading = bool(re.search(r"^#{1,6}\s+\S", text or "", flags=re.M))
    # 结构切块仅在文本确有有效标题时启用（window 模式 / 无标题文本 → 句子级窗口）
    chunker = (getattr(_cfg, "KB_CHUNKER", "self") or "self").lower()
    if chunker == "llamaindex" and has_heading:
        # 刀1·库式借用：LlamaIndex MarkdownNodeParser 切块（对照日志+失败回退自研，门面/下游零改动）
        try:
            from llama_index.core.node_parser import MarkdownNodeParser
            from llama_index.core.schema import Document
            _li: list = []
            for _n in MarkdownNodeParser().get_nodes_from_documents([Document(text=text)]):
                _md = _n.metadata or {}
                _path = " > ".join([_md.get(k, "") for k in ("Header_1", "Header_2", "Header_3", "Header_4") if _md.get(k)])
                # 修复 2026-08-26：原式 `(_path+"\n") if _path else ""+get_content()` 因三目
                # 优先级在路径非空时丢弃正文（块只剩标题路径）。恒拼接路径前缀+正文，
                # 对齐 _chunk_markdown 的"首行=路径"约定，使父子块兄弟聚合对全库一致可用。
                _body = (_n.get_content() or "").strip()
                _t = ((_path + "\n") if _path else "") + _body
                if _t.strip():
                    _li.append(_t.strip())
            _self = _chunk_markdown(text, size=size, overlap=overlap)
            logger.info("[chunker] llamaindex=%d块/均长%.0f vs self=%d块/均长%.0f",
                        len(_li), (sum(map(len, _li)) / len(_li)) if _li else 0,
                        len(_self), (sum(map(len, _self)) / len(_self)) if _self else 0)
            chunks = _li or _chunk_markdown(text, size=size, overlap=overlap) or _chunk_text(text, size=size, overlap=overlap)
        except Exception:
            logger.warning("[chunker] llamaindex 切块失败，回退自研", exc_info=True)
            chunks = _chunk_markdown(text, size=size, overlap=overlap) or \
                     _chunk_text(text, size=size, overlap=overlap)
    elif chunker == "semantic" and not has_heading:
        # 闭环四·A3：语义断点切块——仅无标题文本生效，有标题仍走 markdown 主道。
        # 双通道对比日志照 llamaindex 刀1 模式；_chunk_semantic 内部软着陆绝不抛。
        _sem = _chunk_semantic(text, _embed, size=size, overlap=overlap)
        _self = _chunk_text(text, size=size, overlap=overlap)
        logger.info("[chunker] semantic=%d块/均长%.0f vs self=%d块/均长%.0f",
                    len(_sem), (sum(map(len, _sem)) / len(_sem)) if _sem else 0,
                    len(_self), (sum(map(len, _self)) / len(_self)) if _self else 0)
        chunks = _sem or _self
    elif mode in ("markdown", "auto") and has_heading:
        chunks = _chunk_markdown(text, size=size, overlap=overlap) or \
                 _chunk_text(text, size=size, overlap=overlap)
    else:
        chunks = _chunk_text(
            text,
            size=size,
            overlap=overlap,
        )
    if not chunks:
        return 0
    _set_progress(project_id, source, done=len(chunks), total=len(chunks), stage="chunking")
    # 解析当前 embedding 签名对应的活跃索引版本（签名变化时自动开新物理表，旧表保留只读）
    table = _db.resolve_active_text_table()
    # 清同源旧块（跨版本）：改切块参数/更新内容后重传，避免新旧边界块混存污染检索
    try:
        removed = _db.delete_kb_by_source(project_id, source)
        if removed:
            logger.info("入库前清理同源旧块 source=%s removed=%s", source, removed)
            _invalidate_bm25(project_id)
    except Exception:
        logger.warning("清理同源旧块失败 source=%s", source, exc_info=True)
    # 入库前确认向量表维度与当前 embedding 配置一致；不一致直接报错，不再静默返回 0 块
    _db.ensure_vector_dim(table)
    # 向量化（分批，模型一次 32 条）；每批写进度供前端轮询
    embeddings = []
    batch = 32
    _set_progress(project_id, source, done=0, total=len(chunks))
    for i in range(0, len(chunks), batch):
        embeddings.extend(_embed(chunks[i:i + batch]))
        _set_progress(project_id, source, done=min(i + batch, len(chunks)), total=len(chunks))
    # 入库（批量单事务：大批量从逐条 commit 降到一次 commit，避免分钟级锁窗口）
    bulk = []
    for i, c in enumerate(chunks):
        uid = _make_doc_id(project_id, source, i, c)
        bulk.append((uid, project_id, source, i, session_id, False, chunks[i], embeddings[i]))
    _db.upsert_kb_vectors_bulk(bulk, table=table)
    # 标题树：复用文档自身的形式分类逻辑（markdown 标题层级），供项目记忆知识图谱
    tree: list = []
    try:
        if source:
            tree = _extract_tree(text)
            _db.upsert_kb_tree(project_id, source, tree)
    except Exception:
        logger.warning("保存文档标题树失败 source=%s", source, exc_info=True)
    # 闭环五·B4-lite：标题树先修/相关关系抽取（门控 KB_KG_EDGES 默认开；
    # 内部静默容错，此层再兜一道与 B1 同款保险）
    try:
        if source and tree:
            extract_kg_edges(project_id, source, tree, api_key=api_key, db=_db)
    except Exception:
        logger.warning("关系抽取失败（不阻断上传）source=%s", source, exc_info=True)
    # 闭环四·B1：入库后为每块生成 ≤3 个可答问题存旁路表（换说法提问的 BM25 命中文本）。
    # 门控 KB_META_ENHANCE（默认开）；任何失败不阻断上传（enhance_questions 内部已兜底，
    # 此层再兜一道与标题树同级的保险）。
    try:
        _set_progress(project_id, source, done=0, total=1, stage="enhancing")
        enhance_questions(project_id, chunks, [b[0] for b in bulk],
                          source=source, api_key=api_key, db=_db)
        _set_progress(project_id, source, done=1, total=1, stage="enhancing")
    except Exception:
        logger.warning("问题增强失败（不阻断上传）source=%s", source, exc_info=True)
    _invalidate_bm25(project_id)
    return len(chunks)


def copy_document_across_projects(src_project_id: str, src_source: str,
                                  dst_project_id: str, dst_source: str = "",
                                  session_id: str | None = None) -> int:
    """跨项目复制向量块（P0-2 根因1 修复）：同一文件在其他项目已完整入库时，
    解析/切块/embedding 结果与本项目完全一致（同模型确定性产出），直接复制行，
    免去重复解析与上千次 embedding 调用（大 PDF 实测约 4.5 分钟）。

    doc_id 按目标项目重算（_make_doc_id），与源项目互不相干；
    session_id 改挂目标上传会话；B1 问题/kg_edges/kb_tree 为派生增强，暂不复制（P2 取舍，
    目标项目召回质量略降属预期）。返回复制块数；源无块返回 0（调用方回退全量入库）。"""
    dst_source = dst_source or src_source
    rows = _db.fetch_kb_rows(src_project_id, src_source)
    if not rows:
        return 0
    bulk = [(_make_doc_id(dst_project_id, dst_source, chunk, content),
             dst_project_id, dst_source, chunk, session_id, int(bool(has_ctx)), content, emb)
            for (chunk, has_ctx, content, emb) in rows]
    _db.insert_kb_vectors_raw(bulk, table=_db.peek_active_text_table())
    _invalidate_bm25(dst_project_id)
    return len(bulk)


def add_image(project_id: str, source: str, image_data_uri: str, description: str,
              file_path: str = "", mime: str = "image/png") -> int:
    """图片入库：用 Qwen3-VL-Embedding 生成图片向量并写入 image_vectors。
    与文字描述入库（add_document）并行，不替代文字链路；
    未配置 VL key 时跳过图片向量化，返回 0（仍可走文字描述检索）。"""
    from core.config import config as _cfg
    if getattr(_cfg, "KB_MODE", "full") == "light":
        return 0
    if not _vl_key():
        logger.warning("未配置 VL key，跳过图片向量化 source=%s", source)
        return 0
    try:
        from core.config import config as _cfg
        _db.ensure_vector_dim("image_vectors", int(getattr(_cfg, "VL_EMBEDDING_DIM", 4096) or 4096))
        vecs = embed_vl_images([image_data_uri])
        if not vecs:
            return 0
        doc_id = hashlib.md5((source + project_id).encode("utf-8")).hexdigest()[:24]
        _db.upsert_image_vectors_bulk(
            [(doc_id, project_id, source, description or "", file_path, mime, vecs[0])]
        )
        return 1
    except Exception:
        logger.exception("图片向量入库失败 source=%s", source)
        return 0


def _search_images(project_id: str, query: str, top_k: int = 3) -> list:
    """跨模态检索图片：文本查询向量 → image_vectors。失败/无 key 返回空列表。"""
    if not _vl_key():
        return []
    qvl = embed_vl_query(query)
    if not qvl:
        return []
    rows = _db.search_image_vectors(project_id, qvl, k=top_k)
    return [{
        "content": r.get("content") or "",
        "metadata": {
            "source": r.get("source"),
            "project_id": project_id,
            "type": "image",
            "file_path": r.get("file_path") or "",
            "mime": r.get("mime") or "",
        },
        "distance": r.get("distance"),
        "kind": "image",
    } for r in rows]


def search(project_id: str, query: str, top_k: int = 3, include_images: bool = True, rerank: bool = True) -> list:
    """混合检索：向量语义检索 + BM25 关键词检索 → RRF 融合 → P3 重排。
    include_images=False 时跳过图片跨模态检索；rerank=False 时跳过重排（极速档轻检索）。"""
    from core.config import config as _cfg
    if getattr(_cfg, "KB_MODE", "full") == "light":
        include_images = False
    _table = _db.peek_active_text_table()
    docs = _db.get_kb_docs(project_id, table=_table)
    # 图片跨模态检索（仅项目有图片向量时触发，避免无谓调用 VL 接口）
    image_hits: list = []
    if include_images:
        try:
            if _db.get_image_docs(project_id):
                image_hits = _search_images(project_id, query, top_k)
        except Exception:
            logger.warning("图片跨模态检索失败 project_id=%s", project_id, exc_info=True)
    if not docs:
        return image_hits
    # 活跃索引版本：检索与 BM25 只在当前代际进行（旧版本保留只读，不参与检索）
    table = _table
    rrf_k = int(getattr(_cfg, "KB_RRF_K", 60) or 60)
    fetch_mult = max(1, int(getattr(_cfg, "KB_FETCH_MULT", 3) or 3))
    # 1. 向量检索（召回倍数候选）
    qvec = _embed([query])[0]
    vec_rows = _db.search_kb_vectors(project_id, qvec, k=top_k * fetch_mult, table=table)
    vec = {r["doc_id"]: r for r in vec_rows}
    # 2. BM25 检索
    bm = _get_bm25(project_id, table)
    bm_hits = {}
    if bm:
        ids, tokenized, bm25 = bm
        scores = bm25.get_scores(_tokenize(query))
        order = sorted(range(len(scores)), key=lambda i: -scores[i])
        for idx in order[: top_k * fetch_mult]:
            if scores[idx] > 0:
                bm_hits[ids[idx]] = idx
    # 3. RRF 融合：score = sum(1/(k+rank))
    rrf = {}
    for i, h in enumerate(vec.keys()):
        rrf[h] = 1.0 / (rrf_k + i)
    if bm:
        sorted_bm = sorted(bm_hits.keys(), key=lambda k: bm_hits[k])
        for i, k in enumerate(sorted_bm[: top_k * fetch_mult]):
            rrf[k] = rrf.get(k, 0) + 1.0 / (rrf_k + i)
    # 4. 合并：向量结果 + BM25 独有命中
    all_hits = {}
    for h, r in vec.items():
        all_hits[h] = {
            "content": r["content"],
            "metadata": {"source": r["source"], "project_id": project_id, "chunk": r["chunk"],
                         "session_id": r["session_id"], "has_context": bool(r["has_context"])},
            "distance": r["distance"],
        }
    if bm:
        bm_only = [k for k in bm_hits.keys() if k not in all_hits]
        if bm_only:
            doc_map = {d["doc_id"]: d for d in docs}
            for k in bm_only:
                d = doc_map.get(k)
                if d:
                    all_hits[k] = {
                        "content": d["content"],
                        "metadata": {"source": d["source"], "project_id": project_id, "chunk": d["chunk"],
                                     "session_id": d["session_id"], "has_context": bool(d["has_context"])},
                        "distance": None,
                    }
    # 5. 按 RRF 分数取候选（多取一些供 P3 精排；候选池=召回倍数×2，保底 12）
    candidate_n = max(top_k * fetch_mult * 2, 12)
    ranked = sorted(rrf.keys(), key=lambda k: -rrf[k])[:candidate_n]
    cands = []
    for h in ranked:
        if h in all_hits:
            item = dict(all_hits[h])
            item["rrf"] = round(rrf.get(h, 0), 4)
            cands.append(item)
    # 6. P3：CrossEncoder 重排序（极速档可跳过，省一次 API 调用）
    reranker = _get_reranker() if rerank else None
    if reranker and len(cands) > 1:
        try:
            pairs = [(query, it["content"][:500]) for it in cands]
            scores = reranker.predict(pairs)
            for i, s in enumerate(scores):
                cands[i]["rerank"] = float(s)
            cands.sort(key=lambda x: -x.get("rerank", 0))
            return cands[:top_k] + image_hits
        except Exception:
            logger.warning("重排失败，按 RRF 结果返回", exc_info=True)
    return cands[:top_k] + image_hits


# P3 重排序后端（懒加载；本地 CrossEncoder 与 API 实例分别缓存）
_reranker_local = None
_reranker_api = None


class _ApiReranker:
    """OpenAI 兼容 rerank API（如硅基流动 bge-reranker-v2-m3），
    接口对齐 CrossEncoder.predict(pairs) —— pairs 为 [(query, doc), ...]，返回分数列表。
    """

    def __init__(self):
        from core.config import config as _cfg
        # 同一硅基流动 Key 同时驱动 embedding 与 rerank：rerank 未单独配置时复用向量化配置
        self._url = ((_cfg.RERANK_BASE_URL or _cfg.EMBEDDING_BASE_URL) or "").rstrip("/") + "/rerank"
        self._key = _cfg.RERANK_API_KEY or _cfg.EMBEDDING_API_KEY
        self._model = _cfg.RERANK_MODEL

    def predict(self, pairs):
        if not pairs:
            return []
        import requests as _req
        query = pairs[0][0]
        docs = [p[1] for p in pairs]
        resp = _req.post(
            self._url,
            json={"model": self._model, "query": query, "documents": docs, "top_n": len(docs)},
            headers={"Authorization": "Bearer " + self._key, "Content-Type": "application/json"},
            timeout=60,
        )
        resp.raise_for_status()
        scores = [0.0] * len(docs)
        for r in resp.json().get("results") or []:
            scores[r["index"]] = r.get("relevance_score", r.get("score", 0.0))
        return scores


def _get_reranker():
    """重排序后端路由：RERANK_BACKEND=none 禁用；=api 走外接服务（未配 key 回退本地）；默认本地"""
    global _reranker_api, _reranker_local
    from core.config import config as _cfg
    if _cfg.RERANK_BACKEND == "none":
        return None
    # api 后端：rerank key 未单独配置时复用向量化 key（同一硅基流动 Key 全搞定）
    if _cfg.RERANK_BACKEND == "api" and (_cfg.RERANK_API_KEY or _cfg.EMBEDDING_API_KEY):
        if _reranker_api is None:
            _reranker_api = _ApiReranker()
        return _reranker_api
    if _reranker_local is None:
        try:
            from core.config import config as _cfg
            from sentence_transformers import CrossEncoder
            _reranker_local = CrossEncoder(getattr(_cfg, "RERANK_LOCAL_MODEL", "BAAI/bge-reranker-base"), max_length=512)
        except Exception:
            _reranker_local = False
    return _reranker_local or None


def list_docs(project_id: str) -> list:
    """列出项目知识库的文档（按 source 聚合）。
    同时查 resources 表（已上传原文）和 kb_vectors（向量块），
    未向量化的资源也显示（chunks=0, vectorized=false），前端可标注。
    生成类（gen: 前缀 / 生成· / 对话生成·）条目过滤不显示（资源库保留，左栏不展示）。"""
    # 从 resources 表取全部资源（原文已存）
    res_rows = _db.get_resources(project_id)
    # 从活跃版本向量表取已有向量块（按 source 聚合；旧版本代际不计入展示）
    vec_rows = _db.get_kb_docs(project_id, table=_db.peek_active_text_table())
    vec_map: dict[str, int] = {}
    for r in vec_rows:
        src = r["source"] or "未命名"
        vec_map[src] = vec_map.get(src, 0) + 1
    # 合并：resources 为主，kb_vectors 补充块数
    grouped: dict[str, dict] = {}
    for r in res_rows:
        src = r["name"]
        if not src:
            continue
        if (r.get("type") or "").startswith("gen:") or src.startswith("对话生成·") or src.startswith("生成·"):
            continue
        grouped[src] = {
            "source": src,
            "chunks": vec_map.get(src, 0),
            "vectorized": src in vec_map,
            "preview": "",
        }
    # 补充 tree（每个 source 只查一次）
    for src in grouped:
        grouped[src]["tree"] = _db.get_kb_tree(project_id, src)
    return list(grouped.values())


def delete_doc(project_id: str, source: str) -> int:
    """删除某个来源的全部块，返回删除块数。
    连带清理 resources 表（原文）与 file_hashes 表（去重 hash），
    否则残留幽灵记录会让同内容再上传被误判重复。"""
    n = _db.delete_kb_by_source(project_id, source)
    _db.delete_image_by_source(project_id, source)
    _db.delete_kb_tree_by_source(project_id, source)
    try:
        from core.postgres_client import pg_client as _pg
        _pg.execute("DELETE FROM resources WHERE project_id=%s AND name=%s", (project_id, source))
        _pg.execute("DELETE FROM file_hashes WHERE project_id=%s AND source=%s", (project_id, source))
    except Exception:
        logger.warning("删除资源原文/去重 hash 失败 source=%s", source, exc_info=True)
    _invalidate_bm25(project_id)
    return n


def delete_project_kb(project_id: str) -> int:
    """删除项目全部知识库（级联删除时调用）"""
    n = _db.delete_kb_project(project_id)
    _db.delete_image_project(project_id)
    _invalidate_bm25(project_id)
    return n
