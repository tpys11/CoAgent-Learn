# -*- coding: utf-8 -*-
"""闭环三·B2-lite：研究档子问题分解 + 覆盖度判据 + 自适应补搜。
切片① rewrite_queries(research=True) 三态（正常分解/单面退化/异常软着陆）；
切片② _coverage_missing 纯函数（空列/全达/部分缺/首见归属口径）；
切片③ retrieve_stage 自适应编排（恰两次取回/≤3封顶/零补搜/短路）。"""
from engine import retrieve as rt
from tests._engine_helpers import ScriptedLLM


# --- 切片①：rewrite_queries(research=True) 三态 ---

def test_research_decompose_multi_facet():
    """正常分解：多面题 → ≤4 条独立子问 + decomposed=true。"""
    llm = ScriptedLLM([
        '{"need_search": true, "queries": ["Uber 营收增长", "Lyft 营收增长", '
        '"网约车市场整体规模", "两家单位经济模型对比"], "decomposed": true}'])
    out = rt.rewrite_queries(llm, "对比 Uber 和 Lyft 的营收增长与商业模式", research=True)
    assert out == {"need_search": True,
                   "queries": ["Uber 营收增长", "Lyft 营收增长",
                               "网约车市场整体规模", "两家单位经济模型对比"],
                   "decomposed": True}


def test_research_single_facet_degrades():
    """单面退化：decomposed=false 单元素 = 等价普通检索（防碎片化）。"""
    llm = ScriptedLLM(['{"need_search": true, "queries": ["RAG 是什么"], "decomposed": false}'])
    out = rt.rewrite_queries(llm, "RAG 是什么", research=True)
    assert out == {"need_search": True, "queries": ["RAG 是什么"], "decomposed": False}


def test_research_over_cap_clamped_to_four():
    """分解上限 4 条（普通档仍为 5 条），超出的截断。"""
    llm = ScriptedLLM(['{"need_search": true, '
                       '"queries": ["a", "b", "c", "d", "e"], "decomposed": true}'])
    assert rt.rewrite_queries(llm, "多面问题", research=True)["queries"] == \
        ["a", "b", "c", "d"]


def test_research_crash_soft_landing():
    """异常软着陆：三键齐全，绝不冒泡。"""
    class _Boom:
        def chat_stream(self, *a, **k):
            raise RuntimeError("x")
    assert rt.rewrite_queries(_Boom(), "任何", research=True) == \
        {"need_search": False, "queries": [], "decomposed": False}


# --- 切片②：_coverage_missing 纯函数 ---

def test_coverage_empty_cols_all_missing():
    assert rt._coverage_missing([[], []]) == [0, 1]


def test_coverage_all_sufficient():
    cols = [[{"url": "u1"}, {"url": "u2"}], [{"url": "u3"}, {"url": "u4"}]]
    assert rt._coverage_missing(cols) == []


def test_coverage_partial_missing():
    cols = [[{"url": "u1"}, {"url": "u2"}], [{"url": "u3"}]]
    assert rt._coverage_missing(cols) == [1]


def test_coverage_first_seen_attribution():
    """口径声明：跨列重复计入先见面——第二列全为重复 → 贡献 0 → 缺失（v1 近似）。"""
    cols = [[{"url": "u1"}, {"url": "u2"}], [{"url": "u1"}, {"url": "u2"}]]
    assert rt._coverage_missing(cols) == [1]


def test_coverage_skips_non_dict_and_empty_input():
    assert rt._coverage_missing([]) == []
    assert rt._coverage_missing(None) == []
    cols = [[{"url": "u1"}, "junk", None], [{"url": "u2"}]]
    assert rt._coverage_missing(cols) == [0, 1]


# --- 切片③：retrieve_stage 自适应编排 ---

def _row(t: str) -> dict:
    return {"title": t, "url": "u-" + t, "content": "c"}


def _patch_fetch(monkeypatch, script: list):
    """脚本化 _fetch_all 假件：按调用次序回放 (web_groups, kb_out)，记录每次入参。"""
    calls = []

    def fake_fetch(queries, pid, use_kb=True, per_call_timeout=15):
        calls.append(list(queries))
        return script[min(len(calls), len(script)) - 1]

    monkeypatch.setattr(rt, "_fetch_all", fake_fetch)
    return calls


def test_adaptive_extra_round_when_col_sparse(monkeypatch):
    """首轮某子问列空 → 恰两次取回（重试集=未达标子问原句）、meta 三键齐、
    观察窗出现「子问题分解/补搜」delta，全程取回≤3封顶。"""
    calls = _patch_fetch(monkeypatch, [
        ([[_row("a1"), _row("a2")], []], []),       # 首轮：子问B列空
        ([[_row("b1"), _row("b2")]], []),           # 补搜：仅缺失子问B
    ])
    events = []
    llm = ScriptedLLM(['{"need_search": true, "queries": ["子问A", "子问B"], '
                       '"decomposed": true}'])
    out = rt.retrieve_stage(llm, "多面研究题", "研究", "p1", rounds=2,
                            emit=lambda t, **p: events.append(p.get("text", "")))
    assert calls == [["子问A", "子问B"], ["子问B"]]
    assert len(calls) <= 3  # 总轮次≤3封顶
    m = out["search_meta"]
    assert m["adaptive_extra_rounds"] == 1 and m["decomposed"] is True
    assert m["sub_questions"] == ["子问A", "子问B"]
    assert m["rounds"] == 2 and m["queries"] == ["子问A", "子问B", "子问B"]
    assert any("子问题分解 2 个" in e for e in events), events
    assert any("补搜 1 面" in e for e in events), events
    titles = {r["title"] for r in out["search_results"]}
    assert titles == {"a1", "a2", "b1", "b2"}  # 补搜列参与融合


def test_adaptive_no_extra_when_all_covered(monkeypatch):
    """各列召回充足 → 零补搜只取回一次；decomposed=false 单面题行为收敛。"""
    calls = _patch_fetch(monkeypatch, [
        ([[_row("a1"), _row("a2")], [_row("b1"), _row("b2")]], [_row("k1")]),
    ])
    llm = ScriptedLLM(['{"need_search": true, "queries": ["子问A", "子问B"], '
                       '"decomposed": false}'])
    out = rt.retrieve_stage(llm, "单面研究题", "研究", "p1", rounds=2)
    assert calls == [["子问A", "子问B"]]
    m = out["search_meta"]
    assert m["adaptive_extra_rounds"] == 0 and m["rounds"] == 1
    assert m["decomposed"] is False
    assert m["sub_questions"] == ["子问A", "子问B"]


def test_adaptive_no_search_short_circuits(monkeypatch):
    """分解判无需检索 → 零取回零补搜，空契约软着陆同旧路径。"""
    calls = _patch_fetch(monkeypatch, [])
    llm = ScriptedLLM(['{"need_search": false, "queries": [], "decomposed": false}'])
    out = rt.retrieve_stage(llm, "闲聊一句", "研究", "p1", rounds=2)
    assert calls == []
    assert out["search_results"] == []
    m = out["search_meta"]
    assert m["rounds"] == 0 and m["adaptive_extra_rounds"] == 0
    assert m["sub_questions"] == [] and m["decomposed"] is False
    assert m["raw_count"] == 0
