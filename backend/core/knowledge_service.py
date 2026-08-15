# -*- coding: utf-8 -*-
"""知识库服务：文本切块 → 向量化 → SQLite(sqlite-vec) 存储/检索（按项目隔离）
替换原 Chroma 实现；embedding 用 bge-small-zh-v1.5（中文，512维）。
"""
import hashlib
import logging
import re

from core.sqlite_client import get_db

_db = get_db()
logger = logging.getLogger("coagent.knowledge")

# BM25 缓存：project_id -> (ids, tokenized_docs, bm25)
_bm25_cache = {}

# embedding 模型（懒加载）
_embedder = None


def _get_embedder():
    """加载本地部署 embedding 模型（模型名/路径由配置 EMBEDDING_LOCAL_MODEL 指定，默认 bge-small-zh-v1.5）"""
    global _embedder
    if _embedder is None:
        try:
            from core.config import config as _cfg
            from sentence_transformers import SentenceTransformer
            _embedder = SentenceTransformer(getattr(_cfg, "EMBEDDING_LOCAL_MODEL", "BAAI/bge-small-zh-v1.5"))
        except Exception:
            _embedder = False
    return _embedder or None


def _embed_local(texts: list[str]) -> list[list[float]]:
    """本地模型批量向量化；模型不可用时降级为哈希伪向量（仍可检索但效果差）"""
    emb = _get_embedder()
    if emb:
        return emb.encode(texts, normalize_embeddings=True).tolist()
    # 降级：确定性伪向量（相同文本得到相同向量）
    vecs = []
    for t in texts:
        v = [0.0] * 512
        for i, ch in enumerate((t or "")[:512]):
            v[i] = (ord(ch) % 100) / 100.0
        vecs.append(v)
    return vecs


def _embed_api(texts: list[str]) -> list[list[float]]:
    """OpenAI 兼容 embedding API（如硅基流动 bge-m3）"""
    import requests as _req
    from core.config import config as _cfg
    url = (_cfg.EMBEDDING_BASE_URL or "").rstrip("/") + "/embeddings"
    h = {"Authorization": "Bearer " + _cfg.EMBEDDING_API_KEY, "Content-Type": "application/json"}
    resp = _req.post(url, json={"model": _cfg.EMBEDDING_MODEL, "input": list(texts)}, headers=h, timeout=60)
    resp.raise_for_status()
    data = resp.json().get("data") or []
    data.sort(key=lambda d: d.get("index", 0))  # 部分服务乱序返回，按 index 复原
    vecs = [d["embedding"] for d in data]
    # 维度断言：与配置不符立即报错（向量表维度固定，维度变了需清库重灌）
    for v in vecs:
        if len(v) != _cfg.EMBEDDING_DIM:
            raise RuntimeError(
                f"embedding 维度 {len(v)} 与配置 EMBEDDING_DIM={_cfg.EMBEDDING_DIM} 不符；"
                "切换 embedding 后端后请清空知识库重新入库"
            )
    return vecs


def _embed(texts: list[str]) -> list[list[float]]:
    """批量向量化，按配置路由：api 后端 > 本地模型 > 伪向量降级"""
    from core.config import config as _cfg
    if _cfg.EMBEDDING_BACKEND == "api" and _cfg.EMBEDDING_API_KEY:
        try:
            return _embed_api(texts)
        except Exception:
            logger.warning("embedding API 失败，降级本地", exc_info=True)
    return _embed_local(texts)


def _tokenize(text: str) -> list:
    """中文分词（jieba），供 BM25 使用"""
    try:
        import jieba
        return [w for w in jieba.lcut((text or "").lower()) if w.strip() and w.strip() not in "，。！？、；：""''（）《》 "]
    except Exception:
        return list((text or "").lower())


def _get_bm25(project_id: str):
    """获取项目 BM25 索引（带缓存，数据变更后失效）"""
    cache = _bm25_cache.get(project_id)
    if cache is not None:
        return cache
    try:
        rows = _db.get_kb_docs(project_id)
    except Exception:
        return None
    if not rows:
        return None
    ids = [r["doc_id"] for r in rows]
    tokenized = [_tokenize(r["content"]) for r in rows]
    from rank_bm25 import BM25Okapi
    bm25 = BM25Okapi(tokenized)
    _bm25_cache[project_id] = (ids, tokenized, bm25)
    return _bm25_cache[project_id]


