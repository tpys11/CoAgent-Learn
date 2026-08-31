# -*- coding: utf-8 -*-
"""Step F8-S4 守卫：扫描件 OCR 出路（is_ocr auto + 近空 MinerU 重试 + 无 token 指引）。

背景（派发单 §三 S4）：MinerU is_ocr 硬编码 False → 图片型 PDF 无文字层时全链路无解。
本守卫钉住：
1. fitz 文字层检测：前 3 页总长 < 阈值 → is_ocr=True（真 PDF 字节驱动，fitz 在库）；
2. is_ocr 决策进 MinerU batch 请求体（mock HTTP，不真调云）；
3. pymupdf4llm 近空 → 降级链前先试 MinerU(is_ocr=True)（token 门控）；
4. 无 token：错误文案含 mineru.net 申请指引；解析层永不抛出（优雅降级语义不变）。
"""
import io
import zipfile
from types import SimpleNamespace

import fitz
import pytest

import core.db as core_db
import routers.knowledge as kmod
from core import parse_service
from core.config import config as _cfg


def _pdf_bytes(with_text: bool) -> bytes:
    """构造 2 页 PDF：with_text=True 带文字层；False 模拟扫描件（无文字层）。"""
    doc = fitz.open()
    for i in range(2):
        page = doc.new_page()
        if with_text:
            page.insert_text((72, 72), f"第 {i} 页文字层内容，用于 is_ocr 决策检测。" * 3)
    return doc.tobytes()


class _FakeResp:
    def __init__(self, payload=None, content=b""):
        self._payload = payload
        self.content = content
        self.status_code = 200

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


@pytest.fixture()
def mineru_env(monkeypatch):
    """token 在位 + config 恢复保护。"""
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "tok-fake")
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "mineru")
    return SimpleNamespace()


def _mock_mineru_http(monkeypatch, calls: dict):
    """MinerU 四步 HTTP 全 mock：申请 URL → PUT → 轮询 done → ZIP 下载（full.md）。"""
    import requests

    def fake_post(url, **kw):
        calls["batch_body"] = kw.get("json")
        return _FakeResp({"data": {"batch_id": "b1", "file_urls": ["http://put-url"]}})

    def fake_put(url, data=None, timeout=None):
        calls["put_bytes"] = len(data or b"")
        return _FakeResp()

    def fake_get(url, **kw):
        if "extract-results" in url:
            return _FakeResp({"data": {"extract_result": [
                {"state": "done", "full_zip_url": "http://zip-url"}]}})
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("full.md", "OCR 提取的全文内容。")
        return _FakeResp(content=buf.getvalue())

    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests, "put", fake_put)
    monkeypatch.setattr(requests, "get", fake_get)


# ══════════════ 1. fitz 文字层检测 ══════════════

def test_needs_ocr_true_for_scanned_pdf():
    """无文字层 PDF → 判扫描件。"""
    assert parse_service._needs_ocr(_pdf_bytes(with_text=False)) is True


def test_needs_ocr_false_for_text_pdf():
    """文字层充足 → 不走 OCR。"""
    assert parse_service._needs_ocr(_pdf_bytes(with_text=True)) is False


def test_needs_ocr_false_for_garbage_bytes():
    """打不开的字节不做决策（返回 False），交引擎链报错降级。"""
    assert parse_service._needs_ocr(b"not a pdf") is False


# ══════════════ 2. is_ocr 决策进请求体（mock HTTP） ══════════════

def test_mineru_auto_sets_is_ocr_true_for_scanned(mineru_env, monkeypatch):
    calls: dict = {}
    _mock_mineru_http(monkeypatch, calls)
    text = parse_service._parse_mineru(_pdf_bytes(with_text=False), "scan.pdf")
    assert "OCR 提取的全文内容" in text
    assert calls["batch_body"]["files"][0]["is_ocr"] is True, calls["batch_body"]


def test_mineru_auto_keeps_false_for_text_pdf(mineru_env, monkeypatch):
    calls: dict = {}
    _mock_mineru_http(monkeypatch, calls)
    parse_service._parse_mineru(_pdf_bytes(with_text=True), "text.pdf")
    assert calls["batch_body"]["files"][0]["is_ocr"] is False


def test_mineru_explicit_override_wins(mineru_env, monkeypatch):
    """显式 is_ocr 覆盖 auto（重试路径依赖此语义）。"""
    calls: dict = {}
    _mock_mineru_http(monkeypatch, calls)
    parse_service._parse_mineru(_pdf_bytes(with_text=True), "text.pdf", is_ocr=True)
    assert calls["batch_body"]["files"][0]["is_ocr"] is True


# ══════════════ 3. 无 token：优雅降级 + 指引文案 ══════════════

