# -*- coding: utf-8 -*-
"""F14-S4e：pick_judge_llm zen 前缀路由——区分自搭跨厂商和官方 Zen（红先行）。
T33：main / pipeline 一律 fixture 执行期导入。"""
import sys, os
import pytest
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


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_zen_prefix_routes_to_zen_endpoint(mock_cll, monkeypatch):
    """S4e①：REVIEW_MODEL_RESEARCH='zen:mimo-v2.5-free'+ZEN_API_KEY→调用 base_url/model 正确"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:mimo-v2.5-free")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert llm._api_key == "sk-zen-test-only-fake"
    assert llm.model_name == "mimo-v2.5-free"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm.thinking is False


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_zen_prefix_no_key_falls_back_to_model_main(mock_cll, monkeypatch):
    """S4e②：zen: 前缀但 ZEN_API_KEY 缺失→响亮回退 MODEL_MAIN"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "")
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "")  # 清除真实 .env 的 key
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:mimo-v2.5-free")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req(api_key="")  # 无任何 key 可用
    llm = pick_judge_llm("研究", req)
    # 回退 MODEL_MAIN 时走默认 base_url（req.base_url）+ req key
    assert llm.model_name == "deepseek-v4-flash-vision-exp"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_slash_branch_still_works(mock_cll, monkeypatch):
    """S4e③：硅基流动 / 分支回归钉——无 zen: 前缀时走原路径"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "Qwen/Qwen2.5-72B-Instruct")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-siliconflow-test")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert llm._api_key == "sk-siliconflow-test"
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_zen_prefix_with_slash_in_name(mock_cll, monkeypatch):
    """S4e④：zen:前缀 + 名称含 "/" 也走 zen 通道（前缀优先于 "/" 路由）"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Qwen/Qwen2.5-72B-Instruct")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    # zen: 前缀优先——走 Zen，不走硅基流动
    assert llm._api_key == "sk-zen-test-only-fake"
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://opencode.ai/zen/v1"
