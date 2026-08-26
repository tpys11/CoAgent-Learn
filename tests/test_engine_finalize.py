# -*- coding: utf-8 -*-
"""Loop4·Finalize 副作用验证（独立临时库 + 后台提交捕获）：
AI回复落库(think含思维链) / 专注时长与按天focus / 任务统计 / autoSave资源闸 /
五轮钩子幂等触发 / 后处理调度清单(distill+compress+followups±extra)。"""
import json
import time as _time
from types import SimpleNamespace

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
from engine.finalize import (five_round_hook, finalize_side_effects,
                             schedule_post_turn)

LONG_REPLY = "这是一段足够长的合格回答内容。" * 12  # >120 字，过垃圾过滤


@pytest.fixture()
def env(tmp_path, monkeypatch):
    client = SQLiteClient(str(tmp_path / "t.db"))
    client.init_tables()
    monkeypatch.setattr(pr_mod, "_project_repo", ProjectRepo(db=client), raising=False)
    # finalize 内部直引 pg_client（统计/落库路径）——必须与隔离库同源
    import core.postgres_client as pgmod
    monkeypatch.setattr(pgmod, "pg_client", client)
    submitted: list = []
    monkeypatch.setattr(__import__("core.background", fromlist=["submit"]),
                        "submit", lambda fn=None, *a, **k: submitted.append(fn))
    client.execute("INSERT INTO dialogues(id,project_id,session_id,name) "
                   "VALUES('dF','p1','s1','对话F')")
    req = SimpleNamespace(api_key="k", settings={}, session_id="s1",
                          followup_focus=None, extra_followup_did=None,
                          base_url=None, message="m", model=None)
    return client, req, submitted


def _result(reply=LONG_REPLY):
    return {"final_reply": reply,
            "mindchain": [{"agent": "学习助手·生成", "content": "思维"}],
            "task_stats": {"plan": {"ms": 5}},
            "complexity": "standard"}


def test_finalize_persists_reply_stats_focus_tasks(env):
    client, req, _ = env
    t0 = _time.time() - 3
    finalize_side_effects(req, "p1", "dF", _result(), t0)
    row = client.execute("SELECT role, content, think FROM messages "
                         "WHERE dialogue_id='dF' AND role='assistant'")[0]
    assert LONG_REPLY[:10] in row["content"]
    assert "学习助手·生成" in row["think"]
    assert client.execute("SELECT count(*) c FROM task_stats")[0]["c"] == 1
    assert client.execute("SELECT duration_seconds s FROM stats "
                          "WHERE project_id='p1'")[0]["s"] >= 1
    assert client.execute("SELECT count(*) c FROM focus_log")[0]["c"] == 1


def test_finalize_autosave_gate_and_junk_filter(env):
    client, req, _ = env
    # 默认关：不自动保存
    finalize_side_effects(req, "p1", "dF", _result(LONG_REPLY), _time.time())
    assert client.execute("SELECT count(*) c FROM resources")[0]["c"] == 0
    # 开启且内容合格：入库一条
    req.settings = {"autoSaveResource": True}
    finalize_side_effects(req, "p1", "dF", _result(LONG_REPLY), _time.time())
    assert client.execute("SELECT count(*) c FROM resources")[0]["c"] == 1


def test_schedule_post_turn_submission_list(env):
    _, req, submitted = env
    req.settings = {}
    schedule_post_turn(req, "p1", "dF", {"final_reply": "r"})
    names = [fn.__name__ for fn in submitted]
    assert names.count("distill_memory") == 1
    assert names.count("compress_dialogue") == 1
    assert names.count("generate_followups") == 1  # 主对话追问


def test_schedule_post_turn_extra_and_switch(env):
    _, req, submitted = env
    req.settings = {"autoFollowups": False}
    req.extra_followup_did = "d-second"
    schedule_post_turn(req, "p1", "dF", {"final_reply": "r"})
    names = [fn.__name__ for fn in submitted]
    assert "generate_followups" not in names          # autoFollowups=False 关主追问
    assert "distill_memory" in names and "compress_dialogue" in names


def test_five_round_hook_triggers_at_multiple_of_five(monkeypatch):
    import os
    import tempfile
    from core.db.base import SQLiteClient
    fd, dbp = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    client = SQLiteClient(dbp)
    client.init_tables()

    class _StubRepo:
        """与 SQLiteClient.execute 同语义：%s 占位转换 + SELECT 返回 list[dict]。"""
        def __init__(self, db):
            self._db = db

        def execute(self, sql, params=None):
            if params is not None:
                sql = sql.replace("%s", "?")
            cur = self._db.execute(sql, params or ())
            if sql.strip().upper().startswith(("SELECT", "PRAGMA")):
                return [dict(r) for r in cur.fetchall()]
            return []

    import core.postgres_client as pgmod
    # SQLiteClient.execute 本就完成 %s→? 转换并返回 list[dict]，直接复用为 pg 桩
    monkeypatch.setattr(pgmod, "pg_client", client)
    import core.memory_service as ms
    calls = []
    monkeypatch.setattr(ms, "transfer_dialogue_to_project",
                        lambda pid, did: calls.append((pid, did)))
    # 外键前置：先建对话行再插用户消息
    client.execute("INSERT INTO dialogues(id,project_id,session_id,name) "
                   "VALUES('dh','pX','sX','钩子测试')")
    for i in range(5):
        client.execute("INSERT INTO messages(dialogue_id,role,content) "
                       "VALUES('dh','user',%s)", (f"u{i}",))
    five_round_hook("pX", "dh")
    assert len(calls) == 1 and calls[0] == ("pX", "dh")
    os.remove(dbp)
