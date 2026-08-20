# -*- coding: utf-8 -*-
"""知识库域 repo（向量表 / 标题树 / 去重 / 缓存）。"""
from core.db.base import get_db


class KbRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def create_vector_tables(self):
        self._db.create_vector_tables()

    def vector_table_dim(self, table):
        return self._db.vector_table_dim(table)

    def ensure_vector_dim(self, table, expected=None):
        return self._db.ensure_vector_dim(table, expected)

    def has_file_hash(self, project_id, sha256):
        return self._db.has_file_hash(project_id, sha256)

    def save_file_hash(self, project_id, sha256, source):
        self._db.save_file_hash(project_id, sha256, source)

    def get_preset_doc(self, url):
        return self._db.get_preset_doc(url)

    def save_preset_doc(self, url, title, content):
        self._db.save_preset_doc(url, title, content)

    def upsert_kb_vector(self, *args, **kwargs):
        self._db.upsert_kb_vector(*args, **kwargs)

    def upsert_kb_vectors_bulk(self, items):
        self._db.upsert_kb_vectors_bulk(items)

    def upsert_image_vectors_bulk(self, items):
        self._db.upsert_image_vectors_bulk(items)

    def search_image_vectors(self, *args, **kwargs):
        return self._db.search_image_vectors(*args, **kwargs)

    def get_image_docs(self, project_id):
        return self._db.get_image_docs(project_id)

    def delete_image_by_source(self, project_id, source):
        return self._db.delete_image_by_source(project_id, source)

    def delete_image_project(self, project_id):
        return self._db.delete_image_project(project_id)

    def upsert_kb_tree(self, project_id, source, tree):
        self._db.upsert_kb_tree(project_id, source, tree)

    def get_kb_tree(self, project_id, source):
        return self._db.get_kb_tree(project_id, source)

    def get_all_kb_trees(self, project_id):
        """返回项目全部文档标题树 [{source, tree}]"""
        import json as _json
        rows = self._db.execute("SELECT source, tree FROM kb_tree WHERE project_id=?", (project_id,))
        out = []
        for r in rows or []:
            if not r.get("tree"):
                continue
            try:
                t = _json.loads(r["tree"])
            except Exception:
                continue
            if isinstance(t, list):
                out.append({"source": r.get("source"), "tree": t})
        return out

    def delete_kb_tree_by_source(self, project_id, source):
        return self._db.delete_kb_tree_by_source(project_id, source)

    def find_chunk_index(self, project_id, source, probe):
        """在 kb_vectors 找 content 含 probe 的最小 chunk 序号（节点正文起始块定位）。"""
        if not probe:
            return None
        rows = self._db.execute(
            "SELECT MIN(chunk) c FROM kb_vectors WHERE project_id=? AND source=? AND content LIKE ?",
            (project_id, source, "%" + probe + "%"),
        )
        return rows[0]["c"] if rows and rows[0]["c"] is not None else None

    def get_kb_chunk(self, project_id, source, chunk):
        """按 source+chunk 序号取单块原文（旧数据兜底用）。"""
        rows = self._db.execute(
            "SELECT content FROM kb_vectors WHERE project_id=? AND source=? AND chunk=?",
            (project_id, source, chunk),
        )
        return rows[0]["content"] if rows else ""

    def get_kb_chunks(self, project_id, source):
        """按 source 取全部向量块（chunk 序），供阅读器全文重组。"""
        return self._db.execute(
            "SELECT chunk, content FROM kb_vectors WHERE project_id=? AND source=? ORDER BY chunk",
            (project_id, source),
        )

    def search_kb_vectors(self, *args, **kwargs):
        return self._db.search_kb_vectors(*args, **kwargs)

    def get_kb_docs(self, project_id):
        return self._db.get_kb_docs(project_id)

    def get_resources(self, project_id):
        """resources 表：取项目全部已上传资源（name + content 长度）"""
        return self._db.execute(
            "SELECT name, length(content) as content_len FROM resources WHERE project_id = ?",
            (project_id,),
        )

    def get_resource_content(self, project_id, source):
        """resources 表：按 name 取该资源原文（未向量化文档的兜底全文来源）"""
        rows = self._db.execute(
            "SELECT content FROM resources WHERE project_id=? AND name=?",
            (project_id, source),
        )
        return rows[0]["content"] if rows else ""

    def count_kb_by_source(self, project_id, source):
        """按 source 统计向量块数（幽灵 hash 自愈判定用）"""
        rows = self._db.execute(
            "SELECT COUNT(*) c FROM kb_vectors WHERE project_id=? AND source=?",
            (project_id, source),
        )
        return rows[0]["c"] if rows else 0

    def get_file_hash_source(self, project_id, sha256):
        """取去重表里该 hash 对应的 source（判断向量是否被删过）"""
        rows = self._db.execute(
            "SELECT source FROM file_hashes WHERE project_id=? AND sha256=?",
            (project_id, sha256),
        )
        return rows[0]["source"] if rows else ""

    def list_project_ids(self):
        rows = self._db.execute("SELECT DISTINCT project_id FROM kb_vectors")
        return [r["project_id"] for r in rows]

    def delete_kb_by_source(self, project_id, source):
        return self._db.delete_kb_by_source(project_id, source)

    def delete_kb_project(self, project_id):
        return self._db.delete_kb_project(project_id)


_kb_repo = None


def get_kb_repo() -> KbRepo:
    global _kb_repo
    if _kb_repo is None:
        _kb_repo = KbRepo()
    return _kb_repo
