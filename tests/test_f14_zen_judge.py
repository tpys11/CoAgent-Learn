# -*- coding: utf-8 -*-
"""F14-S4e（RC4-S1 改写）：pick_judge_llm zen 通道——档位定值格语义。
原「REVIEW_MODEL_RESEARCH zen: 前缀路由」随动态格退役；zen 通道改由档位驱动
（ZEN_TEST_MODE=1 → test 档判卷=big-pickle 走 Zen）。T33：main / pipeline 一律 fixture 执行期导入。"""
import sys, os
import pytest
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


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_test_tier_routes_to_zen_endpoint(mock_cll, monkeypatch):
    """改写①：ZEN_TEST_MODE=1（test 档）→ 判卷=big-pickle，调用 base_url/key 正确（档位驱动）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:mimo-v2.5-free")   # 退役键不被读
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert llm._api_key == "sk-zen-test-only-fake"
    assert llm.model_name == "big-pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm.thinking is False


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_test_tier_no_zen_key_falls_back_to_model_main(mock_cll, monkeypatch):
    """改写②：test 档但 ZEN_API_KEY 缺失→响亮回退 MODEL_MAIN（fail-open 语义保持）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "")
    monkeypatch.setattr(_cfg, "DEEPSEEK_API_KEY", "")  # 清除真实 .env 的 key
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req(api_key="")  # 无任何 key 可用
    llm = pick_judge_llm("研究", req)
    # 回退 MODEL_MAIN 时走默认 base_url（req.base_url）+ req key
    assert llm.model_name == "deepseek-v4-flash-vision-exp"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_standard_tier_siliconflow_branch(mock_cll, monkeypatch):
    """改写③：standard 档 SF 通道回归钉（VL key 桩；research 桩退役不再需要）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-siliconflow-test")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert llm._api_key == "sk-siliconflow-test"
    assert llm.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_test_tier_immune_to_retired_research_value(mock_cll, monkeypatch):
    """改写④：退役键 REVIEW_MODEL_RESEARCH 含"/"或 zen: 前缀均不再影响路由——
    test 档判卷恒 big-pickle 走 Zen（原「zen: 前缀优先于 /」解析逻辑随动态格删除）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Qwen/Qwen2.5-72B-Instruct")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")

    from engine.review import pick_judge_llm
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    # 档位定值优先——走 Zen 定值 big-pickle，不走硅基流动
    assert llm._api_key == "sk-zen-test-only-fake"
    assert llm.model_name == "big-pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
