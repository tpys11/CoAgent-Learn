# -*- coding: utf-8 -*-
"""RA-S1：REVIEW_FOLLOW_MAIN 审核子开关——「关=审核时用主模型」（红先行）。
T51 陷阱：PUT 空串不覆写 → 关闭语义不能写 REVIEW_MODEL_RESEARCH=''（会被吞掉=假关闭），
故用独立布尔键 REVIEW_FOLLOW_MAIN 承载。T33：main/pipeline 一律执行期导入；
T49：测试骨架沿用 test_f14_t51_put_semantics.py 的隔离库 + test_f14_zen_judge.py 的 mock LLM。"""
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


class FakeLLM:
    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


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
def test_follow_main_on_research_judge_uses_model_main(mock_cll, monkeypatch):
    """RA-S1①：follow_main='1' → 研究档判卷=MODEL_MAIN（即使研究档模型配了 zen: 也短路）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    # 主模型通道：model=MODEL_MAIN、base_url=req.base_url（非 Zen 端点）
    assert llm.model_name == "deepseek-v4-flash-vision-exp"
    assert llm._base_url == "https://api.deepseek.com/v1"
    assert llm._api_key == "sk-deepseek-fake"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_follow_main_off_zen_routing_unaffected(mock_cll, monkeypatch):
    """RA-S1②：follow_main='0' → 研究档 zen: 路由不受影响（原语义零回归）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert llm.model_name == "Big Pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm._api_key == "sk-zen-test-only-fake"


def test_put_follow_main_false_lands_zero(settings_env):
    """RA-S1③：bool 红线——显式 review_follow_main=false 必须落库 0（R14：false 不能被当缺省吞掉）。"""
    tc, _client = settings_env
    tc.put("/api/settings", json={"review_follow_main": True})
    tc.put("/api/settings", json={"review_follow_main": False})
    resp = tc.get("/api/settings")
    assert resp.json()["review"]["follow_main"] == False


def test_get_settings_echoes_follow_main(settings_env):
    """RA-S1④：GET /api/settings 的 review 节回显 follow_main（默认 False）。"""
    tc, _client = settings_env
    # 默认（未保存过）=False
    assert tc.get("/api/settings").json()["review"]["follow_main"] == False
    tc.put("/api/settings", json={"review_follow_main": True})
    assert tc.get("/api/settings").json()["review"]["follow_main"] == True


def test_test_endpoint_review_probe_respects_follow_main(settings_env, monkeypatch):
    """RA-S1⑤：/api/settings/test 的 review 探测在 follow_main=1 时按主通道
    （与 pick_judge 同款；漏这处=自检卡说谎）。全程 mock requests，零真实网络。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "sk-deepseek-test-only-fake")
    monkeypatch.setattr(_cfg, "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")

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
    # review 探测走主通道（DeepSeek 端点），不被 zen: 路由劫走
    assert results["review"]["ok"] is True
    assert seen["url"].startswith("https://api.deepseek.com/v1")
