# -*- coding: utf-8 -*-
"""D4 重试幂等：client_msg_id 去重（前端 5xx/网络抖动重试时整个 POST 重发 →
用户消息此前会被入库两份；现在重试复用同一 client_msg_id → 只入库一份）。

可观测判据逐条对应：
- 同一 client_msg_id 重复入库 → 仅 1 行（幂等主断言）
- 连续两条内容完全相同、ID 不同的消息 → 2 行（防「误伤」关键断言）
- 不带 client_msg_id（旧客户端/手工 curl）→ 行为与改动前一致（存 NULL，不去重）
- 迁移幂等：init_tables 重复执行不报错、索引只建一次
- 部分唯一索引属性：NULL 多行放行；非 NULL 重复硬失败
- 并发窗口兜底：先查后插之间被抢先 → 唯一冲突按「已存在」跳过，不报错

⚠️ 导入纪律：core.postgres_client / engine.pipeline_v2 一律【延迟到执行期】导入——
pipeline_v2 的模块级链（core.model_provider → core.config.load_dotenv()）会把 .env 的
SQLITE_DIR 注入进程环境，而 tests/test_db_path.py 靠「导入期快照」判定分支；若本模块在
collection 期就触发 dotenv，其快照采到污染值 → test_db_dir_matches_resolution_rule 假失败
（2026-08-30 全量回归实测：模块级导入 pipeline_v2 → 该守卫红；延迟后全绿）。
core.db.base 不触发 dotenv（test_db_path.py 自身模块级导入它，同款先例）。"""
import sqlite3
from types import SimpleNamespace

import pytest

from core.db.base import SQLiteClient


@pytest.fixture()
def db(tmp_path, monkeypatch):
    client = SQLiteClient(str(tmp_path / "t.db"))
    client.init_tables()
    # _persist_user_message 内部直引 pg_client——必须与隔离库同源（延迟导入，见文件头）
    import core.postgres_client as pgmod
    monkeypatch.setattr(pgmod, "pg_client", client)
    return client


def _persist(req, pid, did):
    from engine.pipeline_v2 import _persist_user_message
    return _persist_user_message(req, pid, did)


def _req(msg, cmid=""):
    return SimpleNamespace(session_id="s1", message=msg, client_msg_id=cmid)


def _user_rows(client, did="dT"):
    return client.execute(
        "SELECT content, client_msg_id FROM messages "
        "WHERE dialogue_id=? AND role='user' ORDER BY id", (did,))


def test_same_client_msg_id_persists_once(db):
    """新行为断言：重试重发（同 did 同 client_msg_id）→ 用户消息只存 1 份。"""
    _persist(_req("你好", "cmi-1"), "p1", "dT")
    _persist(_req("你好", "cmi-1"), "p1", "dT")
    rows = _user_rows(db)
    assert len(rows) == 1
    assert rows[0]["content"] == "你好"
    assert rows[0]["client_msg_id"] == "cmi-1"


def test_two_identical_contents_both_saved(db):
    """防误伤关键断言：用户连发两条一模一样的消息（每次发送生成新 ID）→ 都要保存。"""
    _persist(_req("同一句话", "cmi-a"), "p1", "dT")
    _persist(_req("同一句话", "cmi-b"), "p1", "dT")
    rows = _user_rows(db)
    assert [r["client_msg_id"] for r in rows] == ["cmi-a", "cmi-b"]


def test_legacy_request_without_client_msg_id_unchanged(db):
    """回归控制断言：旧客户端不传该字段（默认空串 → 存 NULL）——不去重，行为与改动前一致。"""
    _persist(_req("旧请求1"), "p1", "dT")
    _persist(_req("旧请求2"), "p1", "dT")
    rows = _user_rows(db)
    assert len(rows) == 2
    assert all(r["client_msg_id"] is None for r in rows)


def test_migration_idempotent_and_single_index(db):
    """回归控制断言：迁移幂等——init_tables 重复执行不报错、索引不重复建。"""
    db.init_tables()  # 第二次执行
    idx = db.execute(
        "SELECT name FROM sqlite_master WHERE type='index' "
        "AND name='uq_messages_client_msg_id'")
    assert len(idx) == 1


def test_partial_unique_index_nulls_free_dups_hard_fail(db):
    """回归控制断言：部分唯一索引属性——NULL 任意多行放行，非 NULL 重复硬失败。"""
    for d in ("dX", "dY", "dZ"):  # messages.dialogue_id 有外键，先建对话行
        db.execute("INSERT INTO dialogues(id,project_id,session_id,name) "
                   "VALUES(?,'p1','s1','x')", (d,))
    db.execute("INSERT INTO messages(dialogue_id,role,content,client_msg_id) "
               "VALUES('dX','user','a',NULL)")
    db.execute("INSERT INTO messages(dialogue_id,role,content,client_msg_id) "
               "VALUES('dY','user','b',NULL)")
    db.execute("INSERT INTO messages(dialogue_id,role,content,client_msg_id) "
               "VALUES('dZ','user','c','dup-id')")
    with pytest.raises(sqlite3.IntegrityError):  # 同值非 NULL 第二次插入 → 唯一冲突
        db.execute("INSERT INTO messages(dialogue_id,role,content,client_msg_id) "
                   "VALUES('dZ','user','c2','dup-id')")


def test_concurrent_race_backstop_skips_on_unique_conflict(db, monkeypatch):
    """新行为断言：先查后插的并发窗口被抢先（去重 SELECT 恒空、INSERT 直通真库）→
    唯一冲突按「已存在」跳过，不报错、不重复入库（决策 5：冲突不是错误）。"""
    _persist(_req("竞态", "cmi-race"), "p1", "dT")
    real_execute = db.execute

    def racing_execute(sql, params=None):
        # 只拦「去重 SELECT」（唯一含 client_msg_id 的 SELECT），dialogues 存在性检查照常直通
        if sql.lstrip().upper().startswith("SELECT") and "client_msg_id" in sql:
            return []
        return real_execute(sql, params)

    import core.postgres_client as pgmod
    monkeypatch.setattr(pgmod, "pg_client", SimpleNamespace(execute=racing_execute))
    _persist(_req("竞态", "cmi-race"), "p1", "dT")  # 不得抛错
    cnt = db.execute(
        "SELECT count(*) c FROM messages WHERE client_msg_id='cmi-race'")
    assert cnt[0]["c"] == 1


def test_chat_request_has_client_msg_id_field():
    """存在性守卫（决策 18）：ChatRequest 必须带 client_msg_id 可选字段且默认空串
    （该字段落点 main.py 不在原 D4 文件清单内，属预批改动，见交接文档决策 17 标注）。
    main 顶层依赖较多，同样延迟到执行期导入（保持本模块 collection 期零 dotenv 触发）。"""
    from main import ChatRequest
    assert ChatRequest(message="x").client_msg_id == ""
