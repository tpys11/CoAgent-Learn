# -*- coding: utf-8 -*-
"""分阶测试题作答仓库（评估体系 L5 反馈回路数据源 / 官方"动态决策更新"要求）。
自包含懒建表——不触碰 base.init_tables；表结构见《项目专属评估体系·设计稿》§四。"""
from core.db.base import get_db


class QuizRepo:
    def __init__(self, db=None):
        self._db = db or get_db()
        self._ensured = False

    def _ensure_table(self):
        if self._ensured:
            return
        self._db.execute("""
            CREATE TABLE IF NOT EXISTS quiz_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dialogue_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                kp_tag TEXT DEFAULT '',
                correct INTEGER NOT NULL,
                answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_quiz_dlg ON quiz_answers(dialogue_id)")
        self._ensured = True

    def insert_many(self, dialogue_id: str, answers: list) -> int:
        """批量落库一次提交的作答记录；返回写入条数。"""
        self._ensure_table()
        n = 0
        for a in answers or []:
            self._db.execute(
                "INSERT INTO quiz_answers(dialogue_id,question_id,kp_tag,correct) "
                "VALUES(%s,%s,%s,%s)",
                (dialogue_id, str(a.get("question_id", "")),
                 str(a.get("kp_tag", "")), 1 if a.get("correct") else 0))
            n += 1
        return n

    def recent_accuracy(self, dialogue_id: str, limit: int = 10) -> dict:
        """最近 limit 条作答的聚合：{total, correct, accuracy}；无记录 total=0/accuracy=None。"""
        self._ensure_table()
        rows = self._db.execute(
            "SELECT correct FROM quiz_answers WHERE dialogue_id=%s "
            "ORDER BY id DESC LIMIT %s", (dialogue_id, int(limit)))
        total = len(rows)
        correct = sum(1 for r in rows if r.get("correct"))
        return {"total": total, "correct": correct,
                "accuracy": round(correct / total, 4) if total else None}


_quiz_repo = None


def get_quiz_repo() -> QuizRepo:
    global _quiz_repo
    if _quiz_repo is None:
        _quiz_repo = QuizRepo()
    return _quiz_repo
