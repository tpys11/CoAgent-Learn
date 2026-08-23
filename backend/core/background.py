# -*- coding: utf-8 -*-
"""统一后台执行器：收敛散落的裸 threading.Thread，统一异常兜底与日志。"""
import logging
import threading

logger = logging.getLogger("coagent.background")


def submit(fn, *args, **kwargs):
    """提交一个后台任务（daemon 线程）。异常仅记录日志，不影响主流程。"""
    def _run():
        try:
            fn(*args, **kwargs)
        except Exception:
            logger.exception("后台任务执行失败: %s", getattr(fn, "__name__", repr(fn)))

    threading.Thread(target=_run, daemon=True).start()
