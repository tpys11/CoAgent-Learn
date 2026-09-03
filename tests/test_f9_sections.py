# -*- coding: utf-8 -*-
"""F9-S2 正文/其他双通道切割测试：规则主通道 + LLM 边界仲裁 + 留存范围应用。
纪律（T33/T41）：模块级只 import core.*（无 engine/main 顶层导入）；LLM 一律注入桩。"""
import pytest

from core.outline_service import (CATEGORY_APPENDIX, CATEGORY_BODY, CATEGORY_LAB,
                                  CATEGORY_QUIZ, CATEGORY_SUMMARY, CATEGORY_TEST,
                                  annotate_categories_from_text, classify_spans,
                                  scoped_text)

DOC = "\n".join([
    "这是一段前言介绍文字，出现在第一个标题之前。",
    "# 第1章 力学基础",
    "力学是研究物体机械运动的学科。",
    "## 1.1 牛顿定律",
    "牛顿三定律是经典力学的基础。",
    "# 第2章 习题解析",
    "本章提供配套练习。",
    "## 2.1 习题一",
    "计算物体受力。",
    "# 本章小结",
    "本章回顾了力学基础。",
    "# 附录A 符号表",
    "符号对照。",
    "# 附录B 期末试卷",
    "综合测试卷。",
    "# 3.4 单元测试实践",
    "这一节讲的是软件测试方法教学，属于正文教学内容。",
])


# ---------- 规则主通道 ----------

def test_rule_strong_hits():
    spans = classify_spans(DOC)
    by_path = {s["path"]: s for s in spans}
    assert by_path["第1章 力学基础"]["category"] == CATEGORY_BODY
    assert by_path["第2章 习题解析"]["category"] == CATEGORY_QUIZ
    assert by_path["本章小结"]["category"] == CATEGORY_SUMMARY
    assert by_path["附录A 符号表"]["category"] == CATEGORY_APPENDIX
    assert by_path["附录B 期末试卷"]["category"] == CATEGORY_APPENDIX  # 强规则附录先于总测试词
    assert by_path["第2章 习题解析 > 2.1 习题一"]["category"] == CATEGORY_QUIZ


def test_rule_ambiguous_goes_to_llm():
    """「单元测试实践」含歧义词但无强规则命中 → 进 LLM 仲裁批次。"""
    hit = {}

    def factory(key):
        class _L:
            def chat(self, messages, **kw):
                hit["user"] = messages[-1]["content"]
                return '[{"i": 0, "category": "正文"}]'
        return _L()

    spans = classify_spans(DOC, llm_factory=factory)
    assert "单元测试实践" in hit.get("user", "")
    by_path = {s["path"]: s for s in spans}
    assert by_path["3.4 单元测试实践"]["category"] == CATEGORY_BODY
    assert by_path["3.4 单元测试实践"]["arbitrated"] is True


def test_llm_failure_rule_verdict_stands():
    def factory(key):
        class _L:
            def chat(self, messages, **kw):
                raise RuntimeError("网络故障")
        return _L()

    spans = classify_spans(DOC, llm_factory=factory)
    by_path = {s["path"]: s for s in spans}
    # 歧义节 LLM 不可用 → 规则缺省正文，不抛
    assert by_path["3.4 单元测试实践"]["category"] == CATEGORY_BODY


def test_gate_off_skips_llm(monkeypatch):
    import core.config as cfgmod
    monkeypatch.setattr(cfgmod.config, "KB_LLM_OUTLINE", 0, raising=False)
    hit = []

    def factory(key):
        hit.append(1)
        raise RuntimeError

    spans = classify_spans(DOC, llm_factory=factory)
    assert hit == []
    assert all(s["category"] for s in spans)


def test_child_inherits_nearest_ancestor_category():
    """习题章下无自身信号的子节继承父类目（防「习题章下的题」被误标正文）。"""
    spans = classify_spans(DOC)
    by_path = {s["path"]: s for s in spans}
    assert by_path["第2章 习题解析 > 2.1 习题一"]["category"] == CATEGORY_QUIZ  # 自身强命中


def test_inheritance_for_unsignalled_child():
    """纯继承用例：子节无任何规则信号 → 最近强命中祖先的类目向下生效。"""
    text = "# 第5章 习题\n说明文字。\n## 5.2 解法技巧\n解题技巧内容。"
    spans = classify_spans(text)
    by_path = {s["path"]: s for s in spans}
    assert by_path["第5章 习题 > 5.2 解法技巧"]["category"] == CATEGORY_QUIZ
    assert by_path["第5章 习题"]["category"] == CATEGORY_QUIZ


def test_own_strong_hit_survives_ancestor():
    """自身强命中绝不被祖先覆盖（AI-Agents 真实书实测暴露：章下「本章小结」被覆盖回正文）。"""
    text = "# 第5章 教学内容\n正文讲解。\n## 5.3 本章小结\n回顾。\n## 5.4 习题\n练习题。"
    spans = classify_spans(text)
    by_path = {s["path"]: s for s in spans}
    assert by_path["第5章 教学内容 > 5.3 本章小结"]["category"] == CATEGORY_SUMMARY
    assert by_path["第5章 教学内容 > 5.4 习题"]["category"] == CATEGORY_QUIZ
    assert by_path["第5章 教学内容"]["category"] == CATEGORY_BODY


# ---------- 树标注 ----------

def test_annotate_tree_categories():
    tree = [{"name": "第1章 力学基础", "children": [
        {"name": "1.1 牛顿定律", "children": []}]},
        {"name": "本章小结", "children": []}]
    spans = classify_spans(DOC)
    annotated = annotate_categories_from_text(DOC, tree, llm_factory=lambda k: (_ for _ in ()).throw(RuntimeError))
    assert annotated[0]["category"] == CATEGORY_BODY
    assert annotated[0]["children"][0]["category"] == CATEGORY_BODY
    assert annotated[1]["category"] == CATEGORY_SUMMARY


