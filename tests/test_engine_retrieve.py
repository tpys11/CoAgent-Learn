"""Loop2·切片2.3：Retrieve 阶段验证（改写/并行双源/筛选/软着陆）。"""
import json

from engine import retrieve as rt
from tests._engine_helpers import ScriptedLLM


def test_rewrite_ok():
    llm = ScriptedLLM(['{"need_search": true, "queries": ["RAG 原理", "检索增强生成 教程"]}'])
    out = rt.rewrite_queries(llm, "讲讲RAG")
    assert out == {"need_search": True, "queries": ["RAG 原理", "检索增强生成 教程"]}


def test_rewrite_no_need():
    llm = ScriptedLLM(['{"need_search": false, "queries": []}'])
    assert rt.rewrite_queries(llm, "写首诗")["need_search"] is False


def test_rewrite_crash_falls_to_false():
    class _Boom:
        def chat_stream(self, *a, **k):
            raise RuntimeError("x")
    assert rt.rewrite_queries(_Boom(), "任何") == {"need_search": False, "queries": []}


def test_fetch_all_parallel_both_sources(monkeypatch):
    monkeypatch.setattr(rt, "_web_search", lambda q: [{"title": f"w-{q}", "content": "c"}])
    monkeypatch.setattr(rt, "_kb_search", lambda q, pid: [{"title": f"kb-{q}", "content": "k"}])
    web, kb = rt._fetch_all(["q1", "q2"], "proj-1", use_kb=True)
    assert len(web) == 2 and len(kb) >= 1


def test_fetch_all_tolerates_exceptions(monkeypatch):
    def _boom(q):
        raise RuntimeError("搜索源挂了")
    monkeypatch.setattr(rt, "_web_search", _boom)
    monkeypatch.setattr(rt, "_kb_search", lambda q, pid: [{"title": "kb-only"}])
    web, kb = rt._fetch_all(["q1"], "proj-1", use_kb=True)
    assert web == [] and len(kb) == 1


def test_filter_keeps_six_and_falls_back_on_error():
    llm_ok = ScriptedLLM(['{"keep": [5, 4, 3, 2, 1, 0]}'])
    cands = [{"title": f"c{i}", "content": ""} for i in range(10)]
    kept = rt.filter_results(llm_ok, cands, keep=6)
    assert [c["title"] for c in kept] == ["c5", "c4", "c3", "c2", "c1", "c0"]

    class _Boom:
        def chat_stream(self, *a, **k):
            raise RuntimeError("x")
    kept2 = rt.filter_results(_Boom(), cands, keep=6)
    assert len(kept2) == 6  # 异常→保序截断兜底，不丢证据


def test_retrieve_stage_end_to_end(monkeypatch):
    """端到端：5查询×每查询2条web + 1条kb = 11候选 > keep6 → 触发筛选路径留模型挑选。"""
    llm = ScriptedLLM([
        '{"need_search": true, "queries": ["q0", "q1", "q2", "q3", "q4"]}',
        '{"keep": [8, 1]}',
    ])
    monkeypatch.setattr(rt := __import__("engine.retrieve", fromlist=["retrieve"]),
                        "_web_search",
                        lambda q: [{"title": "web-" + q + "-a", "content": "wc"},
                                   {"title": "web-" + q + "-b", "content": "wc"}])
    monkeypatch.setattr(__import__("engine.retrieve", fromlist=["retrieve"]),
                        "_kb_search", lambda q, pid: [{"title": "kb-" + q, "content": "kc"}])
    out = retrieve_mod().retrieve_stage(llm, "需要外部信息的问题", "思考", "projX")
    assert out["search_meta"]["raw_count"] == 11
    assert len(out["search_results"]) == 2
    assert all(r["title"].startswith("web-") for r in out["search_results"])  # idx8/1 均为web侧
    assert out["search_meta"]["queries"][0] == "q0"


def retrieve_mod():
    import engine.retrieve as m
    return m
