# -*- coding: utf-8 -*-
"""闭环五·B4-lite：先修关系边守卫（表幂等/级联/抽取四态/白名单滤幻觉/接线/报告注解）。"""
import json

import pytest

import core.knowledge_service as ks
from core.config import config as _cfg
from core.db.base import SQLiteClient
from tests.test_semantic_chunker import A4_B4, FakeKbRepo, _by_topic  # 闭环四夹具复用


# ---------- 切片①：表存储与级联 ----------

@pytest.fixture()
def db(tmp_path):
    c = SQLiteClient(str(tmp_path / "kg.db"))
    c.init_tables()
    return c


def test_kg_edges_store_idempotent_cascade(db):
    db.upsert_kg_edges_bulk([("p1", "srcA", "运动学", "牛顿定律", "先修")])
    db.upsert_kg_edges_bulk([("p1", "srcA", "运动学", "牛顿定律", "先修"),   # 重复幂等
                             ("p1", "srcA", "动量", "牛顿定律", "相关")])
    edges = sorted(db.get_kg_edges("p1"), key=lambda e: (e["rel"], e["src"]))
    assert edges == [{"src": "运动学", "dst": "牛顿定律", "rel": "先修"},
                     {"src": "动量", "dst": "牛顿定律", "rel": "相关"}]
    assert db.get_kg_edges("pX") == []
    db.delete_kb_by_source("p1", "srcA")
    assert db.get_kg_edges("p1") == []
    db.upsert_kg_edges_bulk([("p1", "srcB", "a", "b", "相关")])
    db.delete_kb_project("p1")
    assert db.get_kg_edges("p1") == []


# ---------- 切片②：extract_kg_edges 四态 ----------

TREE = [{"name": "牛顿定律", "children": [{"name": "运动学", "children": []}]},
        {"name": "角动量", "children": []}]


class FakeChatLLM:
    def __init__(self, responses):
        self.responses = list(responses)
        self.user_prompts = []

    def chat(self, messages, temperature=0.2, **kw):
        self.user_prompts.append(messages[1]["content"])
        r = self.responses.pop(0) if self.responses else ""
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture()
def kg_on(monkeypatch):
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 1)
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "test-key", raising=False)


def test_extract_happy_path(db, monkeypatch, kg_on):
    llm = FakeChatLLM([json.dumps(
        {"edges": [{"src": "运动学", "dst": "牛顿定律", "rel": "先修"},
                   {"src": "角动量", "dst": "牛顿定律", "rel": "相关"}]},
        ensure_ascii=False)])
    wrote = []
    monkeypatch.setattr(ks._db, "upsert_kg_edges_bulk",
                        lambda items: wrote.extend(items), raising=False)
    n = ks.extract_kg_edges("p1", "力学讲义", TREE, api_key="k",
                            llm_factory=lambda key: llm)
    assert n == 2
    assert ("p1", "力学讲义", "运动学", "牛顿定律", "先修") in wrote
    # 输入口径：章节名清单在 user，来源标题在 system prompt
    assert any("运动学" in p for p in llm.user_prompts)


def test_extract_hallucinated_endpoints_dropped(db, monkeypatch, kg_on):
    """端点不在清单 → 白名单直接丢弃（防幻觉核心断言）；自环/rel 越界同滤。"""
    llm = FakeChatLLM([json.dumps({"edges": [
        {"src": "四脚坐标系", "dst": "牛顿定律", "rel": "先修"},   # src 幻觉
        {"src": "运动学", "dst": "运动学", "rel": "先修"},         # 自环
        {"src": "运动学", "dst": "角动量", "rel": "依赖"},          # rel 越界
        {"src": "运动学", "dst": "牛顿定律", "rel": "先修"},       # 唯一合法
    ]}, ensure_ascii=False)])
    wrote = []
    monkeypatch.setattr(ks._db, "upsert_kg_edges_bulk",
                        lambda items: wrote.extend(items), raising=False)
    n = ks.extract_kg_edges("p1", "s", TREE, api_key="k", llm_factory=lambda key: llm)
    assert n == 1 and wrote[0][2:] == ("运动学", "牛顿定律", "先修")


def test_extract_crash_returns_zero(db, monkeypatch, kg_on):
    llm = FakeChatLLM([RuntimeError("LLM 炸")])
    n = ks.extract_kg_edges("p1", "s", TREE, api_key="k", llm_factory=lambda key: llm)
    assert n == 0


def test_extract_gate_and_key(monkeypatch):
    def _fail(key):
        raise AssertionError("门控未生效")

    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 0)
    assert ks.extract_kg_edges("p1", "s", TREE, api_key="k",
                               llm_factory=_fail) == 0
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 1)
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "", raising=False)
    assert ks.extract_kg_edges("p1", "s", TREE, api_key="", llm_factory=_fail) == 0


def test_extract_single_node_skips_llm(monkeypatch, kg_on):
    def _fail(key):
        raise AssertionError("单节点不应调用 LLM")
    assert ks.extract_kg_edges("p1", "s", [{"name": "孤章", "children": []}],
                               api_key="k", llm_factory=_fail) == 0


# ---------- 切片③：add_document 接线 ----------

def test_add_document_wires_kg_extraction(monkeypatch, tmp_path):
    repo = FakeKbRepo()
    seen = {}

    def _fake_kg(pid, source, tree, api_key="", **kw):
        seen.update(pid=pid, source=source, tree=tree, api_key=api_key)
        return 1

    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _by_topic)
    monkeypatch.setattr(ks, "enhance_questions", lambda *a, **k: 0)
    monkeypatch.setattr(ks, "extract_kg_edges", _fake_kg)
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    ks.add_document("p8", "# 力学\n\n## 牛顿定律\n\n内容。\n## 运动学\n\n内容。",
                    source="力学讲义", api_key="用户key")
    assert seen["pid"] == "p8" and seen["source"] == "力学讲义"
    names = ks._flatten_tree_names(seen["tree"])
    assert names == ["力学", "牛顿定律", "运动学"]  # 拍平保序：父前子后


# ---------- 切片④：报告先修注解 ----------

def test_attach_prereq_pure():
    from services.match_report import _attach_prereq
    tree = [{"name": "力学", "status": "untouched",
             "children": [{"name": "运动学", "status": "blind", "children": []}]},
            {"name": "牛顿定律", "status": "mastered", "children": []}]
    out = _attach_prereq(tree, {"运动学": ["牛顿定律"]})
    assert out[0]["children"][0]["prereq"] == ["牛顿定律"]
    assert "prereq" not in out[0] and "prereq" not in out[1]   # 未命中不挂键


def test_build_match_report_includes_prereq(tmp_path, monkeypatch):
    """端到端：kg_edges 有先修边 → 报告 path_tree 节点带 prereq（零 kb_tree 合成路径）。"""
    from services.match_report import build_match_report
    c = SQLiteClient(str(tmp_path / "kgrep.db"))
    c.init_tables()
    c.upsert_kg_edges_bulk([("pR", "s1", "运动学", "牛顿定律", "先修")])
    rep = build_match_report("pR", db=c, kb_repo=_EmptyRepo())
    names = {n["name"] for n in rep["path_tree"]}
    assert {"运动学", "牛顿定律"} <= names           # kg 端点合成顶层节点
    kin = next(n for n in rep["path_tree"] if n["name"] == "运动学")
    assert kin["prereq"] == ["牛顿定律"]


class _EmptyRepo:
    """零 kb_tree 桩：验证 kg 端点合成路径。"""

    def get_all_kb_trees(self, project_id):
        return []
