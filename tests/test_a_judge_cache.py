# -*- coding: utf-8 -*-
"""A组·T32：pick_judge_llm 收编 D2 通用 LLM client 缓存的守卫。

D2 给 _make_llm/_make_fast_llm 加了进程级缓存后，review.py 的 judge 仍裸
DeepSeekLLM(...) 绕过缓存——研究档单轮 = 主模型 1 + 快档 1 + judge 1 = 3 个
OpenAI client 构造。收编后 judge 走同一 _cached_llm 接缝（传 judge 自己的
组合参数，绝不复用 _make_llm 的「req 主模型」语义）。

RC4-S1 改写（owner 09-03 终版语义）：判卷=档位定值格（standard=SF Qwen2.5-72B，
REVIEW_MODEL_RESEARCH 桩退役）——judge 默认走 SF 跨厂商组合，与快档（main 通道）
组合不再重合；构造数断言同步修正（≤3）。SF key 桩激活通道（缺 key 响亮回退语义
由 test_engine_review 钉住，此处全 mock 零真实网络）。

断言定位（决策 24）：
- test_judge_built_once_across_calls：新行为断言——judge 退回裸构造时恰红。
- test_research_round_constructions_le3：judge 独立组合下单轮构造 ≤3（旧 ≤2 语义随
  定值格退役——judge 与快档不再共享实例）。
- test_judge_isolated_from_main_model / test_judge_cross_vendor_isolated_and_built_once：
  隔离性断言——judge 与主模型不得共享实例；SF 组合只建一次。
- test_judge_cache_key_no_plaintext：安全红线断言（沿用 D2：sha256 摘要，
  Key 明文不入缓存 key）。

导入纪律（T33）：engine.review / engine.pipeline_v2 / core.base_llm 打桩全部
延迟到 fixture 执行期——collection 期 import engine.pipeline_v2 会触发
core.config.load_dotenv 把 .env 的 SQLITE_DIR 注入进程环境，污染
test_db_path 的导入期快照（同 tests/test_d4_retry_idempotency.py 文件头说明）。
"""
from types import SimpleNamespace

import pytest


@pytest.fixture()
def judge_env(monkeypatch):
    import engine.pipeline_v2 as eng_mod
    import engine.review as review_mod
    eng_mod._LLM_CACHE.clear()

    # 打桩 DeepSeekLLM：只计数构造、记录构造参数，不发真实 SDK 请求。
    # 属性语义与真类对齐（model_name/_base_url/thinking），供隔离断言使用。
    import core.base_llm as base_llm_mod

    calls: list[dict] = []

    class _FakeLLM:
        def __init__(self, api_key=None, model=None, base_url=None,
                     thinking=None, effort=None):
            calls.append({"api_key": api_key, "model": model,
                          "base_url": base_url, "thinking": thinking})
            self.model_name = model or "deepseek-v4-flash-vision-exp"
            self._api_key = api_key
            self._base_url = base_url
            self.thinking = thinking
            self.effort = effort

    monkeypatch.setattr(base_llm_mod, "DeepSeekLLM", _FakeLLM)
    yield SimpleNamespace(eng=eng_mod, review=review_mod, calls=calls)
    eng_mod._LLM_CACHE.clear()


def _req(api_key="k-judge-test", base_url=None):
    return SimpleNamespace(api_key=api_key, model=None, base_url=base_url,
                           message="m", session_id="s", settings={})


def _force_sf_judge_channel(monkeypatch):
    """RC4：judge 定值格=SF Qwen2.5-72B——桩 VL key 激活 SF 通道 + 显式 standard 档
    （ZEN_TEST_MODE 桩防上游 PUT 泄漏，T60 家族），保证本组断言只考察缓存行为，
    不受本机 .env 的 key 状态波动影响（退役键 REVIEW_MODEL_* 不再被读）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-judge-sf-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    return _cfg


def test_judge_built_once_across_calls(judge_env, monkeypatch):
    """新行为断言：同组合反复取 judge → 只构造一次（收编前每次裸构造）。"""
    _force_sf_judge_channel(monkeypatch)
    a = judge_env.review.pick_judge_llm("思考", _req())
    b = judge_env.review.pick_judge_llm("思考", _req())
    c = judge_env.review.pick_judge_llm("研究", _req())
    assert a is b is c
    assert len(judge_env.calls) == 1
    assert a.model_name == "Qwen/Qwen2.5-72B-Instruct"   # 定值格实名（思考/研究同格）


def test_research_round_constructions_le3(judge_env, monkeypatch):
    """验收指标（RC4 修正）：研究档单轮 OpenAI 构造次数 ≤ 3。
    judge 走 SF 跨厂商组合（定值格），与快档（main 通道）不再重合——
    main1 + fast1 + judge(SF)1 = 3；旧「judge is fast 共享」断言随动态格退役。"""
    _force_sf_judge_channel(monkeypatch)
    eng = judge_env.eng
    main = eng._make_llm(_req())
    fast = eng._make_fast_llm(_req())
    judge = judge_env.review.pick_judge_llm("研究", _req())
    assert len(judge_env.calls) == 3, f"单轮构造 {len(judge_env.calls)} 次（目标≤3）"
    assert main is not fast  # 主模型(思考=None)与快档(thinking=False)仍隔离
    assert judge is not fast  # judge(SF 组合)与快档(main 组合)不共享
    assert judge.model_name == "Qwen/Qwen2.5-72B-Instruct"


def test_judge_isolated_from_main_model(judge_env, monkeypatch):
    """隔离性：judge(SF 组合/thinking=False) 与主模型 _make_llm(main/thinking=None)
    不得共享实例——审核语义不得被静默改变。"""
    _force_sf_judge_channel(monkeypatch)
    main = judge_env.eng._make_llm(_req())
    judge = judge_env.review.pick_judge_llm("思考", _req())
    assert judge is not main
    assert judge.thinking is False and main.thinking is None
    assert judge.model_name != main.model_name  # SF 判卷 vs 主模型（跨厂商隔离）


def test_judge_cross_vendor_isolated_and_built_once(judge_env, monkeypatch):
    """跨厂商通道（硅基流动）：SF 组合独立 key/base_url/model → 独立实例且只建一次；
    与主模型互不串味（审核「防自我包庇」语义的缓存版落地）。"""
    from core.config import config as _cfg
    _force_sf_judge_channel(monkeypatch)
    j1 = judge_env.review.pick_judge_llm("研究", _req())
    j2 = judge_env.review.pick_judge_llm("研究", _req())
    assert j1 is j2 and len(judge_env.calls) == 1
    assert j1.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert j1._base_url == _cfg.VL_BASE_URL and j1._api_key == "sk-judge-sf-fake"
    main = judge_env.eng._make_llm(_req())
    assert main is not j1


def test_judge_cache_key_no_plaintext(judge_env, monkeypatch):
    """安全红线（沿用 D2）：judge 走缓存后，API Key 明文不得出现在缓存 key。"""
    _force_sf_judge_channel(monkeypatch)
    secret = "sk-judge-secret-A2-98765"
    judge_env.review.pick_judge_llm("思考", _req(api_key=secret))
    keys_repr = repr(list(judge_env.eng._LLM_CACHE.keys()))
    assert secret not in keys_repr
    for k in judge_env.eng._LLM_CACHE.keys():
        assert len(k[0]) == 16 and all(c in "0123456789abcdef" for c in k[0])
