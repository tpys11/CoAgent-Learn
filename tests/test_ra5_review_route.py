# -*- coding: utf-8 -*-
"""RA5-S1：判卷路由单一事实源 resolve_review_route（红先行）。
三处同源漂移现场（pick_judge_llm / settings /test 探测复刻段 / GET review 不回显实际生效模型）
收敛到一个纯函数；四分支逻辑自 pick_judge_llm 原样搬迁，行为零变化。
T33：main/pipeline 一律执行期导入；T49：隔离库骨架沿用 test_ra_s1_review_follow_main.py。"""
import sys, os
import pytest
import fastapi.testclient
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


def _make_req(api_key="sk-deepseek-fake", base_url="https://api.deepseek.com/v1"):
    req = MagicMock()
    req.api_key = api_key
    req.base_url = base_url
    return req


def _fake_cached_llm(key, base_url, model, thinking, effort, factory):
    """模拟 _cached_llm：key 非空返回 factory() 产物（真 DeepSeekLLM，断言 model_name/_api_key/_base_url）；
    key 为空返回 mock（避免真实 OpenAI 客户端）。"""
    if not key:
        llm = MagicMock()
        llm.model_name = model
        llm._api_key = key
        llm._base_url = base_url
        llm.thinking = thinking
        return llm
    return factory()


# ---------- resolve_review_route 三态矩阵（纯函数直调） ----------

def test_route_matrix_follow_main_on_short_circuits_main(monkeypatch):
    """矩阵①：follow_main='1' → main 通道 MODEL_MAIN（research 配了 zen: 也短路——原 pick_judge 语义）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    assert resolve_review_route("研究") == {
        "model": "deepseek-v4-flash-vision-exp", "provider": "main", "follow_main": True}


def test_route_matrix_zen_prefix_routes_zen(monkeypatch):
    """矩阵②：follow_main='0' + zen: 前缀 → zen 通道，model=去前缀体（原 pick_judge 语义）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    assert resolve_review_route("研究") == {
        "model": "Big Pickle", "provider": "zen", "follow_main": False}


def test_route_matrix_empty_research_falls_back_main(monkeypatch):
    """矩阵③：follow_main='0' + research 空 → main 通道 MODEL_MAIN（原 pick_judge 语义）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "")
    assert resolve_review_route("研究") == {
        "model": "deepseek-v4-flash-vision-exp", "provider": "main", "follow_main": False}


def test_route_think_template_reads_think_model(monkeypatch):
    """补充：思考档读 REVIEW_MODEL_THINK（resolve 服务 pick_judge 双模板，不只研究档）。"""
    from core.config import config as _cfg
    from core.model_provider import resolve_review_route
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_THINK", "zen:Think Pickle")
    assert resolve_review_route("思考") == {
        "model": "Think Pickle", "provider": "zen", "follow_main": False}


# ---------- pick_judge 与 route 同源断言（LLM 构造实测 vs 路由判定） ----------

@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_follow_main(mock_cll, monkeypatch):
    """同源①：follow_main='1' 时 pick_judge 实造 LLM 与 route 判定一致（主模型/主通道/req key）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "1")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    req = _make_req()
    llm = pick_judge_llm("研究", req)
    assert route["provider"] == "main" and route["follow_main"] is True
    assert llm.model_name == route["model"] == "deepseek-v4-flash-vision-exp"
    assert llm._base_url == req.base_url          # 主通道=req 端点（非 Zen）
    assert llm._api_key == req.api_key            # 主通道 key=req.api_key||DEEPSEEK


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_zen(mock_cll, monkeypatch):
    """同源②：zen: 路由时 pick_judge 实造 LLM 与 route 判定一致（去前缀模型/Zen 端点/ZEN key）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "zen:Big Pickle")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "sk-zen-test-only-fake")
    monkeypatch.setattr(_cfg, "ZEN_BASE_URL", "https://opencode.ai/zen/v1")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    llm = pick_judge_llm("研究", _make_req())
    assert route["provider"] == "zen"
    assert llm.model_name == route["model"] == "Big Pickle"
    assert llm._base_url == "https://opencode.ai/zen/v1"
    assert llm._api_key == "sk-zen-test-only-fake"


@patch("engine.pipeline_v2._cached_llm", side_effect=_fake_cached_llm)
def test_same_source_siliconflow(mock_cll, monkeypatch):
    """同源③："/" 跨厂商路由时 pick_judge 实造 LLM 与 route 判定一致（SF 端点/VL||EMBEDDING key）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "Qwen/Qwen2.5-72B-Instruct")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-vl-test-only-fake")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1")

    from engine.review import pick_judge_llm
    from core.model_provider import resolve_review_route
    route = resolve_review_route("研究")
    llm = pick_judge_llm("研究", _make_req())
    assert route["provider"] == "siliconflow"
    assert llm.model_name == route["model"] == "Qwen/Qwen2.5-72B-Instruct"
    assert llm._base_url == "https://api.siliconflow.cn/v1"
    assert llm._api_key == "sk-vl-test-only-fake"   # VL 优先于 EMBEDDING（原 pick_judge 选择序）


# ---------- GET review 节 additive 回显 ----------

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


def test_get_review_echoes_effective_model(settings_env, monkeypatch):
    """RA5-S1：GET review 节 additive 回显 effective_model=resolve_review_route('研究')['model']
    （后端权威——前端自检卡改读此值，删前端路由复算）。三态：空→主模型；"/"→研究档实名；
    follow_main=1→短路主模型。"""
    tc, _client = settings_env
    from core.config import config as _cfg
    # 基线显式桩定（不依赖宿主 .env/DB 状态），隔离库初始为空
    monkeypatch.setattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")
    monkeypatch.setattr(_cfg, "REVIEW_MODEL_RESEARCH", "")
    assert tc.get("/api/settings").json()["review"]["effective_model"] == "deepseek-v4-flash-vision-exp"
    # PUT "/" 型研究档 → effective_model=研究档实名（siliconflow 路由按名回显，key 可用性不影响回显）
    tc.put("/api/settings", json={"review_model_research": "Qwen/Qwen2.5-72B-Instruct"})
    assert tc.get("/api/settings").json()["review"]["effective_model"] == "Qwen/Qwen2.5-72B-Instruct"
    # follow_main=1 短路 → 主模型（独立开关优先于 research 值）
    tc.put("/api/settings", json={"review_follow_main": True})
    assert tc.get("/api/settings").json()["review"]["effective_model"] == "deepseek-v4-flash-vision-exp"
