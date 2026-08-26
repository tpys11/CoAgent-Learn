# -*- coding: utf-8 -*-
"""Loop4.5 补强 · 三模式矩阵端到端验证（CHAT_ENGINE=v2）：
T1 多轮上下文注入（画像/偏好/早期摘要/近期原文 全段落进 generate 的 user 内容）
T2 极速档矩阵（跳过学情/检索/审核 + 字数指令回归）
T3 研究档全链（两轮递归检索 + 审核未通过携因重生成一次后通过）
隔离策略与 test_chat_golden 相同；检索源定值化防真实网络。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
from tests._engine_helpers import ScriptedLLM

import fastapi.testclient


class ModeProbeLLM:
    """主模型假件：捕获完整 messages；回答定值。"""
    last = None

    def __init__(self, api_key=None, model=None, base_url=None, **kw):
        self.model = model
        self.messages = None
        ModeProbeLLM.last = self

    def chat_stream(self, messages, on_token, **kw):
        self.messages = messages
        for piece in ["合成回答内容"]:
            if kw.get("cancel_event") is not None and kw["cancel_event"].is_set():
                return
            if kw.get("on_content"):
                kw["on_content"](piece)


class RoutingFastLLM:
    PROMPTS = {"意图分类器": '{"complexity": "standard"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [0, 1, 2]}'}

    def __init__(self):
        self.calls = []

    def chat_stream(self, messages, on_token, **kw):
        s = messages[0]["content"]
        self.calls.append(s[:20])
        raw = next((v for k, v in self.PROMPTS.items() if k in s), "")
        for ch in raw:
            on_token(ch)


@pytest.fixture()
def v2_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    monkeypatch.setenv("CHAT_ENGINE", "v2")
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.postgres_client as pgmod
    import core.db.project_repo as prmod
    import core.background as bgmod
    import engine.retrieve as rt

    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)
    monkeypatch.setattr(rt, "_web_search",
                        lambda q: [{"title": "w-" + q, "url": "u-" + q, "content": "wc"}])
    monkeypatch.setattr(rt, "_kb_search",
                        lambda q, pid: [{"title": "k-" + q, "url": "u-" + q, "content": "kc"}])

    import engine.pipeline_v2 as eng
    fast = RoutingFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)
    eng._last_fast = fast  # 供测试断言消费记录
    monkeypatch.setattr(eng, "_make_llm", lambda req, model_override=None: ModeProbeLLM(
        api_key="d", model=model_override or req.model or "m", base_url=req.base_url))

    import main as _main
    return _main.app, eng, client, rt


def _run(app, body):
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        for line in resp.iter_lines():
            if line.startswith("data: "):
                f = json.loads(line[6:])
                if f.get("type") != "heartbeat":
                    frames.append(f)
    return frames


def _steps(frames):
    return [f.get("agent") for f in frames if f["type"] == "step"]


def _user_text(main_llm):
    msgs = main_llm.messages
    return msgs[1]["content"] if msgs and len(msgs) > 1 else ""


def _seed_context(client, did):
    client.execute(
        "INSERT INTO dialogues(id,project_id,session_id,name,profile,summary) "
        "VALUES(%s,'pX','sX','对话M',%s,%s)",
        (did, json.dumps({"用户背景": "背景X", "偏好提问方式": ["对比学习"],
                          "level_score": 0.7}),
         "早期摘要S"))
    for i, (role, text) in enumerate([("user", "历史A"), ("assistant", "历史B"),
                                      ("user", "历史C")]):
        client.execute(
            "INSERT INTO messages(dialogue_id,role,content,created_at) "
            "VALUES(%s,%s,%s,%s)", (did, role, text, f"2026-08-25 10:00:0{i}"))


import json as _json  # noqa: E402 供种子使用


def test_multi_turn_context_injection(v2_env):
    app, eng, client, _rt = v2_env
    _seed_context(client, "dM")
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dM",
                        "session_id": "sX", "settings": {}})
    main_llm = ModeProbeLLM.last
    assert main_llm is not None and main_llm.messages is not None
    sys_text = main_llm.messages[0]["content"]
    user_text = _user_text(main_llm)
    assert "【用户背景】背景X" in user_text
    assert "【偏好提问方式】对比学习" in user_text
    assert "【早期对话摘要】早期摘要S" in user_text
    assert "【近期对话】" in user_text and "历史A" in user_text and "历史C" in user_text
    assert "【输出策略指令】" in sys_text
    done = frames[-1]
    assert done["type"] == "done"
    step_agents = _steps(frames)
    assert "学情与记忆管理" in step_agents and "知识库管理" in step_agents
    # 缺口③可见性：输出策略脚注亮出依据数值（本轮学情分或规则地板）
    foot = [f for f in frames if f["type"] == "thought_token" and f.get("agent") == "输出策略"]
    assert foot and ("level=" in foot[0]["chunk"] or "规则地板" in foot[0]["chunk"]), foot


def test_extreme_mode_matrix(v2_env):
    app, eng, client, _rt = v2_env
    frames = _run(app, {"message": "你好呀今天感觉怎么样", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dE",
                        "session_id": "sX", "settings": {"template": "极速"}})
    assert _steps(frames) == ["学习助手·规划", "学习助手·生成"], _steps(frames)
    main_llm = ModeProbeLLM.last
    sys_text = main_llm.messages[0]["content"]
    assert "500-800" in sys_text and "1000" in sys_text
    assert "输出策略指令" in sys_text


def test_word_limits_and_citation_rules(v2_env):
    """N1+N2 对齐：思考/研究档字数约束注入；有检索结果时引用格式规则注入。"""
    app, eng, client, _rt = v2_env
    # 思考档：800-1200/max1500
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dW1",
                        "session_id": "sX", "settings": {"template": "思考"}})
    sys_text = ModeProbeLLM.last.messages[0]["content"]
    assert "800-1200" in sys_text and "1500" in sys_text
    # 有检索留存 → 引用格式规则随检索块注入
    user_text = _user_text(ModeProbeLLM.last)
    assert "[来源: " in user_text and "【检索结果】" in user_text
    # 研究档：1500-2000/max3000
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dW2",
                        "session_id": "sX", "settings": {"template": "研究"}})
    sys_text = ModeProbeLLM.last.messages[0]["content"]
    assert "1500-2000" in sys_text and "3000" in sys_text


def test_kb_miss_declaration(v2_env, monkeypatch):
    """N1 诚实边界：检索执行但零留存 → 第一句强制申明规则注入 user 内容。"""
    app, eng, client, rt = v2_env
    monkeypatch.setattr(rt, "_web_search", lambda q: [])
    monkeypatch.setattr(rt, "_kb_search", lambda q, pid: [])
    frames = _run(app, {"message": "请讲解RAG的原理与应用", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dMiss",
                        "session_id": "sX", "settings": {"template": "思考"}})
    assert frames[-1]["type"] == "done"
    user_text = _user_text(ModeProbeLLM.last)
    assert "未在知识库中检索到相关内容" in user_text
    assert "模型自有知识" in user_text


def test_research_full_chain_with_review(v2_env, monkeypatch):
    app, eng, client, _rt = v2_env

    class ResearchFastLLM:
        """研究档专用：分类恒 research_deep；规划器按轮次产出不同查询。"""
        def __init__(self):
            self.calls = []
            self.qn = 0

        def chat_stream(self, messages, on_token, **kw):
            s = messages[0]["content"]
            self.calls.append(s[:20])
            if "意图分类器" in s:
                # 前导自然语言 + 围栏json：思考原文非空（Loop6 思维链持久化验证点）
                raw = ('用户想深入了解RAG。\n```json\n'
                       '{"complexity": "research_deep"}\n```')
            elif "学情评估器" in s:
                raw = ('近期术语使用准确。\n```json\n'
                       '{"level_score": 0.9, "evidence": "术语准确"}\n```')
            elif "查询规划器" in s:
                self.qn += 1
                raw = json.dumps({"need_search": True,
                                  "queries": [f"r{self.qn}a", f"r{self.qn}b"]},
                                 ensure_ascii=False)
            elif "检索候选" in s:
                raw = '{"keep": [0, 1]}'
            else:
                raw = ""
            for ch in raw:
                on_token(ch)

    fast = ResearchFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)

    # A1：kb 命中携带 metadata + 首行路径 → 断言 pipeline 注入【相关章节全文】
    monkeypatch.setattr(_rt, "_kb_search",
                        lambda q, pid: [{"content": "第1章 > 1.1 节\n角动量核心块。",
                                         "metadata": {"source": "讲义R", "chunk": 0}}])
    import core.knowledge_service as _ks
    monkeypatch.setattr(_ks, "fetch_section_texts",
                        lambda pid, src, paths, max_chars=2000:
                        {list(paths)[0]: "整章全文内容，含兄弟乙与推导细节。"})

    judge = ScriptedLLM(['{"passed": false, "score": 40, "reasons": "密度不足"}',
                         '{"passed": true, "score": 88, "reasons": ""}'])
    import engine.review as rv_mod
    monkeypatch.setattr(rv_mod, "pick_judge_llm", lambda template, req: judge)

    frames = _run(app, body_research())
    # 研究档两轮：查询规划器至少调用两次（轮次感知的不同查询）
    planner_calls = [c for c in fast.calls if "查询规划器" in c]
    assert len(planner_calls) >= 2
    # 审核未通过→重生成→通过：审核脚注与最终 reviewed 都要体现
    audit_notes = [f.get("chunk") for f in frames
                   if f["type"] == "thought_token" and f.get("agent") == "审核"]
    assert any("密度不足" in (c or "") for c in audit_notes)
    done = frames[-1]
    assert done["review"]["passed"] is True and done["review"]["score"] == 88
    # Loop6：思维链持久化——done.mindchain 携带各阶段思考原文（规划/学情）
    mc_agents = [e.get("agent") for e in done.get("mindchain", [])]
    assert "学习助手·规划" in mc_agents and "学情与记忆管理" in mc_agents, mc_agents
    assert any("深入了解RAG" in e["content"] for e in done["mindchain"])
    assert done["reply"] == "合成回答内容"
    # 1.5 观测复活：🛰 检索观察窗 subagent 帧序列（start→delta…→end，同 run_id）
    sa = [f for f in frames if f["type"] == "subagent"]
    assert sa, "研究档必须产出检索观察窗事件"
    assert sa[0]["event"] == "start" and sa[-1]["event"] == "end"
    rid = sa[0]["run_id"]
    assert all(f["run_id"] == rid for f in sa)
    deltas = [f.get("text", "") for f in sa if f["event"] == "delta"]
    assert any("改写查询" in t for t in deltas), deltas
    assert any("终筛留存" in t for t in deltas), deltas
    assert any("章节展开" in t for t in deltas), deltas  # A1：兄弟聚合发生
    assert sa[-1]["status"] == "ok" and "留存" in (sa[-1].get("summary") or "")
    # A1 注入断言：主模型 user 内容含【相关章节全文】与受控章节文本
    user_t = ModeProbeLLM.last.messages[1]["content"]
    assert "【相关章节全文】" in user_t and "含兄弟乙与推导细节" in user_t


def body_research():
    return {"message": "请讲解RAG的原理与应用并深入调研最新进展",
            "api_key": "d", "project_id": "pX", "dialogue_id": "dR",
            "session_id": "sX", "settings": {"template": "研究"}}


def _steps(frames):
    return [f.get("agent") for f in frames if f["type"] == "step"]
