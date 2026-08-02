# -*- coding: utf-8 -*-
"""知识库服务：文本切块 → 向量化 → Chroma 存储/检索（按项目隔离）"""
import hashlib
import re
import chromadb


_client = chromadb.HttpClient(host="guashuai-chroma", port=8000)


def _col_name(project_id: str) -> str:
    """Chroma collection 名需合法，用 project_id 生成唯一名"""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", str(project_id)) or "default"
    return "kb_" + safe[:60]


def _chunk_text(text: str, size: int = 400) -> list:
    """简单切块：先按段落，超长再按长度切"""
    text = (text or "").strip()
    if not text:
        return []
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    chunks = []
    cur = ""
    for p in paras:
        if len(cur) + len(p) <= size:
            cur = (cur + " " + p).strip()
        else:
            if cur:
                chunks.append(cur)
            # 段落本身超长则再切
            while len(p) > size:
                chunks.append(p[:size])
                p = p[size:]
            cur = p
    if cur:
        chunks.append(cur)
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
    return len(chunks)


def search(project_id: str, query: str, top_k: int = 3) -> list:
    """检索与问题最相关的知识片段"""
    try:
        col = _client.get_collection(_col_name(project_id))
    except Exception:
        return []
    if col.count() == 0:
        return []
    r = col.query(query_texts=[query], n_results=top_k)
    out = []
    docs = r.get("documents") or [[]]
    metas = r.get("metadatas") or [[]]
    dists = r.get("distances") or [[]]
    for i in range(len(docs[0])):
        out.append({"content": docs[0][i], "metadata": metas[0][i] if metas and metas[0] else {}, "distance": dists[0][i] if dists and dists[0] else None})
    return out


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
    return len(to_del)
