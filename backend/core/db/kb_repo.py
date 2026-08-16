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

    def delete_kb_tree_by_source(self, project_id, source):
        return self._db.delete_kb_tree_by_source(project_id, source)

    def search_kb_vectors(self, *args, **kwargs):
        return self._db.search_kb_vectors(*args, **kwargs)

    def get_kb_docs(self, project_id):
        return self._db.get_kb_docs(project_id)

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
