# -*- coding: utf-8 *-* 
"""R-D S1：ModelRegistry 角色×档位注册表（红先行）。
RC4-S1 改写（owner 09-03 终版语义）：review 两档改定值格（standard=SF Qwen2.5-72B 跨厂商独立判卷、
test=zen big-pickle），_review_dynamic 动态格删除——follow_main/REVIEW_MODEL_RESEARCH 设置项退役，
resolve_review_route 契约收敛两键。原动态格多态断言按新语义改写（owner 拍板=正当行为变更）。
静态格直调（standard/test 两档全角色）+ 档位判定（detect_tier/current_tier）
+ 未知 role/tier 响亮报错。T33：main/pipeline 一律执行期导入；本文件零 DB 触达（T49 骨架不需要）。
双源同值锚点：本文件与 frontend/src/models*.test 各自钉住判卷实名（交接核对项）。"""
import sys, os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


# ---------- 矩阵形状：6 角色 × 3 档位（S1 09-04：go 第二测试通道入表，18 格口径） ----------

def test_matrix_shape_6_roles_x_3_tiers():
    from core.model_provider import REGISTRY
    assert set(REGISTRY) == {"standard", "test", "go"}
    for tier in ("standard", "test", "go"):
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


# ---------- review 定值格（RC4-S1：owner 09-03 终版「档位定死」，_review_dynamic 退役） ----------

def test_standard_review_cell_fixed(monkeypatch):
    """standard.review=定值格：SF 独立厂商判卷（变异①靶格——格临时改回 main 此条恰红）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-only-fake")
    spec = resolve_model("review", "standard")
    assert spec.model == "Qwen/Qwen2.5-72B-Instruct"      # 双源同值锚点③（与前端镜像核对）
    assert spec.provider == "siliconflow"
    assert spec.base_url == _cfg.VL_BASE_URL
    assert spec.api_key == "sk-vl-only-fake"


def test_review_cell_ignores_retired_settings(monkeypatch):
    """退役设置项不再影响判卷路由：follow_main=1 不短路主模型、research 配 zen: 不被读。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_model, resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    spec = resolve_model("review", "standard")
    assert spec.model == "Qwen/Qwen2.5-72B-Instruct"
    assert spec.provider == "siliconflow"
    assert resolve_review_route("研究") == {
        "model": "Qwen/Qwen2.5-72B-Instruct", "provider": "siliconflow"}


def test_review_cell_key_single_vl(monkeypatch):
    """格层 key=单键 VL_API_KEY（RC4 定值格口径）；VL||EMBEDDING 兜底保持在调用方 pick_judge（陷阱①）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_model
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "sk-emb-fake")
    spec = resolve_model("review", "standard")
    assert spec.api_key == ""                              # 格层不兜底——兜底语义归 pick_judge
    assert spec.model == "Qwen/Qwen2.5-72B-Instruct"


def test_review_cell_template_param_retired():
    """template 参数退役：思考/研究同格定值，传参不再改变结果（_review_dynamic 已删）。"""
    from core.model_provider import resolve_model
    a = resolve_model("review", "standard", template="研究")
    b = resolve_model("review", "standard", template="思考")
    c = resolve_model("review", "standard")
    assert a.model == b.model == c.model == "Qwen/Qwen2.5-72B-Instruct"
    assert a.provider == b.provider == c.provider == "siliconflow"


def test_test_tier_review_cell_big_pickle(monkeypatch):
    """RC4 终版：测试档判卷定值 big-pickle（zen 通道）——不再依赖 review_model_research 桩。
    双源同值锚点④：与 frontend/src/models.ts MODEL_ZEN_REVIEW 核对（交接记录）。"""
    from core.config import config as _cfg
    from core.model_provider import MODEL_ZEN_REVIEW, resolve_model
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:mimo-v2.5-free")   # 退役键不被读
    spec = resolve_model("review", "test", template="研究")
    assert spec.model == MODEL_ZEN_REVIEW == "big-pickle"
    assert spec.provider == "zen"
    assert spec.base_url == _cfg.ZEN_BASE_URL
    assert spec.api_key == _cfg.ZEN_API_KEY


# ---------- 注册表级 resolve_review_route（RC4 新契约：恰两键，follow_main 随动态格退役） ----------

def test_registry_resolve_review_route_dict_contract():
    """RC4 契约：返回恰 {"model","provider"} 两键（follow_main 键删除——T61 同步清）。"""
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    assert route == {"model": "Qwen/Qwen2.5-72B-Instruct", "provider": "siliconflow"}
    assert "follow_main" not in route


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
