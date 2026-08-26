# -*- coding: utf-8 -*-
"""子agent运行记录 repo（条目4地基①）：subagent_runs 表持久化原语。

设计说明：
- 表在本模块内懒建（CREATE TABLE IF NOT EXISTS），不侵入 base.py 中央建表区；
  后续如需统一迁移可平移至 base.py 的 init 区。
- 一条 run = 主agent一次子agent调用的完整档案：input（主发给子的指令）、
  events（过程事件 JSON 数组：start/input/delta/end）、output（最终报告）。
- append_event 采用读-改-写整个 events 数组：调用方为工作流单线程串行发射，无并发竞争。
"""
import json
import logging

from core.db.base import get_db

logger = logging.getLogger("coagent.subagent")

_DDL = """
CREATE TABLE IF NOT EXISTS subagent_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    dialogue_id TEXT NOT NULL DEFAULT '',
    agent TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    input TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    output TEXT NOT NULL DEFAULT '',
    events TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
)
"""


class SubAgentRepo:
    def __init__(self, db=None):
        self._db = db or get_db()
        self._db.execute(_DDL)

    def insert_run(self, run_id: str, project_id: str = "", dialogue_id: str = "",
                   agent: str = "", title: str = "", input_text: str = ""):
        self._db.execute(
            "INSERT OR REPLACE INTO subagent_runs "
            "(id, project_id, dialogue_id, agent, title, input) VALUES (?, ?, ?, ?, ?, ?)",
            (run_id, project_id, dialogue_id, agent, title, input_text),
        )

    def append_event(self, run_id: str, event: dict) -> bool:
        """向 run 的 events 数组追加一条事件（dict 原样入 JSON）。run 不存在返回 False。"""
        rows = self._db.execute("SELECT events FROM subagent_runs WHERE id=?", (run_id,))
        if not rows:
            return False
        try:
            events = json.loads(rows[0]["events"] or "[]")
        except Exception:
            events = []
            logger.warning("[subagent.repo] run=%s events 字段损坏，已重置", run_id, exc_info=True)
        events.append(event)
        self._db.execute(
            "UPDATE subagent_runs SET events=? WHERE id=?",
            (json.dumps(events, ensure_ascii=False), run_id),
        )
        return True

    def finish_run(self, run_id: str, status: str = "ok", output: str = ""):
        """终态回写：status(ok|error) + 最终报告文本 + finished_at。"""
        self._db.execute(
            "UPDATE subagent_runs SET status=?, output=?, finished_at=CURRENT_TIMESTAMP WHERE id=?",
            (status, output, run_id),
        )

    def get_run(self, run_id: str):
        """取完整 run 记录；events 已解析为数组。不存在返回 None。"""
        rows = self._db.execute("SELECT * FROM subagent_runs WHERE id=?", (run_id,))
        if not rows:
            return None
        row = dict(rows[0])
        try:
            row["events"] = json.loads(row.get("events") or "[]")
        except Exception:
            row["events"] = []
        return row


_subagent_repo = None


def get_subagent_repo() -> SubAgentRepo:
    global _subagent_repo
    if _subagent_repo is None:
        _subagent_repo = SubAgentRepo()
    return _subagent_repo
