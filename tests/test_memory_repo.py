# -*- coding: utf-8 -*-
"""memory_repo 守卫测试（闭环A·地基）：
验证 global/project 记忆 upsert 的插入/更新两分支、最新行写回策略、session 归一，
以及 memory_edit 数组字段归一化。独立临时库，不触碰真实 data/app.db。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db.memory_repo import MemoryRepo


@pytest.fixture()
def repo(tmp_path):
    client = SQLiteClient(str(tmp_path / "t.db"))
    client.init_tables()
    return MemoryRepo(db=client)


def test_global_upsert_insert_then_update(repo):
    assert repo.get_global_profile() is None
    repo.save_global_profile('{"a": "1"}')
    assert json.loads(repo.get_global_profile())["a"] == "1"
    repo.save_global_profile('{"a": "2"}')
    rows = repo.list_global_profile_full()
    assert len(rows) == 1, "upsert 不应新增行"
    assert json.loads(rows[0]["data"])["a"] == "2"


def test_global_update_targets_latest_row(repo):
    """多 session 历史行存在时，写回必须落在 updated_at 最新的行（与读路径同一行）。"""
    repo._db.execute("INSERT INTO global_profile (session_id, data, updated_at) VALUES ('s1','{\"v\":\"old1\"}','2026-01-01 00:00:00')")
    repo._db.execute("INSERT INTO global_profile (session_id, data, updated_at) VALUES ('s2','{\"v\":\"old2\"}','2026-02-01 00:00:00')")
    repo.save_global_profile('{"v": "new"}')
    hits = repo._db.execute("SELECT session_id, data FROM global_profile WHERE data LIKE '%new%'")
    assert len(hits) == 1 and hits[0]["session_id"] == "s2"
    assert json.loads(repo.get_global_profile())["v"] == "new"


def test_project_upsert_and_session_norm(repo):
    repo.save_project_memory("p1", '{"k": "x"}')
    row = repo.get_project_memory_with_session("p1")[0]
    assert row["session_id"] == "default", "未传 session 时新插入应归一为 default（D1）"
    repo.save_project_memory("p1", '{"k": "y"}', "sess9")
    rows = repo.get_project_memory_with_session("p1")
    assert len(rows) == 1 and json.loads(rows[0]["data"])["k"] == "y"
    repo.save_project_memory("p2", "{}", "sessA")
    assert repo.get_project_memory_with_session("p2")[0]["session_id"] == "sessA"


def test_normalize_mem_value():
    from services.memory_edit import _normalize_mem_value
    assert _normalize_mem_value("偏好", "a、b，c") == ["a", "b", "c"]
    assert _normalize_mem_value("知识点", "x\ny") == ["x", "y"]
    assert _normalize_mem_value("身份", "字符串保持原样") == "字符串保持原样"
    assert _normalize_mem_value("偏好", ["已是", "列表"]) == ["已是", "列表"]
