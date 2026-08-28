# -*- coding: utf-8 -*-
"""SQLiteClient 业务表 mixin：init_tables（原 Postgres 12 张表 + 幂等列迁移 + 索引）。
B2 拆分（2026-08-27）：方法自 base.py 逐字迁入。"""
import sqlite3


class BusinessTablesMixin:
    """业务表 DDL。"""

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
        except sqlite3.OperationalError:
            pass  # 幂等迁移：列已存在
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
            CREATE TABLE IF NOT EXISTS focus_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL DEFAULT 'default',
                dialogue_id TEXT DEFAULT '',
                duration_seconds INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT DEFAULT '',
                project_id TEXT NOT NULL DEFAULT 'default',
                type TEXT DEFAULT 'text',
                file_ext TEXT DEFAULT '',
                file_size INTEGER DEFAULT 0,
                file_path TEXT DEFAULT '',
                difficulty REAL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        # 兼容旧表：补充新增列（已存在则忽略）
        for _col, _ddl in [
            ("type", "TEXT DEFAULT 'text'"),
            ("file_ext", "TEXT DEFAULT ''"),
            ("file_size", "INTEGER DEFAULT 0"),
            ("file_path", "TEXT DEFAULT ''"),
            ("difficulty", "REAL"),
        ]:
            try:
                self.execute("ALTER TABLE resources ADD COLUMN " + _col + " " + _ddl)
            except sqlite3.OperationalError:
                pass  # 幂等迁移：列已存在
        self.execute("""
            CREATE TABLE IF NOT EXISTS dialogues (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL DEFAULT 'default',
                session_id TEXT NOT NULL DEFAULT 'default',
                name TEXT NOT NULL DEFAULT '新对话',
                created_at TEXT DEFAULT (datetime('now')),
                archived INTEGER DEFAULT 0,
                summary TEXT DEFAULT '',
                compressed_upto INTEGER DEFAULT 0
            )
        """)
        # 兼容旧库：会话压缩字段
        for _col, _ddl in [("summary", "TEXT DEFAULT ''"), ("compressed_upto", "INTEGER DEFAULT 0")]:
            try:
                self.execute("ALTER TABLE dialogues ADD COLUMN " + _col + " " + _ddl)
            except sqlite3.OperationalError:
                pass  # 幂等迁移：列已存在
        # 兼容旧库：对话级学情画像缓存（合成后注入，未完成禁发）
        for _col, _ddl in [("profile", "TEXT DEFAULT ''"), ("profile_status", "TEXT DEFAULT 'ready'")]:
            try:
                self.execute("ALTER TABLE dialogues ADD COLUMN " + _col + " " + _ddl)
            except sqlite3.OperationalError:
                pass  # 幂等迁移：列已存在
        # 闭环六：会话种类标记（''=主对话 / 'resource'=资源编辑会话——不进列表不进学情管线）
        try:
            self.execute("ALTER TABLE dialogues ADD COLUMN kind TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # 幂等迁移：列已存在
        self.execute("CREATE INDEX IF NOT EXISTS idx_dialogues_project ON dialogues (project_id, created_at)")
        self.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dialogue_id TEXT NOT NULL REFERENCES dialogues(id),
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                think TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        try:
            # 兼容旧库：思维链列（{agent, content}[] 的 JSON）
            self.execute("ALTER TABLE messages ADD COLUMN think TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # 幂等迁移：列已存在
        self.execute("CREATE INDEX IF NOT EXISTS idx_messages_dialogue ON messages (dialogue_id, created_at)")
        # 资源列表按项目查询的主索引：缺它时全表 SCAN 会路过巨型 content 溢出页
        # （实测单行 4MB 测试残留拖慢每次 /api/resources 200-780ms，2026-08-26 性能回归）
        self.execute("CREATE INDEX IF NOT EXISTS idx_resources_project ON resources (project_id, created_at)")
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
