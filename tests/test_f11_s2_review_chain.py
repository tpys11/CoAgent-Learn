# -*- coding: utf-8 -*-
"""F11-S2 审核全程入思维链（TDD 红基线，本轮核心）。

R5 通过场景也有审核事件：现状审核通过时思维链零审核痕迹（:511 仅未通过时发一条），
   owner 要求审核「过程与结论全程在思维链区」——通过/未通过都必须有发起+结论事件。
R6 结论事件含分数与通过状态。
R7 done.mindchain 权威终稿含审核条目（历史回看持久；正文后块删除后数据不丢）。
R8 done 帧后零审核事件（消息完成后不再追加审核相关内容）。
R9 重试序：轮次 N 审核结论先于第 N+1 稿正文 token（answer_reset）；
   每轮结论均入事件流，最终 mindchain 汇总含全部轮次。

口径说明：「审核事件先于正文完成」在单稿通过场景物理上只能钉为「先于 done 帧
（消息完成）」——审核对象就是当稿正文，事件序必然 正文→审核→done；重试场景
（R9）则钉「结论先于下一稿正文」。两种解读均被本文件钉死。

隔离策略与 test_engine_trace 相同；T33：pipeline_v2 延迟到 fixture 执行期导入。
"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from tests._engine_helpers import RoutingFastLLM


class ProbeLLM:
    """主模型假件：回答定值（审核事件断言不依赖主模型产出）。"""

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
    fast = RoutingFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)
    monkeypatch.setattr(eng, "_make_llm",
                        lambda req, model_override=None: ProbeLLM(
                            api_key="d", model=model_override or req.model or "m",
                            base_url=req.base_url))
    # 判卷模型不真构造（review_once/review_claims 在各测试内整体打桩）。
    # 注意：_v2_worker 是函数内 from engine.review import ...（CONVENTIONS 分层规定），
    # 打桩必须落 engine.review 模块本体，而非 pipeline_v2 命名空间。
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
         "project_id": "pX", "dialogue_id": "dG1",
         "session_id": "sX", "settings": {"template": "思考", "reviewEnabled": True}}

_VERDICT_PASS = {"passed": True, "score": 92, "reasons": "",
                 "thinking": "", "skipped": False}
_VERDICT_FAIL = {"passed": False, "score": 61, "reasons": "断言X缺证据支撑",
                 "thinking": "", "skipped": False}


def _audit_frames(frames):
    return [(i, f) for i, f in enumerate(frames)
            if f["type"] == "thought_token" and f.get("agent") == "审核"]


def test_review_events_streamed_before_done(v2_env, monkeypatch):
    """R5+R6+R7：通过场景也有发起+结论事件（含分数），全部先于 done，mindchain 持久。"""
    app, eng = v2_env
    import engine.review as rv_mod
    monkeypatch.setattr(rv_mod, "review_once", lambda *a, **k: dict(_VERDICT_PASS))
    frames = _run(app, _BODY)
    audit = _audit_frames(frames)
    assert len(audit) >= 2, f"F11-S2 红基线：通过场景审核事件不足（发起+结论），实得 {len(audit)}"
    done_idx = len(frames) - 1
    assert frames[-1]["type"] == "done"
    assert all(i < done_idx for i, _ in audit), "审核事件必须全部先于 done 帧"
    text = "".join(f.get("chunk") or "" for _, f in audit)
    assert "92" in text, "结论事件须含分数"
    assert "通过" in text, "结论事件须含通过状态"
    mc = frames[-1].get("mindchain") or []
    review_items = [it for it in mc if it.get("agent") == "审核"]
    assert review_items, "F11-S2 红基线：done.mindchain 无审核条目（历史回看不持久）"
    assert "92" in review_items[-1].get("content") or ""


def test_no_audit_events_after_done(v2_env, monkeypatch):
    """R8：done 帧后零审核事件（消息完成后不再追加审核内容）。
    回归控制断言（决策 24）：done 是 SSE 终止帧，本断言现状结构上不可能红——
    钉的是「未来若 done 后补发事件」的回归，非新行为。"""
    app, eng = v2_env
    import engine.review as rv_mod
    monkeypatch.setattr(rv_mod, "review_once", lambda *a, **k: dict(_VERDICT_PASS))
    frames = _run(app, _BODY)
    done_idx = next(i for i, f in enumerate(frames) if f["type"] == "done")
    tail = [f for f in frames[done_idx + 1:]]
    assert not [f for f in tail if f.get("agent") == "审核"], "done 后不得有审核事件"


def test_review_fail_retry_sequence(v2_env, monkeypatch):
    """R9：未通过→结论→answer_reset→新稿→通过→结论→done；两轮结论均入 mindchain。"""
    app, eng = v2_env
    import engine.review as rv_mod
    verdicts = [dict(_VERDICT_FAIL), dict(_VERDICT_PASS)]

    def _scripted(*a, **k):
        return verdicts.pop(0)

    monkeypatch.setattr(rv_mod, "review_once", _scripted)
    frames = _run(app, _BODY)
    audit = _audit_frames(frames)
    reset_idx = next(i for i, f in enumerate(frames) if f["type"] == "answer_reset")
    fail_concl_idx = [i for i, f in audit if "61" in (f.get("chunk") or "")]
    assert fail_concl_idx, "第一轮未通过结论事件缺失（含分数 61）"
    assert fail_concl_idx[0] < reset_idx, "审核结论必须先于重试稿正文（answer_reset）"
    text = "".join(f.get("chunk") or "" for _, f in audit)
    assert "重新生成" in text, "重试提示须保留"
    assert "92" in text, "第二轮通过结论事件缺失"
    mc = frames[-1].get("mindchain") or []
    review_items = [it for it in mc if it.get("agent") == "审核"]
    assert review_items, "done.mindchain 无审核条目"
    mc_text = review_items[-1].get("content") or ""
    assert "61" in mc_text and "92" in mc_text, "mindchain 审核条目须汇总全部轮次结论"
