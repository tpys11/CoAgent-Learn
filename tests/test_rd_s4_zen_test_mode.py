# -*- coding: utf-8 *-* 
"""R-D S4：zen_test_mode 设置透传（红先行）。
PUT bool-in-_vals 显式落 ZEN_TEST_MODE（R14 红线：false 必须能落 0）；GET zen 节回显 test_mode；
T51 语义：exclude_unset 缺省不发不覆写。落库后 current_tier() 即时随档（决策 38 后台链路总开关）。"""
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


def test_put_zen_test_mode_true_reflects_get_config_and_tier(settings_env, monkeypatch):
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")   # 基线桩定（不依赖宿主状态）
    r = tc.put("/api/settings", json={"zen_test_mode": True})
    assert r.json()["status"] == "ok"
    assert tc.get("/api/settings").json()["zen"]["test_mode"] is True
    assert str(getattr(_cfg, "ZEN_TEST_MODE")) == "1"
    from core.model_provider import current_tier
    assert current_tier() == "test"   # 后台辅助链（compress/ingest/outline/resource_gen）即时随档


def test_put_zen_test_mode_false_lands_zero(settings_env, monkeypatch):
    """R14 红线：false 必须能落 0（bool 用 in _vals 显式判断，不能被 exclude_unset 吞掉）。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    tc.put("/api/settings", json={"zen_test_mode": False})
    assert tc.get("/api/settings").json()["zen"]["test_mode"] is False
    assert str(getattr(_cfg, "ZEN_TEST_MODE")) == "0"


def test_put_without_zen_test_mode_keeps_existing(settings_env, monkeypatch):
    """T51 语义：缺省字段不覆写——PUT 不带 zen_test_mode 时不得把已存 1 打回 0。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    tc.put("/api/settings", json={"zen_api_key": "sk-zen-fake"})
    assert tc.get("/api/settings").json()["zen"]["test_mode"] is True
