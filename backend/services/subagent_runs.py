# -*- coding: utf-8 -*-
"""子agent运行生命周期服务（条目4地基②）：create → emit(start/input/delta/…) → finish 的语义封装。

分层说明（封装原则：逻辑→函数，持久化→repo）：
- 本层不含 SQL，持久化一律走 core.db.subagent_repo；
- 任何失败只记日志不抛出——子agent观测绝不能打断主对话链路（降级语义与未来 @guard 对齐）。
"""
import logging
import time
import uuid

logger = logging.getLogger("coagent.subagent")

_CTX = "subagent.svc"


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def new_run_id() -> str:
    """run_id：r + 12位hex（如 r3f9a1c2e4b7），前端按钮/窗口以此为主键。"""
    return "r" + uuid.uuid4().hex[:12]


def create_run(*, project_id: str = "", dialogue_id: str = "", agent: str = "",
               title: str = "", input_text: str = "") -> str:
    """建档并返回 run_id。失败时返回新 id 但档案缺失——后续 emit 自动降级为日志。"""
    rid = new_run_id()
    try:
        from core.db.subagent_repo import get_subagent_repo
        get_subagent_repo().insert_run(rid, project_id=project_id, dialogue_id=dialogue_id,
                                       agent=agent, title=title, input_text=input_text)
    except Exception:
        logger.warning("[%s] 建档失败 run=%s title=%s", _CTX, rid, title, exc_info=True)
    return rid


def emit(run_id: str, type_: str, **payload):
    """追加一条过程事件（type_: start / input / delta / end）。失败静默降级为日志。"""
    try:
        from core.db.subagent_repo import get_subagent_repo
        get_subagent_repo().append_event(run_id, {"t": _now(), "type": type_, **payload})
    except Exception:
        logger.warning("[%s] 事件写入失败 run=%s type=%s", _CTX, run_id, type_, exc_info=True)


def finish_run(run_id: str, status: str = "ok", summary: str = "", output: str = ""):
    """收尾：终态回写（output 优先，退而取 summary）+ end 事件入流。"""
    try:
        from core.db.subagent_repo import get_subagent_repo
        get_subagent_repo().finish_run(run_id, status=status, output=output or summary)
        emit(run_id, "end", status=status, summary=summary)
    except Exception:
        logger.warning("[%s] 收尾失败 run=%s", _CTX, run_id, exc_info=True)


def get_run(run_id: str):
    """整档读取（events 已解析）；失败返回 None（调用方按无档案渲染兜底）。"""
    try:
        from core.db.subagent_repo import get_subagent_repo
        return get_subagent_repo().get_run(run_id)
    except Exception:
        logger.warning("[%s] 查询失败 run=%s", _CTX, run_id, exc_info=True)
        return None
