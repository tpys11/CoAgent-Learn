# -*- coding: utf-8 -*-
"""SQLite 统一数据层：业务表 + sqlite-vec 向量表
接口兼容原 pg_client（execute 返回 list[dict]），替换 PostgreSQL+Chroma。
"""
import json
import os
import sqlite3
import time

import sqlite_vec

_DB_DIR = os.environ.get("SQLITE_DIR", "./data")
_DB_PATH = os.path.join(_DB_DIR, "app.db")


class SQLiteClient:
    def __init__(self, db_path: str = _DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self.conn = None
        self._connect()

    def _connect(self):
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.enable_load_extension(True)
        sqlite_vec.load(self.conn)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def execute(self, sql: str, params: tuple | list | None = None, fetch: bool = True):
        """执行 SQL，返回 list[dict]（SELECT）或空列表。
        自动将 Postgres 风格 %s 占位符转为 SQLite 的 ?，保持旧调用兼容。
        """
        if params:
            sql = sql.replace("%s", "?")
        try:
            cur = self.conn.execute(sql, params or ())
            if sql.strip().upper().startswith(("SELECT", "PRAGMA")):
                rows = cur.fetchall()
                return [dict(r) for r in rows]
            self.conn.commit()
            return []
        except sqlite3.Error:
            # 连接可能失效，重连一次再试
            try:
                self._connect()
                cur = self.conn.execute(sql, params or ())
                if sql.strip().upper().startswith(("SELECT", "PRAGMA")):
                    rows = cur.fetchall()
                    return [dict(r) for r in rows]
                self.conn.commit()
                return []
            except Exception:
                raise

    # ── 向量操作（sqlite-vec）──

    def create_vector_tables(self):
        """知识库向量表 + 记忆向量表（float[1024]，bge-small-zh 输出 512 维亦可存）"""
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS kb_vectors USING vec0("
            "doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
            "has_context INTEGER, content TEXT, embedding float[512])"
        )
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0("
            "scope TEXT, content TEXT, embedding float[512])"
        )

    def upsert_kb_vector(self, doc_id: str, project_id: str, source: str, chunk: int,
                         session_id: str, has_context: bool, content: str, embedding: list):
        # vec0 表不支持 UPDATE，用 DELETE+INSERT 实现 upsert
        self.execute("DELETE FROM kb_vectors WHERE doc_id = ?", (doc_id,))
        self.conn.execute(
            "INSERT INTO kb_vectors(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (None, doc_id, project_id, source, chunk, session_id, int(has_context), content,
             sqlite_vec.serialize_float32(embedding)),
        )
        self.conn.commit()

    def search_kb_vectors(self, project_id: str, query_embedding: list, k: int = 12) -> list[dict]:
        rows = self.conn.execute(
            "SELECT rowid, distance, doc_id, source, chunk, session_id, has_context, content "
            "FROM kb_vectors WHERE project_id = ? AND embedding MATCH ? AND k = ? "
            "ORDER BY distance",
            (project_id, sqlite_vec.serialize_float32(query_embedding), k),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_kb_docs(self, project_id: str) -> list[dict]:
        """取项目全部向量块（doc_id, source, chunk, content），供 BM25 与列表展示"""
        return self.execute(
            "SELECT rowid, doc_id, source, chunk, session_id, has_context, content "
            "FROM kb_vectors WHERE project_id = ? ORDER BY chunk",
            (project_id,),
        )

    def delete_kb_by_source(self, project_id: str, source: str) -> int:
        rows = self.execute(
            "SELECT rowid FROM kb_vectors WHERE project_id = ? AND source = ?",
            (project_id, source),
        )
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM kb_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    def delete_kb_project(self, project_id: str) -> int:
        rows = self.execute("SELECT rowid FROM kb_vectors WHERE project_id = ?", (project_id,))
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM kb_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    # ── 业务表 ──

    def init_tables(self):
        """建表：兼容原 Postgres 12 张表（SQLite 语法）"""
        self.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '新项目',
                is_default INTEGER DEFAULT 0,
                simple INTEGER DEFAULT 0,
                domain TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                archived INTEGER DEFAULT 0
            )
        """)
        try:
            self.execute("ALTER TABLE projects ADD COLUMN simple INTEGER DEFAULT 0")
        except Exception:
            pass
        self.execute("""
            CREATE TABLE IF NOT EXISTS dialogue_memories (
                dialogue_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL DEFAULT 'default',
                profile_data TEXT DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dialogue_id TEXT NOT NULL DEFAULT '',
                project_id TEXT NOT NULL DEFAULT 'default',
                resource_type TEXT DEFAULT '',
                feedback TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL DEFAULT 'default',
                tokens INTEGER DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                metrics TEXT DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS task_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL DEFAULT 'default',
                dialogue_id TEXT DEFAULT 'default',
                data TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT DEFAULT '',
                project_id TEXT NOT NULL DEFAULT 'default',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS dialogues (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL DEFAULT 'default',
                session_id TEXT NOT NULL DEFAULT 'default',
                name TEXT NOT NULL DEFAULT '新对话',
                created_at TEXT DEFAULT (datetime('now')),
                archived INTEGER DEFAULT 0
            )
        """)
        self.execute("CREATE INDEX IF NOT EXISTS idx_dialogues_project ON dialogues (project_id, created_at)")
        self.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dialogue_id TEXT NOT NULL REFERENCES dialogues(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("CREATE INDEX IF NOT EXISTS idx_messages_dialogue ON messages (dialogue_id, created_at)")
        self.execute("""
            CREATE TABLE IF NOT EXISTS global_profile (
                id INTEGER PRIMARY KEY DEFAULT 1,
                session_id TEXT NOT NULL DEFAULT 'default',
                data TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS project_memories (
                project_id TEXT NOT NULL,
                session_id TEXT NOT NULL DEFAULT 'default',
                data TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (project_id, session_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT UNIQUE NOT NULL DEFAULT 'default',
                profile_data TEXT DEFAULT '{}',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                project_id TEXT NOT NULL DEFAULT 'default',
                type TEXT DEFAULT '',
                properties TEXT DEFAULT '{}'
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS followups (
                dialogue_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL DEFAULT 'default',
                questions TEXT DEFAULT '[]',
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS relations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL DEFAULT 'default',
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                relation TEXT DEFAULT '',
                properties TEXT DEFAULT '{}'
            )
        """)
        self.create_vector_tables()


def get_db() -> SQLiteClient:
    """单例"""
    if not hasattr(get_db, "_instance"):
        get_db._instance = SQLiteClient()
        get_db._instance.init_tables()
    return get_db._instance


# 兼容旧引用名
db_client = get_db()


if __name__ == "__main__":
    db = get_db()
    print("tables:", [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")])
