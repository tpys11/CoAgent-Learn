# -*- coding: utf-8 -*-
"""FIXAUX 三守卫（T1 承重轮）：测试档辅助链 key 路由 + 判卷 JSON 容错。
守卫①：pipeline_v2._make_llm/_make_fast_llm 档位感知——go 档注册表定值格 key 优先
        （决策 38 契约闭合：测试档严禁落 DEEPSEEK 兜底；三通道 key 隔离，7b91c44 owner 拍板），
        standard 档构造参数与改前逐字节等价（回归控制断言钉死）。
守卫②：think_then_json 单引号伪 JSON（qwen3.8-flash 实录形态）ast.literal_eval 兜底——
        解析产出 dict 而非「执行异常」指纹；双失败仍抛原 ValueError（指纹语义不变）。
全部假件/monkeypatch，零真网零真实 key（铁律 35）。变异记录见 commit message。"""
import pytest

from core.config import config
from core.model_provider import MODEL_GO_MAIN


class _Req:
    """_make_llm/_make_fast_llm 消费的 req 最小面：api_key/base_url/model。"""

    def __init__(self, api_key, base_url, model=None):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model


def _capture_llm(captured):
    """D2 缓存打桩（test_go_tier.py pick_judge 先例）：捕获新三元组并真实构造 client
    （OpenAI() 构造离线无网络，凭据全假件）。"""

    def fake_cache(api_key, base_url, model, thinking, effort, build):
        captured.update(api_key=api_key, base_url=base_url, model=model,
                        thinking=thinking, effort=effort)
        return build()

    return fake_cache


# ══ 守卫①：档位感知 key 路由 ═══════════════════════════════════════════════

def test_fixaux1_go_tier_registry_key_wins(monkeypatch):
    """go 档 _make_llm：key=注册表 GO_API_KEY（假值A）而非 req 残留 deepseek key——
    严禁落 DEEPSEEK 兜底（决策 38 契约闭合）；model/base_url 同步走注册表格。"""
    import engine.pipeline_v2 as pv
    monkeypatch.setattr(config, "GO_API_KEY", "sk-go-fake-A")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "sk-deepseek-backend-B")
    captured = {}
    monkeypatch.setattr(pv, "_cached_llm", _capture_llm(captured))
    req = _Req(api_key="sk-deepseek-fake", base_url="https://gw.example.com/v1")
    llm = pv._make_llm(req)
    assert llm._api_key == "sk-go-fake-A"
    assert llm._base_url == "https://gw.example.com/v1"
    assert llm.model_name == MODEL_GO_MAIN
    assert captured["api_key"] == "sk-go-fake-A"
    assert captured["base_url"] == "https://gw.example.com/v1"
    assert captured["model"] == MODEL_GO_MAIN


def test_fixaux1_go_tier_fast_role(monkeypatch):
    """go 档 _make_fast_llm：fast 角色按注册表自己格取值（go 档 fast=main 同格），关思考保留。"""
    import engine.pipeline_v2 as pv
    monkeypatch.setattr(config, "GO_API_KEY", "sk-go-fake-A")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    monkeypatch.setattr(config, "ZEN_TEST_MODE", "1")
    monkeypatch.setattr(config, "TEST_CHANNEL", "go")
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "sk-deepseek-backend-B")
    captured = {}
    monkeypatch.setattr(pv, "_cached_llm", _capture_llm(captured))
    llm = pv._make_fast_llm(
        _Req(api_key="sk-deepseek-fake", base_url="https://gw.example.com/v1"))
    assert llm._api_key == "sk-go-fake-A"
    assert llm._base_url == "https://gw.example.com/v1"
    assert llm.model_name == MODEL_GO_MAIN
    assert llm.thinking is False


