# -*- coding: utf-8 -*-
"""RB-S4 规划/策略/检索内容增厚 + 重写段补齐（纯函数直调 + worker 级双写）。

R1 检索增厚：_format_search_detail 的命中 snippet 80→240 字（纯函数直调）。
R2 截断防爆不回归：超长 query/content/source 输入下产出长度仍有界（F11 R4 结构断言保留）。
R3 规划双写：plan_thinking 非空时既有 mindchain 条目 + 新增 token 事件流式化，
   流式文本与 done.mindchain 条目同源（防「闪现后消失」）。
R4 策略全文：输出策略 token 从一行摘要扩为「摘要头 + directive 全文」，且补齐
   mindchain_entries 双写（此前只有 token 无条目 = F11 双写纪律的存量坑）。
R5 重写段补齐（S1 安全设计授权、2026-09-02 经批准的最小越界）：审核未过重试后，
   done.mindchain 含「学习助手·生成（重写 #N）」条目且位于审核条目之前——
   done 权威替换后链内仍可见全部草稿段（owner 底线）。

隔离策略：test_f11_* 同款四点进程内隔离，零触碰真实库（T49）。
T33：engine.pipeline_v2 / main 一律延迟到 fixture 执行期导入。
"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db.project_repo import ProjectRepo
import fastapi.testclient

from tests._engine_helpers import RoutingFastLLM


class ThinkingFastLLM(RoutingFastLLM):
    """意图分类器响应带 JSON 前置思考文本 → classify_intent 产出非空 plan_thinking
    （think_then_json 取首个 JSON 之前的文本为 thinking）。"""

    PROMPTS = {"意图分类器": '用户询问原理类问题，需判断检索与深度。\n{"complexity": "standard"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [1, 0]}'}


class ProbeLLM:
    """主模型假件：每稿回答定值（重写段断言不依赖主模型产出差异）。"""

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
    # 判卷模型不真构造（review_once/review_claims 在各测试内整体打桩）；
    # _v2_worker 是函数内 from engine.review import ...，打桩必须打 review 模块本体
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
         "project_id": "pX", "dialogue_id": "dRB1",
         "session_id": "sX", "settings": {"template": "思考", "reviewEnabled": True}}


def test_snippet_thickened_to_240():
    """R1（纯函数直调）：命中 snippet 240 字（原 80），截断点精确。"""
    import engine.pipeline_v2 as eng  # T33：执行期导入
    marker = "X" * 239 + "Y"          # 第 240 字符 = Y；其后 Z 不应出现
    results = [{"title": "t", "content": marker + "Z" * 50,
                "metadata": {"source": "文档A.pdf", "chunk": 1}, "rrf_score": 0.5}]
    out = eng._format_search_detail({}, results)
    assert ("X" * 239 + "Y") in out, "snippet 须含前 240 字（含第 240 字符）"
    assert ("YZ") not in out, "第 241 字符起不得入文（snippet=240 非旧值 80/250）"


def test_detail_format_truncation_bounded_240():
    """R2（纯函数直调）：超长输入下产出有界——F11 R4 结构断言在 snippet 240 下仍成立。"""
    import engine.pipeline_v2 as eng
    meta = {"queries": [f"超长查询{i}" * 100 for i in range(20)], "raw_count": 99}
    results = [{"title": f"t{i}" * 500, "content": "长内容" * 500,
                "metadata": {"source": f"文档{i}.pdf" * 50, "chunk": i},
                "rrf_score": 0.1234} for i in range(30)]
    out = eng._format_search_detail(meta, results)
    assert len(out) < 4000, f"内容事件长度必须有界，实际 {len(out)}"
    assert "文档0.pdf"[:6] in out, "至少 1 条命中预览且 source 截断后仍可辨认"
    assert out.count("长内容") <= 3 * 80, "top3×snippet240 界内（240 字 ≈ 80 组『长内容』）"


def test_plan_thinking_streamed_and_persisted(v2_env):
    """R3（worker 级）：plan_thinking 非空 → 流式 token 事件 + done.mindchain 条目双写。"""
    app, _eng = v2_env
    frames = _run(app, _BODY)
    think_text = "用户询问原理类问题，需判断检索与深度。"
    plan = [f for f in frames
            if f["type"] == "thought_token" and f.get("agent") == "学习助手·规划"]
    joined = "".join(f.get("chunk") or "" for f in plan)
    assert think_text in joined, "规划思考须流式进思维链通道（RB-S4 新增 token）"
    assert "规划要点" in joined, "要点摘要仍在（原有 :323 token 不被替代）"
    done = frames[-1]
    assert done["type"] == "done"
    plan_items = [it for it in (done.get("mindchain") or [])
                  if it.get("agent") == "学习助手·规划"]
    assert plan_items, "done.mindchain 无规划条目"
    assert think_text in plan_items[-1].get("content") or "", "规划条目须含思考全文（双写）"
    assert "规划要点" in plan_items[-1].get("content") or "", "规划条目须含要点（相邻合并）"


def test_strategy_full_directive_streamed_and_persisted(v2_env, monkeypatch):
    """R4（worker 级）：输出策略 token 含摘要头+directive 全文，mindchain 补齐双写。"""
    app, _eng = v2_env
    import engine.output_strategy as os_mod  # _v2_worker 函数内 import 本模块 → 打桩生效
    monkeypatch.setattr(os_mod, "directive", lambda sid, t: "哨兵指令全文ABC123")
    frames = _run(app, _BODY)
    strat = [f for f in frames
             if f["type"] == "thought_token" and f.get("agent") == "输出策略"]
    assert strat, "输出策略零内容事件"
    text = "".join(f.get("chunk") or "" for f in strat)
    assert "T=" in text and "（" in text, "摘要头须在（名称/T 值/依据）"
    assert "哨兵指令全文ABC123" in text, "directive 全文须随 token 流式"
    done = frames[-1]
    strat_items = [it for it in (done.get("mindchain") or [])
                   if it.get("agent") == "输出策略"]
    assert strat_items, "done.mindchain 无输出策略条目（存量「闪现后消失」坑须补齐）"
    assert "哨兵指令全文ABC123" in strat_items[-1].get("content") or ""


def test_rewrite_segments_in_done_mindchain(v2_env, monkeypatch):
    """R5（worker 级，经批准越界的钉子）：审核未过重试 → done.mindchain 含重写段条目，
    位于审核条目之前，与前端 genRewriteAgent 命名同款。"""
    app, _eng = v2_env
    import engine.review as rv_mod
    verdicts = [{"passed": False, "score": 61, "reasons": "断言X缺证据支撑",
                 "thinking": "", "skipped": False},
                {"passed": True, "score": 92, "reasons": "",
                 "thinking": "", "skipped": False}]
    monkeypatch.setattr(rv_mod, "review_once", lambda *a, **k: dict(verdicts.pop(0)))
    frames = _run(app, _BODY)
    assert any(f.get("type") == "answer_reset" for f in frames), "前置：重试确已发生"
    done = frames[-1]
    assert done["type"] == "done"
    mc = done.get("mindchain") or []
    rewrite = [it for it in mc if it.get("agent") == "学习助手·生成（重写 #0）"]
    assert rewrite, "done.mindchain 缺重写段条目（done 替换会丢草稿段，owner 底线破）"
    assert rewrite[0].get("content") == "合成回答内容", "重写段条目须携带被重试稿全文"
    gen = [it for it in mc if it.get("agent") == "学习助手·生成"]
    assert gen, "done.mindchain 缺生成条目（首稿并入）"
    review_idx = next(i for i, it in enumerate(mc) if it.get("agent") == "审核")
    rewrite_idx = mc.index(rewrite[0])
    assert rewrite_idx < review_idx, "重写段必须位于审核条目之前（草稿在审核节点之前）"
