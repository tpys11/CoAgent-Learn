# -*- coding: utf-8 -*-
"""SQLiteClient 核心 mixin：路径常量 / 连接管理 / execute / 动态设置 / 表名白名单。
B2 拆分（2026-08-27）：方法自 base.py 逐字迁入，类经 mixin 组装后对外身份不变
（类名 SQLiteClient / 构造签名 / 方法 MRO 全部保持）。"""
import logging
import os
import re
import sqlite3
import threading
import time

import sqlite_vec

logger = logging.getLogger("coagent.db")

# 数据目录默认锚定仓库根 data/（与进程 CWD 无关）——历史教训：相对 ./data 曾因启动目录不同
# 分裂出三个 app.db（根data / backend/data / docker命名卷）。环境变量 SQLITE_DIR 仍可覆盖。
_DEFAULT_DB_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data"))
_DB_DIR = os.path.normpath(os.environ.get("SQLITE_DIR") or _DEFAULT_DB_DIR)
_DB_PATH = os.path.join(_DB_DIR, "app.db")
DATA_DIR = _DB_DIR  # 上传目录等同源派生（main.py 静态挂载 / knowledge.py 图片落盘）

# 物理表名白名单（原 SQLiteClient 类属性，mixin 化后提升为模块级——同一正则对象）
_TABLE_RE = re.compile(r"^[A-Za-z0-9_]+$")


class CoreMixin:
    """连接与执行基座：所有 mixin 的 self._lock/_new_conn/execute 由此提供。"""

    def __init__(self, db_path: str = _DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        # 每操作短命连接 + 单锁串行（对齐 DeepTutor）：不再持有常驻共享连接，
        # 避免被事件循环线程 + 线程池线程 + 后台线程并发使用时偶发锁冲突/连接失效。
        self._lock = threading.RLock()
        # P1.1：journal_mode 是数据库文件的持久属性，每实例只需确保一次（见 _ensure_wal）
        self._wal_ensured = False

    def _ensure_wal(self, conn):
        """P1.1：在实例首个连接上确保 WAL，之后不再重复。
        journal_mode 是数据库文件的持久属性（一旦设为 WAL 就一直是 WAL），原 _new_conn
        在每条连接上都重设一次（实测 33ms/条）是纯浪费——init_tables 约 24 次 execute
        × 全量 82 个 DB 用例，是回归耗时的最大单点开销。对已是 WAL 的库该 PRAGMA
        是即时 no-op；PRAGMA 失败时随 _new_conn 的重试循环换连接重试，与原行为一致。
        必须在 _lock 串行域内调用（现行所有 _new_conn 调用点均已持锁）。"""
        if self._wal_ensured:
            return
        conn.execute("PRAGMA journal_mode=WAL")
        self._wal_ensured = True

    def _new_conn(self):
        """新建一个独立连接（每次操作独立连接，用完即关）。
        数据在 named volume（Linux 原生 fs）上，WAL 稳定：写事务不再阻塞读。
        WAL 由 _ensure_wal 在实例首个连接上设置（持久属性，勿在此逐连接重设）。"""
        last_err = None
        for _attempt in range(5):
            try:
                conn = sqlite3.connect(self.db_path, check_same_thread=False)
                conn.row_factory = sqlite3.Row
                conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                conn.execute("PRAGMA busy_timeout=5000")
                self._ensure_wal(conn)
                conn.execute("PRAGMA foreign_keys=ON")
                return conn
            except sqlite3.Error as e:
                last_err = e
                try:
                    if 'conn' in dir() and conn:
                        conn.close()
                except Exception:
                    logger.debug("重试前清理旧连接失败", exc_info=True)
                time.sleep(1)
        raise last_err

    def execute(self, sql: str, params: tuple | list | None = None):
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
                    if sql.strip().upper().startswith(("SELECT", "PRAGMA", "EXPLAIN")):
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
                            logger.debug("短命连接关闭失败", exc_info=True)

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

    @staticmethod
    def _safe_table(table: str) -> str:
        """物理表名白名单校验（表名进 f-string SQL 前必须过这道闸）。
        唯一非逐字迁移点：原 `SQLiteClient._TABLE_RE` 类属性引用改为模块级 _TABLE_RE
        （同一正则对象，语义等价）。"""
        if not table or not _TABLE_RE.match(table):
            raise ValueError(f"非法向量表名: {table!r}")
        return table
