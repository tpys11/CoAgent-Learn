# -*- coding: utf-8 -*-
"""学情匹配度报告聚合守卫（评估体系 §五 v1）：四要素拼装 + 端点冒烟。
种子：画像(薄弱点/强项/level_score)、assess Trace 三点、quiz 两个 kp、kb_tree 单源。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from services.match_report import build_match_report, color_tree


@pytest.fixture()
def iso_db(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.db.quiz_repo as qr_mod
    import core.db.kb_repo as kr_mod
    import core.db.eval_repo as er_mod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(qr_mod, "_quiz_repo", qr_mod.QuizRepo(db=client), raising=False)
    monkeypatch.setattr(kr_mod, "_kb_repo", kr_mod.KbRepo(db=client), raising=False)
    # eval_traces 懒建表：种子前先触发（单例同步重置，防沿用上一测试死库）
    monkeypatch.setattr(er_mod, "_eval_repo", er_mod.EvalRepo(db=client), raising=False)
    from core.db.eval_repo import get_eval_repo
    get_eval_repo()._ensure_table()

    # 画像：薄弱点+强项+当前分
    client.execute(
        "INSERT INTO dialogues(id,project_id,session_id,name,profile) VALUES(%s,%s,%s,%s,%s)",
        ("dR", "pR", "sX", "报告对话",
         json.dumps({"level_score": 0.72, "level_evidence": "术语准确",
                     "薄弱点": ["力学基础"], "强项": ["编程实践"]})))
    # assess Trace 三点（含一条越界脏数据应被滤掉）
    for i, sc in enumerate([0.5, 0.6, 1.3]):
        client.execute(
            "INSERT INTO eval_traces(request_id,project_id,stage,output_digest,created_at) "
            "VALUES(%s,'pR','assess',%s,%s)",
            (f"r{i}", json.dumps({"level_score": sc}), f"2026-08-26 0{i}:00:00"))
    return client


def test_trend_filters_out_of_range(iso_db):
    rep = build_match_report("pR", db=iso_db)
    assert [p["score"] for p in rep["trend"]] == [0.5, 0.6]  # 1.3 越界被滤
    assert rep["level_now"]["score"] == 0.72


def test_kp_accuracy_and_overall(iso_db):
    from core.db.quiz_repo import get_quiz_repo
    repo = get_quiz_repo()
    repo._ensured = False
    # 角动量：2/4=0.5 盲区；惯性定律：4/4 掌握
    repo.insert_many("dR", [{"question_id": f"a{i}", "kp_tag": "角动量", "correct": i < 2}
                            for i in range(4)])
    repo.insert_many("dR", [{"question_id": f"b{i}", "kp_tag": "惯性定律", "correct": True}
                            for i in range(4)])
    rep = build_match_report("pR", db=iso_db)
    m = {k["kp"]: k for k in rep["kp_accuracy"]}
    assert m["角动量"]["accuracy"] == 0.5 and m["惯性定律"]["accuracy"] == 1.0
    # 总分 = 加权均值 (2+4)/(4+4)=0.75 → 良好；basis=quiz
    assert rep["overall"] == {"score": 0.75, "label": "良好", "basis": "quiz"}
    # 派生盲区/掌握合并去重
    assert "角动量" in rep["weak_points"] and "力学基础" in rep["weak_points"]
    assert "惯性定律" in rep["strong_points"] and "编程实践" in rep["strong_points"]


def test_path_tree_coloring(iso_db):
    from core.db.quiz_repo import get_quiz_repo
    iso_db.execute(
        "INSERT INTO kb_tree(project_id,source,tree) VALUES('pR','讲义',%s)",
        (json.dumps([
            {"name": "角动量", "children": [{"name": "进阶推导"}]},
            {"name": "惯性定律"},
            {"name": "未涉章节"},
        ]),))
    repo = get_quiz_repo()
    repo.insert_many("dR", [{"question_id": "c1", "kp_tag": "角动量", "correct": True},
                            {"question_id": "c2", "kp_tag": "角动量", "correct": True}])
    rep = build_match_report("pR", db=iso_db)
    st = {n["name"]: n["status"] for n in rep["path_tree"]}
    assert st["角动量"] == "mastered"          # 本用例仅c1/c2全对 → acc=1.0 ≥0.85
    assert st["惯性定律"] == "untouched"       # 本用例没种惯性作答，仅树着色按 kp_map 缺席
    assert st["未涉章节"] == "untouched"
    child = next(n for n in rep["path_tree"] if n["name"] == "角动量")["children"][0]
    assert child["status"] == "untouched"      # 子节点名无命中不继承


def test_color_tree_pure_mapping():
    out = color_tree([{"name": "A", "children": [{"name": "B"}]}],
                     {"B": 0.9}, set(), set())
    assert out[0]["status"] == "untouched" and out[0]["children"][0]["status"] == "mastered"


def test_endpoint_smoke(iso_db, monkeypatch):
    client = iso_db
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.background as bgmod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)
    import main as _main
    with fastapi.testclient.TestClient(_main.app) as tc:
        r = tc.get("/api/report/match", params={"project_id": "pR", "dialogue_id": "dR"})
    assert r.status_code == 200
    body = r.json()
    assert {"overall", "trend", "kp_accuracy", "weak_points", "path_tree"} <= set(body)
    assert body["overall"]["basis"] in ("quiz", "level_score", "empty")
