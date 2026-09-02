# -*- coding: utf-8 *-* 
"""R-D S1：ModelRegistry 角色×档位注册表（红先行）。
静态格直调（standard/test 两档全角色）+ 档位判定（detect_tier/current_tier）+ review 动态格多态
+ 未知 role/tier 响亮报错。零调用点改动（S1 纯新增，review.py 原函数不动，S2 再转调）。
T33：main/pipeline 一律执行期导入；本文件零 DB 触达（T49 骨架不需要）。
双源同值锚点：本文件与 frontend/src/models*.test 各自钉住三串实名（交接核对项）。"""
import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


# ---------- 矩阵形状：6 角色 × 2 档位（review 每档内含 research/think 双模板分支，14 格口径） ----------

def test_matrix_shape_6_roles_x_2_tiers():
    from core.model_provider import REGISTRY
    assert set(REGISTRY) == {"standard", "test"}
    for tier in ("standard", "test"):
        assert set(REGISTRY[tier]) == {"main", "fast", "review", "embedding", "rerank", "vision"}


# ---------- standard 档静态格 ----------

def test_standard_main_cell():
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    spec = resolve_model("main", "standard")
    assert spec.model == "deepseek-v4-flash-vision-exp"   # 双源同值锚点①（与前端镜像核对）
    assert spec.base_url == _cfg.DEEPSEEK_BASE_URL
    assert spec.api_key == _cfg.DEEPSEEK_API_KEY          # 调用方 or 链在调用点保持（S3 逐点）
    assert spec.provider == "main"


def test_standard_fast_follows_main():
    from core.config import config as _cfg
    from core.model_provider import resolve_model, MODEL_FAST, MODEL_MAIN
    assert MODEL_FAST == MODEL_MAIN   # 轻调用道当前跟随主模型（既有语义）
    spec = resolve_model("fast", "standard")
    assert spec.model == MODEL_FAST
    assert spec.base_url == _cfg.DEEPSEEK_BASE_URL
    assert spec.provider == "main"


def test_standard_vision_cell():
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    spec = resolve_model("vision", "standard")
    assert spec.model == "deepseek-v4-flash-vision-exp"   # dsv4f 自带识图（标准档）
    assert spec.base_url == _cfg.DEEPSEEK_BASE_URL
    assert spec.provider == "main"


def test_standard_embedding_cell():
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    spec = resolve_model("embedding", "standard")
    assert spec.model == _cfg.EMBEDDING_MODEL
    assert spec.base_url == _cfg.EMBEDDING_BASE_URL
    assert spec.api_key == _cfg.EMBEDDING_API_KEY
    assert spec.provider == "siliconflow"


