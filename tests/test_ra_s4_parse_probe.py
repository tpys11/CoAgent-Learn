# -*- coding: utf-8 -*-
"""RA-S4：/api/settings/test results 新增 parse 探测键（additive，零网络）。
mineru→token 已配置即 ok；pymupdf4llm→ok 本地引擎。T33/T49：隔离库骨架沿用 test_f14_t51_put_semantics.py。"""
import sys, os
import pytest
import fastapi.testclient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


@pytest.fixture()
def settings_env(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_DIR", str(tmp_path))
    from core.db.base import SQLiteClient
    client = SQLiteClient(str(tmp_path / "iso.db"))
    client.init_tables()
    import core.db.base as base_mod
    import core.db.settings_repo as srmod
    monkeypatch.setattr(base_mod.get_db, "_instance", client, raising=False)
    monkeypatch.setattr(srmod, "_settings_repo", None, raising=False)
    import main as _main
    return fastapi.testclient.TestClient(_main.app), client


def _mock_requests(monkeypatch):
    """全部 HTTP 原语 mock 掉——本探测承诺零网络（T49）。"""
    class _Resp:
        status_code = 200
        def json(self):
            return {"data": [{"id": "x"}]}
    import requests
    monkeypatch.setattr(requests, "get", lambda *a, **kw: _Resp())
    monkeypatch.setattr(requests, "post", lambda *a, **kw: _Resp())


def test_parse_probe_mineru_with_token_ok(settings_env, monkeypatch):
    """mineru + token 已配置 → ok「MinerU 已配置」，不发网络。"""
    tc, _client = settings_env
    _mock_requests(monkeypatch)
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "mineru")
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "sk-mineru-test-only-fake")
    resp = tc.post("/api/settings/test", json={})
    parse = resp.json()["results"]["parse"]
    assert parse["ok"] is True
    assert parse["msg"] == "MinerU 已配置"


def test_parse_probe_mineru_without_token_not_ok(settings_env, monkeypatch):
    """mineru + token 缺失 → ok=False（配置态告警，前端自检行消费）。"""
    tc, _client = settings_env
    _mock_requests(monkeypatch)
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "mineru")
    monkeypatch.setattr(_cfg, "MINERU_API_TOKEN", "")
    resp = tc.post("/api/settings/test", json={})
    assert resp.json()["results"]["parse"]["ok"] is False


def test_parse_probe_pymupdf4llm_local_ok(settings_env, monkeypatch):
    """pymupdf4llm → ok「本地引擎」（零依赖离线可用）。"""
    tc, _client = settings_env
    _mock_requests(monkeypatch)
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "pymupdf4llm")
    resp = tc.post("/api/settings/test", json={})
    parse = resp.json()["results"]["parse"]
    assert parse["ok"] is True
    assert parse["msg"] == "本地引擎"


def test_parse_probe_additive_legacy_keys_intact(settings_env, monkeypatch):
    """additive 红线：既有键（text_embedding/rerank/chat/chat_zen/review/image_embedding）不删。"""
    tc, _client = settings_env
    _mock_requests(monkeypatch)
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "PARSE_ENGINE", "pymupdf4llm")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "sk-test-only-fake")
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "sk-test-only-fake")
    resp = tc.post("/api/settings/test", json={}).json()["results"]
    for key in ("text_embedding", "rerank", "chat", "chat_zen", "review", "image_embedding", "parse"):
        assert key in resp, f"results 缺键 {key}"
