# -*- coding: utf-8 -*-
"""F14-S1 T51：PUT /api/settings 「空串/缺省不覆写」往返语义（红先行）。
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
    # 单例陷阱：get_settings_repo 有进程级缓存，必须重置指向隔离库
    monkeypatch.setattr(srmod, "_settings_repo", None, raising=False)
    import main as _main
    return fastapi.testclient.TestClient(_main.app), client


def test_put_partial_body_never_overwrites_existing(settings_env):
    """F8 E4 复现钉：先存 Qwen3-VL@1024，再提交【缺省模型/维度】的局部体 → 原值原样。"""
    tc, _client = settings_env
    # 先存初始值
    tc.put("/api/settings", json={"embedding_model": "Qwen/Qwen3-VL-Embedding-8B", "embedding_dim": 1024})
    # 提交局部体（只包含 embedding_api_key）
    tc.put("/api/settings", json={"embedding_api_key": "sk-test-only-fake-DO-NOT-USE"})
    # GET 并断言 embedding.model 和 embedding.dim 保持不变
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["embedding"]["model"] == "Qwen/Qwen3-VL-Embedding-8B"
    assert data["embedding"]["dim"] == 1024


def test_put_empty_string_does_not_overwrite(settings_env):
    """空串=不覆写：先写 EMBEDDING_MODEL，再 PUT embedding_model:"" → 原值保持。"""
    tc, _client = settings_env
    # 先写初始值
    tc.put("/api/settings", json={"embedding_model": "Qwen/Qwen3-VL-Embedding-8B"})
    # 再 PUT 空串
    tc.put("/api/settings", json={"embedding_model": ""})
    # GET 并断言 model 不变
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["embedding"]["model"] == "Qwen/Qwen3-VL-Embedding-8B"


def test_put_explicit_new_value_overwrites(settings_env):
    """显式新值仍覆写（修复不得矫枉过正）：PUT embedding_model="BAAI/bge-m3" → 变。"""
    tc, _client = settings_env
    # PUT 显式新值
    tc.put("/api/settings", json={"embedding_model": "BAAI/bge-m3"})
    # GET 并断言 model 已更新
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["embedding"]["model"] == "BAAI/bge-m3"


def test_put_review_enabled_false_explicit_turns_off(settings_env):
    """bool 红线：显式 review_enabled=false 必须落库 0（exclude_unset 不能把 false 当缺省吞掉）。"""
    tc, _client = settings_env
    # 先设置 review_enabled 为 true
    tc.put("/api/settings", json={"review_enabled": True})
    # 再 PUT review_enabled=false
    tc.put("/api/settings", json={"review_enabled": False})
    # GET 并断言 review.enabled == False
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["review"]["enabled"] == False


def test_put_key_empty_keeps_existing_key(settings_env):
    """key 语义不变：先存 key 再 PUT 空 key → GET api_key_set 仍 True。"""
    tc, _client = settings_env
    # 先存 key
    tc.put("/api/settings", json={"embedding_api_key": "sk-test-only-fake-DO-NOT-USE"})
    # 再 PUT 空 key
    tc.put("/api/settings", json={"embedding_api_key": ""})
    # GET 并断言 api_key_set 仍为 True
    resp = tc.get("/api/settings")
    data = resp.json()
    assert data["embedding"]["api_key_set"] == True