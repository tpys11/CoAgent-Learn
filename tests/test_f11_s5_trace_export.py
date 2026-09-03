# -*- coding: utf-8 -*-
"""F11-S5 协同决策中间数据导出（TDD 红基线）。

派发单 §S5（owner 拍板附加，服务赛题测试数据包）：
GET /api/chat/{dialogue_id}/trace-export → 可下载 JSON，五类数据齐备：
  ①对话消息（含 think 持久化的检索命中预览/审核结论全文）
  ②agent 步骤事件（eval_traces 全量 stage trace）
  ③检索 query/命中（retrieve stage digest 解析 + 消息 think 的命中预览全文）
  ④审核过程与结论（review stage digest + 消息 think 的审核条目全文）
  ⑤subagent_runs 运行记录 + 最终生成资源（project 级关联，口径在 payload 注明）
纯只读聚合：零 schema 变更、T50 领地只读不碰写路径。
T33：main / pipeline 延迟到 fixture 执行期导入。
"""
import json

import pytest
from core.db.base import SQLiteClient
from core.db.project_repo import ProjectRepo
import fastapi.testclient


@pytest.fixture()
def export_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.db.eval_repo as er_mod
    import core.background as bgmod

    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(er_mod, "_eval_repo", er_mod.EvalRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)

    # ---- 造一次真实形状的对话数据（五类各就位） ----
    DID, PID = "dExp", "pExp"
    client.execute(
        "INSERT INTO dialogues(id,project_id,session_id,name) VALUES(%s,%s,%s,%s)",
        (DID, PID, "sX", "导出实验对话"))
    think = json.dumps([
        {"agent": "学习助手·规划", "content": "规划要点：复杂度 standard · 研究档 · 需检索知识库"},
        {"agent": "知识库管理",
         "content": "**检索查询**：`qA`、`qB`\n**命中预览**：\n1. 测试文档A.pdf #chunk-3（融合分 0.0328）：库内内容"},
        {"agent": "审核", "content": "✅ 审核通过 · 92分\n断言支撑 15/15"},
    ], ensure_ascii=False)
    client.execute(
        "INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",
        (DID, "user", "请讲解RAG"))
    client.execute(
        "INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)",
        (DID, "assistant", "合成回答内容", think))
    er = er_mod.EvalRepo(db=client)
    er.insert_traces("reqX", DID, PID, "研究", [
        {"stage": "plan", "input_digest": "请讲解RAG", "output_digest": '{"complexity": "standard"}',
         "metrics_json": "{}", "elapsed_ms": 10},
        {"stage": "retrieve", "input_digest": "请讲解RAG",
         "output_digest": json.dumps({"kept": 2, "queries": ["qA", "qB"], "raw_count": 9, "rounds": 1}),
         "metrics_json": "{}", "elapsed_ms": 120},
        {"stage": "review", "input_digest": "", "output_digest": "{}",
         "metrics_json": json.dumps({"passed": True, "score": 92, "claims_total": 15,
                                     "unsupported": 0, "by_diag": {"hallucination": 0,
                                                                   "retrieval_gap": 0, "no_evidence": 0},
                                     "skipped": False}),
         "elapsed_ms": 300},
    ])
    from core.db.subagent_repo import SubAgentRepo
    sa = SubAgentRepo(db=client)
    sa.insert_run("rExp1", project_id=PID, dialogue_id=DID, agent="知识库管理",
                  title="🛰 检索观察窗", input_text="请讲解RAG")
    sa.append_event("rExp1", {"t": "2026-08-31T04:00:00", "type": "start", "title": "🛰 检索观察窗"})
    sa.finish_run("rExp1", status="ok", output="候选 9 → 留存 2")
    client.execute(
        "INSERT INTO resources(id,name,content,project_id,type) VALUES(%s,%s,%s,%s,%s)",
        ("resExp1", "生成资源A", "资源内容", PID, "text"))

    import main as _main
    return _main.app, client, DID, PID


def test_trace_export_five_sections(export_env):
    """主验收：JSON 可解析 + 五类数据齐备 + attachment 头。"""
    app, _client, DID, _PID = export_env
    with fastapi.testclient.TestClient(app) as tc:
        resp = tc.get(f"/api/chat/{DID}/trace-export")
    assert resp.status_code == 200, resp.text
    assert "attachment" in resp.headers.get("content-disposition", ""), "必须是下载附件头"
    payload = json.loads(resp.content.decode("utf-8"))  # 可解析
    assert payload["dialogue"]["id"] == DID
    # ① 对话消息（assistant think 已解析为对象数组）
    roles = [m["role"] for m in payload["messages"]]
    assert roles == ["user", "assistant"]
    asst = payload["messages"][1]
    assert isinstance(asst["think"], list) and asst["think"][2]["agent"] == "审核"
    # ② agent 步骤事件（eval_traces 全量）
    stages = [t["stage"] for t in payload["agent_traces"]]
    assert stages == ["plan", "retrieve", "review"]
    # ③ 检索 query/命中（queries 来自 retrieve trace digest；命中预览全文来自消息 think）
    assert payload["retrieval"][0]["queries"] == ["qA", "qB"]
    assert payload["retrieval"][0]["kept"] == 2 and payload["retrieval"][0]["raw_count"] == 9
    assert any("测试文档A.pdf" in (p or "") for p in payload["retrieval_hit_previews"]), \
        "命中预览全文须从消息 think 提取"
    # ④ 审核过程与结论
    assert payload["review"][0]["score"] == 92 and payload["review"][0]["passed"] is True
    assert any("审核通过 · 92分" in c for c in payload["review_conclusions"]), "审核结论全文须提取"
    # ⑤ subagent_runs + 资源
    run = payload["subagent_runs"][0]
    assert run["id"] == "rExp1" and run["status"] == "ok"
    assert isinstance(run["events"], list) and run["events"][0]["type"] == "start"
    assert any(r["id"] == "resExp1" for r in payload["resources"])


def test_trace_export_404_on_unknown_dialogue(export_env):
    app, _client, _DID, _PID = export_env
    with fastapi.testclient.TestClient(app) as tc:
        resp = tc.get("/api/chat/dNope/trace-export")
    assert resp.status_code == 404
    assert resp.json()["status"] == "error"
