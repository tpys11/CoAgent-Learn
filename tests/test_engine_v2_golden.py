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

GOLDEN_PATH = pathlib.Path(__file__).parent / "golden" / "sse_frames_v2.json"


class FakeLLM:
    """替代 DeepSeekLLM：chat_stream 以 on_content 吐出定值回答。"""
    last_instance = None

    def __init__(self, api_key=None, model=None, base_url=None, **kw):
        self.api_key = api_key
        self.model = model
        FakeLLM.last_instance = self

    def chat_stream(self, messages, on_token, temperature=0.7, on_content=None,
                    cancel_event=None, on_reasoning=None):
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
    monkeypatch.setattr(eng, "_make_llm", lambda req: FakeLLM(
        api_key="dummy", model=req.model or "test-model", base_url=req.base_url))

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


def test_default_engine_is_v1_and_skips_v2_seam(isolated_app, monkeypatch):
    """CHAT_ENGINE 缺省 → 走 v1 旧路径；v2 模型接缝若被触碰立即失败。"""
    monkeypatch.delenv("CHAT_ENGINE", raising=None)
    app = isolated_app

    def _boom(req):
        raise AssertionError("默认模式不应触碰 v2 引擎接缝")

    import engine.pipeline_v2 as eng
    monkeypatch.setattr(eng, "_make_llm", _boom)
    frames = _capture(app, _body())
    assert frames and frames[-1]["type"] in {"done", "error"}, "v1 路径应正常产出终止帧"


def test_engine_mode_default():
    import importlib
    import engine.pipeline_v2 as eng
    old = os.environ.pop("CHAT_ENGINE", None)
    try:
        importlib.reload(eng)
        assert eng.engine_mode() == "v1"
    finally:
        if old is not None:
            os.environ["CHAT_ENGINE"] = old
        importlib.reload(eng)
