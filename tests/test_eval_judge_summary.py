# -*- coding: utf-8 -*-
"""P0-S3 评测两口修补守卫：分母诚实化（failed_total/valid_ratio）+ md 报告同步 +
eval-override.yml 副本栈隔离（无真实 data 引用）。全部离线、零 LLM 调用（不触 judge 网络通道）。"""
import importlib.util
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# 探测对象：backend/eval 包 + tests/eval/eval_judge.py 工具件（随 P0-S2 入库）
pytest.importorskip("eval", reason="backend/eval 评估包缺失，跳过分母诚实化守卫")

from eval.run_eval import evaluate, render_markdown  # noqa: E402

_SPEC = importlib.util.spec_from_file_location(
    "eval_judge_tool",
    os.path.join(os.path.dirname(__file__), "eval", "eval_judge.py"))
_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_mod)


def _valid(cid="C-1", answer="合外力矩为零 [来源: 讲义A]"):
    return {"case_id": cid, "answer": answer, "level_score": 0.7,
            "difficulty": 0.6, "kps": ["力矩"], "sources": [{"title": "讲义A"}]}


# ---------- 两字段计算 ----------

def test_failed_total_counts_error_and_empty_not_if():
    results = [_valid("C-1"),                          # 有效
               {"case_id": "C-2", "error": "timeout"},  # 失败（error 且无回答）
               {"case_id": "C-3", "answer": "   "},     # 空（回答空白）
               {"case_id": "IF-01", "error": "boom"}]   # IF 口径：不计基础分母
    fields, valid = _mod.summarize_denominator(results)
    assert fields["failed_total"] == 2
    assert [r["case_id"] for r in valid] == ["C-1"]
    assert fields["base_total"] == 3 and fields["valid_ratio"] == round(1 / 3, 4)


def test_valid_ratio_denominator_includes_failed():
    # 含失败/空样本时分母变化：4 条基础样本仅 2 条有效 → 0.5（旧汇总对此完全失语）
    results = [_valid("C-1"), _valid("C-2"),
               {"case_id": "C-3", "error": "conn refused"},
               {"case_id": "C-4", "answer": ""}]
    fields, valid = _mod.summarize_denominator(results)
    assert fields["valid_ratio"] == 0.5 and fields["failed_total"] == 2
    # 三硬指标口径分母不动（EVAL-1 协议）：evaluate 仍只吃有效集
    rep = evaluate(valid)
    assert rep["sample_total"] == 2


def test_valid_ratio_none_when_pool_empty():
    fields, valid = _mod.summarize_denominator([])
    assert fields["valid_ratio"] is None and fields["failed_total"] == 0 and valid == []


# ---------- 报告与汇总同步 ----------

def test_markdown_report_carries_denominator_lines():
    fields, valid = _mod.summarize_denominator(
        [_valid("C-1"), {"case_id": "C-2", "error": "x"}])
    lines = _mod.render_denominator_lines(fields)
    md = render_markdown(evaluate(valid)) + "\n".join(lines) + "\n"
    assert "failed_total" in md and "1" in md
    assert "valid_ratio" in md and "0.5" in md


# ---------- override 副本栈隔离 ----------

def test_eval_override_isolated_from_real_data():
    path = os.path.join(os.path.dirname(__file__), "..", "deploy", "eval-override.yml")
    assert os.path.exists(path), "deploy/eval-override.yml 未创建（S3 交付缺项）"
    text = open(path, encoding="utf-8").read()
    assert "../data" not in text, "数据卷不得指向真实 data 目录"
    assert "coagent-eval-data" in text, "数据卷必须指向临时目录"
    assert "18000:8000" in text, "后端须避开 8000-8080 已用区且对齐 runner 默认端口"
    assert "5174:80" in text, "前端须避开 dev 端口 5173"
    assert "name: coagent-eval" in text, "须独立 project 名与 dev 栈隔离"
    assert "guashuai-eval-backend" in text and "guashuai-eval-frontend" in text, \
        "容器名须带 eval 前缀防与 dev 栈撞名"
