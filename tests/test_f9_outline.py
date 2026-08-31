# -*- coding: utf-8 -*-
"""F9-S1 大纲三通道提取测试：书签优先 → 标题行 → LLM 兜底。
纪律（T33）：本文件模块级只 import core.outline_service（无 engine/main 顶层导入）；
LLM 兜底一律注入桩 factory，绝不真调网络。"""
import pytest

from core.outline_service import extract_outline


def _mk_pdf_with_toc(toc: list) -> bytes:
    """用 fitz 现做一份带书签的最小 PDF（S5 真实教材之外的单测自足路径）。
    set_toc 校验页码不越界 → 按引用的最大页码补建空白页。"""
    import fitz
    doc = fitz.open()
    try:
        max_page = max([int(t[2]) for t in toc if len(t) >= 3], default=1)
        for _ in range(max_page):
            page = doc.new_page()
            page.insert_text((72, 72), "hello")
        doc.set_toc(toc)
        return doc.tobytes()
    finally:
        doc.close()


# ── 通道 1：PDF 书签（get_toc）──

def test_channel1_bookmark_tree_with_pages():
    data = _mk_pdf_with_toc([
        [1, "第一章 导论", 1], [2, "1.1 背景", 1], [2, "1.2 方法", 2],
        [1, "第二章 实验", 3],
    ])
    tree = extract_outline("无关正文", pdf_bytes=data)
    assert [n["name"] for n in tree] == ["第一章 导论", "第二章 实验"]
    assert tree[0]["page"] == 1
    assert [c["name"] for c in tree[0]["children"]] == ["1.1 背景", "1.2 方法"]
    assert tree[0]["children"][1]["page"] == 2


def test_channel1_bookmark_skipped_levels_grouping():
    """书签层级跳跃（1→3）不丢节点：照 _extract_tree 的栈式归组语义。
    （set_toc 自身拒绝跳级，故直接钉装配层 _build_tree——真实世界 get_toc 输出可能有跳级。）"""
    from core.outline_service import _build_tree
    tree = _build_tree([{"name": "篇一", "level": 1, "page": 1},
                        {"name": "跳级小节", "level": 3, "page": 2}])
    assert [n["name"] for n in tree] == ["篇一"]
    assert tree[0]["children"][0]["name"] == "跳级小节"
    assert tree[0]["children"][0]["page"] == 2


def test_channel1_beats_title_lines():
    """PDF 既有书签又有 markdown 标题行 → 书签通道优先。"""
    data = _mk_pdf_with_toc([[1, "书签章", 1]])
    tree = extract_outline("# 标题行章\n正文", pdf_bytes=data)
    assert [n["name"] for n in tree] == ["书签章"]


def test_channel1_empty_toc_falls_to_title_lines():
    """无书签 PDF → 降级标题行通道（兜底链不因 PDF 类型断裂）。"""
    data = _mk_pdf_with_toc([])  # set_toc 空表 = 无书签
    tree = extract_outline("# 第一章\n内容", pdf_bytes=data)
    assert [n["name"] for n in tree] == ["第一章"]


# ── 通道 2：标题行（复用 chunkers._extract_tree 语义）──

def test_channel2_title_lines_without_pdf():
    tree = extract_outline("# 第一章\n内容\n## 1.1 小节\n更多")
    assert [n["name"] for n in tree] == ["第一章"]
    assert tree[0]["children"][0]["name"] == "1.1 小节"


def test_channel2_heading_present_skips_llm():
    """有标题行时不触发 LLM（成本护栏）。"""
    hit = []

    def factory(key):
        hit.append(1)
        raise RuntimeError("有标题行不应进 LLM 通道")

    tree = extract_outline("# 有标题", llm_factory=factory)
    assert hit == []
    assert tree and tree[0]["name"] == "有标题"


# ── 通道 3：LLM 兜底（注入桩）──

def test_channel3_llm_fallback_builds_tree():
    def factory(key):
        class _L:
            def chat(self, messages, **kw):
                return '[{"name": "第一部分", "level": 1}, {"name": "1.1 概念", "level": 2}]'
        return _L()

    tree = extract_outline("纯文本无标题行。" * 200, llm_factory=factory)
    assert [n["name"] for n in tree] == ["第一部分"]
    assert tree[0]["children"][0]["name"] == "1.1 概念"


