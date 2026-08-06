# -*- coding: utf-8 -*-
"""兼容层：postgres_client 更名为 sqlite_client 数据层
保留 pg_client 名称与 execute 接口，业务代码无需改动。
PostgreSQL → SQLite(sqlite-vec)，Chroma 向量 → SQLite 向量表。
"""
from core.sqlite_client import get_db

# 单例：所有 from core.postgres_client import pg_client 的调用继续生效
pg_client = get_db()

__all__ = ["pg_client"]
