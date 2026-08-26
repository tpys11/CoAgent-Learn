# -*- coding: utf-8 -*-
"""闭环 Loop1 · v2 引擎骨架黄金序列。
验证：CHAT_ENGINE=v2 时纯生成对话走新管线，帧型合法、以 done 收尾；
CHAT_ENGINE 缺省时走 v1 旧路径且不触碰 v2 模型接缝。
隔离策略与 test_chat_golden 相同（四点进程内隔离，零触碰真实库）。"""
import json
import os
import pathlib
import sys

import pytest

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import fastapi.testclient  # noqa: E402

from tests._engine_helpers import RoutingFastLLM, ScriptedLLM

GOLDEN_PATH = pathlib.Path(__file__).parent / "golden" / "sse_frames_v2.json"


class FakeLLM:
    """替代 DeepSeekLLM：chat_stream 以 on_content 吐出定值回答，并捕获 messages 供指令断言。"""
    last_instance = None

    def __init__(self, api_key=None, model=None, base_url=None, **kw):
        self.api_key = api_key
        self.model = model
        self.messages = None
        FakeLLM.last_instance = self

    def chat_stream(self, messages, on_token, temperature=0.7, on_content=None,
                    cancel_event=None, on_reasoning=None):
        self.messages = messages
        assert messages[0]["role"] == "system"
        assert "学习助手" in messages[0]["content"]
        for piece in ["黄金回答内容"]:
            if cancel_event is not None and cancel_event.is_set():
                return
            if on_content:
                on_content(piece)


@pytest.fixture()
def isolated_app(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.background as bgmod

    client = base_mod.SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)

    import engine.pipeline_v2 as eng
    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: FakeLLM(
        api_key="dummy", model=model_override or req.model or "test-model",
        base_url=req.base_url))
    # 快模型接缝默认给一条学情评估响应（极速档/规则simple路径不会消费）
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: ScriptedLLM(
        ['{"level_score": 0.8, "evidence": "ok"}']))

    import main as _main  # SQLITE_DIR 已就位后再导入应用
    return _main.app


def _capture(app, body):
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            f = json.loads(line[6:])
            if f.get("type") == "heartbeat":
                continue
            if f.get("type") == "start":
                f["request_id"] = "<RID>"
            frames.append(f)
    return frames


def _body():
    return {"message": "普通消息无括号", "api_key": "dummy-key", "project_id": "p-v2",
            "dialogue_id": "d-v2", "session_id": "s-v2", "settings": {}}


def test_v2_golden_sequence(isolated_app, monkeypatch):
    monkeypatch.setenv("CHAT_ENGINE", "v2")
    app = isolated_app
    frames = _capture(app, _body())
    assert frames, "未捕获到任何 SSE 帧"
    types = [f["type"] for f in frames]
    assert types[0] == "start" and types[-1] == "done"
    assert "step" in types and "answer_token" in types
    assert all(t in {"start", "heartbeat", "step", "thought_token",
                     "answer_token", "subagent", "done", "error"} for t in types)
    done = frames[-1]
    assert done["reply"] == "黄金回答内容"
    assert done["special_suggestions"] == [] and done["retrieved_images"] == []
    if os.environ.get("GOLDEN_REGEN"):
        GOLDEN_PATH.parent.mkdir(exist_ok=True)
        GOLDEN_PATH.write_text(json.dumps(frames, ensure_ascii=False, indent=1), encoding="utf-8")
        pytest.skip("v2 黄金文件已再生")
        return
    assert GOLDEN_PATH.exists(), "缺少 v2 黄金文件：先 GOLDEN_REGEN=1 再生成提交"
    golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    for i, (g, a) in enumerate(zip(golden, frames)):
        assert g == a, f"第{i}帧偏离：\n golden={json.dumps(g, ensure_ascii=False)}\n actual={json.dumps(a, ensure_ascii=False)}"
    assert len(golden) == len(frames)


