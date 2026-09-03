# -*- coding: utf-8 -*-
"""Loop4.5 补强 · 三模式矩阵端到端验证（CHAT_ENGINE=v2）：
T1 多轮上下文注入（画像/偏好/早期摘要/近期原文 全段落进 generate 的 user 内容）
T2 极速档矩阵（跳过学情/审核 + 字数指令回归；RC5-S1 起 KB 检索全档无条件）
T3 研究档全链（B2-lite 分解式检索 + 审核未通过携因重生成一次后通过）
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
    """RC5-S1 语义更新（owner 09-03「所有档位都默认检索知识库」）：极速档跳过
    学情/审核不变，但 KB 检索无条件化——知识库管理步必在（向量化近零成本）。"""
    app, eng, client, _rt = v2_env
    frames = _run(app, {"message": "你好呀今天感觉怎么样", "api_key": "d",
                        "project_id": "pX", "dialogue_id": "dE",
                        "session_id": "sX", "settings": {"template": "极速"}})
    assert _steps(frames) == ["学习助手·规划", "知识库管理", "学习助手·生成"], _steps(frames)
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
        """研究档专用：分类恒 research_deep；规划器按 B2-lite 契约产出分解子问。"""
        def __init__(self):
            self.calls = []

        def chat_stream(self, messages, on_token, **kw):
            s = messages[0]["content"]
            self.calls.append(s)  # 全文入档：供断言分解提示词标记
            if "意图分类器" in s:
                # 前导自然语言 + 围栏json：思考原文非空（Loop6 思维链持久化验证点）
                raw = ('用户想深入了解RAG。\n```json\n'
                       '{"complexity": "research_deep"}\n```')
            elif "学情评估器" in s:
                raw = ('近期术语使用准确。\n```json\n'
                       '{"level_score": 0.9, "evidence": "术语准确"}\n```')
            elif "查询规划器" in s:
                raw = json.dumps({"need_search": True,
                                  "queries": ["RAG 核心原理拆解", "RAG 最新进展调研"],
                                  "decomposed": True},
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

    # 断言级审核契约（Loop7）：首轮检出虚构断言→重生成→次轮全支撑通过
    judge = ScriptedLLM([
        '{"claims": [{"claim": "RAG 检索 top-k 是 5", "label": "unsupported", '
        '"confidence": 0.8, "reason": "证据说 3", "diag": "hallucination"}], '
        '"instruction_ok": true, "instruction_note": ""}',
        '{"claims": [{"claim": "RAG 检索 top-k 是 3", "label": "supported", '
        '"confidence": 0.9, "reason": "证据支持", "diag": ""}], '
        '"instruction_ok": true, "instruction_note": ""}'])
    import engine.review as rv_mod
    monkeypatch.setattr(rv_mod, "pick_judge_llm", lambda template, req: judge)

    frames = _run(app, body_research())
    # B2-lite 新契约：研究档分解式规划恰一次（替代旧"强制两轮改写"），提示词含分解标记
    planner_calls = [c for c in fast.calls if "查询规划器" in c]
    assert len(planner_calls) == 1
    assert "子问题分解" in planner_calls[0]
    # 审核未通过→重生成→通过：审核脚注带诊断类型，最终 reviewed 为断言级契约
    audit_notes = [f.get("chunk") for f in frames
                   if f["type"] == "thought_token" and f.get("agent") == "审核"]
    assert any("未通过" in (c or "") for c in audit_notes)
    assert any("hallucination" in (c or "") for c in audit_notes)
    done = frames[-1]
    assert done["review"]["passed"] is True and done["review"]["score"] == 100
    assert done["review"]["skipped"] is False and done["review"]["issues"] == []
    assert done["review"]["claims"] and done["review"]["claims"][0]["label"] == "supported"
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
    assert any("子问题分解" in t for t in deltas), deltas
    assert any("补搜 2 面" in t for t in deltas), deltas  # 夹具每查询仅1条→双列均未达阈
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


# ---------- 召回审核（条件触发：retrieval_gap 驱动二次检索） ----------

_GAP_FAIL = ('{"claims": [{"claim": "RAG 2026 新基准数据", "label": "unsupported", '
             '"confidence": 0.7, "reason": "证据未覆盖该年度", "diag": "retrieval_gap"}], '
             '"instruction_ok": true, "instruction_note": ""}')
_HALLU_FAIL = ('{"claims": [{"claim": "RAG 检索 top-k 是 5", "label": "unsupported", '
               '"confidence": 0.8, "reason": "证据说 3", "diag": "hallucination"}], '
               '"instruction_ok": true, "instruction_note": ""}')
_PASS_SUPPORTED = ('{"claims": [{"claim": "核心概念", "label": "supported", '
                   '"confidence": 0.9, "reason": "证据支持", "diag": ""}], '
                   '"instruction_ok": true, "instruction_note": ""}')


def _patch_recall_judge(monkeypatch, responses):
    """判卷假件只建一次实例（lambda 内新建会导致每轮判卷都拿到满弹药脚本——重试永不通过）。"""
    import engine.review as rv_mod
    judge = ScriptedLLM(list(responses))
    monkeypatch.setattr(rv_mod, "pick_judge_llm", lambda template, req: judge)


def _count_retrieve_stage(rt, monkeypatch):
    calls = {"n": 0}
    real_rs = rt.retrieve_stage

    def counting_rs(*a, **k):
        calls["n"] += 1
        return real_rs(*a, **k)

    monkeypatch.setattr(rt, "retrieve_stage", counting_rs)
    return calls


def _count_gen_llm(eng, monkeypatch):
    """数"生成次数"而非 _make_llm 次数——重试环复用同一 llm_gen 实例，须数 chat_stream 调用。"""
    gen_calls = {"n": 0}
    base_make = eng._make_llm

    def counting_make(req, model_override=None):
        llm = base_make(req, model_override)
        orig = llm.chat_stream

        def counting_stream(messages, on_token, **kw):
            gen_calls["n"] += 1
            return orig(messages, on_token, **kw)

        llm.chat_stream = counting_stream
        return llm

    monkeypatch.setattr(eng, "_make_llm", counting_make)
    return gen_calls


def _audit_notes(frames, agent="召回审核"):
    return [f.get("chunk") for f in frames
            if f["type"] == "thought_token" and f.get("agent") == agent]


def test_recall_audit_on_gap(v2_env, monkeypatch):
    """gap 断言 → 二次检索 → 新证据重建 user prompt 到达生成侧（证据不更新修复的钉死断言）。"""
    app, eng, client, rt = v2_env
    rs_calls = _count_retrieve_stage(rt, monkeypatch)
    gen_calls = _count_gen_llm(eng, monkeypatch)
    kb_round = {"n": 0}

    def kb_search(q, pid):
        kb_round["n"] += 1
        return [{"title": "k-" + q,
                 "content": "第一轮kb证据" if kb_round["n"] <= 2 else "第二轮kb补充证据"}]

    monkeypatch.setattr(rt, "_kb_search", kb_search)
    _patch_recall_judge(monkeypatch, [_GAP_FAIL, _PASS_SUPPORTED])
    frames = _run(app, body_research())
    assert rs_calls["n"] == 2, (f"rs={rs_calls['n']}, gen={gen_calls['n']}, "
                                f"review={frames[-1].get('review')}, "
                                f"notes={_audit_notes(frames)}, "
                                f"audit={_audit_notes(frames, '审核')}")   # S2 + 召回
    assert gen_calls["n"] == 2                                 # 初稿 + 召回后重生成
    # 证据不更新修复：第二次生成的 user 内容含第二轮补充证据
    assert "第二轮kb补充证据" in ModeProbeLLM.last.messages[1]["content"]
    notes = _audit_notes(frames)
    assert any("检索缺口 1 条" in (c or "") for c in notes)
    # 补搜机制使新增条数不定 → 断言契约级：报了新增且非"无新增"（无新增分支由下一用例覆盖）
    assert any(("新增" in (c or "")) and ("无新增" not in (c or "")) for c in notes)
    assert frames[-1]["review"]["passed"] is True


def test_recall_not_triggered_on_hallucination(v2_env, monkeypatch):
    """hallucination-only 失败：直接重生成，不触发召回（不多花检索）。"""
    app, eng, client, rt = v2_env
    rs_calls = _count_retrieve_stage(rt, monkeypatch)
    _patch_recall_judge(monkeypatch, [_HALLU_FAIL, _PASS_SUPPORTED])
    frames = _run(app, body_research())
    assert rs_calls["n"] == 1                                  # 仅 S2
    assert frames[-1]["review"]["passed"] is True
    assert _audit_notes(frames) == []


def test_recall_at_most_once_within_budget(v2_env, monkeypatch):
    """两轮皆 gap：召回至多 1 次（计数停 2），预算内第 3 次判卷通过。"""
    app, eng, client, rt = v2_env
    rs_calls = _count_retrieve_stage(rt, monkeypatch)
    gen_calls = _count_gen_llm(eng, monkeypatch)
    _patch_recall_judge(monkeypatch, [_GAP_FAIL, _GAP_FAIL, _PASS_SUPPORTED])
    frames = _run(app, body_research())
    assert rs_calls["n"] == 2                                  # S2 + 首次召回（第二次 gap 不再召回）
    assert gen_calls["n"] == 3                                 # 1 初稿 + 2 重试（REVIEW_MAX_RETRY=2）
    assert frames[-1]["review"]["passed"] is True


def test_recall_no_new_evidence_keeps_going(v2_env, monkeypatch):
    """召回无新增（kb 源恒重复）：不重建 prompt 也不崩，thought 帧明示"无新增"。"""
    app, eng, client, rt = v2_env
    rs_calls = _count_retrieve_stage(rt, monkeypatch)
    monkeypatch.setattr(rt, "_kb_search",
                        lambda q, pid: [{"title": "k-" + q, "content": "第一轮kb证据"}])
    _patch_recall_judge(monkeypatch, [_GAP_FAIL, _PASS_SUPPORTED])
    frames = _run(app, body_research())
    assert rs_calls["n"] == 2
    notes = _audit_notes(frames)
    assert any("无新增，按原证据修正" in (c or "") for c in notes)
    assert frames[-1]["review"]["passed"] is True


def _steps(frames):
    return [f.get("agent") for f in frames if f["type"] == "step"]
