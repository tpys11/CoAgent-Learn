# -*- coding: utf-8 -*-
"""闭环七：资源生成管线分支守卫——能力key前置校验零写库 / 阶段帧序 / difficulty自标落库 /
断言审核接线与重试环 / kind隔离。技能生成为同步调用 → 假件直接替换 services.resource_gen.generate_resource。"""
import asyncio
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
from tests._engine_helpers import ScriptedLLM


class GenFastLLM:
    """快模型假件：学情评估器/查询规划器/检索候选（chat_stream 前缀路由）+ 知识库蒸馏（chat 直答）。"""
    last = None

    def __init__(self):
        self.calls = []
        GenFastLLM.last = self

    def chat_stream(self, messages, on_token, **kw):
        s = messages[0]["content"]
        self.calls.append(s)
        if "学情评估器" in s:
            raw = '{"level_score": 0.7, "evidence": "术语准确"}'
        elif "查询规划器" in s:
            raw = '{"need_search": true, "queries": ["RAG 搭建步骤"], "decomposed": true}'
        elif "检索候选" in s:
            raw = '{"keep": [1, 0]}'
        else:
            raw = ""
        for ch in raw:
            on_token(ch)

    def chat(self, messages, temperature=0.7, max_tokens=None):
        self.calls.append(messages[0]["content"])
        return "- 要点甲：检索增强生成流程\n- 要点乙：向量库选型"


class FakeGen:
    """generate_resource 假件：记录入参，返回带 difficulty 注释的可配置正文。"""
    calls = []
    result = {"status": "ok", "content": "# RAG 实操指南\n步骤一：安装依赖 <!--difficulty:0.65-->"}

    def __call__(self, api_key, key, content, base_url=None, model=None):
        FakeGen.calls.append({"key": key, "content": content})
        return dict(FakeGen.result, key=key)


_PASS_CLAIMS = ('{"claims": [{"claim": "步骤一", "label": "supported", "confidence": 0.9, '
                '"reason": "证据支持", "diag": ""}], "instruction_ok": true, "instruction_note": ""}')
_FAIL_CLAIMS = ('{"claims": [{"claim": "步骤一是错的", "label": "unsupported", "confidence": 0.8, '
                '"reason": "证据说反了", "diag": "hallucination"}], "instruction_ok": true, '
                '"instruction_note": ""}')


