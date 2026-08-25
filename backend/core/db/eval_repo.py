# -*- coding: utf-8 -*-
"""协同决策过程Trace仓库（官方提交物：多智能体协同决策中间数据完整IO示例）。
自包含懒建表——不触碰 base.init_tables；写入走同库（SQLITE_DIR 指向处）。"""
from core.db.base import get_db


class EvalRepo:
    def __init__(self, db=None):
        self._db = db or get_db()
        self._ensured = False

    # ---- 建表 ----

    def _ensure_table(self):
        if self._ensured:
            return
        self._db.execute("""
            CREATE TABLE IF NOT EXISTS eval_traces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                dialogue_id TEXT DEFAULT '',
                project_id TEXT DEFAULT '',
                template TEXT DEFAULT '',
                stage TEXT NOT NULL,
                input_digest TEXT DEFAULT '',
                output_digest TEXT DEFAULT '',
                metrics_json TEXT DEFAULT '{}',
                elapsed_ms INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_eval_req ON eval_traces(request_id)")
        self._ensured = True

    # ---- 写入 ----

    def insert_traces(self, request_id: str, dialogue_id: str, project_id: str,
                      template: str, traces: list) -> int:
        """批量写入一轮对话的阶段Trace；返回插入行数。"""
        self._ensure_table()
        n = 0
        for t in traces:
            self._db.execute(
                "INSERT INTO eval_traces(request_id,dialogue_id,project_id,template,"
                "stage,input_digest,output_digest,metrics_json,elapsed_ms) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (request_id, dialogue_id, project_id, template,
                 t.get("stage", ""), t.get("input_digest", ""),
                 t.get("output_digest", ""), t.get("metrics_json", "{}"),
                 int(t.get("elapsed_ms", 0))))
            n += 1
        return n

    # ---- 查询 ----

    def by_request(self, request_id: str) -> list:
        self._ensure_table()
        return self._db.execute(
            "SELECT * FROM eval_traces WHERE request_id=%s ORDER BY id", (request_id,))

    def distinct_stages(self, request_id: str) -> list:
        return sorted({r["stage"] for r in self.by_request(request_id)})


_eval_repo = None


def get_eval_repo() -> EvalRepo:
    global _eval_repo
    if _eval_repo is None:
        _eval_repo = EvalRepo()
    return _eval_repo