def test_mineru_no_token_message_has_guidance(monkeypatch):
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    with pytest.raises(RuntimeError) as ei:
        parse_service._parse_mineru(_pdf_bytes(with_text=False), "scan.pdf")
    assert "mineru.net" in str(ei.value), "无 token 错误必须含申请指引"
    assert "设置" in str(ei.value), "文案须含「怎么办」入口"


def test_parse_document_never_raises_without_token(monkeypatch):
    """无 token：parse_document 永不抛出（优雅降级语义保持——S4 红线）。"""
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "mineru")
    text, engine = parse_service.parse_document("x.pdf", _pdf_bytes(with_text=True))
    assert isinstance(text, str) and engine in ("pymupdf4llm", "mineru", "mathpix", "legacy")


def test_scanned_guidance_empty_when_token_present(monkeypatch):
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "tok-fake")
    assert parse_service.scanned_pdf_guidance() == ""
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    assert "mineru.net" in parse_service.scanned_pdf_guidance()


# ══════════════ 4. 近空重试（token 门控，mock 引擎） ══════════════

def test_near_empty_pymupdf4llm_triggers_ocr_retry(monkeypatch):
    """pymupdf4llm 近空 → 降级链前先试 MinerU(is_ocr=True) → 成功则以 mineru-ocr 返回。"""
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "pymupdf4llm")
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "tok-fake")
    monkeypatch.setattr(parse_service, "_ENGINES", {
        "pymupdf4llm": lambda data, fn: "x",   # 近空（< 16 字符）
        "mineru": lambda data, fn: (_ for _ in ()).throw(AssertionError("不应经 _ENGINES 调 mineru")),
    })
    seen = {}

    def fake_mineru(data, filename, is_ocr=None):
        seen["is_ocr"] = is_ocr
        return "OCR 重试提取的完整全文。"

    monkeypatch.setattr(parse_service, "_parse_mineru", fake_mineru)
    text, engine = parse_service.parse_document("scan.pdf", _pdf_bytes(with_text=False))
    assert engine == "mineru-ocr" and "OCR 重试提取" in text
    assert seen["is_ocr"] is True, "重试必须显式 is_ocr=True"


def test_near_empty_retry_skipped_without_token(monkeypatch):
    """无 token：重试门控关闭，保持既有降级语义（pymupdf4llm 近空文本照常返回）。"""
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "pymupdf4llm")
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    called = {"n": 0}

    def fake_mineru(data, filename, is_ocr=None):
        called["n"] += 1
        return "不应被调用"

    monkeypatch.setattr(parse_service, "_parse_mineru", fake_mineru)
    monkeypatch.setattr(parse_service, "_ENGINES", {
        "pymupdf4llm": lambda data, fn: "x",   # 近空（< 16 字符）
    })
    text, engine = parse_service.parse_document("scan.pdf", _pdf_bytes(with_text=False))
    assert called["n"] == 0 and engine == "pymupdf4llm" and text == "x"


# ══════════════ 5. 空文本报错带指引（knowledge 层） ══════════════

@pytest.fixture()
def kb_env(tmp_path, monkeypatch):
    class _StubRepo:
        def save_file_hash(self, project_id, content_hash, source):
            pass

    monkeypatch.setattr(core_db, "get_kb_repo", lambda: _StubRepo())
    monkeypatch.setattr(kmod, "_save_resource_text", lambda pid, src, text: None)
    monkeypatch.setattr(kmod, "_process_upload",
                        lambda pid, text, source, session_id, api_key, sc, sg, ch: 1)
    subs = []
    monkeypatch.setattr(kmod, "submit", lambda fn, *a, **k: subs.append((fn, a, k)))
    return SimpleNamespace(subs=subs)


def test_bg_empty_pdf_error_carries_guidance(kb_env, monkeypatch):
    """后台链：PDF 解析全空 + 无 token → 进度错误文案含 mineru.net 指引。"""
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    monkeypatch.setattr(kmod, "_parse_for_upload",
                        lambda fname, data, ext: ("", "pymupdf4llm"))
    kmod._process_file_bg("pS", "scan.pdf", b"x", "scan.pdf", "sX", "k", "h1", "pdf")
    import core.knowledge_service as ks
    prog = ks.get_progress("pS", "scan.pdf")
    assert prog["status"] == "error" and "mineru.net" in prog["msg"], prog


def test_sync_empty_pdf_error_carries_guidance(kb_env, monkeypatch):
    from fastapi import FastAPI
    from starlette.testclient import TestClient
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    monkeypatch.setattr(kmod, "_parse_for_upload",
                        lambda fname, data, ext: ("", "pymupdf4llm"))
    app = FastAPI()
    app.include_router(kmod.router)
    r = TestClient(app).post(
        "/api/knowledge/upload-file",
        data={"project_id": "pS", "session_id": "s", "api_key": "", "wait": "1"},
        files={"file": ("scan.pdf", b"%PDF-fake", "application/pdf")})
    d = r.json()
    assert d["status"] == "error" and "mineru.net" in d["msg"], d
