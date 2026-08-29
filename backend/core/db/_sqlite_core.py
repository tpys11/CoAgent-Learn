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
        # 单锁串行（对齐 DeepTutor）：所有连接触达都在 _lock 串行域内。
        # P1.2：execute 改用实例级缓存连接（_get_shared_conn）——缓存连接只在锁内
        # 触达，事件循环线程 + 线程池线程 + 后台线程并发时同一连接从不被两个线程
        # 同时使用；历史上「常驻共享连接偶发锁冲突/连接失效」的成因是无锁并发触达，
        # 而现行所有调用点（execute + _kb_ops 9 处显式调用者）均已持锁，故语义不变。
        self._lock = threading.RLock()
        # P1.2：execute() 专用缓存连接；绝不交给 _kb_ops 的显式调用者（它们会 close）
        self._shared_conn = None

    def _ensure_wal(self, conn):
        """P1.1（T26 修订）：确保数据库处于 WAL。不再用实例级 flag 记忆「已设过」——
        库文件被删后复用同一 client 时 flag 仍为 True，新文件永远得不到 WAL（陈旧状态陷阱，
        生产可达性≈0 但必坑未来测试）。改为查询后按需设置：对已是 WAL 的库，PRAGMA
        journal_mode 读查询是即时 no-op（实测 0ms 级），自校验、无可陈旧状态。
        必须在 _lock 串行域内调用（现行所有 _new_conn 调用点均已持锁）。"""
        row = conn.execute("PRAGMA journal_mode").fetchone()
        if row and (row[0] or "").lower() != "wal":
            conn.execute("PRAGMA journal_mode=WAL")

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

    def _get_shared_conn(self):
        """P1.2：execute() 专用的实例级缓存连接。
        只允许在 _lock 串行域内取用；绝不交给 _kb_ops 的显式调用者——
        它们 finally: conn.close() 会把缓存连接关死（_new_conn 因此永远返回全新连接）。"""
        if self._shared_conn is None:
            self._shared_conn = self._new_conn()
        return self._shared_conn

    def _discard_shared_conn(self):
        """P1.2：缓存连接出错/被外部关闭时丢弃，下次 execute 经 _get_shared_conn
        自动重建（自愈，不永久失效）。"""
        conn, self._shared_conn = self._shared_conn, None
        if conn is not None:
            try:
                conn.close()
            except Exception:
                logger.debug("废弃缓存连接关闭失败", exc_info=True)

    def _rollback_shared_conn(self):
        """P1.2：出错后回滚缓存连接上可能残留的打开事务，避免污染同连接上的后续语句。"""
        conn = self._shared_conn
        if conn is None:
            return
        try:
            conn.rollback()
        except sqlite3.Error:
            logger.debug("缓存连接回滚失败（可能已关闭），丢弃后重建即可", exc_info=True)

    def execute(self, sql: str, params: tuple | list | None = None):
        """执行 SQL，返回 list[dict]（SELECT）或空列表。
        自动将 Postgres 风格 %s 占位符转为 SQLite 的 ?，保持旧调用兼容。
        P1.2：单锁串行语义与原实现一致（本方法原本就在 _lock 内）；连接从
        「每操作新建短命连接」改为实例级缓存复用，省去每次操作的建连开销。
        重试语义保持等价：sqlite3.Error → 回滚（尽力）+ 丢弃缓存 + sleep(0.1)
        + 重试时换全新连接（原实现为 finally 关闭出错连接 + _new_conn 新建）；
        缓存连接被外部意外关闭同样经此路径自动重建，不会永久失效。"""
        with self._lock:
            if params is not None:
                sql = sql.replace("%s", "?")
            for attempt in range(2):
                try:
                    conn = self._get_shared_conn()
                    cur = conn.execute(sql, params or ())
                    if sql.strip().upper().startswith(("SELECT", "PRAGMA", "EXPLAIN")):
                        rows = cur.fetchall()
                        return [dict(r) for r in rows]
                    conn.commit()
                    return []
                except sqlite3.Error:
                    self._rollback_shared_conn()
                    self._discard_shared_conn()
                    if attempt == 0:
                        time.sleep(0.1)
                        continue
                    raise

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
