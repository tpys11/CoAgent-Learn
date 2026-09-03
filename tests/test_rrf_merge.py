# -*- coding: utf-8 -*-
"""P1·RRF 融合与优质源标注守卫。
公式对照：llama-index-core QueryFusionRetriever._reciprocal_rerank_fusion（k=60，rank 从0起）。
确定性样例断言融合序；_fetch_all 新分组契约；filter_results 的 [优质源] 标注注入。"""
from engine.retrieve import _doc_key, _is_quality_source, filter_results, rrf_merge


def _r(title, url=""):
    return {"title": title, "url": url, "content": "c-" + title}


def test_rrf_cross_list_promotion():
    """两列交叉命中者应登顶：b 在两列各得 1/(1+60)+1/(0+60) > 单列榜首的 1/(0+60)。"""
    col_a = [_r("a"), _r("b"), _r("c")]
    col_b = [_r("b"), _r("d")]
    out = rrf_merge([col_a, col_b])
    assert [x["title"] for x in out] == ["b", "a", "d", "c"]


def test_rrf_single_list_passthrough_order():
    lst = [_r("x"), _r("y"), _r("z")]
    assert [x["title"] for x in rrf_merge([lst])] == ["x", "y", "z"]


def test_rrf_empty_and_none_tolerant():
    assert rrf_merge([]) == []
    assert rrf_merge([[], None]) == []
    assert rrf_merge(None) == []


def test_rrf_same_doc_across_lists_collapses():
    doc = _r("同一篇", "http://s/1")
    out = rrf_merge([[doc], [{"title": "同一篇", "url": "http://s/1", "content": "other"}]])
    assert len(out) == 1  # 同键折叠=去重
    assert out[0]["content"] == "c-同一篇"  # 首见代表行


def test_doc_key_url_priority_and_content_fallback():
    assert _doc_key({"url": " http://A/B ", "title": "t"}) == "u:http://A/B"
    assert _doc_key({"title": " Title "}) == "t:title"          # 规范化小写
    k1 = _doc_key({"content": "alpha"})
    k2 = _doc_key({"content": "beta"})
    assert k1 != k2 and k1.startswith("n:")


def test_quality_source_match():
    assert _is_quality_source("https://arxiv.org/abs/123")
    assert _is_quality_source("https://docs.python.org/3/")
    assert not _is_quality_source("https://example.com/x")
    assert not _is_quality_source("")


def test_filter_marks_quality_in_prompt():
    class Capture:
        def __init__(self):
            self.prompt = ""

        def chat_stream(self, messages, on_token, **kw):
            self.prompt = messages[0]["content"]
            for ch in '{"keep": [0, 1]}':
                on_token(ch)
    cap = Capture()
    cands = [_r("普通站", "https://blog.example.com/a"),
             _r("权威站", "https://github.com/repo"),
             _r("教育站", "https://mit.edu/notes")]
    kept = filter_results(cap, cands, keep=2)
    assert '"q": "优质源"' in cap.prompt.replace(", ", ", ") or '优质源' in cap.prompt
    assert cap.prompt.count("优质源") >= 2  # github + mit 命中
    assert [c["title"] for c in kept] == ["普通站", "权威站"]
