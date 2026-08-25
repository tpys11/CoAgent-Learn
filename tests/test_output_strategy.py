# -*- coding: utf-8 -*-
"""Loop3·输出策略三纯函数验证（路由覆盖/计算回落/指令文本）。"""
from engine import output_strategy as strat


def test_route_research_mode_override():
    assert strat.route("研究", 0.0) == 3
    assert strat.route("研究", 0.9) == 3


def test_route_extreme_mode():
    assert strat.route("极速", 0.59) == 1
    assert strat.route("极速", 0.6) == 2
    assert strat.route("极速", 0.95) == 2


def test_route_thinking_boundaries_inclusive():
    assert strat.route("思考", 0.39) == 3   # <0.4 → ③用户先行
    assert strat.route("思考", 0.4) == 1    # 含低端边界
    assert strat.route("思考", 0.5) == 1
    assert strat.route("思考", 0.6) == 1    # 含高端边界
    assert strat.route("思考", 0.61) == 2
    assert strat.route("基础", 0.39) == 3   # 未识别模板按思考处理


def test_compute_t_assess_overrides_profile():
    profile = {"selfLevel": "入门"}          # 映射 0.2
    t = strat.compute_t(profile, assess_score=0.85)
    assert abs(t - (0.7 * 0.85 + 0.3 * 0.6)) < 1e-9


def test_compute_t_profile_only_and_defaults():
    assert abs(strat.compute_t({"selfLevel": "进阶"}) - (0.7 * 0.65 + 0.3 * 0.6)) < 1e-9
    assert abs(strat.compute_t({}) - (0.7 * 0.4 + 0.3 * 0.6)) < 1e-9


def test_compute_t_invalid_assess_falls_back():
    # 非法评分(>1)不采用，回落画像映射
    t = strat.compute_t({"selfLevel": "入门"}, assess_score=5)
    assert abs(t - (0.7 * 0.2 + 0.3 * 0.6)) < 1e-9


def test_compute_t_clamped():
    assert 0 <= strat.compute_t({}, assess_score=1) <= 1
    assert 0 <= strat.compute_t({}, assess_score=0) <= 1


def test_directive_texts_distinct_with_t():
    d = [strat.directive(i, 0.75) for i in (1, 2, 3)]
    assert len(set(d)) == 3
    for text in d:
        assert "输出策略指令" in text and "T=0.75" in text


def test_strategy_name_mapping():
    assert strat.strategy_name(1) == "①KB基准"
    assert strat.strategy_name(3).startswith("③")
