# -*- coding: utf-8 -*-
"""T26：_ensure_wal 陈旧 flag 守卫。

缺陷（P1.1 引入，非历史债）：实例级 `_wal_ensured` flag 在「库文件被删后复用同一
client」场景失效——文件删了但 flag 仍为 True，新库文件从未被设 WAL
（journal_mode=delete，不是 wal）。生产可达性≈0（评委不会运行时删 data/app.db），
定性是给未来测试的陷阱。

守卫（存在性硬失败范式，决策 18）：
- test_wal_survives_db_file_delete_and_reinit：新行为断言——删库文件 → 复用同一
  client → 再建库 → journal_mode 必须仍为 wal（T26 修复前该断言红，见交接文档变异验证）。
- test_wal_ensure_is_stateless：存在性守卫——_ensure_wal 不得再有 _wal_ensured 实例态。
- test_normal_db_is_wal：回归控制断言——常规建库路径 WAL 语义不回退（P1.1 的本意）。

删库文件先例：tests/test_engine_finalize.py:128（os.remove 前 conftest 的 P1.2 桥接
fixture 自动释放 SQLiteClient 缓存连接句柄，Windows 上防 WinError 32）。"""
import os

import pytest

from core.db.base import SQLiteClient


@pytest.fixture()
def client(tmp_path):
    c = SQLiteClient(str(tmp_path / "t26.db"))
    c.init_tables()
    return c


def _journal_mode(c):
    rows = c.execute("PRAGMA journal_mode")
    return (rows[0]["journal_mode"] if rows else "").lower()


def test_normal_db_is_wal(client):
    """回归控制断言：常规建库路径 WAL 不回退（P1.1 本意）。"""
    assert _journal_mode(client) == "wal"


def test_wal_survives_db_file_delete_and_reinit(client, tmp_path):
    """新行为断言（T26 核心）：删库文件 → 复用同一 client → 再建库 → 仍为 wal。"""
    assert _journal_mode(client) == "wal"          # 建库：wal
    client._discard_shared_conn()                   # 释放缓存连接句柄（对齐 conftest 桥接语义）
    os.remove(str(tmp_path / "t26.db"))             # 删库文件（conftest 桥接兜底释放句柄）
    client.init_tables()                            # 复用同一 client 重建库
    assert _journal_mode(client) == "wal"           # 修复前：delete（flag 陈旧，新文件没被设 WAL）


def test_wal_ensure_is_stateless(client):
    """存在性守卫（决策 18）：_ensure_wal 必须无实例级陈旧 flag（查询后按需设置）。"""
    assert not any("wal_ensured" in k for k in vars(client).keys()), \
        "不得再有 _wal_ensured 实例态（T26：陈旧 flag 是本缺陷根因）"
