# -*- coding: utf-8 -*-
"""闭环二（A1 父子块）守卫：章节路径解析 / 兄弟聚合 / llamaindex 修复 / pipeline 注入。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.knowledge_service import parse_section_path  # noqa: E402
from engine.retrieve import _parse_section_path, _expand_sections, retrieve_stage  # noqa: E402
from engine.llm_io import think_then_json  # noqa: E402


# ---------- 路径解析 ----------

def test_parse_section_path_hit():
    c = "第2章 动力学 > 2.3 角动量\n角动量守恒的条件是……"
    assert _parse_section_path(c) == "第2章 动力学 > 2.3 角动量"
    assert parse_section_path(c) == _parse_section_path(c)  # 两处实现同语义


def test_parse_section_path_miss_cases():
    assert _parse_section_path("普通正文没有路径标记") is None       # 无 >
    assert _parse_section_path("# 标题开头不是路径\n正文") is None   # markdown标题非路径
    assert _parse_section_path("") is None


def test_llamaindex_precedence_fix_via_source_scan():
    """用源码扫描锁定优先级缺陷已修：路径分支必须恒拼接 get_content()。"""
    src = open(os.path.join(os.path.dirname(__file__), "..", "backend",
                            "core", "knowledge_service.py"), encoding="utf-8").read()
    part = src.split("def add_document", 1)[1]           # add_document 体内
    branch = part.split('chunker == "llamaindex"', 1)[1].split("elif mode", 1)[0]
    assert 'else "" + ' not in branch, "llamaindex 分支仍存在三目优先级丢正文的写法"
    assert '_t = ((_path + "\\n") if _path else "") + _body' in branch


# ---------- 兄弟聚合 ----------

class FakeDB:
    """get_kb_docs 桩：两章内容 + 他源隔离样本。"""

    def __init__(self, docs):
        self._docs = docs

    def get_kb_docs(self, project_id, table=None):
        return [d for d in self._docs if d.get("project_id") == project_id]


def test_fetch_section_texts_groups_and_caps(monkeypatch):
    import core.knowledge_service as ks
    docs = [
        {"source": "讲义", "project_id": "p", "chunk": 0,
         "content": "第1章 总论\n总论导语"},
        {"source": "讲义", "project_id": "p", "chunk": 1,
         "content": "第2章 动力学 > 2.3 角动量\n角动量定义块。"},
        {"source": "讲义", "project_id": "p", "chunk": 2,
         "content": "第2章 动力学 > 2.3 角动量\n守恒条件块，含推导。"},
        {"source": "讲义", "project_id": "p", "chunk": 3,
         "content": "第2章 动力学 > 2.4 动量\n别章内容不应混入。"},
        {"source": "另书", "project_id": "p", "chunk": 0,
         "content": "第2章 动力学 > 2.3 角动量\n他源同名章不并入。"},
    ]
    monkeypatch.setattr(ks, "_db", type("DB", (), {"get_kb_docs":
                       lambda self, pid=None, table=None: docs})())
    out = ks.fetch_section_texts("p", "讲义", {"第2章 动力学 > 2.3 角动量"})
    text = out["第2章 动力学 > 2.3 角动量"]
    assert "角动量定义块" in text and "守恒条件块" in text and "他源" not in text
    assert "第2章 动力学 > 2.3 角动量\n" not in text  # 剥掉重复路径行
    assert list(out.keys()) == ["第2章 动力学 > 2.3 角动量"]  # 按来源隔离


def test_expand_sections_attaches_parent_context(monkeypatch):
    import engine.retrieve as rt
    kept = [{"title": "", "url": "", "content": "第2章 > 2.3 角动量\n命中片段",
             "metadata": {"source": "讲义"}}]
    called = {}

    def fake_fetch(pid, src, paths, max_chars=2000):
        called["args"] = (pid, src, tuple(paths))
        return {list(paths)[0]: "整章全文……"}

    import core.knowledge_service as ks
    real = ks.fetch_section_texts
    ks.fetch_section_texts = fake_fetch
    try:
        n = _expand_sections(kept, "pX")
    finally:
        ks.fetch_section_texts = real
    assert called["args"] == ("pX", "讲义", ("第2章 > 2.3 角动量",))
    assert kept[0]["parent_context"]["text"] == "整章全文……"
    assert n == 1


# ---------- retrieve_stage 端到端（kb 命中带 metadata 时挂 context） ----------

def test_retrieve_stage_kb_hits_get_parent_context(monkeypatch):
    docs = [{"doc_id": "d1", "source": "S", "chunk": 0, "project_id": "pX",
             "content": "第1章 > 1.1 节\n兄弟甲"},
            {"doc_id": "d2", "source": "S", "chunk": 1, "project_id": "pX",
             "content": "第1章 > 1.1 节\n兄弟乙"}]
    import core.knowledge_service as ks
    monkeypatch.setattr(ks._db, "get_kb_docs",
                        lambda project_id=None, table=None:
                        [dict(d, project_id="pX") for d in docs])

    class OneShot:
        def __init__(self, resp):
            self.resp = resp

        def chat_stream(self, messages, on_token, **kw):
            for ch in self.resp:
                on_token(ch)

    fast = OneShot('{"need_search": true, "queries": ["qA"]}')
    monkeypatch.setattr("engine.retrieve._kb_search",
                        lambda q, pid: [{"content": "第1章 > 1.1 节\n兄弟甲",
                                         "metadata": {"source": "S", "chunk": 0}}])
    monkeypatch.setattr("engine.retrieve._web_search", lambda q: [])
    out = retrieve_stage(fast, "问题", "思考", "pX")
    hit = out["search_results"][0]
    assert hit["parent_context"]["path"] == "第1章 > 1.1 节"
    assert "兄弟乙" in hit["parent_context"]["text"]
