# -*- coding: utf-8 -*-
"""记忆/画像/统计域 repo（global_profile / project_memories / dialogue_memories / followups / stats / task_stats / focus_log / feedback）。"""
from core.db.base import get_db


class MemoryRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    # ---- global_profile ----

    def get_global_profile(self):
        rows = self._db.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        return rows[0]["data"] if rows else None

    def save_global_profile(self, data):
        """upsert 全局记忆；UPDATE 必须命中「updated_at 最新」的行——与 get_global_profile 读同一行
        （B1' 修复：旧实现 SELECT id LIMIT 1 无排序，多 session 历史行时读写可能错位）"""
        rows = self._db.execute("SELECT id FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        if rows:
            self._db.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                             (data, rows[0]["id"]))
        else:
            self._db.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", ("default", data))

    # ---- project_memories ----

    def get_project_memory(self, pid):
        rows = self._db.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
        return rows[0]["data"] if rows else None

    def get_project_memory_with_session(self, pid):
        return self._db.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))

    def save_project_memory(self, pid, data, session_id=""):
        """upsert 课程记忆；新插入行的 session 归一为「传入值或 default」
        （D1 修复：旧 INSERT 写死 'project' 字面量，与 memory_edit 路径漂移并已污染一行存量数据）"""
        rows = self.get_project_memory_with_session(pid)
        if rows:
            self._db.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                             (data, pid))
        else:
            self._db.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)",
                             (session_id or "default", pid, data))

    # ---- dialogue_memories ----

    def get_dialogue_profile(self, did):
        rows = self._db.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (did,))
        return rows[0]["profile_data"] if rows else {}

    def get_dialogue_profile_data(self, did):
        rows = self._db.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (did,))
        return rows[0]["profile_data"] if rows else None

    def get_dialogue_profile_row(self, did):
        return self._db.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (did,))

    def save_dialogue_profile(self, did, pid, data):
        has = self._db.execute("SELECT dialogue_id FROM dialogue_memories WHERE dialogue_id=%s", (did,))
        if has:
            self._db.execute("UPDATE dialogue_memories SET profile_data=%s, updated_at=CURRENT_TIMESTAMP WHERE dialogue_id=%s",
                             (data, did))
        else:
            self._db.execute("INSERT INTO dialogue_memories (dialogue_id, project_id, profile_data) VALUES (%s,%s,%s)",
                             (did, pid, data))

    def update_dialogue_profile_data(self, did, data):
        self._db.execute("UPDATE dialogue_memories SET profile_data=%s WHERE dialogue_id=%s", (data, did))

    # ---- followups ----

    def get_followups(self, did):
        return self._db.execute("SELECT questions, updated_at FROM followups WHERE dialogue_id=%s", (did,))

    # ---- stats / task_stats / focus_log ----

    def count_dialogues(self, pid):
        return self._db.execute("SELECT count(*) AS c FROM dialogues WHERE project_id=%s", (pid,))

    def count_messages_total(self):
        return self._db.execute("SELECT count(*) AS c, COALESCE(SUM(LENGTH(content)),0) AS chars FROM messages", ())

    def get_stats_metrics(self, pid):
        return self._db.execute("SELECT metrics FROM stats WHERE project_id=%s ORDER BY updated_at DESC LIMIT 1", (pid,))

    def sum_stats_duration(self, pid):
        return self._db.execute("SELECT COALESCE(SUM(duration_seconds),0) AS s FROM stats WHERE project_id=%s", (pid,))

    def get_focus_daily(self, project_id):
        if project_id in ("all", ""):
            return self._db.execute(
                "SELECT substr(created_at,1,10) AS d, SUM(duration_seconds) AS s FROM focus_log WHERE created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d", ())
        return self._db.execute(
            "SELECT substr(created_at,1,10) AS d, SUM(duration_seconds) AS s FROM focus_log WHERE project_id=%s AND created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d",
            (project_id,))

    def get_focus_daily_by_project(self, project_id=""):
        """专注日志按 天+项目 分组（近30天），返回 [{d, project_id, s}]——主页学习记录列表用"""
        if project_id:
            return self._db.execute(
                "SELECT substr(created_at,1,10) AS d, project_id, SUM(duration_seconds) AS s FROM focus_log "
                "WHERE project_id=%s AND created_at >= datetime('now','-30 days') GROUP BY d, project_id ORDER BY d",
                (project_id,))
        return self._db.execute(
            "SELECT substr(created_at,1,10) AS d, project_id, SUM(duration_seconds) AS s FROM focus_log "
            "WHERE created_at >= datetime('now','-30 days') GROUP BY d, project_id ORDER BY d", ())

    def get_focus_month(self, project_id, year_month):
        """专注日志按 天+项目 分组（整月，'YYYY-MM'）——月历视图用"""
        if project_id:
            return self._db.execute(
                "SELECT substr(created_at,1,10) AS d, project_id, SUM(duration_seconds) AS s FROM focus_log "
                "WHERE project_id=%s AND substr(created_at,1,7)=%s GROUP BY d, project_id ORDER BY d",
                (project_id, year_month))
        return self._db.execute(
            "SELECT substr(created_at,1,10) AS d, project_id, SUM(duration_seconds) AS s FROM focus_log "
            "WHERE substr(created_at,1,7)=%s GROUP BY d, project_id ORDER BY d", (year_month,))

    def get_task_stats(self, pid, limit):
        return self._db.execute(
            "SELECT dialogue_id, data, created_at FROM task_stats WHERE project_id=%s ORDER BY id DESC LIMIT %s",
            (pid, limit))

    # ---- feedback ----

    def insert_feedback(self, dialogue_id, project_id, resource_type, feedback, note):
        self._db.execute(
            "INSERT INTO feedback (dialogue_id, project_id, resource_type, feedback, note) VALUES (%s,%s,%s,%s,%s)",
            (dialogue_id, project_id, resource_type, feedback, note))

    # ---- clear ----

    def clear_all_memories(self):
        self._db.execute("DELETE FROM global_profile", ())
        self._db.execute("DELETE FROM project_memories", ())
        self._db.execute("DELETE FROM dialogue_memories", ())

    def delete_project_memory(self, pid):
        self._db.execute("DELETE FROM project_memories WHERE project_id=%s", (pid,))

    def delete_feedback(self, pid):
        self._db.execute("DELETE FROM feedback WHERE project_id=%s", (pid,))

    # ---- export ----

    def list_global_profile_full(self):
        return self._db.execute("SELECT data, updated_at FROM global_profile")

    def list_project_memories_full(self):
        return self._db.execute("SELECT project_id, data, updated_at FROM project_memories")

    def list_dialogue_memories_full(self):
        return self._db.execute("SELECT dialogue_id, project_id, profile_data, updated_at FROM dialogue_memories")

    def list_stats_full(self):
        return self._db.execute("SELECT project_id, tokens, duration_seconds, metrics FROM stats")


_memory_repo = None


def get_memory_repo() -> MemoryRepo:
    global _memory_repo
    if _memory_repo is None:
        _memory_repo = MemoryRepo()
    return _memory_repo