# -*- coding: utf-8 -*-
"""答题反馈闭环守卫（闭环D / 官方"动态决策更新"）：合流规则、落库聚合、端点全链。
隔离策略与 test_engine_modes 相同；quiz_repo 单例重置防跨测试死库。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from engine.assess import QUIZ_WEIGHT_NEW, QUIZ_WEIGHT_OLD, \
    apply_quiz_feedback, load_profile_cache, merge_quiz_signal


# ---------- 合流规则（缺口①程序化定义的核心一行） ----------

def test_merge_cold_start_takes_accuracy_directly():
    assert merge_quiz_signal(None, 0.7) == 0.7


def test_merge_weighted_and_clamped():
    old = 0.5
    assert abs(merge_quiz_signal(old, 0.8) - (QUIZ_WEIGHT_NEW * 0.8 + QUIZ_WEIGHT_OLD * 0.5)) < 1e-9
    # 极端值夹逼 [0,1]
    assert merge_quiz_signal(1.0, 0.0) == QUIZ_WEIGHT_OLD * 1.0
    assert merge_quiz_signal(0.0, 1.0) == QUIZ_WEIGHT_NEW * 1.0


# ---------- 服务集成（隔离库） ----------

@pytest.fixture()
def iso_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.db.quiz_repo as qr_mod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(qr_mod, "_quiz_repo", qr_mod.QuizRepo(db=client), raising=False)
    # 种子对话行 + 既有画像分（读改写加键的他键保全验证字段）
    client.execute(
        "INSERT INTO dialogues(id,project_id,session_id,name,profile) "
        "VALUES(%s,'pX','sX','对话Q',%s)",
        ("dQ", json.dumps({"level_score": 0.5, "用户背景": "背景Y"})))
    return client


def _ans(correct: bool, i: int = 0):
    return {"question_id": f"q{i}", "kp_tag": "角动量", "correct": correct}


def test_apply_quiz_feedback_updates_level_score(iso_env):
    client = iso_env
    answers = [_ans(True, i) for i in range(6)] + [_ans(False, i) for i in range(6, 10)]
    out = apply_quiz_feedback("dQ", "pX", answers)   # 近窗正确率 0.6（窗口10全中）
    assert out["saved"] == 10 and out["accuracy"] == 0.6
    expected = round(QUIZ_WEIGHT_NEW * 0.6 + QUIZ_WEIGHT_OLD * 0.5, 4)
    prof = load_profile_cache("dQ")
    assert abs(prof["level_score"] - expected) < 1e-6
    assert "答题反馈" in prof["level_evidence"]
    assert prof["用户背景"] == "背景Y"  # 加键写回他键保全


def test_recent_accuracy_window_limits_to_last_10(iso_env):
    from core.db.quiz_repo import get_quiz_repo
    client = iso_env
    apply_quiz_feedback("dQ", "pX", [_ans(False, i) for i in range(12)])  # 先灌12错
    apply_quiz_feedback("dQ", "pX", [_ans(True, i) for i in range(4)])    # 再4对→近窗10含4对6错
    agg = get_quiz_repo().recent_accuracy("dQ", limit=10)
    assert agg == {"total": 10, "correct": 4, "accuracy": 0.4}


# ---------- 端到端端点 ----------

def test_quiz_submit_endpoint(iso_env, monkeypatch):
    client = iso_env
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.background as bgmod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)

    import main as _main
    body = {"dialogue_id": "dQ", "project_id": "pX",
            "answers": [{"question_id": "q1", "kp_tag": "角动量", "correct": True},
                        {"question_id": "q2", "kp_tag": "角动量", "correct": True}]}
    with fastapi.testclient.TestClient(_main.app) as tc:
        r = tc.post("/api/quiz/submit", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["saved"] == 2 and data["accuracy"] == 1.0
    assert data["new_score"] is not None and data["new_score"] > data["old_score"]
