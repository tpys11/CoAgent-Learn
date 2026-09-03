# -*- coding: utf-8 -*-
"""F14-S4d：GET /api/settings/zen/models——TTL 缓存+失败兜底（红先行）。
T33：main / pipeline 一律 fixture 执行期导入；T49：SQLITE_DIR 隔离，真实库零触碰。"""
import pytest
from unittest.mock import patch, MagicMock
import fastapi.testclient


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


@pytest.fixture(autouse=True)
def reset_zen_cache():
    """Reset module-level cache between tests"""
    import routers.settings as settings_mod
    settings_mod._ZEN_MODELS_CACHE["ts"] = 0.0
    settings_mod._ZEN_MODELS_CACHE["models"] = None
    yield
    settings_mod._ZEN_MODELS_CACHE["ts"] = 0.0
    settings_mod._ZEN_MODELS_CACHE["models"] = None


def test_zen_models_success(settings_env, monkeypatch):
    """F14-S4d①：成功解析返回 models 列表"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{"id": "model-a"}, {"id": "model-b"}]}
    import requests
    monkeypatch.setattr(requests, "get", lambda *a, **kw: mock_resp)
    resp = tc.get("/api/settings/zen/models")
    data = resp.json()
    assert data["status"] == "ok"
    assert "model-a" in data["models"]
    assert "model-b" in data["models"]


def test_zen_models_cache_hit(settings_env, monkeypatch):
    """F14-S4d②：缓存命中第二次不打网"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    call_count = [0]
    def mock_get(*a, **kw):
        call_count[0] += 1
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": [{"id": "model-a"}]}
        return mock_resp
    import requests
    monkeypatch.setattr(requests, "get", mock_get)
    tc.get("/api/settings/zen/models")
    tc.get("/api/settings/zen/models")
    assert call_count[0] == 1  # 第二次命中缓存


def test_zen_models_missing_key(settings_env, monkeypatch):
    """F14-S4d③：缺 key 返回 error"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "")
    resp = tc.get("/api/settings/zen/models")
    data = resp.json()
    assert data["status"] == "error"
    assert "未配置" in data["msg"]


def test_zen_models_http_error(settings_env, monkeypatch):
    """F14-S4d④：HTTP 500 返回 error"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    import requests
    monkeypatch.setattr(requests, "get", lambda *a, **kw: mock_resp)
    resp = tc.get("/api/settings/zen/models")
    data = resp.json()
    assert data["status"] == "error"
    assert "500" in data["msg"]