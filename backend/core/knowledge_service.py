# -*- coding: utf-8 -*-
"""知识库服务：文本切块 → 向量化 → Chroma 存储/检索（按项目隔离）"""
import hashlib
import re
import chromadb


_client = chromadb.HttpClient(host="guashuai-chroma", port=8000)

# BM25 缓存：project_id -> (ids, tokenized_docs, bm25)
_bm25_cache = {}

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
        col = _client.get_collection(_col_name(project_id))
    except Exception:
        return None
    r = col.get(include=["documents"])
    if not r or not r.get("ids"):
        return None
    ids = r["ids"]
    tokenized = [_tokenize(d) for d in (r.get("documents") or [])]
    from rank_bm25 import BM25Okapi
    bm25 = BM25Okapi(tokenized)
    _bm25_cache[project_id] = (ids, tokenized, bm25)
    return _bm25_cache[project_id]


def _invalidate_bm25(project_id: str):
    _bm25_cache.pop(project_id, None)


def _col_name(project_id: str) -> str:
    """Chroma collection 名需合法，用 project_id 生成唯一名"""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", str(project_id)) or "default"
    return "kb_" + safe[:60]


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
            json={"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}], "max_tokens": 80},
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
    col = _client.get_or_create_collection(_col_name(project_id))
    ids, docs, metas = [], [], []
    for i, c in enumerate(chunks):
        uid = hashlib.md5((source + str(i) + c[:80]).encode("utf-8")).hexdigest()[:24]
        ids.append(uid)
        pfx = prefixes[i] if i < len(prefixes) else ""
        docs.append((pfx + chr(10) + chr(10) + c).strip() if pfx else c)
        metas.append({"source": source, "project_id": project_id, "chunk": i, "session_id": session_id, "has_context": bool(pfx)})
    col.upsert(ids=ids, documents=docs, metadatas=metas)
    _invalidate_bm25(project_id)
    return len(chunks)


def search(project_id: str, query: str, top_k: int = 3) -> list:
    """混合检索：向量语义检索 + BM25 关键词检索 → RRF 融合"""
    try:
        col = _client.get_collection(_col_name(project_id))
    except Exception:
        return []
    if col.count() == 0:
        return []
    # 1. 向量检索（取 3 倍候选），key 用 chroma uid
    r = col.query(query_texts=[query], n_results=top_k * 3)
    vec = {}
    qids = (r.get("ids") or [[]])[0]
    docs = r.get("documents") or [[]]
    metas = r.get("metadatas") or [[]]
    dists = r.get("distances") or [[]]
    for i in range(len(docs[0])):
        vec[qids[i]] = docs[0][i]
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
    # 4. 合并：向量结果 + BM25 独有命中（从 chroma 取回原文）
    all_hits = {}
    for i in range(len(docs[0])):
        h = qids[i]
        all_hits[h] = {"content": docs[0][i], "metadata": metas[0][i] if metas and metas[0] else {}, "distance": dists[0][i] if dists and dists[0] else None}
    if bm:
        bm_only = [k for k in bm_hits.keys() if k not in all_hits]
        if bm_only:
            try:
                got = col.get(ids=bm_only, include=["documents", "metadatas"])
                for i in range(len(got.get("ids") or [])):
                    h = got["ids"][i]
                    all_hits[h] = {"content": got["documents"][i], "metadata": got["metadatas"][i] if got.get("metadatas") else {}, "distance": None}
            except Exception:
                pass
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


def list_docs(project_id: str) -> list:
    """列出项目知识库的文档（按 source 聚合）"""
    try:
        col = _client.get_collection(_col_name(project_id))
    except Exception:
        return []
    r = col.get(include=["metadatas", "documents"])
    if not r or not r.get("ids"):
        return []
    grouped = {}
    for i in range(len(r["ids"])):
        m = r["metadatas"][i] if r.get("metadatas") else {}
        src = m.get("source", "") or "未命名"
        g = grouped.setdefault(src, {"source": src, "chunks": 0, "preview": "", "blocks": []})
        g["chunks"] += 1
        if r.get("documents"):
            content = r["documents"][i]
            if not g["preview"]:
                g["preview"] = content[:60]
            g["blocks"].append({"chunk": m.get("chunk", 0), "content": content})
    return list(grouped.values())


def delete_doc(project_id: str, source: str) -> int:
    """删除某个来源的全部块，返回删除块数"""
    try:
        col = _client.get_collection(_col_name(project_id))
    except Exception:
        return 0
    r = col.get(include=["metadatas"])
    if not r or not r.get("ids"):
        return 0
    to_del = [r["ids"][i] for i in range(len(r["ids"])) if (r["metadatas"][i] or {}).get("source") == source]
    if to_del:
        col.delete(ids=to_del)
    _invalidate_bm25(project_id)
    return len(to_del)
