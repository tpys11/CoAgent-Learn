# -*- coding: utf-8 -*-
"""F14-S3b：test 端点扩展对话/审核探测——GET /models 零 token 原语。
T33：main / pipeline 一律 fixture 执行期导入；T49：SQLITE_DIR 隔离，真实库零触碰。"""
import pytest
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


def test_chat_probe_success(settings_env, monkeypatch):
    """对话探测成功：mock requests.get 返回 200。
    CI 条件（无 .env）下 DEEPSEEK_* 为空会短路「未配置 Key」——显式桩 config，不依赖宿主环境。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "sk-test-only-fake-DO-NOT-USE")
    monkeypatch.setattr(_cfg, "DEEPSEEK_BASE_URL", "https://fake.example/v1")
    import requests
    class MockResponse:
        status_code = 200
        def json(self):
            return {"data": [{"id": "model1"}]}
    def mock_get(*args, **kwargs):
        return MockResponse()
    monkeypatch.setattr(requests, "get", mock_get)
    resp = tc.post("/api/settings/test", json={})
    data = resp.json()
    assert "chat" in data["results"]
    assert data["results"]["chat"]["ok"] is True


def test_chat_probe_missing_key(settings_env, monkeypatch):
    """对话探测缺 key：未配置 key 时返回未配置"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "")
    resp = tc.post("/api/settings/test", json={})
    data = resp.json()
    assert "chat" in data["results"]
    assert data["results"]["chat"]["ok"] is False
    assert "未配置 Key" in data["results"]["chat"]["msg"]


def test_chat_probe_timeout(settings_env, monkeypatch):
    """对话探测超时：mock requests.get 抛出异常（config 桩同上，不依赖宿主 .env）。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "sk-test-only-fake-DO-NOT-USE")
    monkeypatch.setattr(_cfg, "DEEPSEEK_BASE_URL", "https://fake.example/v1")
    import requests
    def mock_get(*args, **kwargs):
        raise Exception("timeout")
    monkeypatch.setattr(requests, "get", mock_get)
    resp = tc.post("/api/settings/test", json={})
    data = resp.json()
    assert "chat" in data["results"]
    assert data["results"]["chat"]["ok"] is False
    assert "timeout" in data["results"]["chat"]["msg"]


def test_review_probe_missing_key(settings_env, monkeypatch):
    """RC4 改写：审核探测缺配置=「未配置 Key」（定值格恒有模型，原「未配置审核模型」分支退役）——
    standard 档 VL/EMBEDDING 兜底链全空 → review 探测诚实报缺配置。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    resp = tc.post("/api/settings/test", json={})
    data = resp.json()
    assert "review" in data["results"]
    assert data["results"]["review"]["ok"] is False
    assert "未配置 Key" in data["results"]["review"]["msg"]