def test_fixaux1_standard_tier_byte_identical(monkeypatch):
    """回归控制断言：standard 档与改前逐字节等价——req.api_key 优先未被翻转，
    model_override > req.model > DEFAULT_MODEL 优先序、DEEPSEEK 空兜底公式原样。"""
    import engine.pipeline_v2 as pv
    monkeypatch.setattr(config, "DEEPSEEK_API_KEY", "sk-deepseek-backend-B")
    captured = {}
    monkeypatch.setattr(pv, "_cached_llm", _capture_llm(captured))
    req = _Req(api_key="sk-deepseek-fake", base_url="https://api.deepseek.com/v1",
               model="my-model")
    llm = pv._make_llm(req)
    assert llm._api_key == "sk-deepseek-fake"      # req 优先（backend key 仅空时兜底）
    assert llm._base_url == "https://api.deepseek.com/v1"
    assert llm.model_name == "my-model"
    assert llm.thinking is None
    llm2 = pv._make_llm(req, model_override="override-model")
    assert llm2.model_name == "override-model"     # 显式覆盖语义保留
    req_nokey = _Req(api_key="", base_url="https://api.deepseek.com/v1")
    llm3 = pv._make_llm(req_nokey)
    assert llm3._api_key == "sk-deepseek-backend-B"  # 改前公式：空才落 DEEPSEEK 兜底
    # fast 同构：standard 档 fast=req.model 或 DEFAULT_MODEL，thinking=False
    llm4 = pv._make_fast_llm(req)
    assert llm4._api_key == "sk-deepseek-fake"
    assert llm4.model_name == "my-model"
    assert llm4.thinking is False


def test_fixaux1_cache_key_new_triple(monkeypatch):
    """红线：_cached_llm 缓存键同步用新三元组——同 req key 不同档产生不同缓存条目
    （sha256(api_key) 摘要 + base_url + model 三者都进键）。"""
    import engine.pipeline_v2 as pv
    monkeypatch.setattr(config, "GO_API_KEY", "sk-go-fake-A")
    monkeypatch.setattr(config, "GO_BASE_URL", "https://gw.example.com/v1")
    pv._LLM_CACHE.clear()
    try:
        req_go = _Req(api_key="sk-deepseek-fake", base_url="https://gw.example.com/v1")
        req_std = _Req(api_key="sk-deepseek-fake", base_url="https://api.deepseek.com/v1")
        a = pv._make_llm(req_go)
        b = pv._make_llm(req_std)
        assert a is not b
        assert len(pv._LLM_CACHE) == 2
        (k1, _), (k2, _) = list(pv._LLM_CACHE.items())
        assert k1[0] != k2[0]   # api_key 摘要不同
        assert k1[1] != k2[1]   # base_url 不同
        assert k1[2] != k2[2]   # model 不同（go 定值格 vs DEFAULT）
    finally:
        pv._LLM_CACHE.clear()


# ══ 守卫②：判卷 JSON 单引号兜底（qwen3.8-flash 实录修复）═══════════════════

class _FakeStreamLLM:
    """think_then_json 假件：chat_stream 逐段推 chunk（零真网——铁律 35）。"""

    def __init__(self, chunks):
        self._chunks = chunks

    def chat_stream(self, messages, collect, **kw):
        for c in self._chunks:
            collect(c)


def test_fixaux2_fence_single_quote_json_parses():
    """fence 分支：```json 包裹的单引号伪 JSON → dict 而非「执行异常」指纹。"""
    from engine.llm_io import think_then_json
    llm = _FakeStreamLLM(["前置思考。\n",
                          "```json\n{'critique': '论据不足', 'score': 3}\n```"])
    thinking, result = think_then_json(llm, "sys", "usr", "测试agent")
    assert result == {"critique": "论据不足", "score": 3}
    assert thinking == "前置思考。"


def test_fixaux2_brace_single_quote_json_parses():
    """花括号分支：无围栏裸花括号单引号伪 JSON → dict（两处兜底同款）。"""
    from engine.llm_io import think_then_json
    llm = _FakeStreamLLM(["开头 ", "{'passed': False, 'score': 40} 结尾"])
    thinking, result = think_then_json(llm, "sys", "usr", "测试agent")
    assert result == {"passed": False, "score": 40}
    assert thinking == "开头"


def test_fixaux2_unparseable_still_fingerprint():
    """双失败（json.loads 与 literal_eval 均拒）→ 抛原 ValueError →
    「执行异常: …」指纹语义不变（不吞错，调用失败如实上报）。"""
    from engine.llm_io import think_then_json
    llm = _FakeStreamLLM(["```json\n{不是合法对象}\n```"])
    thinking, result = think_then_json(llm, "sys", "usr", "测试agent")
    assert result == {}
    assert thinking.startswith("执行异常: ")


def test_fixaux2_valid_json_still_strict():
    """合法 JSON 原路径不受兜底影响（fence+双引号标准形态零改动）。"""
    from engine.llm_io import think_then_json
    llm = _FakeStreamLLM(["```json\n{\"passed\": true, \"score\": 85}\n```"])
    _, result = think_then_json(llm, "sys", "usr", "测试agent")
    assert result == {"passed": True, "score": 85}
