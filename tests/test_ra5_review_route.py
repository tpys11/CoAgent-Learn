# -*- coding: utf-8 -*-
"""RA5-S1：判卷路由单一事实源 resolve_review_route（红先行）。
RC4-S1 改写（owner 09-03 终版语义）：路由=档位定值格（standard=SF Qwen2.5-72B、test=zen big-pickle），
follow_main/REVIEW_MODEL_RESEARCH 设置项退役——原「三态矩阵」改写为「退役不影响+档位驱动」断言。
三处同源（pick_judge_llm / settings /test 探测 / GET review effective_model）收敛不变。
T33：main/pipeline 一律执行期导入；T49：隔离库骨架沿用 test_ra_s1_review_follow_main.py。"""
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
    """模拟 _cached_llm：key 非空返回 factory() 产物（真 DeepSeekLLM，断言 model_name/_api_key/_base_url）；
    key 为空返回 mock（避免真实 OpenAI 客户端）。"""
    if not key:
        llm = MagicMock()
        llm.model_name = model
        llm._api_key = key
        llm._base_url = base_url
        llm.thinking = thinking
        return llm
    return factory()


# ---------- 路由矩阵（RC4 定值语义：档位决定，退役设置项/模板参数不再参与） ----------

def test_route_matrix_standard_tier_siliconflow_fixed(monkeypatch):
    """矩阵①（改写）：standard 档恒 SF Qwen72B——follow_main=1 不短路、research 配 zen: 不被读。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    assert resolve_review_route("研究") == {
        "model": "Qwen/Qwen2.5-72B-Instruct", "provider": "siliconflow"}


def test_route_matrix_test_tier_zen_fixed(monkeypatch):
    """矩阵②（改写）：ZEN_TEST_MODE=1 → test 档恒 zen big-pickle（档位驱动，非 research 值）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "")
    assert resolve_review_route("研究") == {
        "model": "big-pickle", "provider": "zen"}


def test_route_matrix_empty_research_no_fallback_main(monkeypatch):
    """矩阵③（改写）：research 空 → 仍 SF Qwen72B（定值格无「空回落主模型」分支）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "")
    assert resolve_review_route("研究") == {
        "model": "Qwen/Qwen2.5-72B-Instruct", "provider": "siliconflow"}


def test_route_template_param_retired(monkeypatch):
    """矩阵④（改写）：模板参数退役——思考/研究同格，REVIEW_MODEL_THINK 不再被读。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_THINK", "zen:Think Pickle")
    assert resolve_review_route("思考") == {
        "model": "Qwen/Qwen2.5-72B-Instruct", "provider": "siliconflow"}


# ---------- pick_judge 与 route 同源断言（LLM 构造实测 vs 路由判定） ----------

@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_standard_siliconflow(mock_cll, monkeypatch):
    """同源①（改写）：standard 档 pick_judge 实造 LLM 与 route 判定一致（SF 端点/VL key）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")   # 退役键不被读
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-test-only-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    llm = pick_judge_llm("研究", _make_req())
    assert route["provider"] == "siliconflow"
    assert llm.model_name == route["model"] == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"
    assert llm._api_key == "sk-vl-test-only-fake"   # VL 优先于 EMBEDDING（pick_judge 兜底序保持）


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_test_tier_zen(mock_cll, monkeypatch):
    """同源②（改写）：test 档 pick_judge 实造 LLM 与 route 判定一致（big-pickle/Zen 端点/ZEN key）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    llm = pick_judge_llm("研究", _make_req())
    assert route["provider"] == "zen"
    assert llm.model_name == route["model"] == "big-pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm._api_key == "sk-zen-test-only-fake"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_siliconflow_key_fallback_chain(mock_cll, monkeypatch):
    """同源③（改写）：VL key 空 → pick_judge 兜底 EMBEDDING key（VL||EMBEDDING or 链在调用方保持——陷阱①）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "sk-emb-fallback-only")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    llm = pick_judge_llm("研究", _make_req())
    assert route["provider"] == "siliconflow"
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"
    assert llm._api_key == "sk-emb-fallback-only"


# ---------- GET review 节 additive 回显 ----------

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


def test_get_review_echoes_effective_model(settings_env, monkeypatch):
    """RC4 改写：GET review.effective_model=定值格权威值——standard 恒 Qwen72B；
    PUT 退役字段（review_model_research/review_follow_main）被忽略不改变回显；
    ZEN_TEST_MODE=1 → big-pickle。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    # T60 家族防线：PUT zen_test_mode 会经 _apply_dynamic_settings 直接 setattr config 单例
    # （穿透本测试的断言面）——开头打桩，teardown 恢复 "0"，中和持久泄漏
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    # standard 档默认（隔离库初始为空，定值格不依赖 DB 状态）
    assert tc.get("/api/settings").json()["review"]["effective_model"] == "Qwen/Qwen2.5-72B-Instruct"
    # PUT 退役字段：pydantic 忽略未知字段，effective_model 不变
    tc.put("/api/settings", json={"review_model_research": "zen:Big Pickle",
                                  "review_follow_main": True})
    body = tc.get("/api/settings").json()["review"]
    assert body["effective_model"] == "Qwen/Qwen2.5-72B-Instruct"
    assert "follow_main" not in body and "model_research" not in body   # 退役回显键同步清（T61）
    # ZEN_TEST_MODE=1 → test 档定值 big-pickle
    tc.put("/api/settings", json={"zen_test_mode": True})
    assert tc.get("/api/settings").json()["review"]["effective_model"] == "big-pickle"