def test_standard_rerank_cell_or_chain(monkeypatch):
    """rerank key 前序=RERANK||EMBEDDING（or 链写进格定义）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
    monkeypatch.setattr(_cfg, "RERANK_API_KEY", "sk-rerank-only-fake")
    spec = resolve_model("rerank", "standard")
    assert spec.model == _cfg.RERANK_MODEL
    assert spec.base_url == _cfg.RERANK_BASE_URL
    assert spec.api_key == "sk-rerank-only-fake"          # 前序生效
    monkeypatch.setattr(_cfg, "RERANK_API_KEY", "")
    spec2 = resolve_model("rerank", "standard")
    assert spec2.api_key == _cfg.EMBEDDING_API_KEY        # 回落 EMBEDDING


# ---------- test 档静态格（决策 38：对话/视觉走 zen；embedding/rerank 专有能力留 SF） ----------

def test_test_tier_main_cell():
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    spec = resolve_model("main", "test")
    assert spec.model == "mimo-v2.5-free"                 # 双源同值锚点②（变异①靶格）
    assert spec.base_url == _cfg.ZEN_BASE_URL
    assert spec.api_key == _cfg.ZEN_API_KEY
    assert spec.provider == "zen"


def test_test_tier_fast_and_vision_cells():
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    fast = resolve_model("fast", "test")
    vision = resolve_model("vision", "test")
    for spec in (fast, vision):
        assert spec.model == "mimo-v2.5-free"
        assert spec.base_url == _cfg.ZEN_BASE_URL
        assert spec.provider == "zen"
    # vision test 格=非视觉模型：调用点（knowledge describe）静默吞没——语义由 S3 测试钉住


def test_test_tier_embedding_rerank_follow_standard(monkeypatch):
    """决策 38：embedding/rerank 的 test 格沿用 standard 同一 cell（专有能力留 SF，非 zen）。"""
    from core.model_provider import resolve_model
    for role in ("embedding", "rerank"):
        a = resolve_model(role, "standard")
        b = resolve_model(role, "test")
        assert (a.model, a.base_url, a.api_key, a.provider) == \
               (b.model, b.base_url, b.api_key, b.provider)


# ---------- review 动态格（RA5 四分支逻辑原样搬迁，行为零变化） ----------

def test_review_dynamic_follow_main(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    spec = resolve_model("review", "standard", template="研究")
    assert spec.model == "deepseek-v4-flash-vision-exp"
    assert spec.provider == "main" and spec.follow_main is True


def test_review_dynamic_zen_prefix(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    spec = resolve_model("review", "standard", template="研究")
    assert spec.model == "Big Pickle"                     # 去前缀体，大小写原样保留
    assert spec.provider == "zen" and spec.follow_main is False


def test_review_dynamic_siliconflow_slash(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "Qwen/Qwen2.5-72B-Instruct")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-only-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    spec = resolve_model("review", "standard", template="研究")
    assert spec.model == "Qwen/Qwen2.5-72B-Instruct"
    assert spec.provider == "siliconflow"
    assert spec.base_url == _cfg.VL_BASE_URL
    assert spec.api_key == "sk-vl-only-fake"              # VL||EMBEDDING 前序（与 pick_judge 同序）


def test_review_dynamic_empty_falls_main(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "")
    spec = resolve_model("review", "standard", template="研究")
    assert spec.model == "deepseek-v4-flash-vision-exp"
    assert spec.provider == "main" and spec.follow_main is False


def test_review_dynamic_think_template(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_THINK", "zen:Think Pickle")
    spec = resolve_model("review", "standard", template="思考")
    assert spec.model == "Think Pickle" and spec.provider == "zen"


def test_review_test_tier_preset_big_pickle(monkeypatch):
    """决策 38 测试档审核实名 big-pickle（前端 presets 置 zen:big-pickle → 动态格路由 zen 通道）。
    双源同值锚点③：与 frontend/src/models*.test 的大串核对（交接记录）。"""
    from core.model_provider import resolve_model
    from core.config import config as _cfg
    # 基线显式桩定（RA5 范式）：先前用例可能经 PUT 写 config 单例泄漏 REVIEW_FOLLOW_MAIN（T60 家族）
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:big-pickle")
    spec = resolve_model("review", "test", template="研究")
    assert spec.model == "big-pickle"
    assert spec.provider == "zen"


# ---------- 注册表级 resolve_review_route（RA5 dict 契约视图，S2 起 review.py 转调） ----------

def test_registry_resolve_review_route_dict_contract(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    assert resolve_review_route("研究") == {
        "model": "Big Pickle", "provider": "zen", "follow_main": False}


# ---------- 报错语义 ----------

def test_unknown_role_raises():
    from core.model_provider import resolve_model
    with pytest.raises(ValueError):
        resolve_model("nope", "standard")


def test_unknown_tier_raises():
    from core.model_provider import resolve_model
    with pytest.raises(ValueError):
        resolve_model("main", "nightly")


# ---------- 档位判定 ----------

def test_detect_tier_zen_mark():
    from core.model_provider import detect_tier
    assert detect_tier("https://opencode.ai/zen/v1") == "test"
    assert detect_tier("https://api.deepseek.com/v1") == "standard"
    assert detect_tier(None) == "standard"


def test_current_tier_switch(monkeypatch):
    from core.config import config as _cfg
    from core.model_provider import current_tier
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "1")
    assert current_tier() == "test"
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    assert current_tier() == "standard"
