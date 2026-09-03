# -*- coding: utf-8 -*-
"""评估三 judge 纯逻辑守卫（闭环C）：全部离线、零网络。
覆盖：引用抽取/核验/汇总、零引用兜底口径、适配容差边界、中英文知识点命中、
语义通道接缝注入、run_eval.evaluate 汇总与 baseline 对比。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# 守卫探测对象是 backend/eval 包（judges + run_eval 纯逻辑），随 backend 入库——
# fresh clone/CI 若缺该包则整文件跳过；tests/eval 工具链已随 P0-S2 入库。
pytest.importorskip("eval", reason="backend/eval 评估包缺失，跳过 judge 纯逻辑守卫")

from eval.judges import coverage, fit, hallucination  # noqa: E402
from eval.run_eval import _diff, evaluate, render_markdown  # noqa: E402


# ---------- 幻觉率 · 程序通道 ----------

def test_extract_citations_cn_format():
    ans = "角动量守恒要求合外力矩为零 [来源: 理论力学讲义]，另见推导 [来源:wiki]。",
    cits = hallucination.extract_citations(ans[0])
    assert cits == ["理论力学讲义", "wiki"]


def test_verify_citations_valid_and_invalid():
    src = [{"title": "理论力学讲义", "url": "http://x/1"},
           {"title": "Physics Wiki", "url": "http://x/2"}]
    ans = ("合外力矩为零 [来源: 理论力学讲义]。"
           "惯性定律 [来源: Physics Wiki]。"
           "虚构出处 [来源: 不存在的文档]。")
    v = hallucination.verify_citations(ans, src)
    assert v["total"] == 3 and v["valid"] == 2 and v["invalid"] == 1
    assert v["invalid_ratio"] == round(1 / 3, 4)
    assert v["invalid_items"] == ["不存在的文档"]


def test_verify_citations_zero_cites_null_ratio():
    v = hallucination.verify_citations("没有任何引用的回答", [{"title": "A"}])
    assert v["total"] == 0 and v["invalid_ratio"] is None  # 兜底口径：不计入


def test_hallucination_summary_aggregates():
    s = hallucination.hallucination_summary([
        {"total": 3, "invalid": 0}, {"total": 1, "invalid": 1}])
    assert s == {"citation_total": 4, "citation_invalid": 1,
                 "invalid_ratio": round(1 / 4, 4)}


def test_llm_judge_channel_with_fake():
    class FakeJudge:
        def chat(self, messages, max_tokens=0):
            return '{"hallucinated": true, "suspicious_claims": ["永动机可行"]}'
    out = hallucination.llm_judge_hallucination(FakeJudge(), "永动机可行……", "热二律禁止")
    assert out["hallucinated"] is True and out["suspicious_claims"] == ["永动机可行"]

    class BadJudge:
        def chat(self, messages, max_tokens=0):
            return "不是JSON"
    assert hallucination.llm_judge_hallucination(BadJudge(), "x", "") == {"skipped": True}


# ---------- 适配一致率 ----------

def test_fit_tolerance_boundary():
    # |0.7-0.45|=0.25 → 一致；|0.7-0.44|=0.26 → 不一致（边界钉死）
    assert fit.fit_consistent(0.7, 0.45) is True
    assert fit.fit_consistent(0.7, 0.44) is False


def test_fit_rate_skips_and_none():
    samples = [{"level_score": 0.8, "difficulty": 0.7},
               {"level_score": None, "difficulty": 0.5},
               {"level_score": 0.2, "difficulty": 0.9}]
    r = fit.fit_rate(samples)
    assert r["valid_total"] == 2 and r["consistent"] == 1 and r["skipped"] == 1
    assert fit.fit_rate([])["rate"] is None


# ---------- 覆盖率 ----------

def test_hit_kps_chinese_and_english_boundary():
    kps = ["角动量", "合外力矩", "RAG", "不相关概念"]
    answer = "角动量守恒的条件是合外力矩为零。检索增强生成（RAGE 变体）……"
    out = coverage.hit_kps(answer, kps)
    assert set(out["hit"]) == {"角动量", "合外力矩"}
    assert set(out["miss"]) == {"RAG", "不相关概念"}  # RAGE ≠ RAG 整词匹配


def test_semantic_channel_seam_injection():
    fake = lambda kp, ans: kp == "力矩平衡"  # noqa: E731 语义假件
    out = coverage.hit_kps("回答里没写原词但语义等价", ["力矩平衡"], semantic_hit_fn=fake)
    assert out["hit"] == ["力矩平衡"] and out["total"] == 1


def test_coverage_rate_empty_none():
    assert coverage.coverage_rate([{"hit": [], "miss": [], "total": 0}])["rate"] is None
    r = coverage.coverage_rate([{"hit": ["a"], "miss": [], "total": 1},
                                {"hit": [], "miss": ["b", "c"], "total": 2}])
    assert r == {"kp_hit": 1, "kp_total": 3, "rate": round(1 / 3, 4)}


# ---------- run_eval 汇总与报告 ----------

def test_evaluate_end_to_end_offline():
    results = [
        {"question": "q1",
         "answer": "合外力做的功等于动能的变化 [来源: 讲义A]。",
         "level_score": 0.8, "difficulty": 0.6,
         "kps": ["动能", "功"],
         "sources": [{"title": "讲义A"}]},
        {"question": "q2",
         "answer": "无引用申明式回答：⚠️ 未在知识库中检索到相关内容",
         "level_score": 0.3, "difficulty": 0.8,
         "kps": ["角动量"],
         "sources": []},
    ]
    rep = evaluate(results)
    assert rep["sample_total"] == 2
    assert rep["hallucination"]["citation_total"] == 1
    assert rep["hallucination"]["invalid_ratio"] == 0.0   # 唯一引用有效 → 幻觉率代理 0
    assert rep["fit"]["valid_total"] == 2 and rep["fit"]["consistent"] == 1  # |0.8-0.6|=0.2✓ |0.3-0.8|✗
    assert rep["coverage"]["kp_total"] == 3 and rep["coverage"]["kp_hit"] == 2  # q1命中功+动能；q2角动量未中
    md = render_markdown(rep)
    assert "幻觉率代理" in md and "适配一致率" in md and "覆盖率" in md


def test_baseline_diff_only_when_both_present():
    cur = {"hallucination": {"rate": 0.04}, "fit": {"rate": 0.9}, "coverage": {"rate": None}}
    base = {"hallucination": {"rate": 0.06}, "fit": {"rate": 0.85}, "coverage": {"rate": 0.5}}
    d = _diff(cur, base)
    assert d == {"hallucination": -0.02, "fit": 0.05}  # coverage 双方缺一不计
