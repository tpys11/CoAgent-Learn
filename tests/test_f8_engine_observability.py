# -*- coding: utf-8 -*-
"""Step F8-S2 守卫：解析引擎透传链（解析 → 进度/上传响应 → 前端可展示）。

背景（派发单 §三 S2）：成功解析只打 INFO、engine_used 不透传前端——用户不知道
能切 MinerU/该文档用了哪个引擎。本守卫钉住：
1. _parse_for_upload 返回 (text, engine)：PDF mock 引擎、非 PDF 标注 markitdown/legacy；
2. 后台链 _process_file_bg → get_progress 载荷带 parse_engine（轮询全程可见）；
3. 同步 wait=1 上传响应带 parse_engine 字段。

纪律：全 mock/桩（T49 不触真实库），submit 同步执行留痕。
"""
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

import core.db as core_db
import core.knowledge_service as ks
import routers.knowledge as kmod


class _StubKbRepo:
    def save_file_hash(self, project_id, content_hash, source):
        pass


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(core_db, "get_kb_repo", lambda: _StubKbRepo())
    monkeypatch.setattr(kmod, "_save_resource_text", lambda pid, src, text: None)
    monkeypatch.setattr(kmod, "_process_upload",
                        lambda pid, text, source, session_id, api_key, sc, sg, ch: 3)
    subs = []
    monkeypatch.setattr(kmod, "submit", lambda fn, *a, **k: subs.append((fn, a, k)))
    app = FastAPI()
    app.include_router(kmod.router)
    return SimpleNamespace(client=TestClient(app), subs=subs)


def test_parse_for_upload_pdf_returns_engine(env, monkeypatch):
    """PDF 路径：mock parse_document（不真调引擎），断言 (text, engine) 原样透传。"""
    from core import parse_service
    monkeypatch.setattr(parse_service, "parse_document",
                        lambda fname, data: ("探针文本", "mineru"))
    assert kmod._parse_for_upload("a.pdf", b"x", "pdf") == ("探针文本", "mineru")


def test_parse_for_upload_non_pdf_engine_label(env, monkeypatch):
    """非 PDF：markitdown 成功 → markitdown；markitdown 失败/不支持 → legacy。"""
    import core.file_parser as fp
    monkeypatch.setattr(fp, "_parse_with_markitdown", lambda data: "MD 探针")
    assert kmod._parse_for_upload("a.txt", b"x", "txt") == ("MD 探针", "markitdown")
    monkeypatch.setattr(fp, "_parse_with_markitdown", lambda data: None)
    text, engine = kmod._parse_for_upload("a.txt", "F8 透传探针文本。".encode("utf-8"), "txt")
    assert engine == "legacy" and "F8 透传探针" in text


def test_bg_progress_carries_parse_engine(env, monkeypatch):
    """后台链：_process_file_bg 解析后 get_progress 载荷必须带 parse_engine
    （且多阶段覆盖后仍可见——旁路记录，不随 stage 更新被抹掉）。"""
    from core import parse_service
    monkeypatch.setattr(parse_service, "parse_document",
                        lambda fname, data: ("后台探针", "pymupdf4llm"))
    kmod._process_file_bg("pE", "doc.pdf", b"x", "doc.pdf", "sX", "k", "h1", "pdf")
    prog = ks.get_progress("pE", "doc.pdf")
    assert prog["status"] == "ok" and prog["parse_engine"] == "pymupdf4llm", prog
    # 后续阶段整条覆盖进度后引擎仍可见（旁路记录不被 _set_progress 抹掉）——
    # 前端完成汇总依赖完成拍上的该字段
    ks._set_progress("pE", "doc.pdf", 1, 1, "enhancing")
    prog = ks.get_progress("pE", "doc.pdf")
    assert prog["stage"] == "enhancing" and prog["parse_engine"] == "pymupdf4llm", prog


def test_sync_response_carries_parse_engine(env, monkeypatch):
    """同步 wait=1：上传响应必须带 parse_engine 字段（前端展示数据源）。"""
    monkeypatch.setattr(kmod, "_parse_for_upload",
                        lambda fname, data, ext: ("同步探针文本。", "mathpix"))
    r = env.client.post(
        "/api/knowledge/upload-file",
        data={"project_id": "pE", "session_id": "s", "api_key": "", "wait": "1"},
        files={"file": ("probe.txt", "x".encode("utf-8"), "text/plain")})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok" and d.get("parse_engine") == "mathpix", d
    assert d["chunks"] == 3 and d["source"] == "probe.txt"


def test_progress_endpoint_without_engine_stays_clean(env):
    """无引擎记录（如文本直投）时进度载荷不掺空字段（向后兼容旧消费方）。"""
    ks._set_progress("pNone", "t.txt", 1, 1, "enhancing")
    d = env.client.get("/api/knowledge/upload-progress?project_id=pNone&source=t.txt").json()
    assert d["status"] == "ok" and "parse_engine" not in d, d
