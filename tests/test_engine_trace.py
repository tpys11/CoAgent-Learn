# -*- coding: utf-8 -*-
"""评估Trace真实性守卫（对齐核查闭环①）：
T1 retrieve trace 记录真实候选数/改写查询/轮次（search_meta 不再被丢弃，raw_count≠kept 可证源）
T2 assess trace 携带 evidence；generate trace metrics 带 t_value/strategy_id
T3 error 路径冲刷已积累 Trace + error 条目（失败轮次可回放）
T4 研究档强制两轮（模式契约"必开两轮"，即使分类器判 standard）
隔离策略与 test_engine_modes 相同；另重置 eval_repo 模块单例绑定隔离库。"""
import json

import pytest

from core.db.base import SQLiteClient
from core.db import project_repo as pr_mod
from core.db.project_repo import ProjectRepo
import fastapi.testclient


class ProbeLLM:
    """主模型假件：可配置异常注入；回答定值。"""
    last = None

    def __init__(self, api_key=None, model=None, base_url=None, boom=False, **kw):
        self.boom = boom
        self.messages = None
        ProbeLLM.last = self

    def chat_stream(self, messages, on_token, **kw):
        if self.boom:
            raise RuntimeError("boom-生成爆炸")
        self.messages = messages
        if kw.get("on_content"):
            kw["on_content"]("合成回答内容")


class RoutingFastLLM:
    PROMPTS = {"意图分类器": '{"complexity": "standard"}',
               "学情评估器": '{"level_score": 0.9, "evidence": "术语准确"}',
               "查询规划器": '{"need_search": true, "queries": ["qA", "qB"]}',
               "检索候选": '{"keep": [0, 1]}'}

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
    import core.db.eval_repo as er_mod
    import core.background as bgmod
    import engine.retrieve as rt

    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(pgmod, "pg_client", client)
    monkeypatch.setattr(prmod, "_project_repo", ProjectRepo(db=client), raising=False)
    # 关键：重置 eval_repo 模块级单例——否则沿用上一测试绑定的死库，写入静默丢失
    monkeypatch.setattr(er_mod, "_eval_repo", er_mod.EvalRepo(db=client), raising=False)
    monkeypatch.setattr(bgmod, "submit", lambda fn=None, *a, **k: None)
    # 每查询4条web结果：候选总数9 > keep=6，逼出真筛选——raw_count(9)≠kept(2) 可证真实来源
    monkeypatch.setattr(rt, "_web_search",
                        lambda q: [{"title": f"w{i}-" + q, "url": f"u{i}-" + q,
                                    "content": "wc"} for i in range(4)])
    monkeypatch.setattr(rt, "_kb_search",
                        lambda q, pid: [{"title": "k-" + q, "url": "u-" + q,
                                         "content": "kc"}])

    import engine.pipeline_v2 as eng
    fast = RoutingFastLLM()
    monkeypatch.setattr(eng, "_make_fast_llm", lambda req: fast)
    eng._last_fast = fast
    monkeypatch.setattr(eng, "_make_llm",
                        lambda req, model_override=None: ProbeLLM(
                            api_key="d", model=model_override or req.model or "m",
                            base_url=req.base_url))

    import main as _main
    return _main.app, eng, client, rt, er_mod


def _run(app, body):
    frames = []
    with fastapi.testclient.TestClient(app).stream("POST", "/api/chat", json=body) as resp:
        for line in resp.iter_lines():
            if line.startswith("data: "):
                f = json.loads(line[6:])
                if f.get("type") != "heartbeat":
                    frames.append(f)
    return frames


def _trace_by_stage(client, request_id):
    rows = client.execute("SELECT * FROM eval_traces WHERE request_id=%s ORDER BY id",
                          (request_id,))
    return {r["stage"]: r for r in rows}


_BODY = {"message": "请讲解RAG的原理与应用", "api_key": "d",
         "project_id": "pX", "dialogue_id": "dT",
         "session_id": "sX", "settings": {"template": "思考"}}


def test_trace_fields_are_truthful(v2_env):
    """T1+T2：retrieve 真实计数与查询；assess evidence；generate T值/策略号。"""
    app, eng, client, _rt, _er = v2_env
    frames = _run(app, _BODY)
    rid = frames[0]["request_id"]
    tr = _trace_by_stage(client, rid)

    # retrieve：raw_count 来自 search_meta 的真实候选数（9），kept 为筛选后留存（2）
    ret = json.loads(tr["retrieve"]["output_digest"])
    assert ret["kept"] == 2 and ret["raw_count"] == 9, ret
    assert ret["queries"] == ["qA", "qB"] and ret["rounds"] == 1

    # assess：分数与证据同录
    ass = json.loads(tr["assess"]["output_digest"])
    assert ass["level_score"] == 0.9 and ass["evidence"] == "术语准确"

    # generate：metrics_json 带 T 值与策略号
    # T = 0.7×cur + 0.3×tgt；本流内 assess_score=0.9 覆盖默认 cur → T=0.7×0.9+0.3×0.6=0.81
    # 思考档 T=0.81 > THRESH_HIGH(0.6) → 策略②用户语域
    gen = json.loads(tr["generate"]["metrics_json"])
    assert abs(gen["t_value"] - 0.81) < 1e-6 and gen["strategy_id"] == 2
    assert "用户语域" in gen["strategy_name"]
    assert json.loads(tr["generate"]["output_digest"])["attempts"] == 1


def test_trace_error_path_persisted(v2_env, monkeypatch):
    """T3：生成阶段爆炸 → error 帧 + 已积累 Trace 与 error 条目落库可回放。"""
    app, eng, client, _rt, _er = v2_env

    def _boom_make_llm(req, model_override=None):
        return ProbeLLM(api_key="d", model="m", base_url=req.base_url, boom=True)

    monkeypatch.setattr(eng, "_make_llm", _boom_make_llm)
    frames = _run(app, _BODY)
    assert frames[-1]["type"] == "error" and "boom" in frames[-1]["message"]
    rid = frames[0]["request_id"]
    tr = _trace_by_stage(client, rid)
    assert "plan" in tr, "error 轮次已完成的阶段 Trace 必须留痕"
    assert tr["error"]["stage"] == "error" and "boom" in tr["error"]["output_digest"]


def test_research_mode_forces_two_rounds(v2_env):
    """T4：研究模板 + 分类器判 standard → 仍强制两轮递归检索（模式契约）。"""
    app, eng, client, _rt, _er = v2_env
    body = dict(_BODY, dialogue_id="dR", settings={"template": "研究"})
    frames = _run(app, body)
    assert frames[-1]["type"] == "done"
    fast = eng._last_fast
    planner_calls = [c for c in fast.calls if "查询规划器" in c]
    assert len(planner_calls) == 2, f"研究档必须两轮改写，实际{len(planner_calls)}次"
    rid = frames[0]["request_id"]
    ret = json.loads(_trace_by_stage(client, rid)["retrieve"]["output_digest"])
    assert ret["rounds"] == 2
