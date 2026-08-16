# -*- coding: utf-8 -*-
"""数据访问层：base（SQLiteClient）+ 各领域 repo。
当前仅搭骨架，调用方仍走 get_db()/execute()；后续逐轮迁移到具体 repo。"""
from core.db.base import SQLiteClient, get_db
from core.db.settings_repo import SettingsRepo, get_settings_repo
from core.db.kb_repo import KbRepo, get_kb_repo
from core.db.memory_repo import MemoryRepo, get_memory_repo
from core.db.project_repo import ProjectRepo, get_project_repo

__all__ = [
    "SQLiteClient",
    "get_db",
    "SettingsRepo",
    "get_settings_repo",
    "KbRepo",
    "get_kb_repo",
    "MemoryRepo",
    "get_memory_repo",
    "ProjectRepo",
    "get_project_repo",
]
