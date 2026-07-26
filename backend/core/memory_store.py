"""
三层记忆存储系统
- 文本层：结构化文本记忆 (SQLite)
- 向量层：语义向量嵌入 (Chroma)
- 图层：知识图谱关系 (NetworkX in-memory)
每个记忆点带时间戳，支持全局/项目级作用域。
"""
import json, os, time
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import create_engine, Column, String, Text, Float, select
from sqlalchemy.orm import declarative_base, Session

Base = declarative_base()

# ── SQLite 文本层 ──
class MemoryRecord(Base):
    __tablename__ = "memories"
    id = Column(String, primary_key=True)
    scope = Column(String, default="global")   # "global" | "project:<id>"
    level = Column(String, default="text")     # "text" | "vector" | "graph"
    content = Column(Text, default="")
    metadata_json = Column(Text, default="{}")  # 额外元数据（JSON）
    created_at = Column(Float)
    updated_at = Column(Float)

# ── Chroma 向量层 ──
try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    _chroma_client = chromadb.Client(ChromaSettings(
        chroma_db_impl="duckdb+parquet", persist_directory="./data/chroma"
    ))
    _vector_collection = _chroma_client.get_or_create_collection("memory_vectors")
except ImportError:
    _chroma_client = None
    _vector_collection = None

class MemoryStore:
    """三层记忆存储管理器"""

    def __init__(self, db_path: str = "./data/memory.db"):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(self.engine)

    # ── 文本层 ──
    def add_text(self, scope: str, content: str, metadata: dict | None = None) -> str:
        now = time.time()
        record_id = f"mem-{int(now * 1000)}"
        with Session(self.engine) as session:
            rec = MemoryRecord(
                id=record_id, scope=scope, level="text",
                content=content, metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
                created_at=now, updated_at=now
            )
            session.add(rec)
            session.commit()
        return record_id

    def update_text(self, record_id: str, content: str, metadata: dict | None = None):
        with Session(self.engine) as session:
            rec = session.get(MemoryRecord, record_id)
            if rec:
                rec.content = content
                rec.metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
                rec.updated_at = time.time()
                session.commit()

    def delete_text(self, record_id: str):
        with Session(self.engine) as session:
            rec = session.get(MemoryRecord, record_id)
            if rec:
                session.delete(rec)
                session.commit()

    def get_texts(self, scope: str = "global", limit: int = 50) -> list[dict]:
        with Session(self.engine) as session:
            records = session.execute(
                select(MemoryRecord)
                .where(MemoryRecord.scope == scope, MemoryRecord.level == "text")
                .order_by(MemoryRecord.updated_at.desc())
                .limit(limit)
            ).scalars().all()
            return [
                {
                    "id": r.id, "scope": r.scope, "content": r.content,
                    "metadata": json.loads(r.metadata_json) if r.metadata_json else {},
                    "created_at": r.created_at, "updated_at": r.updated_at,
                    "created_str": datetime.fromtimestamp(r.created_at, tz=timezone.utc).strftime("%Y-%m-%d %H:%M"),
                    "updated_str": datetime.fromtimestamp(r.updated_at, tz=timezone.utc).strftime("%Y-%m-%d %H:%M"),
                }
                for r in records
            ]

    # ── 向量层 ──
    def add_vector(self, scope: str, content: str, embedding: list[float], metadata: dict | None = None):
        if not _vector_collection:
            return None
        record_id = f"vec-{int(time.time() * 1000)}"
        _vector_collection.add(
            ids=[record_id], embeddings=[embedding],
            documents=[content], metadatas=[{"scope": scope, **(metadata or {})}]
        )
        return record_id

    def search_vectors(self, query_embedding: list[float], scope: str = "global", top_k: int = 5) -> list[dict]:
        if not _vector_collection:
            return []
        results = _vector_collection.query(
            query_embeddings=[query_embedding], n_results=top_k,
            where={"scope": scope}
        )
        return [
            {"id": ids[0], "document": docs[0], "distance": dists[0]}
            for ids, docs, dists in zip(results["ids"], results["documents"], results["distances"])
            if ids
        ]

    # ── 图层 ──
    def add_graph_relation(self, scope: str, subject: str, predicate: str, obj: str):
        """添加三元组关系 (subject, predicate, object)"""
        record_id = f"graph-{int(time.time() * 1000)}"
        return self.add_text(scope, json.dumps({"s": subject, "p": predicate, "o": obj}, ensure_ascii=False),
                           {"level": "graph", "type": "triple"})

    def get_graph(self, scope: str = "global", limit: int = 100) -> list[dict]:
        with Session(self.engine) as session:
            records = session.execute(
                select(MemoryRecord)
                .where(MemoryRecord.scope == scope)
                .where(MemoryRecord.metadata_json.like('%"level":"graph"%'))
                .order_by(MemoryRecord.updated_at.desc())
                .limit(limit)
            ).scalars().all()
            triples = []
            for r in records:
                try:
                    data = json.loads(r.content)
                    triples.append({"s": data["s"], "p": data["p"], "o": data["o"],
                                   "created_at": r.created_at, "id": r.id})
                except json.JSONDecodeError:
                    pass
            return triples

    # ── 全局查询 ──
    def get_all(self, scope: str = "global") -> dict:
        return {
            "text": self.get_texts(scope),
            "graph": self.get_graph(scope),
        }

    def get_last_updated(self, scope: str = "global") -> str | None:
        with Session(self.engine) as session:
            rec = session.execute(
                select(MemoryRecord)
                .where(MemoryRecord.scope == scope)
                .order_by(MemoryRecord.updated_at.desc())
                .limit(1)
            ).scalars().first()
            if rec:
                return datetime.fromtimestamp(rec.updated_at, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            return None

# 全局单例
_memory_store: Optional[MemoryStore] = None
def get_memory_store() -> MemoryStore:
    global _memory_store
    if _memory_store is None:
        _memory_store = MemoryStore()
    return _memory_store
