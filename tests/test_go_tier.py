# -*- coding: utf-8 -*-
"""S1（go 第二测试通道，owner 09-04 拍板）：REGISTRY go 档守卫——定值格/档位判定/判卷路由。
决策 38 同构：专有能力（embedding/rerank）留 SF，对话/审核全链 go 网关定值。
模型 ID 字面占位（owner 将提供确切 API ID）——守卫钉「格结构与 provider 归属」，不钉具体串值
（换 API ID=改常量一行，测试引用常量同值即绿）。"""
import pytest

from core.config import config
from core.model_provider import (MODEL_GO_MAIN, MODEL_GO_REVIEW,
                                 current_tier, detect_tier,
                                 resolve_model, resolve_review_route)


def test_go_model_ids_literal():
    # 双源同值（钉字面防漂移）：换 API ID = 本行字面 + model_provider 常量 + 前端 models.ts 镜像，三处同步改
    # S6 实测校正（owner 截图）：zen go 计划 API ID=小写 glm-5.3-flash / qwen3.8-flash，双模型 chat/completions 200 通
    assert MODEL_GO_MAIN == "glm-5.3-flash"
    assert MODEL_GO_REVIEW == "qwen3.8-flash"


def test_go_registry_main_cell():
    spec = resolve_model("main", "go")
    assert spec.model == MODEL_GO_MAIN
    assert spec.provider == "go"
    assert spec.base_url == config.GO_BASE_URL
    # S6：key=or 链（GO 优先，空则复用 ZEN——go 子通道同一 Bearer 鉴权）
    assert spec.api_key == (config.GO_API_KEY or config.ZEN_API_KEY)


def test_go_registry_review_cell():
    spec = resolve_model("review", "go")
    assert spec.model == MODEL_GO_REVIEW
    assert spec.provider == "go"
    assert spec.base_url == config.GO_BASE_URL


def test_go_registry_aux_follow_main():
    for role in ("fast", "vision"):
        assert resolve_model(role, "go").model == MODEL_GO_MAIN
        assert resolve_model(role, "go").provider == "go"


def test_go_registry_abilities_stay_sf():
    # 决策 38 同构：专有能力不入 go 格（embedding/rerank 共用 standard 的 SF 格）
    assert resolve_model("embedding", "go").provider == "siliconflow"
    assert resolve_model("rerank", "go").provider == "siliconflow"


def test_go_registry_tier_listed():
    from core.model_provider import REGISTRY
    assert set(REGISTRY) == {"standard", "test", "go"}


def test_detect_tier_go_by_base_url(monkeypatch):
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    assert detect_tier("https://gw.example.com/v1") == "go"
    assert detect_tier("https://gw.example.com/v1/") == "go"   # 尾斜杠容忍
    assert detect_tier("https://other.example.com/v1") == "standard"


def test_detect_tier_zen_and_none_unchanged():
    assert detect_tier("https://opencode.ai/zen/v1") == "test"
    assert detect_tier(None) == "standard"


def test_detect_tier_go_wins_over_zen_mark(monkeypatch):
    # S6 关键顺序守卫：go 默认端点含 zen 标记子串（opencode.ai/zen/go/v1）——
    # 精确相等判定必须先于 zen 子串判定，否则 go 请求被误归 test
    monkeypatch.setattr(config, "GO_BASE_URL", "https://opencode.ai/zen/go/v1")
    assert detect_tier("https://opencode.ai/zen/go/v1") == "go"
    assert detect_tier("https://opencode.ai/zen/go/v1/") == "go"
    assert detect_tier("https://opencode.ai/zen/v1") == "test"   # 真 zen 端点不受影响


def test_detect_tier_go_default_base_url():
    # S6：config 默认 GO_BASE_URL=zen go 计划端点（零配置路径的前提）
    assert config.GO_BASE_URL == "https://opencode.ai/zen/go/v1"


def test_detect_tier_go_unset_base_url(monkeypatch):
    # GO_BASE_URL 空（未配置）时任何 URL 都不得误判 go
    monkeypatch.setattr(config, "GO_BASE_URL", "")
    assert detect_tier("") == "standard"


def test_current_tier_channel_directed(monkeypatch):
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    assert current_tier() == "go"
    monkeypatch.setattr(config, "TEST_CHANNEL", "zen")
    assert current_tier() == "test"
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "0")
    assert current_tier() == "standard"


