# -*- coding: utf-8 -*-
"""C1（Z.AI 第三测试通道，owner 09-04 拍板）：REGISTRY zai 档守卫——定值格/档位判定/判卷路由。
与 go 同构（决策 38：专有能力 embedding/rerank 留 SF），特有边界：
①主模型与审核模型同用 glm-4.7（owner 指定同模型自审，专用记忆机制测试——防自我包庇设计
  在此通道不适用=owner 明示取舍，守卫钉「两格同值」防无意分叉）；
②zai 默认端点与标准档 zhipu 主对话完全相同——detect_tier 必须 URL+model 双参判定，
  单看 URL 会把标准档智谱对话误归 zai 档（C1 防误判守卫）。"""
import pytest

from core.config import config
from core.model_provider import (MODEL_ZAI_MAIN, MODEL_ZAI_REVIEW,
                                 current_tier, detect_tier,
                                 resolve_model, resolve_review_route)


def test_zai_model_ids_literal():
    # 双源同值（钉字面防漂移）：官方文档 model="glm-4.7"；主审同模型=owner 明示取舍
    assert MODEL_ZAI_MAIN == "glm-4.7"
    assert MODEL_ZAI_REVIEW == "glm-4.7"


def test_zai_registry_main_cell():
    spec = resolve_model("main", "zai")
    assert spec.model == MODEL_ZAI_MAIN
    assert spec.provider == "zai"
    assert spec.base_url == config.ZAI_BASE_URL
    assert spec.api_key == config.ZAI_API_KEY   # key 独立无兜底（与 go 的 or 链不同）


def test_zai_registry_review_same_model():
    # 主审同模型（owner 拍板：专用记忆机制测试）——守卫钉住防无意分叉
    assert resolve_model("review", "zai").model == MODEL_ZAI_MAIN
    assert resolve_model("review", "zai").provider == "zai"


def test_zai_registry_aux_follow_main():
    for role in ("fast", "vision"):
        assert resolve_model(role, "zai").model == MODEL_ZAI_MAIN
        assert resolve_model(role, "zai").provider == "zai"


def test_zai_registry_abilities_stay_sf():
    assert resolve_model("embedding", "zai").provider == "siliconflow"
    assert resolve_model("rerank", "zai").provider == "siliconflow"


def test_zai_registry_tier_listed():
    from core.model_provider import REGISTRY
    assert set(REGISTRY) == {"standard", "test", "go", "zai"}


def test_zai_default_base_url():
    # C1：官方文档端点（chat/completions，标准 Bearer）
    assert config.ZAI_BASE_URL == "https://open.bigmodel.cn/api/paas/v4"


def test_detect_tier_zai_needs_model_match(monkeypatch):
    # C1 防误判守卫：zai 默认端点与标准档 zhipu 主对话相同——同 URL 不同 model 必须分流
    monkeypatch.setattr(config, "ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    assert detect_tier("https://open.bigmodel.cn/api/paas/v4", "glm-4.7") == "zai"
    assert detect_tier("https://open.bigmodel.cn/api/paas/v4", "glm-4.7/") == "standard"  # model 必须精确
    assert detect_tier("https://open.bigmodel.cn/api/paas/v4", "deepseek-v4-flash-vision-exp") == "standard"
    assert detect_tier("https://open.bigmodel.cn/api/paas/v4", None) == "standard"


def test_detect_tier_zen_go_unchanged_by_zai_params(monkeypatch):
    # 双参化不破坏既有判定（go 精确判定先于 zen 子串，S6 顺序守卫）
    monkeypatch.setattr(config, "GO_BASE_URL", "https://opencode.ai/zen/go/v1")
    assert detect_tier("https://opencode.ai/zen/go/v1", "glm-4.7") == "go"
    assert detect_tier("https://opencode.ai/zen/v1", "glm-4.7") == "test"
    assert detect_tier(None, None) == "standard"


def test_current_tier_zai_directed(monkeypatch):
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "zai")
    assert current_tier() == "zai"
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    assert current_tier() == "go"
    monkeypatch.setattr(config, "TEST_CHANNEL", "zen")
    assert current_tier() == "test"
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "0")
    assert current_tier() == "standard"


def test_review_route_zai(monkeypatch):
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "zai")
    route = resolve_review_route()
    assert route == {"model": MODEL_ZAI_REVIEW, "provider": "zai"}


def test_pick_judge_zai_key_routing(monkeypatch):
    import engine.review as rv
    monkeypatch.setattr(config, "ZAI_API_KEY", "sk-zai-test")
    monkeypatch.setattr(config, "ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "zai")
    captured = {}

    def fake_cache(key, base_url, model, thinking, x, factory):
        captured.update(key=key, base_url=base_url, model=model)
        return "LLM"

    monkeypatch.setattr("engine.pipeline_v2._cached_llm", fake_cache)

    class Req:
        api_key = "sk-req"
        base_url = "https://open.bigmodel.cn/api/paas/v4"

    assert rv.pick_judge_llm(None, Req()) == "LLM"
    assert captured == {"key": "sk-zai-test",
                        "base_url": "https://open.bigmodel.cn/api/paas/v4",
                        "model": MODEL_ZAI_REVIEW}


def test_pick_judge_zai_missing_key_fallback(monkeypatch, caplog):
    # 缺 ZAI key 且 req/DEEPSEEK key 均空（zai 无跨通道兜底）→ 响亮回退主模型，不抛错
    import engine.review as rv
    from core.model_provider import MODEL_MAIN
    monkeypatch.setattr(config, "ZAI_API_KEY", "")
    monkeypatch.setattr(config, "ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "zai")
    captured = {}

    def fake_cache(key, base_url, model, thinking, x, factory):
        captured.update(model=model, base_url=base_url)
        return "LLM"

    monkeypatch.setattr("engine.pipeline_v2._cached_llm", fake_cache)

    class Req:
        api_key = ""
        base_url = "https://open.bigmodel.cn/api/paas/v4"

    assert rv.pick_judge_llm(None, Req()) == "LLM"
    assert captured["model"] == MODEL_MAIN


# ---------- C1：settings GET/PUT zai 节（隔离先例 test_f14_zen_settings；T49 真实库零触碰） ----------
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


def test_settings_put_zai_key_get_shows(settings_env):
    tc, _client = settings_env
    tc.put("/api/settings", json={"zai_api_key": "sk-zai-test-only-fake"})
    data = tc.get("/api/settings").json()
    assert data["zai"]["api_key_set"] is True
    assert data["zai"]["base_url"] == "https://open.bigmodel.cn/api/paas/v4"   # URL 固定官方回显


def test_settings_test_channel_zai_whitelist(settings_env):
    tc, _client = settings_env
    tc.put("/api/settings", json={"test_channel": "zai"})
    assert tc.get("/api/settings").json()["test_channel"] == "zai"
    tc.put("/api/settings", json={"test_channel": "bogus"})
    assert tc.get("/api/settings").json()["test_channel"] == "zen"
