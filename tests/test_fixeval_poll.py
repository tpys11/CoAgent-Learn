# -*- coding: utf-8 -*-
"""FIXEVAL（T2 轮）守卫：eval runner _poll_progress 双信号收口。

背景（宿主实证）：eval 栈灌库后 _poll_progress 轮询 900s 假性卡死，后端日志
"后台入库完成 chunks=1"——实际入库成功，但 upload-progress 返回 {"status":"none"}。
根因：进度态是 backend 进程内存字典（后台直投不写进度 / 进程重启丢 / enhance 阶段
把 done 重置后 LLM 异常被吞不阻断），三种形态都让快路径永假、轮询耗满超时。
修复：error 判定之后追加库内事实兜底——/api/knowledge/list 中该 source chunks>0
即判终态 ok（via=doc-list）；进度快路径 / error 路径 / timeout 返回形状逐字节保留。

守卫全部为假件（monkeypatch runner 模块级 _get_json 与 time），零真网零真实 key；
守卫②③为回归基线（锁定改前返回形状），守卫④锁 timeout 形状与 3s 轮询节奏。
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "eval"))

import eval_runner  # noqa: E402 —— eval_ 前缀防收集的手动驱动件，宿主进程运行


class _FakeClock:
    """假时钟：sleep 只推进仿真钟（零真实等待），time() 返回仿真钟读数。

    _poll_progress 用 time.time() 算耗时、time.sleep(3) 定节奏；假件下 sleep(3)
    一步推 3s，timeout=0.3 时首轮末即超窗，循环有界且零等待。"""

    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def time(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)
        self.now += s


class _Router:
    """假 _get_json：按路径前缀路由 upload-progress / list 两类端点，零真网。"""

    def __init__(self, progress=None, docs=None):
        self.progress = progress if progress is not None else {}
        self.docs = docs if docs is not None else []
        self.progress_calls = 0
        self.list_calls = 0

    def __call__(self, base, path, timeout=30):
        if path.startswith("/api/knowledge/upload-progress"):
            self.progress_calls += 1
            return self.progress
        if path.startswith("/api/knowledge/list"):
            self.list_calls += 1
            # 响应形状=backend/core/knowledge_service.list_docs 实测（routers/knowledge.py:717
            # 包 {"docs": [...]}，每条键 source/chunks/vectorized/preview/tree）
            return {"docs": self.docs}
        raise AssertionError(f"unexpected path: {path}")


def _install(monkeypatch, router):
    clock = _FakeClock()
    monkeypatch.setattr(eval_runner, "time", clock)
    monkeypatch.setattr(eval_runner, "_get_json", router)
    return clock, router


def _run(source="人智导.pdf", timeout=900):
    events = []

    def log(msg):
        events.append(msg)

    return eval_runner._poll_progress("http://fake", "p1", source, log, timeout=timeout), events


# ---------- 守卫①：进度态失效（恒 none）但库内已完成 → 兜底收口 ----------

def test_rescued_by_doc_list(monkeypatch):
    """progress 恒 none（后台直投不写进度形态）+ list 含目标 source chunks=3
    → 返回 ok/via=doc-list/chunks=3，不再假性等满 900s。"""
    router = _Router(progress={"status": "none"},
                     docs=[{"source": "人智导.pdf", "chunks": 3,
                            "vectorized": True, "preview": "", "tree": []}])
    _install(monkeypatch, router)
    resp, events = _run()
    assert resp == {"status": "ok", "chunks": 3, "via": "doc-list"}
    assert any("rescued-by-doc-list chunks=3" in m for m in events)
    assert router.list_calls == 1  # 首轮即收口，未进 sleep


# ---------- 守卫②③：回归基线（改前返回形状逐字节） ----------

def test_fast_path_regression(monkeypatch):
    """progress done=2,total=2 → 快路径 ok，形状与改前完全一致，且不触库内兜底。"""
    prog = {"done": 2, "total": 2, "parse_engine": "marker"}
    router = _Router(progress=prog)
    _install(monkeypatch, router)
    resp, _ = _run()
    assert resp == {"status": "ok", "chunks": 2, "progress": prog,
                    "parse_engine": "marker"}
    assert router.list_calls == 0


def test_error_path_regression(monkeypatch):
    """progress 显式 error → error 路径，形状与改前完全一致，且不触库内兜底。"""
    prog = {"status": "error", "error": "x"}
    router = _Router(progress=prog)
    _install(monkeypatch, router)
    resp, _ = _run()
    assert resp == {"status": "error", "progress": prog}
    assert router.list_calls == 0


# ---------- 守卫④：双信号全缺 → timeout（零真实等待） ----------

def test_timeout_when_no_signal(monkeypatch):
    """progress 恒 none + list 恒空 + timeout=0.3（sleep 假件零等待）→ timeout。"""
    router = _Router(progress={"status": "none"}, docs=[])
    clock, router = _install(monkeypatch, router)
    resp, events = _run(timeout=0.3)
    # timeout 返回形状逐字节：last=进度展示串（done/total 均 None → "None/None"）
    assert resp == {"status": "timeout", "progress": "None/None"}
    assert clock.sleeps == [3]  # 恰好一轮：3s 节奏后超窗，循环有界
    assert router.progress_calls == 1
    assert not any("rescued-by-doc-list" in m for m in events)