def _mk_req(key="guide", did="dGEN", message="给我一份 RAG 搭建实操指南"):
    from types import SimpleNamespace
    return SimpleNamespace(
        message=message, session_id="sX", dialogue_id=did,
        project_id="pX", api_key="k", model=None, base_url=None,
        gen_resource=key, edit_resource_id=None)


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    client = SQLiteClient(str(tmp_path / "rg.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(pr_mod, "_project_repo", ProjectRepo(db=client), raising=False)
    return client


def _patch_chain(monkeypatch, judge_responses) -> ScriptedLLM:
    """接缝四件套：快模型假件 / 检索源定值化 / 技能生成假件 / 审核判卷假件。"""
    import engine.pipeline_v2 as eng
    import engine.retrieve as rt_mod
    import engine.review as rv_mod
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: GenFastLLM())
    monkeypatch.setattr(rt_mod, "_kb_search",
                        lambda q, pid: [{"title": "kb-" + q, "content": "kb 内容"}])
    monkeypatch.setattr(rt_mod, "_web_search",
                        lambda q: [{"title": "web-" + q, "content": "wc"}])
    monkeypatch.setattr("services.resource_gen.generate_resource", FakeGen())
    judge = ScriptedLLM(list(judge_responses))
    monkeypatch.setattr(rv_mod, "pick_judge_llm", lambda template, req: judge)
    return judge


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


def test_resource_gen_happy_path(env, monkeypatch):
    """正常生成：阶段帧齐、difficulty 解析剥离落库、done 收养三件套、消息成对、kind 隔离。"""
    import engine.pipeline_v2 as eng
    FakeGen.calls = []
    FakeGen.result = {"status": "ok",
                      "content": "# RAG 实操指南\n步骤一：安装依赖 <!--difficulty:0.65-->"}
    judge = _patch_chain(monkeypatch, [_PASS_CLAIMS])
    frames = asyncio.run(_collect(eng.stream_response(_mk_req())))
    types = [f["type"] for f in frames]
    assert types[0] == "start" and types[-1] == "done"
    steps = [f.get("agent") for f in frames if f["type"] == "step"]
    assert steps == ["学习助手·规划", "学情与记忆管理", "知识库管理", "学习助手·生成"]
    done = frames[-1]
    assert done["reply"] == "# RAG 实操指南\n步骤一：安装依赖"      # 注释已剥离
    assert done["difficulty"] == 0.65 and done["name"].startswith("给我一份")
    assert done["resource_id"] and done["review"]["passed"] is True
    assert done["review"]["skipped"] is False and done["review"]["issues"] == []
    rows = env.execute("SELECT name, type, content, difficulty FROM resources WHERE project_id='pX'")
    assert rows[0]["type"] == "gen:guide" and rows[0]["difficulty"] == 0.65
    assert "<!--difficulty" not in rows[0]["content"]
    dlg = env.execute("SELECT kind, name FROM dialogues WHERE id='dGEN'")
    assert dlg[0]["kind"] == "resource" and "生成·" in dlg[0]["name"]
    msgs = env.execute("SELECT role, content FROM messages WHERE dialogue_id='dGEN' ORDER BY rowid")
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    # 生成 prompt 合成契约：需求 + 画像学情(0.70) + 蒸馏要点 + 难度自标要求
    assert "【用户需求】" in FakeGen.calls[0]["content"] and "0.70" in FakeGen.calls[0]["content"]
    assert "要点甲" in FakeGen.calls[0]["content"] and "difficulty" in FakeGen.calls[0]["content"]
    # 审核参照系=原始检索块（非蒸馏摘要）：judge prompt 含 kb 内容与策略指令
    assert judge.calls and "kb 内容" in judge.calls[0]["messages"][0]["content"]
    assert "【输出策略指令·T=" in judge.calls[0]["messages"][0]["content"]


def test_resource_gen_unknown_key_zero_write(env):
    """能力 key 非法：前置校验 error 软着陆，零写库。"""
    import engine.pipeline_v2 as eng
    frames = asyncio.run(_collect(eng.stream_response(_mk_req(key="nonsense"))))
    assert frames[-1]["type"] == "error" and "未知能力" in frames[-1]["message"]
    assert env.execute("SELECT * FROM dialogues WHERE id='dGEN'") == []
    assert env.execute("SELECT * FROM messages WHERE dialogue_id='dGEN'") == []
    assert env.execute("SELECT * FROM resources WHERE project_id='pX'") == []


def test_resource_gen_review_retry(env, monkeypatch):
    """首轮虚构断言→审核不过→带反馈重生成→次轮通过：generate 调两次，done 为通过稿，资源仅 1 行。"""
    import engine.pipeline_v2 as eng
    FakeGen.calls = []
    FakeGen.result = {"status": "ok", "content": "# 指南\n修正稿"}
    _patch_chain(monkeypatch, [_FAIL_CLAIMS, _PASS_CLAIMS])
    frames = asyncio.run(_collect(eng.stream_response(_mk_req())))
    done = frames[-1]
    assert done["type"] == "done" and done["review"]["passed"] is True
    assert len(FakeGen.calls) == 2
    assert "【审核反馈·上一稿未通过】" in FakeGen.calls[1]["content"]
    assert "证据说反了" in FakeGen.calls[1]["content"]
    assert any("hallucination" in (f.get("chunk") or "")
               for f in frames if f["type"] == "thought_token")
    assert env.execute("SELECT COUNT(*) c FROM resources WHERE project_id='pX'")[0]["c"] == 1


def test_resource_gen_no_marker_difficulty_null(env, monkeypatch):
    """模型未自标难度：difficulty 落 NULL 不阻断，正文原样。"""
    import engine.pipeline_v2 as eng
    FakeGen.calls = []
    FakeGen.result = {"status": "ok", "content": "# 指南\n没有自标"}
    _patch_chain(monkeypatch, [_PASS_CLAIMS])
    frames = asyncio.run(_collect(eng.stream_response(_mk_req())))
    assert frames[-1]["difficulty"] is None
    assert env.execute("SELECT difficulty FROM resources WHERE project_id='pX'")[0]["difficulty"] is None


def test_gen_branch_dispatch_off(env):
    """分流谓词：gen_resource 不在场 → 不走生成分支（与闭环六谓词并列，编辑优先）。"""
    from types import SimpleNamespace
    req = SimpleNamespace(gen_resource=None, edit_resource_id=None)
    assert not getattr(req, "gen_resource", None) and not getattr(req, "edit_resource_id", None)
    assert getattr(_mk_req(), "gen_resource", None) == "guide"
