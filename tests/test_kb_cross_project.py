# -*- coding: utf-8 -*-
"""P0-2 回归：跨项目上传同一文件的去重/覆盖/复用。
1. doc_id 必须含 project_id（跨项目同内容互不覆盖——根因2）
2. 同项目重复上传跳过（返回 -1）
3. 跨项目第二次上传走复制路径：不影响 donor、目标项目得完整副本、写 file_hashes
4. 开关关闭时回退全量入库
"""
import hashlib

import pytest

import core.knowledge_service as ks
import routers.knowledge as krouter
from core.knowledge_service import _make_doc_id
from routers.knowledge import KB_CROSS_PROJECT_REUSE, _process_upload

PDF = b"%PDF-1.4 fake-bytes"
SHA = hashlib.sha256(PDF).hexdigest()
SRC = "AI-Agents-in-Depth-zh-CN.pdf"
PA = "projA"   # 先上传者（donor）
PB = "projB"   # 后上传者


class FakeRepo:
    """kb_repo 门面最小替身：只实现被测路径用到的接口（语义对照 _kb_ops 真实现）。"""

    def __init__(self):
        self.rows = []       # (doc_id, project_id, source, chunk, content)
        self.hashes = set()  # {(project_id, sha256, source)}

    # ---- 去重三件套（对照 _kb_ops.has_file_hash / get_file_hash_source / save_file_hash）----
    def has_file_hash(self, project_id, sha256):
        return any(p == project_id and s == sha256 for p, s, _ in self.hashes)

    def get_file_hash_source(self, project_id, sha256):
        for p, s, src in self.hashes:
            if p == project_id and s == sha256:
                return src
        return ""

    def save_file_hash(self, project_id, sha256, source):
        self.hashes.add((project_id, sha256, source))

    # ---- 跨项目复用（对照 _kb_ops 新增三方法）----
    def find_donor_by_hash(self, sha256, exclude_project_id):
        for p, s, src in self.hashes:
            if s == sha256 and p != exclude_project_id and self.count_kb_by_source(p, src) > 0:
                return (p, src)
        return None

    def fetch_kb_rows(self, project_id, source):
        sel = sorted((r for r in self.rows if r[1] == project_id and r[2] == source),
                     key=lambda r: r[3])
        return [(r[3], 0, r[4], b"emb") for r in sel]

    def insert_kb_vectors_raw(self, items, table="kb_vectors"):
        pid = items[0][1]
        ids = {it[0] for it in items}
        self.rows = [r for r in self.rows if not (r[1] == pid and r[0] in ids)]
        self.rows.extend((it[0], it[1], it[2], it[3], it[6]) for it in items)

    # ---- 其余被测路径会碰到但本测试不应触发的接口 ----
    def count_kb_by_source(self, project_id, source):
        return sum(1 for r in self.rows if r[1] == project_id and r[2] == source)

    def peek_active_text_table(self):
        return "kb_vectors"

    def upsert_kb_vectors_bulk(self, items, table="kb_vectors"):
        pid = items[0][1]
        ids = {it[0] for it in items}
        self.rows = [r for r in self.rows if not (r[1] == pid and r[0] in ids)]
        self.rows.extend((it[0], it[1], it[2], it[3], it[6]) for it in items)

    def add_document(self, *a, **k):
        raise AssertionError("去重/复用路径不应触发全量入库")

    def delete_kb_by_source(self, *a, **k):
        return 0

    def ensure_vector_dim(self, *a, **k):
        return None

    def resolve_active_text_table(self):
        return "kb_vectors"

    def upsert_kb_tree(self, *a, **k):
        return None

    def get_gen_questions(self, project_id):
        return {}


class FakePg:
    def __init__(self):
        self.sqls = []

    def execute(self, sql, params=None):
        self.sqls.append((sql, params))
        return []


