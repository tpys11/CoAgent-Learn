# -*- coding: utf-8 -*-
"""兼容层：数据访问层已迁到 core/db/base.py。
保留本文件，使 `from core.sqlite_client import get_db` 等旧 import 继续生效。"""
from core.db.base import SQLiteClient, get_db

__all__ = ["SQLiteClient", "get_db"]
