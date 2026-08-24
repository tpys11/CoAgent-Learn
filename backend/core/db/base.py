# -*- coding: utf-8 -*-
"""SQLite 统一数据层：业务表 + sqlite-vec 向量表
接口兼容原 pg_client（execute 返回 list[dict]），替换 PostgreSQL+Chroma。
"""
import hashlib
import os
import re
import sqlite3
import threading
import time

import sqlite_vec

# 数据目录默认锚定仓库根 data/（与进程 CWD 无关）——历史教训：相对 ./data 曾因启动目录不同
# 分裂出三个 app.db（根data / backend/data / docker命名卷）。环境变量 SQLITE_DIR 仍可覆盖。
_DEFAULT_DB_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data"))
_DB_DIR = os.path.normpath(os.environ.get("SQLITE_DIR") or _DEFAULT_DB_DIR)
_DB_PATH = os.path.join(_DB_DIR, "app.db")
DATA_DIR = _DB_DIR  # 上传目录等同源派生（main.py 静态挂载 / knowledge.py 图片落盘）


class SQLiteClient:
    def __init__(self, db_path: str = _DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        # 每操作短命连接 + 单锁串行（对齐 DeepTutor）：不再持有常驻共享连接，
        # 避免被事件循环线程 + 线程池线程 + 后台线程并发使用时偶发锁冲突/连接失效。
        self._lock = threading.RLock()

    def _new_conn(self):
        """新建一个短命连接（每次操作独立连接，用完即关）。
        数据在 named volume（Linux 原生 fs）上，WAL 稳定：写事务不再阻塞读。"""
        last_err = None
        for _attempt in range(5):
            try:
                conn = sqlite3.connect(self.db_path, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                conn.execute("PRAGMA busy_timeout=5000")
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA foreign_keys=ON")
                return conn
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
        每次操作新建短命连接，单锁串行化多线程并发。"""
        with self._lock:
            if params is not None:
                sql = sql.replace("%s", "?")
            for attempt in range(2):
                conn = None
                try:
                    conn = self._new_conn()
                    cur = conn.execute(sql, params or ())
                    if sql.strip().upper().startswith(("SELECT", "PRAGMA")):
                        rows = cur.fetchall()
                        return [dict(r) for r in rows]
                    conn.commit()
                    return []
                except sqlite3.Error:
                    if attempt == 0:
                        time.sleep(0.1)
                        continue
                    raise
                finally:
                    if conn:
                        try:
                            conn.close()
                        except Exception:
                            pass

    # ── 向量操作（sqlite-vec）──

    def create_vector_tables(self):
        """知识库向量表 + 图片跨模态向量表；维度统一 1024（Qwen3-VL-Embedding-8B MRL 实测输出）。
        2026-08-21：移除 memory_vectors/message_vectors 死表——对话记忆以文本形式承载
        （dialogues.summary + compressed_upto 游标），不再做向量存储/召回。"""
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS kb_vectors USING vec0("
            "doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
            "has_context INTEGER, content TEXT, embedding float[1024])"
        )
        # 图片跨模态向量表：与文字共用 Qwen3-VL-Embedding-8B@1024（文本/图片同空间）
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS image_vectors USING vec0("
            "doc_id TEXT, project_id TEXT, source TEXT, content TEXT, file_path TEXT,"
            "mime TEXT, embedding float[1024])"
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
        # 索引版本注册表（照 DeepTutor version-N 思想）：embedding 签名（模型@维度）变化时
        # 新建物理表并切换，旧表保留只读——切模型不再需要清库重灌。append-only，活跃版本=最新一行。
        self.execute(
            "CREATE TABLE IF NOT EXISTS kb_index_versions("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "kind TEXT NOT NULL DEFAULT 'text', "
            "signature TEXT NOT NULL, "
            "dim INTEGER NOT NULL DEFAULT 1024, "
            "table_name TEXT NOT NULL, "
            "created_at TEXT DEFAULT (datetime('now')))"
        )

    def vector_table_dim(self, table: str) -> int | None:
        """读取已存在的 vec0 向量表维度；不存在或无法解析返回 None。"""
        rows = self.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not rows or not rows[0].get("sql"):
            return None
        m = re.search(r"float\[(\d+)\]", rows[0]["sql"])
        return int(m.group(1)) if m else None

    def ensure_vector_dim(self, table: str, expected: int | None = None) -> int:
        """确认向量表维度与当前配置一致；不一致时抛明确错误，避免静默写 0 块。
        expected 为空时按 EMBEDDING_DIM；图片表传入 VL_EMBEDDING_DIM。"""
        from core.config import config as _cfg
        if expected is None:
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

    # ── 索引版本化（照 DeepTutor version-N：签名变更开新表，旧表保留只读回退）──

    _TABLE_RE = re.compile(r"^[A-Za-z0-9_]+$")

    @staticmethod
    def _safe_table(table: str) -> str:
        """物理表名白名单校验（表名进 f-string SQL 前必须过这道闸）"""
        if not table or not SQLiteClient._TABLE_RE.match(table):
            raise ValueError(f"非法向量表名: {table!r}")
        return table

    def embedding_signature(self) -> str:
        """当前 embedding 配置签名：模型名@维度。签名一致才视为同一索引代际——
        同维度换模型（如 Qwen3-VL↔bge-m3 都是 1024 维）向量空间不同，必须开新版本。"""
        from core.config import config as _cfg
        model = getattr(_cfg, "EMBEDDING_MODEL", "") or "unknown"
        dim = int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)
        return f"{model}@{dim}"

    def _emb_dim(self) -> int:
        from core.config import config as _cfg
        return int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)

    def list_text_version_tables(self) -> list[str]:
        """全部文本向量版本物理表，最新在前；无注册记录时兜底返回旧主表"""
        rows = self.execute(
            "SELECT table_name FROM kb_index_versions WHERE kind='text' ORDER BY id DESC")
        tables = [r["table_name"] for r in rows]
        return tables or ["kb_vectors"]

    def peek_active_text_table(self) -> str:
        """读路径的签名感知解析（只读语义：绝不建表/切版）：
        - 当前签名有历史版本 → 返回该版本（配置回滚场景：旧代际内容立即可检索）
        - 无历史版本（全新签名的首次写之前）→ 返回最新表（检索空结果而非报错）
        - 无任何注册记录 → 旧主表"""
        sig = self.embedding_signature()
        rows = self.execute(
            "SELECT signature, table_name FROM kb_index_versions WHERE kind='text' ORDER BY id DESC")
        if not rows:
            return "kb_vectors"
        for r in rows:
            if r["signature"] == sig:
                return r["table_name"]
        return rows[0]["table_name"]

    def resolve_active_text_table(self) -> str:
        """写路径入口：返回与当前 embedding 签名一致的活跃表。
        - 无注册记录 → 既有 kb_vectors 注册为第 1 版（按当前签名登记）
        - 活跃版本签名一致 → 直接复用
        - 签名变化 → 复用历史同名签名的表（配置回滚场景），否则新建 kb_vectors_<hash8> 并切换"""
        with self._lock:
            sig = self.embedding_signature()
            dim = self._emb_dim()
            last = self.execute(
                "SELECT signature, table_name FROM kb_index_versions WHERE kind='text' "
                "ORDER BY id DESC LIMIT 1")
            if last:
                if last[0]["signature"] == sig:
                    return last[0]["table_name"]
                hist = self.execute(
                    "SELECT table_name FROM kb_index_versions WHERE kind='text' AND signature=? "
                    "ORDER BY id DESC LIMIT 1", (sig,))
                if hist:
                    table = hist[0]["table_name"]
                else:
                    table = f"kb_vectors_{hashlib.md5(sig.encode('utf-8')).hexdigest()[:8]}"
                    self._safe_table(table)
                    self.execute(
                        f"CREATE VIRTUAL TABLE IF NOT EXISTS {table} USING vec0("
                        "doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
                        f"has_context INTEGER, content TEXT, embedding float[{dim}])")
                self.execute(
                    "INSERT INTO kb_index_versions(kind, signature, dim, table_name) "
                    "VALUES ('text', ?, ?, ?)", (sig, dim, table))
                return table
            # 首次注册：既有 kb_vectors 成为第 1 版
            actual = self.vector_table_dim("kb_vectors") or dim
            self.execute(
                "INSERT INTO kb_index_versions(kind, signature, dim, table_name) "
                "VALUES ('text', ?, ?, 'kb_vectors')", (sig, actual))
            return "kb_vectors"

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
                         session_id: str, has_context: bool, content: str, embedding: list,
                         table: str = "kb_vectors"):
        # vec0 表不支持 UPDATE，用 DELETE+INSERT 实现 upsert
        self._safe_table(table)
        with self._lock:
            conn = self._new_conn()
            try:
                conn.execute(f"DELETE FROM {table} WHERE doc_id = ?", (doc_id,))
                conn.execute(
                    f"INSERT INTO {table}(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (None, doc_id, project_id, source, chunk, session_id, int(has_context), content,
                     sqlite_vec.serialize_float32(embedding)),
                )
                conn.commit()
            finally:
                conn.close()

    def upsert_kb_vectors_bulk(self, items: list, table: str = "kb_vectors"):
        """批量 upsert：vec0 表不支持 UPDATE，先批量 DELETE 已存在 doc_id，再批量 INSERT。
        分批（每批 500）提交：控制单事务时长（大批量从分钟级锁窗口降到秒级），
        同时规避旧版 SQLite 的 SQLITE_MAX_VARIABLE_NUMBER（999）上限。
        items: [(doc_id, project_id, source, chunk, session_id, has_context, content, embedding)]"""
        if not items:
            return
        import sqlite_vec as _sv
        self._safe_table(table)
        _BATCH = 500
        with self._lock:
            conn = self._new_conn()
            try:
                for start in range(0, len(items), _BATCH):
                    batch = items[start:start + _BATCH]
                    ids = [it[0] for it in batch]
                    ph = ",".join("?" * len(ids))
                    conn.execute(f"DELETE FROM {table} WHERE doc_id IN ({ph})", ids)
                    conn.executemany(
                        f"INSERT INTO {table}(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [(None, it[0], it[1], it[2], it[3], it[4], int(it[5]), it[6], _sv.serialize_float32(it[7])) for it in batch],
                    )
                    conn.commit()
            finally:
                conn.close()

    def upsert_image_vectors_bulk(self, items: list):
        """批量 upsert 图片向量：vec0 不支持 UPDATE，先 DELETE 再 INSERT。
        items: [(doc_id, project_id, source, content, file_path, mime, embedding)]"""
        if not items:
            return
        import sqlite_vec as _sv
        with self._lock:
            conn = self._new_conn()
            try:
                for it in items:
                    conn.execute("DELETE FROM image_vectors WHERE doc_id = ?", (it[0],))
                    conn.execute(
                        "INSERT INTO image_vectors(rowid, doc_id, project_id, source, content, file_path, mime, embedding) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (None, it[0], it[1], it[2], it[3], it[4], it[5], _sv.serialize_float32(it[6])),
                    )
                conn.commit()
            finally:
                conn.close()

    def search_image_vectors(self, project_id: str, query_embedding: list, k: int = 3) -> list[dict]:
        import sqlite_vec as _sv
        with self._lock:
            conn = self._new_conn()
            try:
                rows = conn.execute(
                    "SELECT rowid, distance, doc_id, source, content, file_path, mime "
                    "FROM image_vectors WHERE project_id = ? AND embedding MATCH ? AND k = ? "
                    "ORDER BY distance",
                    (project_id, _sv.serialize_float32(query_embedding), k),
                ).fetchall()
            finally:
                conn.close()
        return [dict(r) for r in rows]

    def get_image_docs(self, project_id: str) -> list[dict]:
        """取项目全部图片向量元数据（用于判断是否需要跨模态检索）"""
        return self.execute(
            "SELECT rowid, doc_id, source, content, file_path, mime FROM image_vectors WHERE project_id = ?",
            (project_id,),
        )

    def delete_image_by_source(self, project_id: str, source: str) -> int:
        rows = self.execute(
            "SELECT rowid FROM image_vectors WHERE project_id = ? AND source = ?",
            (project_id, source),
        )
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM image_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    def delete_image_project(self, project_id: str) -> int:
        rows = self.execute("SELECT rowid FROM image_vectors WHERE project_id = ?", (project_id,))
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM image_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    def upsert_kb_tree(self, project_id: str, source: str, tree: list):
        """保存文档标题树（json）"""
        import json as _json
        self.execute(
            "INSERT INTO kb_tree(project_id, source, tree, updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(project_id, source) DO UPDATE SET tree=excluded.tree, updated_at=datetime('now')",
            (project_id, source, _json.dumps(tree, ensure_ascii=False)),
        )

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

    def search_kb_vectors(self, project_id: str, query_embedding: list, k: int = 12,
                          table: str = "kb_vectors") -> list[dict]:
        self._safe_table(table)
        with self._lock:
            conn = self._new_conn()
            try:
                rows = conn.execute(
                    "SELECT rowid, distance, doc_id, source, chunk, session_id, has_context, content "
                    f"FROM {table} WHERE project_id = ? AND embedding MATCH ? AND k = ? "
                    "ORDER BY distance",
                    (project_id, sqlite_vec.serialize_float32(query_embedding), k),
                ).fetchall()
            finally:
                conn.close()
        return [dict(r) for r in rows]

    def get_kb_docs(self, project_id: str, table: str = "kb_vectors") -> list[dict]:
        """取活跃版本全部向量块（doc_id, source, chunk, content），供 BM25 与列表展示"""
        self._safe_table(table)
        return self.execute(
            "SELECT rowid, doc_id, source, chunk, session_id, has_context, content "
            f"FROM {table} WHERE project_id = ? ORDER BY chunk",
            (project_id,),
        )

    def delete_kb_by_source(self, project_id: str, source: str) -> int:
        """删除某来源：跨全部文本向量版本（任何代际里的残留都清掉）"""
        total = 0
        for table in self.list_text_version_tables():
            rows = self.execute(
                f"SELECT rowid FROM {self._safe_table(table)} WHERE project_id = ? AND source = ?",
                (project_id, source),
            )
            ids = [r["rowid"] for r in rows]
            if ids:
                ph = ",".join("?" * len(ids))
                self.execute(f"DELETE FROM {self._safe_table(table)} WHERE rowid IN ({ph})", tuple(ids))
                total += len(ids)
        return total

    def delete_kb_project(self, project_id: str) -> int:
        """删除项目知识库：跨全部文本向量版本"""
        total = 0
        for table in self.list_text_version_tables():
            rows = self.execute(
                f"SELECT rowid FROM {self._safe_table(table)} WHERE project_id = ?", (project_id,))
            ids = [r["rowid"] for r in rows]
            if ids:
                ph = ",".join("?" * len(ids))
                self.execute(f"DELETE FROM {self._safe_table(table)} WHERE rowid IN ({ph})", tuple(ids))
                total += len(ids)
        return total

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