def _seed_donor(repo, texts=("c0", "c1", "c2")):
    """项目 A 已完整入库（donor）。"""
    repo.hashes.add((PA, SHA, SRC))
    for i, t in enumerate(texts):
        repo.rows.append((_make_doc_id(PA, SRC, i, t), PA, SRC, i, t))


def test_doc_id_project_scoped():
    """跨项目同内容 doc_id 必不同；同项目同内容稳定（重传幂等前提）。"""
    a = _make_doc_id(PA, SRC, 0, "同一段文本")
    b = _make_doc_id(PB, SRC, 0, "同一段文本")
    assert a != b
    assert len(a) == 24, "长度必须与历史一致，避免列宽/类型变化"
    assert a == _make_doc_id(PA, SRC, 0, "同一段文本")


def test_same_project_reupload_returns_minus1(monkeypatch):
    repo = FakeRepo()
    _seed_donor(repo)
    monkeypatch.setattr("core.db.get_kb_repo", lambda: repo)

    assert _process_upload(PA, "全文", SRC, "s1", "key", content_hash=SHA) == -1
    assert repo.count_kb_by_source(PA, SRC) == 3, "真重复不得删除/重建已有块"


def test_cross_project_reuse_copies_without_reingest(monkeypatch):
    repo = FakeRepo()
    _seed_donor(repo)
    pg = FakePg()
    monkeypatch.setattr("core.db.get_kb_repo", lambda: repo)
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr("core.postgres_client.pg_client", pg)
    assert KB_CROSS_PROJECT_REUSE is True, "默认开关应为开（关闭场景见下一条）"

    n = _process_upload(PB, "全文", SRC, "s2", "key", content_hash=SHA)

    assert n == 3, "复用路径应返回真实块数（与全量入库同口径）"
    assert repo.count_kb_by_source(PA, SRC) == 3, "donor 不得被影响（根因2 回归）"
    assert repo.count_kb_by_source(PB, SRC) == 3, "目标项目应得到完整副本"
    assert (PB, SHA, SRC) in repo.hashes, "file_hashes 必须按目标项目写入"
    a_ids = {r[0] for r in repo.rows if r[1] == PA}
    b_ids = {r[0] for r in repo.rows if r[1] == PB}
    assert not (a_ids & b_ids), "doc_id 命名空间必须按项目隔离"
    assert any("resources" in sql for sql, _ in pg.sqls), "原文必须按目标项目存档"


def test_cross_project_reuse_disabled_falls_back_to_full(monkeypatch):
    repo = FakeRepo()
    _seed_donor(repo)
    monkeypatch.setattr("core.db.get_kb_repo", lambda: repo)
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr("core.postgres_client.pg_client", FakePg())
    monkeypatch.setattr(krouter, "KB_CROSS_PROJECT_REUSE", False)
    calls = {}

    def _fake_full_ingest(*a, **k):
        calls["full"] = True
        return 3

    monkeypatch.setattr(ks, "add_document", _fake_full_ingest)

    n = _process_upload(PB, "全文", SRC, "s2", "key", content_hash=SHA)

    assert n == 3
    assert calls.get("full"), "关开关必须回退全量入库路径"
    assert repo.count_kb_by_source(PB, SRC) == 0, "关开关时不得走复制写入"


def test_cross_project_reuse_broken_donor_falls_back(monkeypatch):
    """donor 无向量（幽灵态）→ 复制得 0 块 → 必须回退全量入库而非返回 0。"""
    repo = FakeRepo()
    repo.hashes.add((PA, SHA, SRC))   # 只有 hash，无向量行（幽灵）
    monkeypatch.setattr("core.db.get_kb_repo", lambda: repo)
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr("core.postgres_client.pg_client", FakePg())
    monkeypatch.setattr(ks, "add_document", lambda *a, **k: 5)

    n = _process_upload(PB, "全文", SRC, "s2", "key", content_hash=SHA)

    assert n == 5, "幽灵 donor 必须回退全量入库"
    assert repo.count_kb_by_source(PB, SRC) == 0
