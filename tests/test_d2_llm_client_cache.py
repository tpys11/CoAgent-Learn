# -*- coding: utf-8 -*-
"""D2：LLM client 进程级缓存守卫。

断言定位（决策 24）：
- 隔离性组（不同 api_key/base_url/model/思考开关 → 不同实例）：新行为断言，
  若缓存退化成「无条件单例」→ 恰这组红。
- test_cache_key_contains_no_plaintext_key：安全红线断言——API Key 明文不得
  出现在缓存 key（repr 全量扫描）+ 摘要格式校验。
- test_concurrent_same_combo_single_instance：并发防竞态（Assess 线程与 Retrieve
  并发取同组合 → 只建一次）。
- test_cache_structures_exist：存在性守卫（决策 18）。

导入纪律：engine.pipeline_v2 延迟到 fixture 执行期导入（同 tests/test_d4_retry_idempotency.py
文件头的说明——避免 collection 期触发 core.config.load_dotenv 污染 test_db_path 快照）。"""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest


@pytest.fixture()
def eng():
    import engine.pipeline_v2 as eng_mod
    eng_mod._LLM_CACHE.clear()
    yield eng_mod
    eng_mod._LLM_CACHE.clear()


def _req(api_key="k1", model=None, base_url=None):
    return SimpleNamespace(api_key=api_key, model=model, base_url=base_url,
                           message="m", session_id="s", settings={})


def test_cache_structures_exist(eng):
    """存在性守卫（决策 18）：缓存结构与锁必须在。"""
    assert isinstance(eng._LLM_CACHE, dict)
    assert eng._LLM_CACHE_LOCK is not None


def test_same_combo_reuses_instance(eng):
    a = eng._make_llm(_req())
    b = eng._make_llm(_req())
    assert a is b
    fa = eng._make_fast_llm(_req())
    fb = eng._make_fast_llm(_req())
    assert fa is fb


def test_different_api_key_isolated(eng):
    a = eng._make_llm(_req(api_key="k1"))
    b = eng._make_llm(_req(api_key="k2"))
    assert a is not b


def test_different_base_url_isolated(eng):
    a = eng._make_llm(_req(base_url="https://a.example.com/v1"))
    b = eng._make_llm(_req(base_url="https://b.example.com/v1"))
    assert a is not b


def test_different_model_isolated(eng):
    a = eng._make_llm(_req(model="m-a"))
    b = eng._make_llm(_req(model="m-b"))
    assert a is not b


def test_fast_and_main_isolated(eng):
    a = eng._make_llm(_req())
    b = eng._make_fast_llm(_req())
    assert a is not b
    assert b.thinking is False and a.thinking is None


def test_cache_key_contains_no_plaintext_key(eng):
    """安全红线：API Key 明文不得出现在缓存 key（repr 全量扫描）；key 首位必须是
    16 位十六进制 sha256 摘要。"""
    secret = "sk-super-secret-D2-123456"
    eng._make_llm(_req(api_key=secret))
    eng._make_fast_llm(_req(api_key=secret))
    keys_repr = repr(list(eng._LLM_CACHE.keys()))
    assert secret not in keys_repr
    assert len(eng._LLM_CACHE) == 2  # 主模型(思考=None) 与 快模型(思考=False) 两组合
    for k in eng._LLM_CACHE.keys():
        assert len(k[0]) == 16 and all(c in "0123456789abcdef" for c in k[0])


def test_concurrent_same_combo_single_instance(eng):
    """并发防竞态：S3 Assess 线程与 S2 Retrieve 并发取同组合 → 只建一次。"""
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(eng._make_llm, _req()) for _ in range(16)]
        outs = [f.result() for f in futs]
    assert all(o is outs[0] for o in outs)
    assert len(eng._LLM_CACHE) == 1