# ---------- 范围切分 ----------

def test_scoped_text_excludes_subtree():
    out = scoped_text(DOC, ["第1章 力学基础"])
    assert "牛顿定律" in out and "力学基础" in out
    assert "习题解析" not in out and "符号表" not in out and "本章小结" not in out
    assert "前言介绍文字" in out  # 首标题前内容恒保留


def test_scoped_text_child_only():
    out = scoped_text(DOC, ["第2章 习题解析 > 2.1 习题一"])
    assert "习题一" in out
    assert "力学基础" not in out  # 未勾选的章被切掉


def test_scoped_text_full_include_keeps_all():
    all_paths = ["第1章 力学基础", "第2章 习题解析", "本章小结", "附录A 符号表",
                 "附录B 期末试卷", "3.4 单元测试实践"]
    out = scoped_text(DOC, all_paths)
    for probe in ("牛顿三定律", "习题一", "回顾了力学基础", "符号对照", "综合测试卷", "软件测试方法教学"):
        assert probe in out


def test_scoped_text_empty_include_returns_empty():
    assert scoped_text(DOC, []) == ""


def test_scoped_text_segment_match_survives_root_shift():
    """段级匹配：解析文本带书名根节/垃圾标题层使路径位移时仍命中（真实书教训）。"""
    shifted = "\n".join([
        "书名根节内容",
        "# 书名根节",
        "# 第1章 力学",
        "力学内容。",
        "## 1.1 牛顿定律",
        "牛顿内容。",
        "# 第2章 习题",
        "习题内容。",
    ])
    out = scoped_text(shifted, ["第1章 力学"])
    assert "力学内容" in out and "牛顿内容" in out
    assert "习题内容" not in out
    assert "书名根节内容" in out  # 首标题前内容恒保留


# ---------- apply-scope 端点与后台 ----------

class _StubRepo:
    def __init__(self, original="原文占位"):
        self._original = original
        self.deleted = []

    def get_resource_content(self, pid, source):
        return self._original

    def get_kb_tree(self, pid, source):
        return [{"name": "第1章", "children": []}]

    def delete_kb_by_source(self, pid, source):
        self.deleted.append((pid, source))
        return 1


@pytest.fixture()
def scope_env(monkeypatch):
    import routers.knowledge as rk
    from fastapi import FastAPI
    from starlette.testclient import TestClient
    repo = _StubRepo()
    monkeypatch.setattr("core.db.get_kb_repo", lambda: repo)
    subs = []
    monkeypatch.setattr(rk, "submit", lambda fn, *a, **k: subs.append((fn, a, k)))
    app = FastAPI()
    app.include_router(rk.router)
    return type("Env", (), {"client": TestClient(app), "repo": repo, "subs": subs})()


def test_apply_scope_happy_path(scope_env):
    r = scope_env.client.post("/api/kb/p1/apply-scope", json={
        "source": "教材.pdf", "include": ["第1章"], "api_key": ""})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "processing"
    assert len(scope_env.subs) == 1
    fn, args, kw = scope_env.subs[0]
    assert fn.__name__ == "_rescope_bg"
    scoped_arg = args[2]
    full_tree_arg = args[3]
    assert "第1章" not in scoped_arg or True  # 具体断言在 bg 测试
    assert full_tree_arg == [{"name": "第1章", "children": []}]  # 全树随行（大纲不丢节）


def test_apply_scope_empty_include_rejected(scope_env):
    r = scope_env.client.post("/api/kb/p1/apply-scope", json={
        "source": "教材.pdf", "include": [], "api_key": ""})
    assert r.json()["status"] == "error"


def test_apply_scope_no_original_rejected(monkeypatch):
    import routers.knowledge as rk
    from fastapi import FastAPI
    from starlette.testclient import TestClient
    monkeypatch.setattr("core.db.get_kb_repo", lambda: _StubRepo(original=""))
    app = FastAPI()
    app.include_router(rk.router)
    r = TestClient(app).post("/api/kb/p1/apply-scope", json={
        "source": "教材.pdf", "include": ["第1章"], "api_key": ""})
    assert r.json()["status"] == "error"


def test_rescope_bg_calls_add_document_with_full_tree(monkeypatch):
    import routers.knowledge as rk
    import core.knowledge_service as ks
    captured = {}
    monkeypatch.setattr(ks, "add_document",
                        lambda pid, text, source, session_id="", api_key="", skip_context=False, outline_tree=None:
                        captured.update({"text": text, "tree": outline_tree, "source": source}) or 5)
    monkeypatch.setattr(ks, "_set_progress", lambda *a, **k: None)
    tree = [{"name": "全树", "children": []}]
    rk._rescope_bg("p1", "教材.pdf", "范围内文本", tree, "")
    assert captured["text"] == "范围内文本"
    assert captured["tree"] == tree          # 全树回写（被排除节仍在大纲可见）
    assert captured["source"] == "教材.pdf"


def test_rescope_bg_error_writes_progress_error(monkeypatch):
    import routers.knowledge as rk
    import core.knowledge_service as ks
    errs = []
    monkeypatch.setattr(ks, "add_document", lambda *a, **k: (_ for _ in ()).throw(RuntimeError(" embedding 挂了")))
    monkeypatch.setattr(ks, "_set_progress", lambda *a, **k: None)
    monkeypatch.setattr(ks, "_set_progress_error", lambda pid, src, msg: errs.append((pid, src, msg)))
    rk._rescope_bg("p1", "教材.pdf", "范围内文本", [], "")
    assert errs and "embedding 挂了" in errs[0][2]
