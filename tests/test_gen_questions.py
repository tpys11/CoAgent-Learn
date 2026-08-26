# -*- coding: utf-8 -*-
"""闭环四·B1：每块生成问题旁路表守卫（DDL/幂等 upsert/级联删除/BM25 语料拼装/批量生成容错）。"""
import json

import pytest

import core.knowledge_service as ks
from core.config import config as _cfg
from core.db.base import SQLiteClient
from tests.test_semantic_chunker import A4_B4, FakeKbRepo, _by_topic  # 切片②夹具复用


# ---------- 切片③：旁路表存储与级联 ----------

@pytest.fixture()
def db(tmp_path):
    c = SQLiteClient(str(tmp_path / "gq.db"))
    c.init_tables()
    return c


def test_gen_questions_store_idempotent_cascade(db):
    db.upsert_gen_questions_bulk([("p1", "srcA", "d1", '["q1?"]'),
                                  ("p1", "srcA", "d2", '["q2?"]')])
    db.upsert_gen_questions_bulk([("p1", "srcA", "d1", '["q1改?"]')])  # 同 doc_id 幂等覆盖
    assert db.get_gen_questions("p1") == {"d1": '["q1改?"]', "d2": '["q2?"]'}
    assert db.get_gen_questions("pX") == {}
    db.delete_kb_by_source("p1", "srcA")          # 按源级联
    assert db.get_gen_questions("p1") == {}
    db.upsert_gen_questions_bulk([("p1", "srcB", "d3", "[]")])
    db.delete_kb_project("p1")                    # 按项目级联
    assert db.get_gen_questions("p1") == {}


class _FakeBM25:
    """rank_bm25 本地缺席（容器专属依赖）——桩只验证语料拼装，不复刻打分：
    任一查询词出现在该文档 token 序列中即得 1 分。"""

    def __init__(self, tokenized):
        self.tokenized = tokenized

    def get_scores(self, q_tokens):
        return [1.0 if any(t in doc for t in q_tokens) else 0.0
                for doc in self.tokenized]


@pytest.fixture()
def fake_rank_bm25(monkeypatch):
    import sys
    import types
    monkeypatch.setitem(sys.modules, "rank_bm25",
                        types.SimpleNamespace(BM25Okapi=_FakeBM25))


def test_bm25_corpus_includes_questions(monkeypatch, fake_rank_bm25):
    """换说法命中：问题文本「动量矩」不在块原文里，拼入语料后 BM25 可召回。"""
    rows = [{"doc_id": "d1", "source": "s", "chunk": 0, "content": "角动量守恒条件成立",
             "session_id": "", "has_context": 0}]

    class _DB:
        def get_kb_docs(self, pid, table="kb_vectors"):
            return rows

        def get_gen_questions(self, pid):
            return {"d1": json.dumps(["动量矩何时保持不变？"], ensure_ascii=False)}

    monkeypatch.setattr(ks, "_db", _DB())
    monkeypatch.delitem(ks._bm25_cache, ("p1", "kb_vectors"), raising=False)
    bm = ks._get_bm25("p1", "kb_vectors")
    ids, tok, bm25 = bm
    assert bm25.get_scores(ks._tokenize("动量矩"))[0] > 0   # 问题侧命中（B1 增益）
    assert bm25.get_scores(ks._tokenize("角动量"))[0] > 0   # 原文侧不回退


def test_bm25_feed_survives_missing_questions(monkeypatch, fake_rank_bm25):
    """无问题块（存量/B1 关闭）语料回退纯 content——get_gen_questions 异常也不炸。"""
    rows = [{"doc_id": "d2", "source": "s", "chunk": 0, "content": "普通内容块",
             "session_id": "", "has_context": 0}]

    class _DB:
        def get_kb_docs(self, pid, table="kb_vectors"):
            return rows

        def get_gen_questions(self, pid):
            raise RuntimeError("旁路表不存在（旧库）")

    monkeypatch.setattr(ks, "_db", _DB())
    monkeypatch.delitem(ks._bm25_cache, ("p2", "kb_vectors"), raising=False)
    bm = ks._get_bm25("p2", "kb_vectors")
    assert bm is not None and bm[2].get_scores(ks._tokenize("普通内容"))[0] > 0


# ---------- 切片④：enhance_questions 批量生成与容错 ----------

class FakeChatLLM:
    """带 chat() 的假 flash：按调用序回放；boom=True 时抛异常。记录入参。"""

    def __init__(self, responses):
        self.responses = list(responses)
        self.prompts = []

    def chat(self, messages, temperature=0.2, **kw):
        self.prompts.append(messages[0]["content"][:40])
        r = self.responses.pop(0) if self.responses else ""
        if isinstance(r, Exception):
            raise r
        return r


