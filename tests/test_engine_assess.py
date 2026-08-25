# -*- coding: utf-8 -*-
"""Loop3·Assess 验证：评估解析、写回加键保全他键、读改写往返、分数防御。
独立临时库；project_repo 单例打补丁指向同库，模拟真实读写路径。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
from engine.assess import (assess_and_store, coerce_score, evaluate_level,
                           load_profile_cache, store_level_score)

GOOD = '{"level_score": 0.8, "evidence": "术语准确"}'


class OneShot:
    def __init__(self, raw):
        self.raw = raw

    def chat_stream(self, messages, on_token, **kw):
        on_token(self.raw)


@pytest.fixture()
def repo_db(tmp_path, monkeypatch):
    client = SQLiteClient(str(tmp_path / "t.db"))
    client.init_tables()
    monkeypatch.setattr(pr_mod, "_project_repo", ProjectRepo(db=client), raising=False)
    client.execute(
        "INSERT INTO dialogues(id,project_id,session_id,name,profile) "
        "VALUES('d1','p1','s1','n',%s)", ('{"用户背景": "x"}',))
    return client


def test_evaluate_ok(repo_db):
    out = evaluate_level(OneShot(GOOD), "消息", "", None)
    assert out == {"level_score": 0.8, "evidence": "术语准确"}


def test_evaluate_malformed_returns_none():
    assert evaluate_level(OneShot("不是json"), "m", "", None) is None
    assert evaluate_level(OneShot('{"level_score": 5}'), "m", "", None) is None


def test_coerce_score():
    assert coerce_score("0.7") == 0.7
    assert coerce_score(0.2) == 0.2
    assert coerce_score("abc") is None
    assert coerce_score(2) is None
    assert coerce_score(None) is None


def test_store_preserves_existing_keys(repo_db):
    assert store_level_score("d1", 0.8, "ok") is True
    row = repo_db.execute("SELECT profile FROM dialogues WHERE id='d1'")[0]
    d = json.loads(row["profile"])
    assert d["用户背景"] == "x"
    assert d["level_score"] == 0.8
    assert "level_updated_at" in d


def test_load_roundtrip(repo_db):
    assert load_profile_cache("d1").get("用户背景") == "x"
    store_level_score("d1", 0.9, "e")
    assert load_profile_cache("d1")["level_score"] == 0.9


def test_assess_and_store_happy(repo_db):
    out = assess_and_store(OneShot(GOOD), "d1", "消息", "", None)
    assert out == 0.8
    d = load_profile_cache("d1")
    assert d["level_score"] == 0.8 and d["level_evidence"] == "术语准确"


def test_assess_missing_dialogue_row_still_returns_score(repo_db):
    """对话行不存在时落库静默失败，但本轮评分仍返回供路由使用。"""
    out = assess_and_store(OneShot(GOOD), "不存在的did", "消息", "", None)
    assert out == 0.8