def test_channel3_llm_failure_returns_empty_not_raise():
    """LLM 故障 → 空树不阻断上传（B1 同款哲学）。"""
    def factory(key):
        class _L:
            def chat(self, messages, **kw):
                raise RuntimeError("网络故障")
        return _L()

    assert extract_outline("纯文本无标题行。" * 200, llm_factory=factory) == []


def test_channel3_llm_garbage_output_coerced():
    """LLM 输出非 JSON/含幻觉条目 → 防御式收敛为可用树（KG 同款纪律）。"""
    def factory(key):
        class _L:
            def chat(self, messages, **kw):
                return '前置噪声 [{"name": "", "level": 1}, {"name": "有效章", "level": 1}] 尾部'
        return _L()

    tree = extract_outline("纯文本无标题行。" * 200, llm_factory=factory)
    assert [n["name"] for n in tree] == ["有效章"]


def test_channel3_gate_off_skips_llm(monkeypatch):
    """KB_LLM_OUTLINE=0 → 不进 LLM 通道（门控与 B1/KG 同款）。"""
    import core.config as cfgmod
    monkeypatch.setattr(cfgmod.config, "KB_LLM_OUTLINE", 0, raising=False)
    hit = []

    def factory(key):
        hit.append(1)
        raise RuntimeError("门控关闭不应调用")

    assert extract_outline("纯文本无标题行。" * 200, llm_factory=factory) == []
    assert hit == []


def test_empty_text_returns_empty():
    assert extract_outline("") == []
    assert extract_outline("   \n  ") == []


# ---------- 接线：提取结果落 kb_tree（FakeRepo 模式照 test_semantic_chunker） ----------

import core.knowledge_service as ks  # noqa: E402
from core.config import config as _cfg  # noqa: E402


class _FakeRepo:
    """add_document 依赖面桩：只捕获 tree 落库；向量面给最小定值。"""

    def __init__(self):
        self.trees = []

    def resolve_active_text_table(self):
        return "kb_vectors"

    def ensure_vector_dim(self, table, expected=None):
        return 1024

    def delete_kb_by_source(self, pid, src):
        return 0

    def upsert_kb_vectors_bulk(self, items, table="kb_vectors"):
        pass

    def upsert_kb_tree(self, pid, src, tree):
        self.trees.append((pid, src, tree))


def _fake_embed(texts):
    return [[0.0, 1.0] for _ in texts]


def test_add_document_outline_tree_lands_in_kb_tree(monkeypatch):
    """书签大纲经 add_document(outline_tree=…) 原样落 kb_tree（含 page 字段）。"""
    repo = _FakeRepo()
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _fake_embed)
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 0)
    outline = [{"name": "书签章", "children": [{"name": "小节", "children": []}], "page": 3}]
    n = ks.add_document("p1", "正文内容足够切块的若干文字。", source="教材.pdf",
                        api_key="", outline_tree=outline)
    assert n >= 1
    assert repo.trees and repo.trees[0][2] == outline  # 书签树原样落库（不重算不覆盖）


def test_add_document_outline_none_falls_back_to_extract_tree(monkeypatch):
    """outline_tree=None（直接调用方/旧路径）→ 既有 _extract_tree 行为不变。"""
    repo = _FakeRepo()
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _fake_embed)
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 0)
    n = ks.add_document("p1", "# 标题章\n正文", source="笔记.md", api_key="")
    assert n >= 1
    assert repo.trees and [x["name"] for x in repo.trees[0][2]] == ["标题章"]


def test_process_upload_threads_pdf_bytes_to_outline(monkeypatch):
    """漏斗收口：_process_upload 调 extract_outline 透传 pdf_bytes，并把结果传给 add_document。"""
    import routers.knowledge as rk  # T33：执行期导入，不进 collection 期

    captured = {}

    def fake_extract(text, pdf_bytes=None, api_key="", llm_factory=None):
        captured["pdf_bytes"] = pdf_bytes
        return [{"name": "漏斗章", "children": []}]

    def fake_add(pid, text, source, session_id, api_key, skip_context=False, outline_tree=None):
        captured["outline_tree"] = outline_tree
        return 3

    monkeypatch.setattr("core.outline_service.extract_outline", fake_extract)
    monkeypatch.setattr("core.knowledge_service.add_document", fake_add)
    n = rk._process_upload("p1", "文本", "教材.pdf", "s", "", content_hash="", pdf_bytes=b"PDF")
    assert n == 3
    assert captured["pdf_bytes"] == b"PDF"
    assert captured["outline_tree"] == [{"name": "漏斗章", "children": []}]