class _Repo:
    """upsert 捕获桩（不动 KbRepo 单例，防测试触真实库）。"""

    def __init__(self):
        self.items = []

    def upsert_gen_questions_bulk(self, items):
        self.items.extend(items)


@pytest.fixture()
def quiet_cfg(monkeypatch):
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 1)
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "test-key", raising=False)


def test_enhance_happy_path(monkeypatch, quiet_cfg):
    llm = FakeChatLLM([json.dumps([{"i": 0, "questions": ["甲是什么？"]},
                                   {"i": 1, "questions": ["乙如何？", "乙为何？"]}],
                                  ensure_ascii=False)])
    repo = _Repo()
    monkeypatch.setattr(ks, "_db", repo)
    n = ks.enhance_questions("p1", ["甲块内容。", "乙块内容。"], ["id0", "id1"],
                             api_key="k", llm_factory=lambda key: llm, source="s1")
    assert n == 2 and len(repo.items) == 2
    assert repo.items[0] == ("p1", "s1", "id0", json.dumps(["甲是什么？"], ensure_ascii=False))
    assert "乙为何？" in repo.items[1][3]


def test_enhance_group_failure_continues(monkeypatch, quiet_cfg):
    """13 块 → 2 组（12+1）；第一组炸 → 该组无问题，第二组照常入库。"""
    llm = FakeChatLLM([RuntimeError("第一组炸"),
                       json.dumps([{"i": 0, "questions": ["补救？"]}], ensure_ascii=False)])
    repo = _Repo()
    monkeypatch.setattr(ks, "_db", repo)
    n = ks.enhance_questions("p1", ["块" + str(i) + "内容。" for i in range(13)],
                             ["id" + str(i) for i in range(13)],
                             api_key="k", llm_factory=lambda key: llm, source="s1")
    assert n == 1 and repo.items[0][2] == "id12"


def test_enhance_all_groups_fail_never_blocks(monkeypatch, quiet_cfg):
    llm = FakeChatLLM([RuntimeError("全炸")])
    repo = _Repo()
    monkeypatch.setattr(ks, "_db", repo)
    n = ks.enhance_questions("p1", ["内容。", "内容。"], ["a", "b"],
                             api_key="k", llm_factory=lambda key: llm, source="s1")
    assert n == 0 and repo.items == []


def test_enhance_gate_and_key(monkeypatch):
    def _fail_factory(key):  # 门关/无 key 时绝不应触达工厂
        raise AssertionError("门控未生效")

    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    assert ks.enhance_questions("p1", ["内容。"], ["a"], api_key="k",
                                llm_factory=_fail_factory, source="s") == 0
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 1)
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "", raising=False)
    assert ks.enhance_questions("p1", ["内容。"], ["a"], api_key="",
                                llm_factory=_fail_factory, source="s") == 0


def test_enhance_over_cap_skips_extra(monkeypatch, quiet_cfg):
    """预算封顶：>96 块只增强前 8 组；超限块不增强（不阻断）。"""
    calls = []

    class _CountLLM:
        def chat(self, messages, temperature=0.2, **kw):
            calls.append(1)
            return json.dumps([{"i": i, "questions": ["问？"]} for i in range(12)],
                              ensure_ascii=False)

    repo = _Repo()
    monkeypatch.setattr(ks, "_db", repo)
    n = ks.enhance_questions("p1", ["块"] * 100, ["id" + str(i) for i in range(100)],
                             api_key="k", llm_factory=lambda key: _CountLLM(), source="s1")
    assert len(calls) == 8 and n == 96  # 8 组 × 12 块


def test_add_document_wires_enhance(monkeypatch):
    """接线证明：add_document 以 (chunks, bulk doc_ids, source, api_key) 调用增强。"""
    repo = FakeKbRepo()
    seen = {}

    def _fake_enhance(pid, chunks, doc_ids, source="", api_key="", **kw):
        seen.update(pid=pid, chunks=chunks, doc_ids=doc_ids,
                    source=source, api_key=api_key)
        return 0

    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _by_topic)
    monkeypatch.setattr(ks, "enhance_questions", _fake_enhance)
    monkeypatch.setattr(_cfg, "KB_CHUNKER", "semantic")
    ks.add_document("p9", "".join(A4_B4), source="增强源", api_key="用户key")
    assert seen["pid"] == "p9" and len(seen["chunks"]) == 2
    assert seen["doc_ids"] == [b[0] for b in repo.bulk]
    assert seen["source"] == "增强源" and seen["api_key"] == "用户key"
