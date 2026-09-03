# -*- coding: utf-8 -*-
"""Loop4·ReviewGate 验证：门控矩阵 / 判卷解析 / 异常跳过软着陆。
研究档断言级审核（review_claims）：契约 / 诊断分类 / fail-open / 低温固定。"""
import pytest

from engine.review import (REVIEW_MAX_RETRY, pick_judge_llm, review_claims,
                           review_enabled, review_once)
from tests._engine_helpers import ScriptedLLM


def test_review_enabled_matrix():
    assert review_enabled("极速", {"reviewEnabled": True}) is False   # 极速恒关
    assert review_enabled("研究", {}) is True                          # 研究恒开
    assert review_enabled("研究", {"reviewEnabled": False}) is True    # 研究不受配置降档
    assert review_enabled("思考", {}) is False                         # 思考默认关
    assert review_enabled("思考", {"reviewEnabled": True}) is True     # 思考可配开


class _Req:
    api_key = "dummy"
    base_url = None


def test_pick_judge_llm_by_mode(monkeypatch):
    """RC4 改写：判卷=档位定值格（standard=SF Qwen72B），思考/研究同格。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")   # T60 家族防线：显式 standard 档
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-test-sf")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    j1 = pick_judge_llm("思考", _Req())
    assert j1.model_name == "Qwen/Qwen2.5-72B-Instruct"
    j2 = pick_judge_llm("研究", _Req())
    assert j2.model_name == "Qwen/Qwen2.5-72B-Instruct"


def test_pick_judge_llm_research_cross_vendor_lane(monkeypatch):
    """RC4 改写：standard 档判卷定值 SF 实名——走硅基流动端点真跨厂商（防自我包庇的设计意图落地）。"""
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "sk-test-sf")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    j = pick_judge_llm("研究", _Req())
    assert j.model_name == "Qwen/Qwen2.5-72B-Instruct"
    assert j._base_url == _cfg.VL_BASE_URL


def test_pick_judge_llm_missing_key_loud_fallback(monkeypatch, caplog):
    """定值格模型缺硅基流动 key → 响亮回退同源视觉版（VL||EMBEDDING 兜底全空时；运行时 401/fail-open 预期）。"""
    import logging as _logging
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "ZEN_TEST_MODE", "0")
    monkeypatch.setattr(_cfg, "VL_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(_cfg, "ZEN_API_KEY", "")   # standard 档不走 zen，但显式清空防环境波动
    with caplog.at_level(_logging.WARNING, logger="coagent.review"):
        j = pick_judge_llm("研究", _Req())
    assert j.model_name == "deepseek-v4-flash-vision-exp"
    assert j._base_url is None
    assert any("回退" in r.message for r in caplog.records)


def test_review_once_pass():
    llm = ScriptedLLM(['{"passed": true, "reasons": ""}'])
    out = review_once(llm, "回答内容", "", "【输出策略指令】测试")
    assert out["passed"] is True and out["skipped"] is False


def test_review_once_fail_reasons():
    llm = ScriptedLLM(['{"passed": false, "reasons": "密度过高"}'])
    out = review_once(llm, "回答内容", "", "")
    assert out["passed"] is False and "密度" in out["reasons"]


def test_review_once_malformed_skips():
    llm = ScriptedLLM(["完全不是json"])
    out = review_once(llm, "回答内容", "", "")
    assert out["passed"] is True and out["skipped"] is True


def test_max_retry_constant():
    assert REVIEW_MAX_RETRY == 2


# ---------- review_claims（研究档断言级审核） ----------

def _claims_json(claims, instruction_ok=True, note=""):
    import json as _j
    return _j.dumps({"claims": claims, "instruction_ok": instruction_ok,
                     "instruction_note": note}, ensure_ascii=False)


def test_review_claims_pass():
    llm = ScriptedLLM([_claims_json([
        {"claim": "向量库用Milvus", "label": "supported", "confidence": 0.9,
         "reason": "证据1支持", "diag": ""}])])
    out = review_claims(llm, "回答", [{"title": "t", "content": "Milvus 是向量库"}], "策略")
    assert out["passed"] is True and out["skipped"] is False
    assert out["score"] == 100 and out["issues"] == []
    assert out["reasons"] == ""


def test_review_claims_hallucination_fails_and_maps_issues():
    llm = ScriptedLLM([_claims_json([
        {"claim": "RAG 检索 top-k 是 5", "label": "unsupported", "confidence": 0.8,
         "reason": "证据说 3", "diag": "hallucination"},
        {"claim": "Milvus 是向量库", "label": "supported", "confidence": 0.9,
         "reason": "证据2", "diag": ""}])])
    out = review_claims(llm, "回答", [{"content": "top-k 是 3"}], "")
    assert out["passed"] is False
    assert out["score"] == 50                       # round(100×1/2)
    assert out["issues"][0]["problem"].startswith("【虚构】")
    assert "证据说 3" in out["issues"][0]["fix"]
    assert out["claims"][0]["diag"] == "hallucination"


def test_review_claims_gap_diag_kept():
    """retrieval_gap 是单步3召回审核的触发依据，必须原样保留在 claims 里。"""
    llm = ScriptedLLM([_claims_json([
        {"claim": "2026 年最新基准 X", "label": "unsupported", "confidence": 0.6,
         "reason": "证据未覆盖", "diag": "retrieval_gap"}])])
    out = review_claims(llm, "回答", [{"content": "别的 topic"}], "")
    assert out["passed"] is False
    assert out["issues"][0]["problem"].startswith("【检索缺口】")
    assert out["claims"][0]["diag"] == "retrieval_gap"


def test_review_claims_diag_whitelist_defaults_conservative():
    """白名单外 diag 归为 no_evidence（最保守），label 白名单外整条丢弃。"""
    llm = ScriptedLLM([_claims_json([
        {"claim": "甲", "label": "unsupported", "confidence": 0.5,
         "reason": "r", "diag": "不知道"},
        {"claim": "乙", "label": "半对半错", "confidence": 0.5, "reason": "r"}])])
    out = review_claims(llm, "回答", [], "")
    assert len(out["claims"]) == 1 and out["claims"][0]["claim"] == "甲"
    assert out["claims"][0]["diag"] == "no_evidence"


def test_review_claims_malformed_skips():
    llm = ScriptedLLM(["完全不是json"])
    out = review_claims(llm, "回答", [], "")
    assert out["passed"] is True and out["skipped"] is True
    assert out["issues"] == [] and out["claims"] == []
    assert "本轮未经完整审核" in out["reasons"]


def test_review_claims_empty_claims():
    llm = ScriptedLLM([_claims_json([])])
    out = review_claims(llm, "回答", [], "")
    assert out["passed"] is True and out["score"] == 100 and out["claims"] == []
    assert "未抽取到事实断言" in out["reasons"]


def test_review_claims_instruction_fail():
    llm = ScriptedLLM([_claims_json([
        {"claim": "A", "label": "supported", "confidence": 0.9, "reason": "r", "diag": ""}],
        instruction_ok=False, note="密度过高")])
    out = review_claims(llm, "回答", [], "策略")
    assert out["passed"] is False and "密度过高" in out["reasons"]


def test_review_claims_temperature_zero():
    llm = ScriptedLLM([_claims_json([])])
    review_claims(llm, "回答", [], "")
    assert llm.calls[0]["kw"].get("temperature") == 0
