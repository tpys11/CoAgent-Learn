# -*- coding: utf-8 -*-
"""RC2-S1 检索命中内容块入观察窗事件 + 思维链双写。

R1 载荷结构：终筛完成点 subagent 通道新增 hits 事件，载荷为 top5 {title,source,content}。
R2 截断防爆：超长 title/source/content 输入下块长度仍有界（content=240 / title=source=60）。
R3 双写一致：token 事件与 done.mindchain「知识库管理」条目同源（防 done 权威替换打回）。
R4 top5 上限：超过 5 条命中只发前 5 块（载荷上限硬约束）。
R5 持久化：hits 事件经 _sa_emit 落 subagent_runs 档案（REST 回看通道覆盖）。

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
    """意图分类器带思考前缀；检索双源各回 1 条 → 终筛留存可预期。"""

    PROMPTS = {"意图分类器": '用户询问原理类问题，需判断检索与深度。\n{"complexity": "standard"}',
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
def v2_env(tmp_path, monkeypatch):
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

    import engine.pipeline_v2 as eng
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: ThinkingFastLLM())
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


_BODY = {"message": "请讲解RAG的原理与应用", "api_key": "d",
         "project_id": "pX", "dialogue_id": "dRC21",
         "session_id": "sX", "settings": {"template": "思考", "reviewEnabled": True}}


def test_hits_event_payload_structure(v2_env):
    """R1（worker 级）：观察窗 hits 事件载荷=top5 结构化块（title/source/content 三字段）。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    hits_frames = [f for f in frames
                   if f.get("type") == "subagent" and f.get("event") == "hits"]
    assert hits_frames, "subagent 通道须有 hits 事件（RC2-S1 新增）"
    hits = hits_frames[0].get("hits")
    assert isinstance(hits, list) and hits, "hits 须为非空列表"
    for b in hits:
        assert set(b.keys()) == {"title", "source", "content"}, "块结构固定三字段"
        assert all(isinstance(v, str) for v in b.values()), "三字段均字符串"
    assert any(b["source"] == "测试文档A.pdf" for b in hits), "KB 命中 source 须透传"


def test_hits_truncation_bounded():
    """R2（纯函数直调）：超长输入下 title≤60 / source≤60 / content=240，绝不发全量 chunk。"""
    import engine.pipeline_v2 as eng
    results = [{"title": "T" * 500,
                "content": "长" * 5000,
                "metadata": {"source": "超长文档名" * 100, "chunk": 0}}
               for _ in range(3)]
    blocks = eng._hit_blocks(results)
    assert len(blocks) == 3
    for b in blocks:
        assert len(b["title"]) <= 60 and len(b["source"]) <= 60
        assert len(b["content"]) == 240, "content 精确截到 240 字（截断防爆硬约束）"


def test_hits_doublewrite_consistent(v2_env):
    """R3（worker 级）：命中块 token 事件与 done.mindchain 条目同源（双写纪律）。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    tok = [f for f in frames
           if f.get("type") == "thought_token" and f.get("agent") == "知识库管理"]
    joined = "".join(f.get("chunk") or "" for f in tok)
    assert "命中内容块" in joined, "命中块须流式进思维链（RC2-S1 token 事件）"
    done = frames[-1]
    assert done["type"] == "done"
    kb_items = [it for it in (done.get("mindchain") or [])
                if it.get("agent") == "知识库管理"]
    assert kb_items, "done.mindchain 缺知识库管理条目"
    assert "命中内容块" in kb_items[-1].get("content"), "命中块须落 done 条目（双写，防闪现后消失）"
    # 双写一致：流式文本与权威条目都携带同一块的 source 标记
    assert "测试文档A.pdf" in joined and "测试文档A.pdf" in kb_items[-1].get("content")


def test_hits_top5_cap():
    """R4（纯函数直调）：8 条命中只发前 5 块（_HIT_BLOCKS_MAX 载荷上限）。"""
    import engine.pipeline_v2 as eng
    results = [{"title": f"t{i}", "content": f"c{i}",
                "metadata": {"source": f"s{i}"}} for i in range(8)]
    blocks = eng._hit_blocks(results)
    assert len(blocks) == 5, "top5 上限（5×240 字载荷硬约束）"
    assert [b["title"] for b in blocks] == [f"t{i}" for i in range(5)]


def test_hits_persisted_in_archive(v2_env):
    """R5（worker 级）：hits 事件落 subagent_runs 档案——REST 回看通道自动覆盖。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    hits_frames = [f for f in frames if f.get("event") == "hits"]
    assert hits_frames, "前置：hits 事件已发"
    rid = hits_frames[0]["run_id"]
    from services.subagent_runs import get_run
    run = get_run(rid)
    assert run, "观察窗档案须已建档"
    types = [e.get("type") for e in (run.get("events") or [])]
    assert "hits" in types, "hits 事件须落库（刷新后经 GET /api/chat/subagent 回看不丢）"
