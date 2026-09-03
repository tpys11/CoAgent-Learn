# -*- coding: utf-8 -*-
"""RA2-S1：GET /api/settings chat 节 additive `main_model`（主模型实名出接口）。
owner 反馈①②闭环的对照面：自检卡 chat 行 / review 行（follow_main）与 MODEL_MAIN 同源可核对。
T33：main 执行期导入；T49：SQLITE_DIR 隔离，真实库零触碰。"""
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
    # 单例陷阱：get_settings_repo 有进程级缓存，必须重置指向隔离库
    monkeypatch.setattr(srmod, "_settings_repo", None, raising=False)
    import main as _main
    return fastapi.testclient.TestClient(_main.app)


def test_get_settings_chat_has_main_model(settings_env):
    """RA2-S1：GET chat 节 additive main_model —— key 存在且与 model_provider 单一事实源同值。"""
    tc = settings_env
    from core.model_provider import MODEL_MAIN  # 执行期导入（T33 同款纪律）
    chat = tc.get("/api/settings").json()["chat"]
    assert chat["main_model"] == MODEL_MAIN
    assert chat["main_model"] == "deepseek-v4-flash-vision-exp"