def _invalidate_bm25(project_id: str):
    _bm25_cache.pop(project_id, None)


def _extract_tree(text: str) -> list:
    """从文档文本提取标题层级树（复用上传资料自身的形式分类逻辑：markdown 标题）
    无标题时返回空列表（前端显示空树占位）。"""
    tree = []
    stack: list[tuple[int, dict]] = []
    for line in (text or "").splitlines():
        if not line.strip().startswith("#"):
            continue
        m = re.match(r"^(#{1,6})\s+(.+)$", line.rstrip())
        if not m:
            continue
        lvl = len(m.group(1))
        node = {"name": m.group(2).strip(), "children": []}
        while stack and stack[-1][0] >= lvl:
            stack.pop()
        if stack:
            stack[-1][1]["children"].append(node)
        else:
            tree.append(node)
        stack.append((lvl, node))
    return tree


def _split_sentences(text: str) -> list:
    """句子级切分：中文句号/问号/感叹号/分号 + 换行视为句界（对齐 DeepTutor 的句子级切块思想）"""
    # 先按行拆，再按中文/英文句末标点拆
    pieces = re.split(r"(?<=[。！？!?；;])\s*|\n", text)
    return [p.strip() for p in pieces if p.strip()]


def _chunk_text(text: str, size: int = 512, overlap: int = 50) -> list:
    """切块：句子级 + 512 字符窗口 + 50 重叠（照 DeepTutor SentenceSplitter chunk_size=512, chunk_overlap=50）。
    按句子累积成块，超过 size 则收束当前块并开新块；相邻块保留 overlap 的重叠尾巴避免语义被切断。"""
    text = (text or "").strip()
    if not text:
        return []
    sentences = _split_sentences(text)
    chunks: list = []
    cur = ""
    for s in sentences:
        if len(s) > size:
            # 超长单句：先收当前块，再硬切该句（带重叠）
            if cur:
                chunks.append(cur)
            s = s[:size]  # 超长句截断，避免单块过大
            cur = s
            continue
        if cur and len(cur) + 1 + len(s) > size:
            # 当前块放不下：收束（保留尾部 overlap 作下块开头）
            tail = cur[-overlap:] if overlap and len(cur) > overlap else ""
            chunks.append(cur)
            cur = (tail + " " + s).strip() if tail else s
        else:
            cur = (cur + " " + s).strip() if cur else s
    if cur:
        chunks.append(cur)
    return chunks


def add_document(project_id: str, text: str, source: str = "", session_id: str = "", api_key: str = "", skip_context: bool = False) -> int:
    """上传文本：切块 → 向量化 → 入库，返回入库块数。
    已移除「每块 LLM 生成上下文前缀」（_gen_context，2026-08-15 删除）：
    对齐 DeepTutor，上传链路零 LLM 调用，几百块从分钟级降到秒级；
    上下文连续性由 512/50 重叠切块保证，检索质量由 bge+BM25+rerank 保证。
    skip_context 参数保留仅为兼容旧调用方，不再起作用。"""
    chunks = _chunk_text(text)
    if not chunks:
        return 0
    # 入库前确认向量表维度与当前 embedding 配置一致；不一致直接报错，不再静默返回 0 块
    _db.ensure_vector_dim("kb_vectors")
    # 向量化（分批，模型一次 32 条）
    embeddings = []
    batch = 32
    for i in range(0, len(chunks), batch):
        embeddings.extend(_embed(chunks[i:i + batch]))
    # 入库（批量单事务：大批量从逐条 commit 降到一次 commit，避免分钟级锁窗口）
    bulk = []
    for i, c in enumerate(chunks):
        uid = hashlib.md5((source + str(i) + c[:80]).encode("utf-8")).hexdigest()[:24]
        bulk.append((uid, project_id, source, i, session_id, False, chunks[i], embeddings[i]))
    _db.upsert_kb_vectors_bulk(bulk)
    # 标题树：复用文档自身的形式分类逻辑（markdown 标题层级），供项目记忆知识图谱
    try:
        if source:
            _db.upsert_kb_tree(project_id, source, _extract_tree(text))
    except Exception:
        logger.warning("保存文档标题树失败 source=%s", source, exc_info=True)
    _invalidate_bm25(project_id)
    return len(chunks)