def test_default_engine_is_v2():
    """缺省（未设 CHAT_ENGINE）→ 新引擎 v2 为主；显式 v1 才回退旧路径。"""
    import importlib
    import engine.pipeline_v2 as eng
    old = os.environ.pop("CHAT_ENGINE", None)
    try:
        importlib.reload(eng)
        assert eng.engine_mode() == "v2"
    finally:
        if old is not None:
            os.environ["CHAT_ENGINE"] = old
        importlib.reload(eng)


def test_v2_memory_edit_branch_short_circuit(isolated_app, monkeypatch):
    """[模块名] 记忆修改分支：短路 done，不进入生成管线。"""
    monkeypatch.setenv("CHAT_ENGINE", "v2")
    app = isolated_app
    import services.memory_edit as me_mod
    monkeypatch.setattr(me_mod, "memory_edit",
                        lambda api_key, message, pid, session_id="": {
                            "reply": "✅ 已更新记忆模块「学习目标」",
                            "steps": [{"agent": "记忆管理", "status": "done", "detail": "更新"}]})
    import engine.pipeline_v2 as eng
    constructed = []
    base_make = eng._make_llm

    def _spy(req, model_override=None):
        constructed.append(1)
        return base_make(req, model_override)

    monkeypatch.setattr(eng, "_make_llm", _spy)

    frames = _capture(app, {"message": "[学习目标] 改成掌握RAG", "api_key": "d",
                            "project_id": "p-v2", "dialogue_id": "d-v2",
                            "session_id": "s-v2", "settings": {}})
    types = [f["type"] for f in frames]
    assert types[0] == "start" and types[-1] == "done"
    assert not any(f["type"] == "step" and f.get("agent") == "学习助手·生成"
                   for f in frames), "记忆分支不应进入生成阶段"
    assert constructed == [], "生成模型不应被触碰"
    done = frames[-1]
    assert "已更新记忆模块" in done["reply"]


def test_v2_strategy_directive_flow(isolated_app, monkeypatch):
    """Loop3·非简单消息全链：Plan分类→Assess评分→T路由②→指令注入生成system。
    思考档模式权威检索：知识库管理步必然存在。"""
    monkeypatch.setenv("CHAT_ENGINE", "v2")
    app = isolated_app
    body = {"message": "请讲解RAG的原理与应用", "api_key": "dummy-key",
            "project_id": "p-v2", "dialogue_id": "d-v2", "session_id": "s-v2",
            "settings": {}}
    import engine.pipeline_v2 as eng
    import engine.retrieve as rt_mod
    fast = RoutingFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)
    # 检索源定值化（防真实网络）：2查询×2条web + 1条kb = 5候选 ≤ keep6 → 筛选早退
    monkeypatch.setattr(rt_mod, "_web_search",
                        lambda q: [{"title": "web-" + q + "-a", "content": "wc"},
                                   {"title": "web-" + q + "-b", "content": "wc"}])
    monkeypatch.setattr(rt_mod, "_kb_search",
                        lambda q, pid: [{"title": "kb-" + q, "content": "kc"}])

    frames = _capture(app, body)
    steps = [f.get("agent") for f in frames if f["type"] == "step"]
    assert steps == ["学习助手·规划", "学情与记忆管理", "知识库管理", "学习助手·生成"]

    foot = [f for f in frames if f["type"] == "thought_token" and f.get("agent") == "输出策略"]
    assert len(foot) == 1 and foot[0]["chunk"].startswith("②用户语域 T=0.81"), foot

    main_llm = FakeLLM.last_instance
    sys_text = main_llm.messages[0]["content"]
    assert "【输出策略指令】" in sys_text and "贴合用户当前" in sys_text
    done = frames[-1]
    assert done["type"] == "done" and done["reply"] == "黄金回答内容"

    # 快模型三消费者全部命中路由前缀（分类/评估/查询规划；候选≤keep时筛选早退不调用）
    assert len(fast.calls) == 3
