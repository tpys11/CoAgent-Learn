# -*- coding: utf-8 -*-
"""RC5-S1：KB 检索无条件化（owner 09-03 终版语义，红先行）。

owner 原话：「我说的检索检索知识库，上网搜索叫搜索，所有档位都默认检索知识库
（向量化检索几乎不耗时间）」——「检索」=KB 链（改写→向量召回→终筛），所有档位/
模板 always-run；need_search 只门控 web 搜索（上网有真实成本，判定机制与
RC4-S3 的 queries 翻案原样保留：need=false ⟹ queries 空 ⟹ KB 用原问题召回）。

钉点：①need=false 无检索词 → KB 用原问题召回、web 零调用；②need=true → web
按检索词逐条照常；③研究档（rounds=2）need=false → KB 单路召回、覆盖度补搜
（web 机制）不触发；④_fetch_all kb_query 解耦（空 web queries 时 KB 单路取回）；
⑤空库/无命中降级路径不变（0 候选软着陆）。
T33：执行期导入；零真实网络（monkeypatch 先例）。"""
import sys
import pathlib

_ROOT = pathlib.Path(__file__).resolve().parents[1]
for _p in (str(_ROOT), str(_ROOT / "backend")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from engine import retrieve as rt
from tests._engine_helpers import ScriptedLLM


def _patch_sources(monkeypatch, kb_rows=None, web_rows=None):
    """双源假件：记录调用入参；KB 返回 kb_rows 定值，web 真值时按查询返回可区分行
    （url 随查询变化——RRF 融合按 _doc_key 去重，同 url 会被折叠干扰 raw_count 断言）。"""
    kb_calls: list[str] = []
    web_calls: list[str] = []

    monkeypatch.setattr(
        rt, "_kb_search",
        lambda q, pid: (kb_calls.append(q), list(kb_rows or []))[1])
    monkeypatch.setattr(
        rt, "_web_search",
        lambda q: (web_calls.append(q),
                   [{"title": "W-" + q, "content": "w", "url": "u-" + q}]
                   if web_rows else [])[1])
    return kb_calls, web_calls


def test_kb_recalls_with_raw_message_when_planner_declines_web(monkeypatch):
    """无条件检索①：规划器判不需上网（need=false → queries 空）→ KB 仍用原问题
    召回且命中进入终筛；web 零调用（门控保留）。修复前此路径在取回前 break → 0 候选。"""
    kb_calls, web_calls = _patch_sources(
        monkeypatch, kb_rows=[{"title": "KB-讲义", "content": "二次型定义", "url": "kb://1"}])
    llm = ScriptedLLM(['{"need_search": false, "queries": []}', '{"keep": [0]}'])
    out = rt.retrieve_stage(llm, "二次型的正定性怎么判定？", "思考", "p1")
    assert kb_calls == ["二次型的正定性怎么判定？"], "KB 必须用原问题无条件召回"
    assert web_calls == [], "need=false 时 web 不得上网（门控保留）"
    assert [r["title"] for r in out["search_results"]] == ["KB-讲义"]
    assert out["search_meta"]["rounds"] == 1
    assert out["search_meta"]["queries"] == []


def test_web_still_runs_when_planner_requests(monkeypatch):
    """web 门控保留②：need=true + 检索词 → web 按词逐条照常，KB 用 queries[0]
    （旧契约不变）。上网判定机制与 RC5 前一致。"""
    kb_calls, web_calls = _patch_sources(
        monkeypatch,
        kb_rows=[{"title": "KB-A", "content": "k", "url": "kb://a"}],
        web_rows=[{"title": "W", "content": "w", "url": "u"}])
    llm = ScriptedLLM(['{"need_search": true, "queries": ["qA", "qB"]}', '{"keep": [0, 1, 2]}'])
    out = rt.retrieve_stage(llm, "需要外部信息的问题", "思考", "p1")
    assert web_calls == ["qA", "qB"]
    assert kb_calls == ["qA"]
    assert out["search_meta"]["raw_count"] == 3  # web 2 + kb 1


def test_research_path_kb_always_no_web_extra_round(monkeypatch):
    """无条件检索③（研究档）：rounds=2 且 need=false → KB 单路召回照跑，
    覆盖度补搜（web 机制）不触发——_fetch_all 恰一次调用且 web queries 为空。
    修复前研究档短路为空契约（零取回）。"""
    calls: list[tuple] = []

    def fake_fetch(queries, pid, use_kb=True, per_call_timeout=15, kb_query=None):
        calls.append((list(queries), kb_query))
        return ([], [{"title": "KB-研究", "content": "c", "url": "kb://r"}])

    monkeypatch.setattr(rt, "_fetch_all", fake_fetch)
    llm = ScriptedLLM(['{"need_search": false, "queries": [], "decomposed": false}'])
    out = rt.retrieve_stage(llm, "闲聊一句", "研究", "p1", rounds=2)
    assert calls == [([], "闲聊一句")], "KB 用原问题单路召回，补搜不触发"
    assert len(out["search_results"]) == 1
    m = out["search_meta"]
    assert m["rounds"] == 1 and m["adaptive_extra_rounds"] == 0
    assert m["sub_questions"] == [] and m["decomposed"] is False
    assert m["raw_count"] == 1


def test_fetch_all_kb_only_with_kb_query(monkeypatch):
    """解耦④：queries 空但 kb_query 给定 → 仅 KB 单路取回（web_groups 空列表）；
    缺省 kb_query 保持 queries[0] 旧契约（研究档补搜路径不回归）。"""
    kb_calls, web_calls = _patch_sources(
        monkeypatch, kb_rows=[{"title": "KB-1", "content": "k"}])
    groups, kb = rt._fetch_all([], "p1", use_kb=True, kb_query="原问题")
    assert groups == [] and len(kb) == 1
    assert kb_calls == ["原问题"] and web_calls == []
    kb_calls.clear()
    web_calls.clear()
    _fetch_backcompat = rt._fetch_all(["q1", "q2"], "p1", use_kb=True)
    groups2, kb2 = _fetch_backcompat
    assert kb_calls == ["q1"], "缺省 kb_query=queries[0]（旧契约）"


def test_empty_kb_zero_candidates_still_degrades_cleanly(monkeypatch):
    """空库降级⑤：KB/web 均空 → 0 候选软着陆（空结果、无异常、终筛 0 留存），
    观察窗文案链路（候选 0 → 留存 0）的数据源不变。"""
    _patch_sources(monkeypatch, kb_rows=[], web_rows=[])
    llm = ScriptedLLM(['{"need_search": false, "queries": []}'])
    out = rt.retrieve_stage(llm, "知识库里没有的问题", "思考", "p1")
    assert out["search_results"] == []
    assert out["search_meta"]["raw_count"] == 0
    assert out["search_meta"]["queries"] == []


def test_rewrite_prompt_narrows_to_web_search_semantics():
    """语义收窄②：规划器提示词把 need_search 判定收窄为「是否需要上网搜索」，
    并声明知识库检索始终进行（提示词层钉，防语义回漂）。"""
    import inspect
    src = inspect.getsource(rt.rewrite_queries)
    assert "是否需要上网搜索" in src
    assert "知识库向量检索始终进行" in src