def search(project_id: str, query: str, top_k: int = 3) -> list:
    """混合检索：向量语义检索 + BM25 关键词检索 → RRF 融合 → P3 重排"""
    docs = _db.get_kb_docs(project_id)
    if not docs:
        return []
    # 1. 向量检索（取 3 倍候选）
    qvec = _embed([query])[0]
    vec_rows = _db.search_kb_vectors(project_id, qvec, k=top_k * 3)
    vec = {r["doc_id"]: r for r in vec_rows}
    # 2. BM25 检索
    bm = _get_bm25(project_id)
    bm_hits = {}
    if bm:
        ids, tokenized, bm25 = bm
        scores = bm25.get_scores(_tokenize(query))
        order = sorted(range(len(scores)), key=lambda i: -scores[i])
        for idx in order[: top_k * 3]:
            if scores[idx] > 0:
                bm_hits[ids[idx]] = idx
    # 3. RRF 融合：score = sum(1/(60+rank))
    rrf = {}
    for i, h in enumerate(vec.keys()):
        rrf[h] = 1.0 / (60 + i)
    if bm:
        sorted_bm = sorted(bm_hits.keys(), key=lambda k: bm_hits[k])
        for i, k in enumerate(sorted_bm[: top_k * 3]):
            rrf[k] = rrf.get(k, 0) + 1.0 / (60 + i)
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
    # 5. 按 RRF 分数取候选（多取一些供 P3 精排）
    candidate_n = max(top_k * 6, 12)
    ranked = sorted(rrf.keys(), key=lambda k: -rrf[k])[:candidate_n]
    cands = []
    for h in ranked:
        if h in all_hits:
            item = dict(all_hits[h])
            item["rrf"] = round(rrf.get(h, 0), 4)
            cands.append(item)
    # 6. P3：CrossEncoder 重排序
    reranker = _get_reranker()
    if reranker and len(cands) > 1:
        try:
            pairs = [(query, it["content"][:500]) for it in cands]
            scores = reranker.predict(pairs)
            for i, s in enumerate(scores):
                cands[i]["rerank"] = float(s)
            cands.sort(key=lambda x: -x.get("rerank", 0))
            return cands[:top_k]
        except Exception:
            logger.warning("重排失败，按 RRF 结果返回", exc_info=True)
    return cands[:top_k]


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
    只返回 source/chunks/preview/tree——不返回每块完整正文（块多时响应可达几百 KB，
    前端并不使用 blocks 内容，拉取/解析会拖慢界面加载）。"""
    rows = _db.get_kb_docs(project_id)
    if not rows:
        return []
    grouped = {}
    for r in rows:
        src = r["source"] or "未命名"
        g = grouped.setdefault(src, {"source": src, "chunks": 0, "preview": ""})
        g["chunks"] += 1
        content = r["content"] or ""
        if not g["preview"]:
            g["preview"] = content[:150]
    # 标题树每个 source 只查一次（之前误放循环内，块多时每行都查库 → 接口 3.5s 卡顿）
    for src in grouped:
        grouped[src]["tree"] = _db.get_kb_tree(project_id, src)
    return list(grouped.values())


def delete_doc(project_id: str, source: str) -> int:
    """删除某个来源的全部块，返回删除块数"""
    n = _db.delete_kb_by_source(project_id, source)
    _db.delete_kb_tree_by_source(project_id, source)
    _invalidate_bm25(project_id)
    return n


def delete_project_kb(project_id: str) -> int:
    """删除项目全部知识库（级联删除时调用）"""
    n = _db.delete_kb_project(project_id)
    _invalidate_bm25(project_id)
    return n
