# -*- coding: utf-8 -*-
"""P1 守卫：DB 连接层提速后的 WAL / 连接语义（C4 范式：存在性守卫 + 属性守卫 skip 兜底）。

钉住的目标（一处坏掉只红对应那一条）：
1. test_p1_connection_api_exists              —— 存在性：P1 依赖的连接层 API 必须存在
2. test_p1_new_conn_has_no_journal_mode       —— 结构：_new_conn 不得逐连接重设 WAL（P1.1 回退检测）
3. test_p1_new_db_is_wal                      —— 行为：新建库经 init_tables 后 journal_mode 必须 = wal
4. test_p1_init_tables_fast                   —— 性能：init_tables 不得回退到「逐连接建连+逐连接重设 WAL」量级
5. test_p1_new_conn_returns_fresh             —— 语义：_new_conn 永远返回全新独立连接
6. test_p1_execute_reuses_cached_conn         —— 语义：execute 复用实例级缓存连接（P1.2 回退检测）
7. test_p1_upsert_kg_edges_bulk_then_execute_ok —— 语义：显式调用者路径用完后连接层健康、缓存连接未被破坏

背景：_new_conn 原本每条连接都执行 PRAGMA journal_mode=WAL（实测 33ms/条），而
journal_mode 是库文件持久属性；_kb_ops 9 处显式调用者会自行 close 拿到的连接，
因此 _new_conn 必须永远返回全新连接，缓存连接只允许 execute 内部使用。
"""
import inspect
import sqlite3
import time

import pytest

from core.db.base import SQLiteClient


def _mk_client(tmp_path, monkeypatch, name="p1.db"):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    return SQLiteClient(str(tmp_path / name))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """标准建库路径（与生产 get_db() 同款：构造 → init_tables）。"""
    c = _mk_client(tmp_path, monkeypatch)
    c.init_tables()
    return c


def test_p1_connection_api_exists():
    """存在性守卫：P1 依赖的连接层 API 必须存在；各属性守卫在缺失时 skip，由本条兜底。"""
    for attr in ("_new_conn", "_ensure_wal", "_get_shared_conn", "execute"):
        assert hasattr(SQLiteClient, attr), f"SQLiteClient 缺少 {attr}——P1 连接层被破坏"


def test_p1_new_conn_has_no_journal_mode():
    """结构守卫（P1.1）：_new_conn 源码不得出现 journal_mode——防「每连接重设 WAL」回退。"""
    if not hasattr(SQLiteClient, "_new_conn"):
        pytest.skip("_new_conn 不存在，由存在性守卫兜底")
    src = inspect.getsource(SQLiteClient._new_conn)
    assert "journal_mode" not in src, (
        "_new_conn 又在逐连接重设 journal_mode（P1.1 回退：每条 33ms × 每次 execute）"
    )


def test_p1_new_db_is_wal(tmp_path, monkeypatch):
    """行为守卫（P1.1）：journal_mode 移出 _new_conn 后，新建库经 init_tables 仍必须是
    WAL，否则 WAL 的「写不阻塞读」并发优势会静默丢失。用全新原始连接读库文件持久属性。"""
    if not hasattr(SQLiteClient, "_ensure_wal"):
        pytest.skip("_ensure_wal 不存在，由存在性守卫兜底")
    db_file = tmp_path / "p1wal.db"
    c = _mk_client(tmp_path, monkeypatch, "p1wal.db")
    c.init_tables()
    raw = sqlite3.connect(str(db_file))
    try:
        mode = raw.execute("PRAGMA journal_mode").fetchone()[0]
    finally:
        raw.close()
    assert mode == "wal", f"新建库 journal_mode={mode!r}（应为 wal——建库路径未补上 WAL）"


