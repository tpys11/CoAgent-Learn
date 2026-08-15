"""一次性迁移：把向量表从 float[512] 重建为 float[1024]，并重灌现有知识库块。

运行（后端容器内）：
    python rebuild_vectors_1024.py
"""
from core.sqlite_client import get_db
from routers.settings import _apply_dynamic_settings
from core.knowledge_service import _embed


def main() -> None:
    _apply_dynamic_settings()
    db = get_db()

    rows = db.execute(
        "SELECT doc_id, project_id, source, chunk, session_id, has_context, content "
        "FROM kb_vectors ORDER BY project_id, source, chunk"
    )
    print(f"旧 kb_vectors 块数: {len(rows)}")

    # 仅迁移 kb_vectors；先备份元数据，避免重灌失败时丢内容。
    db.execute("DROP TABLE IF EXISTS kb_vectors_backup_512")
    db.execute(
        "CREATE TABLE kb_vectors_backup_512 AS "
        "SELECT doc_id, project_id, source, chunk, session_id, has_context, content FROM kb_vectors"
    )
    try:
        db.execute("DROP TABLE IF EXISTS kb_vectors")
    except Exception as e:
        print(f"drop kb_vectors 失败: {e}")
        raise

    db.create_vector_tables()

    if rows:
        texts = [r["content"] for r in rows]
        embeddings = _embed(texts)
        items = []
        for r, emb in zip(rows, embeddings):
            if len(emb) != 1024:
                raise RuntimeError(f"embedding 维度错误: {len(emb)}")
            items.append((
                r["doc_id"], r["project_id"], r["source"], r["chunk"],
                r["session_id"], bool(r["has_context"]), r["content"], emb,
            ))
        db.upsert_kb_vectors_bulk(items)

    print(f"完成，已重建 {len(rows)} 个知识库块（1024 维）；旧元数据备份在 kb_vectors_backup_512")


if __name__ == "__main__":
    main()
