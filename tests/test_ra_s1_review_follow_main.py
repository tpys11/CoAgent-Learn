# -*- coding: utf-8 -*-
"""RA-S1（RC4-S1 改写）：REVIEW_FOLLOW_MAIN 退役语义验证——owner 09-03 终版拍板
判卷路由=档位定值格，follow_main/REVIEW_MODEL_RESEARCH 设置项退役。
原「开关行为」断言按新语义改写（正当行为变更，非删测试护绿）：开关键不再落库生效、
不再短路路由、探测不再分叉。T33：main/pipeline 一律执行期导入；
T49：测试骨架沿用 test_f14_t51_put_semantics.py 的隔离库 + mock LLM。"""
import sys, os
import pytest
import fastapi.testclient
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


def _make_req(api_key="sk-deepseek-fake", base_url="https://api.deepseek.com/v1"):
    req = MagicMock()
    req.api_key = api_key
    req.base_url = base_url
    return req


def _fake_cached_llm(key, base_url, model, thinking, effort, factory):
    """模拟 _cached_llm：优先返回 factory() 产物；key 为空时返回 mock（避免真实 OpenAI 客户端）"""
    if not key:
        llm = MagicMock()
        llm.model_name = model
        llm._api_key = key
        llm._base_url = base_url
        llm.thinking = thinking
        return llm
    return factory()


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


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_follow_main_setting_no_longer_steers_judge(mock_cll, monkeypatch):
    """改写①：REVIEW_FOLLOW_MAIN='1' 不再短路主模型——判卷按档位定值格（standard=SF Qwen72B）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-test-only-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    llm = pick_judge_llm("研究", _make_req())
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"
    assert llm._api_key == "sk-vl-test-only-fake"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_test_tier_judge_routes_zen(mock_cll, monkeypatch):
    """改写②：test 档（ZEN_TEST_MODE=1）判卷=zen big-pickle（档位驱动替代旧 follow_main 分叉）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")

    from engine.review import pick_judge_llm
    llm = pick_judge_llm("研究", _make_req())
    assert llm.model_name == "big-pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm._api_key == "sk-zen-test-only-fake"


def test_put_retired_fields_ignored(settings_env):
    """改写③：PUT 退役字段 review_follow_main（含 false 显式体）被 pydantic 忽略——
    GET review 节无 follow_main 键（不再落库生效，T61 同步清）。"""
    tc, _client = settings_env
    tc.put("/api/settings", json={"review_follow_main": True})
    tc.put("/api/settings", json={"review_follow_main": False})
    body = tc.get("/api/settings").json()["review"]
    assert "follow_main" not in body


def test_get_settings_review_node_no_retired_keys(settings_env):
    """改写④：GET review 节不再回显 follow_main/model_research（退役键同步清）。"""
    tc, _client = settings_env
    body = tc.get("/api/settings").json()["review"]
    assert "follow_main" not in body
    assert "model_research" not in body
    assert body["effective_model"] == "Qwen/Qwen2.5-72B-Instruct"   # 定值格权威回显


def test_test_endpoint_review_probe_by_tier_not_follow_main(settings_env, monkeypatch):
    """改写⑤：/api/settings/test 的 review 探测按档位定值格 provider 走通道——
    REVIEW_FOLLOW_MAIN=1 不再劫持到主通道（standard→SF 端点）。全程 mock requests，零真实网络。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")   # 退役键：不得影响探测通道
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-test-only-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    seen = {}

    class _Resp:
        status_code = 200
        def json(self):
            return {"data": [{"id": "x"}]}

    def _fake_get(url=None, **kw):
        seen["url"] = url
        return _Resp()

    def _fake_post(url=None, **kw):
        return _Resp()

    import requests
    monkeypatch.setattr(requests, "get", _fake_get)
    monkeypatch.setattr(requests, "post", _fake_post)

    resp = tc.post("/api/settings/test", json={})
    assert resp.status_code == 200
    results = resp.json()["results"]
    # review 探测走定值格 provider 通道（SF 端点），不被退役键劫持到主通道
    assert results["review"]["ok"] is True
    assert seen["url"].startswith("https://api.siliconflow.cn/v1")
