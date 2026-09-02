# -*- coding: utf-8 -*-
"""RC2-S2 规划节点流式先行——删 is_rule_simple 规则短路（owner 裁定 09-02）。

R1 规则短路已删：短消息（原 is_rule_simple=True 直达 simple_direct）现也经
   classify_intent LLM 真实分析，规划节点有思考文本可流式（钉在行为层：
   把 classify_intent 调用改回规则短路，本测试红）。
R2 simple_direct 不虚发：LLM 判 simple_direct 且无思考前缀 → 规划节点只有
   _plan_pt 要点一行，不编造深度思考（owner 语义：先行思考=真实分析过程）。
R3 先行序列：规划思考 token 先于任何生成 token（「规划节点先动」的时序钉）。

plan_thinking 流式发射+双写本身为 RB-S4 既有实现（test_rb_s4_thickening R3 已钉
流式事件与 done.mindchain 双写一致），本文件不重复。

隔离策略：test_rb_s4_* 同款四点进程内隔离，零触碰真实库（T49）。
T33：engine.pipeline_v2 / main 一律延迟到 fixture 执行期导入。
"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from tests._engine_helpers import RoutingFastLLM


class ThinkingFastLLM(RoutingFastLLM):
    """意图分类器带思考前缀（standard 档）——classify_intent 产出非空 plan_thinking。"""

    PROMPTS = {"意图分类器": '用户询问原理类问题，需判断检索与深度。\n{"complexity": "standard"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [1, 0]}'}


class SimpleDirectFastLLM(RoutingFastLLM):
    """意图分类器无思考前缀且判 simple_direct——plan_thinking 为空的路径。"""

    PROMPTS = {"意图分类器": '{"complexity": "simple_direct"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [1, 0]}'}


class ProbeLLM:
    def __init__(self, api_key=None, model=None, base_url=None, **kw):
        self.messages = None

    def chat_stream(self, messages, on_token, **kw):
        self.messages = messages
        if kw.get("on_content"):
            kw["on_content"]("合成回答内容")


@pytest.fixture()
def v2_env(tmp_path, monkeypatch, request):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.db.eval_repo as er_mod
    import core.background as bgmod
    import engine.retrieve as rt

    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(er_mod, "_eval_repo", er_mod.EvalRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)
    monkeypatch.setattr(rt, "_web_search",
                        lambda q: [{"title": f"WEB-{q}", "url": f"https://web.example/{q}",
                                    "content": "网页内容"}])
    monkeypatch.setattr(rt, "_kb_search",
                        lambda q, pid: [{"title": f"KB-{q}", "url": f"kb://{q}",
                                         "content": "库内内容",
                                         "metadata": {"source": "测试文档A.pdf", "chunk": 3}}])

    fast_cls = request.param if hasattr(request, "param") else ThinkingFastLLM
    import engine.pipeline_v2 as eng
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast_cls())
    monkeypatch.setattr(eng, "_make_llm",
                        lambda req, model_override=None: ProbeLLM(
                            api_key="d", model=model_override or req.model or "m",
                            base_url=req.base_url))
    import engine.review as rv_mod
    monkeypatch.setattr(rv_mod, "pick_judge_llm", lambda template, req: None)

    import main as _main
    return _main.app, eng


def _run(app, body):
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        for line in resp.iter_lines():
            if line.startswith("data: "):
                f = json.loads(line[6:])
                if f.get("type") != "heartbeat":
                    frames.append(f)
    return frames


def _plan_thought(frames):
    return [f for f in frames
            if f.get("type") == "thought_token" and f.get("agent") == "学习助手·规划"]


@pytest.mark.parametrize("v2_env", [ThinkingFastLLM], indirect=True)
def test_short_message_still_gets_llm_thinking(v2_env):
    """R1（worker 级）：短消息（原 is_rule_simple→True）不再被规则短路——
    规划节点流式出 classify_intent 的真实分析文本。"""
    app, _eng = v2_env
    frames = _run(app, {"message": "你好", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dRC22a",
                        "session_id": "sX",
                        "settings": {"template": "思考", "reviewEnabled": True}})
    plan = _plan_thought(frames)
    joined = "".join(f.get("chunk") or "" for f in plan)
    assert "需判断检索与深度" in joined, (
        "短消息也须有 LLM 规划思考流式（is_rule_simple 规则短路已删，owner 裁定）")


@pytest.mark.parametrize("v2_env", [SimpleDirectFastLLM], indirect=True)
def test_llm_simple_direct_no_fake_thinking(v2_env):
    """R2（worker 级）：LLM 判 simple_direct 且无思考 → 规划节点只有要点一行，不虚发。"""
    app, _eng = v2_env
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dRC22b",
                        "session_id": "sX",
                        "settings": {"template": "思考", "reviewEnabled": True}})
    plan = _plan_thought(frames)
    joined = "".join(f.get("chunk") or "" for f in plan)
    assert "规划要点" in joined, "要点摘要照旧"
    assert "需判断检索与深度" not in joined, "无思考不得编造（simple 路径不虚发）"
    assert not any(f.get("event") for f in frames if f.get("type") == "subagent"), (
        "simple_direct 不检索（无观察窗事件）")
    done = frames[-1]
    kb_items = [it for it in (done.get("mindchain") or [])
                if it.get("agent") == "知识库管理"]
    assert not kb_items, "simple_direct 无检索条目"


@pytest.mark.parametrize("v2_env", [ThinkingFastLLM], indirect=True)
def test_plan_thinking_streams_before_generation(v2_env):
    """R3（worker 级）：规划思考 token 先于任何生成 token（「规划节点先动」时序钉）。"""
    app, _eng = v2_env
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dRC22c",
                        "session_id": "sX",
                        "settings": {"template": "思考", "reviewEnabled": True}})
    plan_idx = next((i for i, f in enumerate(frames)
                     if f.get("type") == "thought_token"
                     and f.get("agent") == "学习助手·规划"), None)
    gen_idx = next((i for i, f in enumerate(frames)
                    if f.get("type") == "answer_token"), None)
    assert plan_idx is not None, "规划节点须有思考 token"
    assert gen_idx is not None, "前置：生成 token 存在"
    assert plan_idx < gen_idx, "规划思考必须先于生成流式（先行语义）"
