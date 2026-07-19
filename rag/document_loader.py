"""RAG文档加载器 — 加载md文件 → 切块 → BGE Embedding → Chroma入库"""
import os
import re
import logging
from pathlib import Path

logger = logging.getLogger("document_loader")


def load_and_chunk(docs_dir: str, chunk_size: int = 500) -> list[dict]:
    """加载data/documents/下所有md文件，按##标题切块，返回[{text, meta}]"""
    docs_path = Path(docs_dir)
    if not docs_path.exists():
        logger.warning(f"文档目录不存在: {docs_dir}")
        return []

    chunks = []
    for md_file in docs_path.glob("*.md"):
        with open(md_file, encoding="utf-8") as f:
            content = f.read()

        # 按 ## 标题切分
        sections = re.split(r"\n(?=## )", content)
        title = md_file.stem  # e.g. "01-大模型基础概念"

        for i, section in enumerate(sections):
            text = section.strip()
            if not text:
                continue
            # 进一步切分过长的section
            if len(text) > chunk_size * 2:
                subs = _split_long(text, chunk_size)
                for j, sub in enumerate(subs):
                    chunks.append({
                        "text": sub,
                        "metadata": {
                            "source": str(md_file),
                            "title": title,
                            "section_index": i,
                            "sub_index": j,
                        }
                    })
            else:
                chunks.append({
                    "text": text,
                    "metadata": {
                        "source": str(md_file),
                        "title": title,
                        "section_index": i,
                        "sub_index": 0,
                    }
                })

    logger.info(f"加载了 {len(list(docs_path.glob('*.md')))} 个文件，切分为 {len(chunks)} 个片段")
    return chunks


def _split_long(text: str, size: int) -> list[str]:
    """将超长文本按段落边界切成小块"""
    paragraphs = text.split("\n\n")
    result = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) < size:
            current = (current + "\n\n" + para).strip()
        else:
            if current:
                result.append(current)
            current = para
    if current:
        result.append(current)
    return result or [text]


def embed_and_store(
    chunks: list[dict],
    embedding_model,
    collection,
    batch_size: int = 8,
):
    """将文本块向量化并存入Chroma"""
    if not chunks:
        return

    total = len(chunks)
    for start in range(0, total, batch_size):
        batch = chunks[start : start + batch_size]
        texts = [c["text"] for c in batch]
        metadatas = [c["metadata"] for c in batch]
        ids = [
            f"{m['title']}-s{m['section_index']}-s{m['sub_index']}"
            for m in metadatas
        ]

        embeddings = embedding_model.encode(texts, show_progress_bar=False).tolist()
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )
        logger.info(f"已入库 {min(start + batch_size, total)}/{total}")


def search(collection, query: str, embedding_model, top_k: int = 3) -> list[dict]:
    """检索最相关的Top-K片段"""
    q_embedding = embedding_model.encode([query], show_progress_bar=False).tolist()
    results = collection.query(query_embeddings=q_embedding, n_results=top_k)
    output = []
    if results and results["documents"] and results["documents"][0]:
        for i in range(len(results["documents"][0])):
            output.append({
                "content": results["documents"][0][i],
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results.get("distances") else None,
            })
    return output
