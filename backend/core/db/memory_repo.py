# -*- coding: utf-8 -*-
"""记忆/会话向量域 repo。记忆、统计等业务表当前仍走 base.execute，后续逐轮迁移。"""
from core.db.base import get_db


class MemoryRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def insert_message_vector(self, dialogue_id, role, content, embedding):
        self._db.insert_message_vector(dialogue_id, role, content, embedding)

    def search_message_vectors(self, dialogue_id, vec, k=3):
        return self._db.search_message_vectors(dialogue_id, vec, k)

    def execute(self, sql, params=None, fetch=True):
        return self._db.execute(sql, params, fetch)


_memory_repo = None


def get_memory_repo() -> MemoryRepo:
    global _memory_repo
    if _memory_repo is None:
        _memory_repo = MemoryRepo()
    return _memory_repo
