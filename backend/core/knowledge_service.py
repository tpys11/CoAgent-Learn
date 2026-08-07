# -*- coding: utf-8 -*-
"""知识库服务：文本切块 → 向量化 → SQLite(sqlite-vec) 存储/检索（按项目隔离）
替换原 Chroma 实现；embedding 用 bge-small-zh-v1.5（中文，512维）。
"""
import hashlib
import re

from core.sqlite_client import get_db

_db = get_db()

# BM25 缓存：project_id -> (ids, tokenized_docs, bm25)
_bm25_cache = {}

# embedding 模型（懒加载）
_embedder = None


def _get_embedder():
    """加载中文 embedding 模型（bge-small-zh-v1.5，512 维）"""
    global _embedder
    if _embedder is None:
        try:
            import os
            os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
            from sentence_transformers import SentenceTransformer
            _embedder = SentenceTransformer("BAAI/bge-small-zh-v1.5")
        except Exception:
            _embedder = False
    return _embedder or None


def _embed(texts: list[str]) -> list[list[float]]:
    """批量向量化；模型不可用时降级为哈希伪向量（仍可检索但效果差）"""
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


def _chunk_text(text: str, size: int = 400) -> list:
    """切块：每个段落独立成块（保留上下文粒度），超长段落按长度再切"""
    text = (text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    chunks = []
    for p in paras:
        while len(p) > size:
            chunks.append(p[:size])
            p = p[size:]
        if p:
            chunks.append(p)
    return chunks


def _gen_context(chunk: str, full_text: str, api_key: str = "") -> str:
    """用 LLM 为单个块生成上下文前缀（P1 上下文感知检索）"""
    try:
        import requests as _req
        from core.config import config as _cfg
        NL = chr(10)
        prompt = (
            "下面是一篇文档的片段，请为这个片段生成一句简短的上下文说明（30字以内），"
            "说明这段内容在整篇文档中的位置或主题，让单独看这段的人能明白它讲什么。" + NL +
            "整篇文档开头部分：" + NL + full_text[:1500] + NL + NL +
            "需要加说明的片段：" + NL + chunk + NL + NL +
            "只输出说明文字，不要引号、不要多余内容。"
        )
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
            json={"model": "deepseek-flash", "messages": [{"role": "user", "content": prompt}], "max_tokens": 80},
            headers=h, timeout=30)
        if resp.status_code == 200:
            txt = (resp.json()["choices"][0]["message"]["content"] or "").strip()
            txt = txt.strip("\u201c\u201d\"'").strip()
            if txt and len(txt) < 120:
                return txt
    except Exception:
        pass
    return ""


def add_document(project_id: str, text: str, source: str = "", session_id: str = "", api_key: str = "") -> int:
    """上传文本：切块 → 每块生成上下文前缀(P1) → 向量化 → 入库，返回入库块数"""
    chunks = _chunk_text(text)
    if not chunks:
        return 0
    # 用 LLM 为每块生成上下文前缀（并发加速）
    from concurrent.futures import ThreadPoolExecutor
    try:
        with ThreadPoolExecutor(max_workers=4) as ex:
            prefixes = list(ex.map(lambda ck: _gen_context(ck, text, api_key), chunks))
    except Exception:
        prefixes = [""] * len(chunks)
    # 组装文档文本
    docs = []
    for i, c in enumerate(chunks):
        pfx = prefixes[i] if i < len(prefixes) else ""
        docs.append((pfx + chr(10) + chr(10) + c).strip() if pfx else c)
    # 向量化（分批，模型一次 32 条）
    embeddings = []
    batch = 32
    for i in range(0, len(docs), batch):
        embeddings.extend(_embed(docs[i:i + batch]))
    # 入库
    for i, c in enumerate(chunks):
        uid = hashlib.md5((source + str(i) + c[:80]).encode("utf-8")).hexdigest()[:24]
        pfx = prefixes[i] if i < len(prefixes) else ""
        _db.upsert_kb_vector(
            doc_id=uid, project_id=project_id, source=source, chunk=i,
            session_id=session_id, has_context=bool(pfx),
            content=docs[i], embedding=embeddings[i],
        )
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
            pass
    return cands[:top_k]


# P3 重排序模型（懒加载，进程内只加载一次）
_reranker = None


def _get_reranker():
    global _reranker
    if _reranker is None:
        try:
            import os
            os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
            from sentence_transformers import CrossEncoder
            _reranker = CrossEncoder("BAAI/bge-reranker-base", max_length=512)
        except Exception:
            _reranker = False
    return _reranker or None


def list_docs(project_id: str) -> list:
    """列出项目知识库的文档（按 source 聚合）"""
    rows = _db.get_kb_docs(project_id)
    if not rows:
        return []
    grouped = {}
    for r in rows:
        src = r["source"] or "未命名"
        g = grouped.setdefault(src, {"source": src, "chunks": 0, "preview": "", "blocks": []})
        g["chunks"] += 1
        content = r["content"] or ""
        if not g["preview"]:
            g["preview"] = content[:60]
        g["blocks"].append({"chunk": r["chunk"], "content": content})
    return list(grouped.values())


def delete_doc(project_id: str, source: str) -> int:
    """删除某个来源的全部块，返回删除块数"""
    n = _db.delete_kb_by_source(project_id, source)
    _invalidate_bm25(project_id)
    return n


def delete_project_kb(project_id: str) -> int:
    """删除项目全部知识库（级联删除时调用）"""
    n = _db.delete_kb_project(project_id)
    _invalidate_bm25(project_id)
    return n
