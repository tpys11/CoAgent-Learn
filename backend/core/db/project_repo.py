# -*- coding: utf-8 -*-
"""项目/对话/消息域 repo（projects / dialogues / messages）。"""
from core.db.base import get_db


class ProjectRepo:
    def __init__(self, db=None):
        self._db = db or get_db()

    def ensure_default_project(self):
        rows = self._db.execute("SELECT id FROM projects WHERE is_default=TRUE")
        if rows:
            return rows[0]["id"]
        pid = __import__("time").strftime("%Y%m%d%H%M%S") + "default"
        self._db.execute("INSERT INTO projects (id, name, is_default) VALUES (%s,%s,%s)", (pid, "默认项目", True))
        return pid

    def list_projects(self):
        return self._db.execute(
            "SELECT id, name, is_default, simple, domain, created_at FROM projects WHERE archived = FALSE ORDER BY created_at")

    def insert_project(self, pid, name, simple, domain):
        self._db.execute("INSERT INTO projects (id, name, is_default, simple, domain) VALUES (%s,%s,%s,%s,%s)",
                         (pid, name, False, simple, domain))

    def update_project(self, pid, name, domain, simple):
        self._db.execute("UPDATE projects SET name=%s, domain=%s, simple=%s WHERE id=%s", (name, domain, simple, pid))

    def list_active_projects(self):
        return self._db.execute("SELECT id FROM projects WHERE archived = FALSE")

    def list_project_names(self):
        return self._db.execute("SELECT id, name FROM projects")

    def list_dialogue_ids(self, pid):
        return self._db.execute("SELECT id FROM dialogues WHERE project_id=%s", (pid,))

    def list_dialogues(self, pid):
        return self._db.execute(
            "SELECT id, name, created_at FROM dialogues WHERE project_id=%s AND archived=FALSE ORDER BY created_at", (pid,))

    def list_dialogue_briefs(self, pid):
        return self._db.execute("SELECT id, name FROM dialogues WHERE project_id=%s", (pid,))

    def list_dialogue_dates(self, pid):
        return self._db.execute("SELECT id, created_at FROM dialogues WHERE project_id=%s ORDER BY created_at", (pid,))

    def list_learning_dialogues(self, pid=None):
        if pid:
            return self._db.execute(
                "SELECT id, project_id, name, created_at FROM dialogues WHERE project_id=%s AND archived=FALSE", (pid,))
        return self._db.execute("SELECT id, project_id, name, created_at FROM dialogues WHERE archived=FALSE")

    def get_dialogue_project(self, did):
        rows = self._db.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
        return rows[0]["project_id"] if rows else None

    def get_dialogue_status(self, did):
        rows = self._db.execute("SELECT profile_status FROM dialogues WHERE id=%s", (did,))
        return rows[0]["profile_status"] if rows else None

    def mark_dialogue_status(self, did, status):
        self._db.execute("UPDATE dialogues SET profile_status=%s WHERE id=%s", (status, did))

    def get_dialogue_profile(self, did):
        rows = self._db.execute("SELECT profile FROM dialogues WHERE id=%s", (did,))
        return rows[0]["profile"] if rows else None

    def get_dialogue_name(self, did):
        rows = self._db.execute("SELECT name FROM dialogues WHERE id=%s", (did,))
        return rows[0].get("name") if rows else None

    def insert_or_ignore_dialogue(self, did, name, pid):
        self._db.execute("INSERT OR IGNORE INTO dialogues (id, name, project_id) VALUES (%s,%s,%s)", (did, name, pid))

    def update_dialogue_meta(self, did, name=None, archived=None):
        if name is not None:
            self._db.execute("UPDATE dialogues SET name=%s WHERE id=%s", (name, did))
        if archived is not None:
            self._db.execute("UPDATE dialogues SET archived=%s WHERE id=%s", (1 if archived else 0, did))

    def delete_dialogue_messages(self, did):
        self._db.execute("DELETE FROM messages WHERE dialogue_id=%s", (did,))

    def delete_dialogue_memories(self, did):
        self._db.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (did,))

    def delete_dialogues(self, pid):
        self._db.execute("DELETE FROM dialogues WHERE project_id=%s", (pid,))

    def delete_dialogue_row(self, did):
        self._db.execute("DELETE FROM dialogues WHERE id=%s", (did,))

    def delete_project_row(self, pid):
        self._db.execute("DELETE FROM projects WHERE id=%s", (pid,))

    def get_dialogue_messages(self, did):
        return self._db.execute(
            "SELECT role, content, think, created_at FROM messages WHERE dialogue_id=%s ORDER BY created_at ASC", (did,))

    def insert_dialogue_message(self, did, role, content):
        self._db.execute("INSERT INTO messages (dialogue_id, role, content) VALUES (%s,%s,%s)", (did, role, content))

    def get_dialogue_plain_messages(self, did):
        return self._db.execute("SELECT content FROM messages WHERE dialogue_id=%s ORDER BY created_at", (did,))

    def get_assistant_messages(self, dids):
        ph = ",".join(["%s"] * len(dids))
        return self._db.execute(
            "SELECT dialogue_id, content, created_at FROM messages WHERE role='assistant' AND dialogue_id IN ("
            + ph + ") ORDER BY created_at", tuple(dids))

    def get_messages_by_dids(self, dids, limit):
        ph = ",".join(["%s"] * len(dids))
        return self._db.execute(
            "SELECT content, created_at FROM messages WHERE dialogue_id IN (" + ph + ") ORDER BY created_at LIMIT %s",
            tuple(dids) + (limit,))

    # ---- export ----

    def list_projects_full(self):
        return self._db.execute("SELECT id, name, is_default, simple, domain, created_at FROM projects WHERE archived = FALSE")

    def list_dialogues_full(self):
        return self._db.execute("SELECT id, project_id, session_id, name, created_at FROM dialogues")

    def list_messages_full(self):
        return self._db.execute("SELECT dialogue_id, role, content, created_at FROM messages ORDER BY created_at")

    def list_resources(self, pid):
        return self._db.execute(
            "SELECT id, name, content, project_id, created_at FROM resources WHERE project_id=%s", (pid,))


_project_repo = None


def get_project_repo() -> ProjectRepo:
    global _project_repo
    if _project_repo is None:
        _project_repo = ProjectRepo()
    return _project_repo