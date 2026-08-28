# -*- coding: utf-8 -*-
"""上传提速·单步2：全链进度事件（stage 序列）+ 解析后台化（_process_file_bg 直调守卫）。"""
import pytest

import core.knowledge_service as ks
import routers.knowledge as kmod
from core.config import config as _cfg
from core.db.base import SQLiteClient


class _StubKbRepo:
    """add_document 依赖的 KB 仓储桩：全部静默成功（含 file_hashes 记录）。"""

    def resolve_active_text_table(self):
        return "kb_vectors"

    def delete_kb_by_source(self, project_id, source):
        return 0

    def ensure_vector_dim(self, table):
        pass

    def upsert_kb_vectors_bulk(self, bulk, table=None):
        pass

    def upsert_kb_tree(self, project_id, source, tree):
        pass

    def save_file_hash(self, project_id, h, source):
        pass


@pytest.fixture()
def env(tmp_path, monkeypatch):
    c = SQLiteClient(str(tmp_path / "up.db"))
    c.init_tables()
    monkeypatch.setattr(ks, "_db", _StubKbRepo())
    monkeypatch.setattr(ks, "_embed", lambda chunks: [[0.0] * 4 for _ in chunks])
    monkeypatch.setattr(ks, "_invalidate_bm25", lambda pid: None)
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 0)
    # 进度记录器：包装真实 _set_progress，保序留痕（get_progress 仍可用）
    seen = []
    real = ks._set_progress

    def rec(pid, src, done, total, stage="embedding"):
        seen.append((stage, done, total))
        real(pid, src, done, total, stage)

    monkeypatch.setattr(ks, "_set_progress", rec)
    return c, seen


def test_add_document_progress_stages(env):
    """入库链进度序列：chunking → embedding(done 递增至 total) → enhancing 收尾。"""
    c, seen = env
    n = ks.add_document("pX", "# 标题A\n内容一。\n# 标题B\n内容二。", "srcX", api_key="")
    assert n >= 1
    assert seen[0][0] == "chunking"
    emb = [s for s in seen if s[0] == "embedding"]
    assert emb and emb[-1][1] == emb[-1][2]                 # done 递增至 total
    assert seen[-1] == ("enhancing", 1, 1)
    # 进度端点载荷带 stage（向后兼容：status/done/total 仍在）
    prog = ks.get_progress("pX", "srcX")
    assert prog["status"] == "ok" and prog["stage"] == "enhancing"


def test_process_file_bg_parses_and_routes(env, monkeypatch):
    """后台全链：txt 解析（直读）→ _process_upload；解析阶段进度先置。"""
    c, seen = env
    captured = {}
    monkeypatch.setattr(kmod, "_process_upload",
                        lambda pid, text, source, session_id, api_key, sc, sg, ch:
                        captured.update({"text": text, "source": source, "hash": ch}) or 3)
    import core.db as core_db
    monkeypatch.setattr(core_db, "get_kb_repo", lambda: _StubKbRepo())

    kmod._process_file_bg("pX", "note.txt", "上传内容实测".encode("utf-8"), "note.txt",
                          "sX", "k", "hash1", "txt")
    assert captured["text"] == "上传内容实测" and captured["source"] == "note.txt"
    assert captured["hash"] == "hash1"
    assert seen[0][0] == "parsing"                          # 解析阶段进度先置
    assert ks.get_progress("pX", "note.txt")["status"] == "ok"


def test_process_file_bg_empty_parse_error_visible(env, monkeypatch):
    """后台解析为空：不再静默——进度写错误终态（前端轮询可见）。"""
    c, seen = env

    class _EmptyParser:
        @staticmethod
        def parse_document(fname, data):
            return "", "pymupdf4llm"

    import core.parse_service as ps_mod
    monkeypatch.setattr(ps_mod, "parse_document", _EmptyParser.parse_document)
    kmod._process_file_bg("pX", "doc.pdf", b"%PDF-fake", "doc.pdf", "sX", "k", "h2", "pdf")
    prog = ks.get_progress("pX", "doc.pdf")
    assert prog["status"] == "error" and "无法解析" in prog["msg"]
