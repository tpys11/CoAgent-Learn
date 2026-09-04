# -*- coding: utf-8 -*-
"""eval runner 对话 ID 跑数隔离守卫（E-46 连带防复发）。

背景：旧方案对话 ID = "edlg-" + case_id（写死、跨跑不变），重跑同批时复用旧
对话的历史消息——实证同一题的问答对跨 4 次跑数累积在同一对话里，assess 的
「近期对话」与生成的记忆上下文全部被污染（E-46 排障日志）。
修复：对话 ID 嵌项目 ID 尾段；ensure_project 每次跑数新建项目 ⇒ 对话必然全新。

守卫全部假件（monkeypatch _post_json / wait_profile_ready），零真网零真实 key。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "eval"))

import eval_runner  # noqa: E402 —— eval_ 前缀防收集的手动驱动件，宿主进程运行


def _install(monkeypatch):
    monkeypatch.setattr(eval_runner, "_post_json", lambda *a, **k: {})
    monkeypatch.setattr(eval_runner, "wait_profile_ready", lambda base, did: True)


def test_dialogue_id_scoped_to_project(monkeypatch):
    """不同跑数（不同 pid）+ 同 case_id ⇒ 对话 ID 必不同（跨跑不复用历史）。"""
    _install(monkeypatch)
    did1, ready1 = eval_runner.new_dialogue("http://fake", "proj-run-aaaa1111", "P1-01", {})
    did2, ready2 = eval_runner.new_dialogue("http://fake", "proj-run-bbbb2222", "P1-01", {})
    assert ready1 is True and ready2 is True
    assert did1 == "edlg-aaaa1111-p1-01"
    assert did2 == "edlg-bbbb2222-p1-01"
    assert did1 != did2


def test_dialogue_id_stable_within_run(monkeypatch):
    """同一次跑数内（同 pid）同 case ⇒ 对话 ID 确定（幂等可复现）。"""
    _install(monkeypatch)
    did1, _ = eval_runner.new_dialogue("http://fake", "proj-run-cccc3333", "P2-07", {})
    did2, _ = eval_runner.new_dialogue("http://fake", "proj-run-cccc3333", "P2-07", {})
    assert did1 == did2 == "edlg-cccc3333-p2-07"
