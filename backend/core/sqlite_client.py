# -*- coding: utf-8 -*-
"""SQLite 统一数据层：业务表 + sqlite-vec 向量表
接口兼容原 pg_client（execute 返回 list[dict]），替换 PostgreSQL+Chroma。
"""
import os
import re
import sqlite3
import threading
import time

import sqlite_vec

_DB_DIR = os.environ.get("SQLITE_DIR", "./data")
_DB_PATH = os.path.join(_DB_DIR, "app.db")


class SQLiteClient:
    def __init__(self, db_path: str = _DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self.conn = None
        # 单例连接会被事件循环线程 + 线程池线程（run_in_threadpool/后台线程）并发使用，
        # sqlite3 连接非线程安全 → 偶发 IndexError/锁冲突/接口卡顿。用可重入锁串行化所有 DB 操作。
        self._lock = threading.RLock()
        self._connect()

    def _connect(self):
        # Windows 挂载卷（Docker Desktop gRPC-FUSE）上 SQLite WAL 的 -shm/-wal 共享
        # 内存文件操作不稳定（unable to open database file），故不使用 WAL，用默认
        # rollback journal；单用户场景并发足够，换取挂载卷上的读写可靠性。
        last_err = None
        for _attempt in range(5):
            try:
                conn = sqlite3.connect(self.db_path, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                conn.execute("PRAGMA busy_timeout=5000")
                conn.execute("PRAGMA foreign_keys=ON")
                self.conn = conn
                return
            except sqlite3.Error as e:
                last_err = e
                try:
                    if 'conn' in dir() and conn:
                        conn.close()
                except Exception:
                    pass
                time.sleep(1)
        raise last_err

    def execute(self, sql: str, params: tuple | list | None = None, fetch: bool = True):
        """执行 SQL，返回 list[dict]（SELECT）或空列表。
        自动将 Postgres 风格 %s 占位符转为 SQLite 的 ?，保持旧调用兼容。
        线程锁串行化（单例连接被多线程并发使用）"""
        with self._lock:
            if params is not None:
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
        """知识库向量表 + 记忆向量表；维度跟随 EMBEDDING_DIM，避免与模型输出不匹配。"""
        from core.config import config as _cfg
        _dim = int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)
        self.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS kb_vectors USING vec0("
            f"doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
            f"has_context INTEGER, content TEXT, embedding float[{_dim}])"
        )
        self.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0("
            f"scope TEXT, content TEXT, embedding float[{_dim}])"
        )
        # 会话消息向量表（上下文压缩后的历史召回：压缩不物理删除，细节可检索找回）
        self.execute(
            f"CREATE VIRTUAL TABLE IF NOT EXISTS message_vectors USING vec0("
            f"dialogue_id TEXT, role TEXT, content TEXT, embedding float[{_dim}])"
        )
        # 知识库文档标题树（上传时提取 markdown 标题层级，供项目记忆知识图谱使用）
        self.execute(
            "CREATE TABLE IF NOT EXISTS kb_tree("
            "project_id TEXT, source TEXT, tree TEXT, updated_at TEXT DEFAULT (datetime('now')), "
            "PRIMARY KEY (project_id, source))"
        )

        # 链接/内置资源内容缓存：首次上传联网抓取后存库，之后同一资源直接从内部获取（不联网）
        self.execute(
            "CREATE TABLE IF NOT EXISTS preset_docs("
            "url TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at TEXT DEFAULT (datetime('now')))"
        )
        # 内容级去重（照 DeepTutor file_hashes）：上传前按内容 sha256 查重，重复则跳过避免污染检索
        self.execute(
            "CREATE TABLE IF NOT EXISTS file_hashes("
            "project_id TEXT, sha256 TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')), "
            "PRIMARY KEY (project_id, sha256))"
        )
        # 动态服务配置（前端设置界面写入）：embedding/rerank/视觉 key 等，优先于 .env
        self.execute(
            "CREATE TABLE IF NOT EXISTS settings("
            "key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))"
        )

    def vector_table_dim(self, table: str) -> int | None:
        """读取已存在的 vec0 向量表维度；不存在或无法解析返回 None。"""
        rows = self.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not rows or not rows[0].get("sql"):
            return None
        m = re.search(r"float\[(\d+)\]", rows[0]["sql"])
        return int(m.group(1)) if m else None

    def ensure_vector_dim(self, table: str) -> int:
        """确认向量表维度与当前配置一致；不一致时抛明确错误，避免静默写 0 块。"""
        from core.config import config as _cfg
        expected = int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)
        actual = self.vector_table_dim(table)
        if actual is not None and actual != expected:
            raise RuntimeError(
                f"向量表 {table} 当前为 {actual} 维，embedding 配置为 {expected} 维；请重建向量表"
            )
        return actual if actual is not None else expected

    def get_setting(self, key: str) -> str:
        """读动态配置；未配置返回空串"""
        rows = self.execute("SELECT value FROM settings WHERE key = ?", (key,))
        return rows[0]["value"] if rows else ""

    def set_setting(self, key: str, value: str):
        """写动态配置（空值删除该键，恢复 .env 默认）"""
        if value is None or str(value).strip() == "":
            self.execute("DELETE FROM settings WHERE key = ?", (key,))
        else:
            self.execute(
                "INSERT INTO settings(key, value, updated_at) VALUES (?,?,datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
                (key, str(value)),
            )

    def get_all_settings(self) -> dict:
        rows = self.execute("SELECT key, value FROM settings")
        return {r["key"]: r["value"] for r in rows}

    def has_file_hash(self, project_id: str, sha256: str) -> bool:
        """内容级去重：该项目的 sha256 是否已入库"""
        rows = self.execute("SELECT 1 FROM file_hashes WHERE project_id = ? AND sha256 = ?", (project_id, sha256))
        return bool(rows)

    def save_file_hash(self, project_id: str, sha256: str, source: str):
        """记录已入库内容的 sha256（供后续去重）"""
        self.execute(
            "INSERT OR REPLACE INTO file_hashes(project_id, sha256, source) VALUES (?,?,?)",
            (project_id, sha256, source),
        )

    def get_preset_doc(self, url: str) -> dict | None:
        """按 url 取已缓存的内容（内部获取，不联网）"""
        rows = self.execute("SELECT url, title, content FROM preset_docs WHERE url = ?", (url,))
        return rows[0] if rows else None

    def save_preset_doc(self, url: str, title: str, content: str):
        """保存 url 抓取内容到缓存（供后续内部获取）"""
        self.execute(
            "INSERT INTO preset_docs(url, title, content, updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(url) DO UPDATE SET title=excluded.title, content=excluded.content, updated_at=datetime('now')",
            (url, title, content),
        )

    def upsert_kb_vector(self, doc_id: str, project_id: str, source: str, chunk: int,
                         session_id: str, has_context: bool, content: str, embedding: list):
        # vec0 表不支持 UPDATE，用 DELETE+INSERT 实现 upsert
        with self._lock:
            self.execute("DELETE FROM kb_vectors WHERE doc_id = ?", (doc_id,))
            self.conn.execute(
                "INSERT INTO kb_vectors(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (None, doc_id, project_id, source, chunk, session_id, int(has_context), content,
                 sqlite_vec.serialize_float32(embedding)),
            )
            self.conn.commit()

    def upsert_kb_vectors_bulk(self, items: list):
        """批量 upsert：vec0 表不支持 UPDATE，先批量 DELETE 已存在 doc_id，再批量 INSERT。
        分批（每批 500）提交：控制单事务时长（大批量从分钟级锁窗口降到秒级），
        同时规避旧版 SQLite 的 SQLITE_MAX_VARIABLE_NUMBER（999）上限。
        items: [(doc_id, project_id, source, chunk, session_id, has_context, content, embedding)]"""
        if not items:
            return
        import sqlite_vec as _sv
        _BATCH = 500
        with self._lock:
            for start in range(0, len(items), _BATCH):
                batch = items[start:start + _BATCH]
                ids = [it[0] for it in batch]
                ph = ",".join("?" * len(ids))
                self.conn.execute(f"DELETE FROM kb_vectors WHERE doc_id IN ({ph})", ids)
                self.conn.executemany(
                    "INSERT INTO kb_vectors(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [(None, it[0], it[1], it[2], it[3], it[4], int(it[5]), it[6], _sv.serialize_float32(it[7])) for it in batch],
                )
                self.conn.commit()

    def upsert_kb_tree(self, project_id: str, source: str, tree: list):
        """保存文档标题树（json）"""
        import json as _json
        self.execute(
            "INSERT INTO kb_tree(project_id, source, tree, updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(project_id, source) DO UPDATE SET tree=excluded.tree, updated_at=datetime('now')",
            (project_id, source, _json.dumps(tree, ensure_ascii=False)),
        )

    def insert_message_vector(self, dialogue_id: str, role: str, content: str, embedding: list):
        """会话消息向量（上下文压缩的历史召回）"""
        import sqlite_vec as _sv
        with self._lock:
            self.conn.execute(
                "INSERT INTO message_vectors(rowid, dialogue_id, role, content, embedding) VALUES (?,?,?,?,?)",
                (None, dialogue_id, role, content, _sv.serialize_float32(embedding)),
            )
            self.conn.commit()

    def search_message_vectors(self, dialogue_id: str, vec: list, k: int = 3) -> list:
        """按对话检索历史消息向量（余弦距离排序）"""
        import sqlite_vec as _sv
        with self._lock:
            rows = self.conn.execute(
                "SELECT role, content, vec_distance_cosine(embedding, ?) AS d FROM message_vectors "
                "WHERE dialogue_id=? ORDER BY d LIMIT ?",
                (_sv.serialize_float32(vec), dialogue_id, k),
            ).fetchall()
        return [{"role": r[0], "content": r[1], "distance": r[2]} for r in rows]

    def get_kb_tree(self, project_id: str, source: str) -> list:
        """读取文档标题树（无则空列表）"""
        import json as _json
        rows = self.execute("SELECT tree FROM kb_tree WHERE project_id=? AND source=?", (project_id, source))
        if not rows or not rows[0].get("tree"):
            return []
        try:
            t = _json.loads(rows[0]["tree"])
            return t if isinstance(t, list) else []
        except Exception:
            return []

    def delete_kb_tree_by_source(self, project_id: str, source: str) -> int:
        """删除某来源文档的标题树"""
        return self.execute("DELETE FROM kb_tree WHERE project_id=? AND source=?", (project_id, source))

    def search_kb_vectors(self, project_id: str, query_embedding: list, k: int = 12) -> list[dict]:
        with self._lock:
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
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        # 兼容旧表：补充新增列（已存在则忽略）
        for _col, _ddl in [
            ("type", "TEXT DEFAULT 'text'"),
            ("file_ext", "TEXT DEFAULT ''"),
            ("file_size", "INTEGER DEFAULT 0"),
            ("file_path", "TEXT DEFAULT ''"),
        ]:
            try:
                self.execute("ALTER TABLE resources ADD COLUMN " + _col + " " + _ddl)
            except Exception:
                pass
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
            except Exception:
                pass
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
        except Exception:
            pass
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


if __name__ == "__main__":
    db = get_db()
    print("tables:", [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")])