def test_p1_init_tables_fast(tmp_path, monkeypatch):
    """性能守卫（P1）：init_tables 原 3.60s/次（逐连接建连 + 逐连接重设 WAL）。
    阈值 2.5s 依据实测分布（docs/progress/step-P1.md）：P1.1 档 5 次中位 1.44s
    （1.266–1.454），变异 M1（逐连接重设 WAL）落点约 2.25s——阈值须 >2.25s 才能
    保证「变异恰一条红」（2.0s 会让 M1 连带打红本条）；同时仍能捕捉全量回退
    （原 3.60s）。
    注意：init_tables 内 9 条幂等 ALTER 必触发 execute 通用重试的 sleep(0.1)×9≈0.94s，
    这是原实现同样支付的固定地板，不是本步回归（详见交接文档「新发现问题」）。"""
    c = _mk_client(tmp_path, monkeypatch, "p1perf.db")
    t0 = time.perf_counter()
    c.init_tables()
    dt = time.perf_counter() - t0
    assert dt < 2.5, f"init_tables 耗时 {dt:.3f}s ≥ 2.5s（连接复用/WAL 提速回退或环境异常）"


def test_p1_new_conn_returns_fresh(tmp_path, monkeypatch):
    """语义守卫：_new_conn 必须永远返回全新独立连接。_kb_ops 的 9 处显式调用者
    （upsert_*_bulk / search_* / fetch_kb_rows 等）拿连接后 finally: conn.close()——
    若返回缓存连接会被关死，后续操作全部 ProgrammingError（总领 A/B 实测挂 4 条的根因）。
    刻意不建表：本属性只关 _new_conn 契约，与 init_tables 健康解耦——
    否则「_new_conn 返回缓存」这一灾难级变异会在 fixture 阶段连锁炸掉，断言跑不到。"""
    if not hasattr(SQLiteClient, "_new_conn"):
        pytest.skip("_new_conn 不存在，由存在性守卫兜底")
    client = _mk_client(tmp_path, monkeypatch, "p1fresh.db")
    c1 = client._new_conn()
    c2 = client._new_conn()
    try:
        assert c1 is not c2, "_new_conn 返回了缓存连接——显式调用者 close 后全库瘫痪"
        c1.close()
        c2.execute("SELECT 1").fetchone()  # 关闭 c1 不得影响 c2（连接独立性）
    finally:
        for x in (c1, c2):
            try:
                x.close()
            except sqlite3.Error:
                pass  # 清理兜底：c1 可能已提前关闭，重复 close 无害


def test_p1_execute_reuses_cached_conn(client):
    """语义守卫（P1.2）：execute 连续两次操作复用同一缓存连接（不再每操作新建）。
    P1.2 回退（退回逐操作 _new_conn）时本条红：_shared_conn 恒为 None / 对象不稳。"""
    if not hasattr(SQLiteClient, "_get_shared_conn"):
        pytest.skip("_get_shared_conn 不存在，由存在性守卫兜底")
    client.execute("SELECT 1")
    first = client._shared_conn
    assert first is not None, "execute 未建立缓存连接（P1.2 缺失）"
    client.execute("SELECT 1")
    assert client._shared_conn is first, "execute 每次都在新建连接（P1.2 回退：退回逐操作建连）"


def test_p1_upsert_kg_edges_bulk_then_execute_ok(client):
    """语义守卫（P1.2）：显式调用者路径（自己拿连接、自己 close）用完后，
    execute 功能正常 且 缓存连接未被破坏（对象同一）——若有人把缓存连接交给
    会 close 的调用者，自愈重建会换掉缓存连接，本条凭对象同一性精确抓红。"""
    if not hasattr(SQLiteClient, "upsert_kg_edges_bulk"):
        pytest.skip("upsert_kg_edges_bulk 不存在，由存在性守卫兜底")
    item = ("pP1", "src1", "线性代数基础", "行列式", "先修")
    conn_before = client._get_shared_conn()
    client.upsert_kg_edges_bulk([item])
    rows = client.execute(
        "SELECT src, dst, rel FROM kg_edges WHERE project_id = 'pP1'")
    assert rows == [{"src": "线性代数基础", "dst": "行列式", "rel": "先修"}]
    assert client._shared_conn is conn_before, (
        "缓存连接被显式调用者破坏（自愈重建发生）——缓存连接绝不能交给会 close 的调用者")
    client.upsert_kg_edges_bulk([item])  # 幂等重放（五元组主键 DO NOTHING）
    rows = client.execute("SELECT COUNT(*) AS n FROM kg_edges WHERE project_id = 'pP1'")
    assert rows[0]["n"] == 1, "upsert_kg_edges_bulk 重放应幂等（恰 1 条）"
