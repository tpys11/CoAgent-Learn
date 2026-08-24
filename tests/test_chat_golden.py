# -*- coding: utf-8 -*-
"""闭环C·SSE 黄金序列：假 workflow 注入真实 /api/chat，锁定 SSE 线格式。

用途：闭环D 拆解前后逐字节对比，防止结构性重构漂移协议；此后任何流式改动跑此测试即知契约是否破坏。

隔离策略（四点，全部 monkeypatch，绝不触碰真实 data/app.db）：
  1. SQLITE_DIR 在导入 main 前指向临时目录（base.py 导入期解析）
  2. get_db 单例与 postgres_client.pg_client 重指临时库（run_workflow 内函数级导入在调用时绑定）
  3. core.background.submit 置空——后台持久化/记忆蒸馏线程全部静默（本测试只锁线格式）
  4. suggest_special_forms 置空 + 假结果 complexity=simple 绕开真实 LLM

再生成黄金文件：GOLDEN_REGEN=1 python -m pytest tests/test_chat_golden.py -q
"""
import json
import os
import pathlib
import sys

import pytest

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# 注意：不得在模块级设置 SQLITE_DIR——pytest 按字母序本文件最先收集，
# 进程级环境污染会让后续测试（test_db_path 默认锚定断言等）失真。隔离全部在 fixture 内完成。

import fastapi.testclient  # noqa: E402

GOLDEN_PATH = pathlib.Path(__file__).parent / "golden" / "sse_frames.json"


@pytest.fixture()
def isolated_app(tmp_path, monkeypatch):
    """返回已隔离的 FastAPI app；每个用例独立临时库。main 在环境就绪后首次导入。"""
    tmpdb = tmp_path / "iso.db"
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.background as bgmod

    client = base_mod.SQLiteClient(str(tmpdb))
    client.init_tables()
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)

    import main as main_mod
    monkeypatch.setattr(main_mod, "suggest_special_forms", lambda *a, **k: [])

    def fake_create_workflow(api_key, settings, on_token, model=None, base_url=None,
                             agents=None, on_answer=None, cancel_event=None, on_subagent=None):
        class _WF:
            def invoke(self, state):
                # 确定性发射：step 自动去重 + thought token + subagent 信封三事件 + answer 两段
                on_token("学习助手·规划", "规划思考第一段")
                on_token("学习助手·规划", "续")           # 同 agent 不重复 step
                on_token("知识库管理", "检索中")
                on_subagent({"type": "start", "run_id": "runX", "agent": "知识库管理", "title": "检索"})
                on_subagent({"type": "delta", "run_id": "runX", "text": "增量"})
                on_subagent({"type": "end", "run_id": "runX", "status": "ok", "summary": "完成"})
                if on_answer:
                    on_answer("黄金回答")
                    on_answer("第二段")
                return {
                    "final_reply": "黄金回答内容",
                    "steps": [{"agent": "学习助手·规划", "status": "done", "detail": "d"}],
                    "mindchain": [
                        {"agent": "学习助手·规划", "content": "规划思考第一段续"},
                        {"agent": "知识库管理", "content": "检索中", "run_ids": ["runX"]},
                    ],
                    "task_stats": {"plan": {"ms": 12, "llm_calls": 1}},
                    "complexity": "simple",
                }
        return _WF()

    monkeypatch.setattr("agents.graph.create_workflow", fake_create_workflow)

    import main as _main  # SQLITE_DIR 已就位，首次导入在此发生
    monkeypatch.setattr(_main, "suggest_special_forms", lambda *a, **k: [])
    return _main.app


def _capture_frames(app, body):
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line.startswith("data: "):
                continue
            f = json.loads(line[6:])
            if f.get("type") == "heartbeat":
                continue  # 心跳条数随调度抖动，不纳入黄金序列
            if f.get("type") == "start":
                f["request_id"] = "<RID>"
            frames.append(f)
    return frames


def _body():
    return {"message": "普通消息无括号", "api_key": "dummy-key", "project_id": "p-golden",
            "dialogue_id": "d-golden", "session_id": "s-golden",
            "settings": {"template": "基础"}}


def test_sse_golden_sequence(isolated_app, monkeypatch):
    frames = _capture_frames(isolated_app, _body())
    assert frames, "未捕获到任何 SSE 帧"
    assert frames[-1]["type"] == "done", "序列必须以 done 收尾"
    if os.environ.get("GOLDEN_REGEN"):
        GOLDEN_PATH.parent.mkdir(exist_ok=True)
        GOLDEN_PATH.write_text(json.dumps(frames, ensure_ascii=False, indent=1), encoding="utf-8")
        pytest.skip(f"黄金文件已再生 {GOLDEN_PATH}")
        return
    assert GOLDEN_PATH.exists(), "缺少黄金文件：先以 GOLDEN_REGEN=1 生成并提交"
    golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    for i, (g, a) in enumerate(zip(golden, frames)):
        assert g == a, f"第{i}帧偏离黄金序列：\n golden={json.dumps(g, ensure_ascii=False)}\n actual={json.dumps(a, ensure_ascii=False)}"
    assert len(golden) == len(frames), (
        f"帧数不一致 golden={len(golden)} actual={len(frames)}\n"
        f"golden尾部={json.dumps(golden[len(frames)-1:len(frames)+3], ensure_ascii=False)}")