def test_current_tier_channel_default_compat(monkeypatch):
    # 只开 ZEN_TEST_MODE 未写 TEST_CHANNEL 的存量形态 → test 档（向后兼容）
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "zen")
    assert current_tier() == "test"


def test_review_route_go(monkeypatch):
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    route = resolve_review_route()
    assert route == {"model": MODEL_GO_REVIEW, "provider": "go"}


def test_pick_judge_go_key_routing(monkeypatch):
    import engine.review as rv
    monkeypatch.setattr(config, "GO_API_KEY", "sk-go-test")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    captured = {}

    def fake_cache(key, base_url, model, thinking, x, factory):
        captured.update(key=key, base_url=base_url, model=model)
        return "LLM"

    monkeypatch.setattr("engine.pipeline_v2._cached_llm", fake_cache)

    class Req:
        api_key = "sk-req"
        base_url = "https://gw.example.com/v1"

    assert rv.pick_judge_llm(None, Req()) == "LLM"
    assert captured == {"key": "sk-go-test",
                        "base_url": "https://gw.example.com/v1",
                        "model": MODEL_GO_REVIEW}


def test_pick_judge_go_zen_key_fallback(monkeypatch):
    # S6：GO_API_KEY 空→兜底复用 ZEN_API_KEY（go 子通道同一 Bearer 鉴权，零配置路径）
    import engine.review as rv
    monkeypatch.setattr(config, "GO_API_KEY", "")
    monkeypatch.setattr(config, "ZEN_API_KEY", "sk-zen-fallback")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://opencode.ai/zen/go/v1")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    captured = {}

    def fake_cache(key, base_url, model, thinking, x, factory):
        captured.update(key=key, base_url=base_url, model=model)
        return "LLM"

    monkeypatch.setattr("engine.pipeline_v2._cached_llm", fake_cache)

    class Req:
        api_key = ""
        base_url = "https://opencode.ai/zen/go/v1"

    assert rv.pick_judge_llm(None, Req()) == "LLM"
    assert captured == {"key": "sk-zen-fallback",
                        "base_url": "https://opencode.ai/zen/go/v1",
                        "model": MODEL_GO_REVIEW}


def test_pick_judge_go_missing_key_fallback(monkeypatch, caplog):
    # 缺 GO key 且 ZEN/req/DEEPSEEK key 均空（or 兜底链全空）→ 响亮回退主模型（fail-open 先例），不抛错
    import engine.review as rv
    from core.model_provider import MODEL_MAIN
    monkeypatch.setattr(config, "GO_API_KEY", "")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "")
    monkeypatch.setattr(config, "ZEN_API_KEY", "")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    captured = {}

    def fake_cache(key, base_url, model, thinking, x, factory):
        captured.update(model=model, base_url=base_url)
        return "LLM"

    monkeypatch.setattr("engine.pipeline_v2._cached_llm", fake_cache)

    class Req:
        api_key = ""
        base_url = "https://gw.example.com/v1"

    assert rv.pick_judge_llm(None, Req()) == "LLM"
    assert captured["model"] == MODEL_MAIN


# ---------- S2：settings GET/PUT go 节（同款隔离先例 test_f14_zen_settings；T49 真实库零触碰） ----------
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


def test_settings_put_go_keys_get_shows(settings_env):
    tc, _client = settings_env
    tc.put("/api/settings", json={"go_api_key": "sk-go-test-only-fake",
                                  "go_base_url": "https://gw.example.com/v1"})
    data = tc.get("/api/settings").json()
    assert data["go"]["api_key_set"] is True
    assert data["go"]["base_url"] == "https://gw.example.com/v1"
    assert data["go"]["api_key_hint"]  # 掩码非空


def test_settings_put_empty_go_keys_keeps_existing(settings_env):
    # T51 语义：空串不覆写
    tc, _client = settings_env
    tc.put("/api/settings", json={"go_api_key": "sk-go-test-only-fake"})
    tc.put("/api/settings", json={"go_api_key": "", "go_base_url": ""})
    data = tc.get("/api/settings").json()
    assert data["go"]["api_key_set"] is True


def test_settings_test_channel_whitelist(settings_env):
    # 白名单：'go' 生效，其余杂值一律落 'zen'（防杂值进 current_tier）
    tc, _client = settings_env
    tc.put("/api/settings", json={"test_channel": "go"})
    assert tc.get("/api/settings").json()["test_channel"] == "go"
    tc.put("/api/settings", json={"test_channel": "bogus"})
    assert tc.get("/api/settings").json()["test_channel"] == "zen"
