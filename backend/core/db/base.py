# -*- coding: utf-8 -*-
"""SQLite 统一数据层：业务表 + sqlite-vec 向量表
接口兼容原 pg_client（execute 返回 list[dict]），替换 PostgreSQL+Chroma。

B2 拆分（2026-08-27）：方法体按职责迁入四个 mixin 模块
（_sqlite_core 连接与执行 / _vector_index 向量索引与版本化 / _kb_ops 知识库域 /
_business_tables 业务表 DDL），本文件保留类身份组装与 get_db 单例——
对外导入路径（core.db.base 的 get_db / DATA_DIR / _DB_DIR / SQLiteClient）
与测试补丁面（get_db._instance / 直构 SQLiteClient）完全不变。
"""
from core.db._business_tables import BusinessTablesMixin
from core.db._kb_ops import KbOpsMixin
from core.db._sqlite_core import DATA_DIR, CoreMixin, _DB_DIR, _DB_PATH
from core.db._vector_index import VectorIndexMixin

__all__ = ["SQLiteClient", "get_db", "DATA_DIR", "_DB_DIR", "_DB_PATH"]


class SQLiteClient(CoreMixin, VectorIndexMixin, KbOpsMixin, BusinessTablesMixin):
    """组装类：对外身份与拆分前完全一致（仅组合，零新增逻辑）。"""


def get_db() -> SQLiteClient:
    """单例"""
    if not hasattr(get_db, "_instance"):
        get_db._instance = SQLiteClient()
        get_db._instance.init_tables()
    return get_db._instance


if __name__ == "__main__":
    db = get_db()
    print("tables:", [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")])
