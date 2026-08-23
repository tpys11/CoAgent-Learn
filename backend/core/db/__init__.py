# -*- coding: utf-8 -*-
"""数据访问层：base（SQLiteClient）+ 已迁移的领域 repo（settings / kb）。
memory / project 域尚未迁移，业务代码直接走 get_db().execute()。"""
from core.db.base import SQLiteClient, get_db
from core.db.settings_repo import SettingsRepo, get_settings_repo
from core.db.kb_repo import KbRepo, get_kb_repo

__all__ = [
    "SQLiteClient",
    "get_db",
    "SettingsRepo",
    "get_settings_repo",
    "KbRepo",
    "get_kb_repo",
]
