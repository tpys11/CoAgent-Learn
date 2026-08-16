# -*- coding: utf-8 -*-
"""项目/对话/资源域 repo。当前业务表仍走 base.execute，后续逐轮迁移。"""
from core.db.base import get_db


class ProjectRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def execute(self, sql, params=None, fetch=True):
        return self._db.execute(sql, params, fetch)

    def init_tables(self):
        self._db.init_tables()


_project_repo = None


def get_project_repo() -> ProjectRepo:
    global _project_repo
    if _project_repo is None:
        _project_repo = ProjectRepo()
    return _project_repo
