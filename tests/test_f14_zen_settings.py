# -*- coding: utf-8 -*-
"""F14-S4c：settings GET/PUT zen 节——zen_api_key 与 review_model_research（红先行）。
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


def test_put_zen_api_key_partial_get_shows_set(settings_env):
    """F14-S4c①：PUT zen_api_key 部分体→GET zen.api_key_set True（依赖 S1）"""
    tc, _client = settings_env
    tc.put("/api/settings", json={"zen_api_key": "sk-zen-test-only-fake"})
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["zen"]["api_key_set"] is True


def test_put_empty_zen_api_key_keeps_existing(settings_env):
    """F14-S4c②：PUT 空 zen_api_key→不覆写（T51 语义）"""
    tc, _client = settings_env
    tc.put("/api/settings", json={"zen_api_key": "sk-zen-test-only-fake"})
    tc.put("/api/settings", json={"zen_api_key": ""})
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["zen"]["api_key_set"] is True


def test_put_review_model_research_echoes(settings_env):
    """F14-S4c③：PUT review_model_research=zen:mimo-v2.5-free→GET 回显"""
    tc, _client = settings_env
    tc.put("/api/settings", json={"review_model_research": "zen:mimo-v2.5-free"})
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["review"]["model_research"] == "zen:mimo-v2.5-free"