# -*- coding: utf-8 -*-
"""F11-S1 检索与规划节点内容化（TDD 红基线）。

R1 规划要点事件：规划完成后思维链通道出现 agent="学习助手·规划" 的要点内容
   （复杂度/检索意图）——现状规划节点仅有 step 空标题（红：零事件）。
R2 检索内容事件：检索完成后思维链通道出现 agent="知识库管理" 的内容事件，
   携带改写 query 与命中预览（source/chunk/融合分）——现状检索节点内部无内容（红）。
R3 持久化双写：done.mindchain 权威终稿同样携带同内容条目。done 帧会无条件替换
   前端流式思维链（useChatStream :401-408），只发事件不进 mindchain_entries
   = 流式可见、done 后消失——本测试钉死「事件 + 持久」双写（红）。
R4 单元级：内容拼装函数对超长 query/content/多 query 输入截断有界（防爆红线）。

隔离策略与 test_engine_trace 相同（四点进程内隔离，零触碰真实库）。
T33：engine.pipeline_v2 / main 一律延迟到 fixture 执行期导入。
"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from tests._engine_helpers import RoutingFastLLM


class ProbeLLM:
    """主模型假件：回答定值（检索/规划内容事件不依赖主模型产出）。"""

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
    # 重置 eval_repo 模块级单例（沿用 test_engine_trace 的坑位教训）
    monkeypatch.setattr(er_mod, "_eval_repo", er_mod.EvalRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)
    # web 桩：超长 content（验证截断防爆）；kb 桩：携带 metadata(source/chunk) 供命中预览断言
    monkeypatch.setattr(rt, "_web_search",
                        lambda q: [{"title": f"WEB-{q}", "url": f"https://web.example/{q}",
                                    "content": "网页内容" * 300}])
    monkeypatch.setattr(rt, "_kb_search",
                        lambda q, pid: [{"title": f"KB-{q}", "url": f"kb://{q}",
                                         "content": "库内内容" * 200,
                                         "metadata": {"source": "测试文档A.pdf", "chunk": 3}}])

    import engine.pipeline_v2 as eng
    fast = RoutingFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)
    monkeypatch.setattr(eng, "_make_llm",
                        lambda req, model_override=None: ProbeLLM(
                            api_key="d", model=model_override or req.model or "m",
                            base_url=req.base_url))

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
         "project_id": "pX", "dialogue_id": "dF1",
         "session_id": "sX", "settings": {"template": "思考"}}


def test_plan_points_event(v2_env):
    """R1：规划节点要点内容事件（复杂度/检索意图），不再只是 step 空标题。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    plan = [f for f in frames
            if f["type"] == "thought_token" and f.get("agent") == "学习助手·规划"]
    assert plan, "F11-S1 红基线：规划节点零内容事件"
    text = "".join(f.get("chunk") or "" for f in plan)
    assert "standard" in text, "规划要点须含复杂度（RoutingFastLLM 分类定值 standard）"


def test_retrieval_detail_event_with_hits(v2_env):
    """R2：检索节点内容事件带 query 与命中预览（source/chunk/融合分）。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    kb = [f for f in frames
          if f["type"] == "thought_token" and f.get("agent") == "知识库管理"]
    assert kb, "F11-S1 红基线：检索节点零内容事件"
    text = "".join(f.get("chunk") or "" for f in kb)
    assert "qA" in text and "qB" in text, "改写 query 须进内容事件"
    assert "测试文档A.pdf" in text, "命中预览须含 source"
    assert "chunk" in text, "命中预览须含 chunk 定位"
    assert "0." in text, "命中预览须含融合分数"


def test_done_mindchain_carries_content(v2_env):
    """R3：done 权威终稿 mindchain 含规划/检索内容条目（双写，防 done 后消失）。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    done = frames[-1]
    assert done["type"] == "done"
    mc = done.get("mindchain") or []
    kb_items = [it for it in mc if it.get("agent") == "知识库管理"]
    assert kb_items, "F11-S1 红基线：done.mindchain 无检索条目（流式内容会被替换丢失）"
    assert "测试文档A.pdf" in kb_items[-1].get("content") or "", "检索条目须含命中 source"
    plan_items = [it for it in mc if it.get("agent") == "学习助手·规划"]
    assert plan_items, "done.mindchain 无规划条目"
    assert "standard" in plan_items[-1].get("content") or ""


def test_detail_format_truncation_bounded():
    """R4：内容拼装纯函数对超长输入截断有界（防爆红线）。"""
    import engine.pipeline_v2 as eng  # T33：执行期导入
    meta = {"queries": [f"超长查询{i}" * 100 for i in range(20)], "raw_count": 99}
    results = [{"title": f"t{i}" * 500, "content": "长内容" * 500,
                "metadata": {"source": f"文档{i}.pdf" * 50, "chunk": i},
                "rrf_score": 0.1234} for i in range(30)]
    out = eng._format_search_detail(meta, results)
    assert len(out) < 4000, f"内容事件长度必须有界，实测 {len(out)}"
    assert "文档0.pdf"[:6] in out, "至少 1 条命中预览且 source 截断后仍可辨认"
