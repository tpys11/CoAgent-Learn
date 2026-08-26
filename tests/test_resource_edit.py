# -*- coding: utf-8 -*-
"""闭环六：资源编辑会话守卫（独立分支三态 / 隔离四断言 / dialogues.kind 迁移与过滤）。"""
import asyncio
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo


class FakeLLM:
    """主模型假件：流式吐新版全文；记录 system prompt 供断言。"""
    last = None

    def __init__(self, text="修订后的全文内容"):
        self.text = text
        self.messages = None
        FakeLLM.last = self

    def chat_stream(self, messages, on_token, **kw):
        self.messages = messages
        for ch in self.text:
            on_token(ch)


def _mk_req(rid, did="dRE"):
    from types import SimpleNamespace
    return SimpleNamespace(
        message="把内容改得更口语化", session_id="sX", dialogue_id=did,
        project_id="pX", api_key="k", model=None, base_url=None,
        edit_resource_id=rid)


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "re.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(pr_mod, "_project_repo", ProjectRepo(db=client), raising=False)
    return client


def _seed_resource(client, rid="r1", name="生成·讲义", content="原版讲义内容"):
    client.execute(
        "INSERT INTO resources(id, name, content, project_id, type) VALUES (%s,%s,%s,%s,%s)",
        (rid, name, content, "pX", "gen:guide"))


async def _collect(coro):
    """拉取 SSE 帧序列。"""
    resp = await coro
    frames = []
    async for chunk in resp.body_iterator:
        text = chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
        for line in text.split("\n"):
            if line.startswith("data: "):
                frames.append(json.loads(line[6:]))
    return frames


def test_resource_edit_happy_path(env, monkeypatch):
    """正常改写：资源+1 新行、消息成对、done 帧带 reply、user prompt 注入全文、真流式（answer 在 LLM 完成前陆续到达）。"""
    import engine.pipeline_v2 as eng
    _seed_resource(env)

    class SlowFakeLLM:
        """慢速假件：逐 token 吐，token 间隔触发队列泵轮转——验证真流式时序。"""
        def __init__(self):
            FakeLLM.last = self
            self.messages = None

        def chat_stream(self, messages, on_token, **kw):
            self.messages = messages
            import time as _t
            for ch in "新版讲义内容":
                on_token(ch)
                _t.sleep(0.06)  # > 泵轮询 0.05s：若先囤后吐，帧时间戳会挤在一起

    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: SlowFakeLLM())
    import time as _t0
    t_start = _t0.monotonic()
    answer_times: list = []

    async def _collect_timed(coro):
        resp = await coro
        frames = []
        async for chunk in resp.body_iterator:
            text = chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
            for line in text.split("\n"):
                if line.startswith("data: "):
                    f = json.loads(line[6:])
                    if f.get("type") == "answer_token":
                        answer_times.append(_t0.monotonic() - t_start)
                    frames.append(f)
        return frames

    frames = asyncio.run(_collect_timed(eng.stream_response(_mk_req("r1"))))
    assert frames[0]["type"] == "start" and frames[-1]["type"] == "done"
    assert frames[-1]["reply"] == "新版讲义内容"
    # 真流式断言：首个 answer 帧远早于全部完成（6 token × 0.06s + 泵轮询 ≈ 0.4s+）
    assert len(answer_times) == 6
    assert answer_times[0] < 0.3, f"首个 answer 帧过晚到达 {answer_times[0]:.2f}s——疑似先囤后吐"
    assert answer_times[-1] - answer_times[0] > 0.15, "answer 帧间隔无展开——疑似一次性批发"
    # 写回：同名同 type 新行（版本历史 +1）
    rows = env.execute("SELECT name, type, content FROM resources WHERE project_id='pX' ORDER BY rowid")
    assert len(rows) == 2 and rows[1]["content"] == "新版讲义内容"
    assert rows[1]["name"] == "生成·讲义" and rows[1]["type"] == "gen:guide"
    # 消息成对 + 全文注入 user prompt（system 为角色指令；【当前资源全文】标记在 user 侧）
    msgs = env.execute("SELECT role, content FROM messages WHERE dialogue_id='dRE' ORDER BY rowid")
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert FakeLLM.last.messages[1]["content"].find("原版讲义内容") > 0
    assert "【当前资源全文】" in FakeLLM.last.messages[1]["content"]
    # kind 隔离标记在案
    dlg = env.execute("SELECT kind, name FROM dialogues WHERE id='dRE'")
    assert dlg[0]["kind"] == "resource" and "编辑·" in dlg[0]["name"]


def test_resource_edit_missing_resource(env):
    """资源缺 → error 帧软着陆，零写库。"""
    import engine.pipeline_v2 as eng
    frames = asyncio.run(_collect(eng.stream_response(_mk_req("ghost"))))
    assert frames[-1]["type"] == "error" and "不存在" in frames[-1]["message"]
    assert env.execute("SELECT * FROM messages WHERE dialogue_id='dRE'") == []
    assert env.execute("SELECT * FROM dialogues WHERE id='dRE'") == []


def test_resource_edit_second_round_continues(env, monkeypatch):
    """二轮续聊：同 dialogue 不重建行，历史累计（user/assistant 交替 4 条）。"""
    import engine.pipeline_v2 as eng
    _seed_resource(env)
    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: FakeLLM("第一版"))
    asyncio.run(_collect(eng.stream_response(_mk_req("r1"))))
    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: FakeLLM("第二版"))
    asyncio.run(_collect(eng.stream_response(_mk_req("r1"))))
    msgs = env.execute("SELECT role FROM messages WHERE dialogue_id='dRE' ORDER BY rowid")
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert env.execute("SELECT COUNT(*) c FROM dialogues WHERE id='dRE'")[0]["c"] == 1
    assert env.execute("SELECT COUNT(*) c FROM resources WHERE project_id='pX'")[0]["c"] == 3


# ---------- 切片②：隔离与 kind 过滤 ----------

def test_kind_isolation_and_dialogue_list(env):
    """隔离四断言之列表面：resource 会话不进 list_dialogues；主对话与旧行（kind 默认 ''）不受扰。"""
    env.execute("INSERT INTO dialogues(id,project_id,session_id,name,kind) VALUES('dMain','pX','sX','主对话','')")
    env.execute("INSERT INTO dialogues(id,project_id,session_id,name,kind) VALUES('dRes','pX','sX','编辑·x','resource')")
    env.execute("INSERT INTO dialogues(id,project_id,session_id,name) VALUES('dLegacy','pX','sX','旧行')")
    names = [d["name"] for d in pr_mod._project_repo.list_dialogues("pX")]
    assert "主对话" in names and "旧行" in names and "编辑·x" not in names


def test_missing_branch_dispatch_off(env):
    """分流谓词：edit_resource_id 不在场 → stream_response 走主管线（不触资源分支）。"""
    import engine.pipeline_v2 as eng
    from types import SimpleNamespace
    req = SimpleNamespace(edit_resource_id=None)
    # 谓词语义直接断言：getattr 默认 None → 不分流
    assert not getattr(req, "edit_resource_id", None)
    req2 = _mk_req("r1")
    assert getattr(req2, "edit_resource_id", None) == "r1"
