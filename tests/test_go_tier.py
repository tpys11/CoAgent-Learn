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
    assert MODEL_GO_MAIN == "GLM-5.3-Flash"
    assert MODEL_GO_REVIEW == "Qwen3.8 Flash"


def test_go_registry_main_cell():
    spec = resolve_model("main", "go")
    assert spec.model == MODEL_GO_MAIN
    assert spec.provider == "go"
    assert spec.base_url == config.GO_BASE_URL
    assert spec.api_key == config.GO_API_KEY


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


def test_pick_judge_go_missing_key_fallback(monkeypatch, caplog):
    # 缺 GO key 且 req/DEEPSEEK key 均空（or 兜底链全空）→ 响亮回退主模型（fail-open 先例），不抛错
    import engine.review as rv
    from core.model_provider import MODEL_MAIN
    monkeypatch.setattr(config, "GO_API_KEY", "")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "")
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
