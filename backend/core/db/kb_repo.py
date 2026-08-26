# -*- coding: utf-8 -*-
"""知识库域 repo（向量表 / 标题树 / 去重 / 缓存）。"""
from core.db.base import get_db


class KbRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def create_vector_tables(self):
        self._db.create_vector_tables()

    def embedding_signature(self) -> str:
        return self._db.embedding_signature()

    def list_text_version_tables(self) -> list:
        return self._db.list_text_version_tables()

    def peek_active_text_table(self) -> str:
        return self._db.peek_active_text_table()

    def resolve_active_text_table(self) -> str:
        return self._db.resolve_active_text_table()

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

    def upsert_kb_vectors_bulk(self, items, table="kb_vectors"):
        self._db.upsert_kb_vectors_bulk(items, table=table)

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
            except _json.JSONDecodeError:
                continue
            if isinstance(t, list):
                out.append({"source": r.get("source"), "tree": t})
        return out

    def delete_kb_tree_by_source(self, project_id, source):
        return self._db.delete_kb_tree_by_source(project_id, source)

    def _text_tables_for_read(self, tables=None) -> list:
        """读取类方法的候选表序列：显式指定 > 全部版本（最新在前）。
        老文档可能停留在旧版本表里，读取时逐版本回退保证仍可读。"""
        if tables:
            return [self._db._safe_table(t) for t in tables]
        return self._db.list_text_version_tables()

    def find_chunk_index(self, project_id, source, probe):
        """在文本向量各版本中找 content 含 probe 的最小 chunk 序号（节点正文起始块定位）。
        活跃版本优先，未命中自动回退旧版本（老文档不重灌也能定位）。"""
        if not probe:
            return None
        for table in self._text_tables_for_read():
            rows = self._db.execute(
                f"SELECT MIN(chunk) c FROM {table} WHERE project_id=? AND source=? AND content LIKE ?",
                (project_id, source, "%" + probe + "%"),
            )
            if rows and rows[0]["c"] is not None:
                return rows[0]["c"]
        return None

    def get_kb_chunk(self, project_id, source, chunk):
        """按 source+chunk 序号取单块原文：活跃版本优先，跨版本回退。"""
        for table in self._text_tables_for_read():
            rows = self._db.execute(
                f"SELECT content FROM {table} WHERE project_id=? AND source=? AND chunk=?",
                (project_id, source, chunk),
            )
            if rows:
                return rows[0]["content"]
        return ""

    def get_kb_chunks(self, project_id, source):
        """按 source 取全部向量块（chunk 序），供阅读器全文重组：含该来源的版本优先。"""
        for table in self._text_tables_for_read():
            rows = self._db.execute(
                f"SELECT chunk, content FROM {table} WHERE project_id=? AND source=? ORDER BY chunk",
                (project_id, source),
            )
            if rows:
                return rows
        return []

    def search_kb_vectors(self, *args, **kwargs):
        return self._db.search_kb_vectors(*args, **kwargs)

    def get_kb_docs(self, project_id, table="kb_vectors"):
        return self._db.get_kb_docs(project_id, table=table)

    def get_resources(self, project_id):
        """resources 表：取项目全部已上传资源（name + type + content 长度）"""
        return self._db.execute(
            "SELECT name, type, length(content) as content_len FROM resources WHERE project_id = ?",
            (project_id,),
        )

    def get_resource_content(self, project_id, source):
        """resources 表：按 name 取该资源原文（未向量化文档的兜底全文来源）"""
        rows = self._db.execute(
            "SELECT content FROM resources WHERE project_id=? AND name=?",
            (project_id, source),
        )
        return rows[0]["content"] if rows else ""

    def count_kb_by_source(self, project_id, source, table=None):
        """按 source 统计向量块数（幽灵 hash 自愈判定用）。
        默认只查活跃版本——切版后旧代际计数归零，现有自愈逻辑自动允许内容重灌进新版本。"""
        table = self._db.peek_active_text_table() if not table else self._db._safe_table(table)
        rows = self._db.execute(
            f"SELECT COUNT(*) c FROM {table} WHERE project_id=? AND source=?",
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
        """全部文本向量版本的并集去重（旧版本里的项目也算存在）"""
        ids: dict = {}
        for table in self._text_tables_for_read():
            for r in self._db.execute(f"SELECT DISTINCT project_id FROM {table}"):
                ids[r["project_id"]] = True
        return list(ids)

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
