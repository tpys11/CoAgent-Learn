"""项目与对话的持久化 CRUD 路由。"""
import json
import logging
import time

from fastapi import APIRouter
from pydantic import BaseModel

from core.helpers import _as_dict
from core.postgres_client import pg_client

logger = logging.getLogger("coagent.projects")
router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = "新项目"
    domain: str = ""
    simple: bool = False


def _ensure_default_project():
    from core.postgres_client import pg_client as _pg
    rows = _pg.execute("SELECT id FROM projects WHERE is_default=TRUE")
    if rows:
        return rows[0]["id"]
    pid = time.strftime("%Y%m%d%H%M%S") + "default"
    _pg.execute("INSERT INTO projects (id, name, is_default) VALUES (%s,%s,%s)", (pid, "默认项目", True))
    return pid


@router.get("/api/projects")
async def list_projects():
    rows = pg_client.execute("SELECT id, name, is_default, simple, domain, created_at FROM projects WHERE archived = FALSE ORDER BY created_at")
    return {"projects": rows}


@router.post("/api/projects")
async def create_project(req: ProjectCreate):
    pid = time.strftime("%Y%m%d%H%M%S") + str(int(time.time() * 1000))[-4:]
    pg_client.execute("INSERT INTO projects (id, name, is_default, simple, domain) VALUES (%s,%s,%s,%s,%s)",
                      (pid, req.name, False, req.simple, req.domain))
    return {"id": pid, "name": req.name, "is_default": False, "simple": req.simple, "domain": req.domain}


@router.patch("/api/projects/{pid}")
async def update_project(pid: str, req: ProjectCreate):
    pg_client.execute("UPDATE projects SET name=%s, domain=%s, simple=%s WHERE id=%s", (req.name, req.domain, req.simple, pid))
    return {"status": "ok"}


@router.delete("/api/projects/{pid}")
async def delete_project(pid: str):
    """级联删除项目：对话+消息+画像+知识库+图谱"""
    dialogs = pg_client.execute("SELECT id FROM dialogues WHERE project_id=%s", (pid,))
    d_ids = [d["id"] for d in dialogs]
    try:
        for d in d_ids:
            pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (d,))
        for d in d_ids:
            pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (d,))
        pg_client.execute("DELETE FROM dialogues WHERE project_id=%s", (pid,))
        pg_client.execute("DELETE FROM project_memories WHERE project_id=%s", (pid,))
        pg_client.execute("DELETE FROM feedback WHERE project_id=%s", (pid,))
        pg_client.execute("DELETE FROM projects WHERE id=%s", (pid,))
    except Exception as e:
        return {"status": "error", "msg": str(e)}
    kb_deleted = 0
    try:
        from core.knowledge_service import delete_project_kb
        kb_deleted = delete_project_kb(pid)
    except Exception:
        logger.exception("删除项目知识库失败 pid=%s", pid)
    return {"status": "ok", "dialogues": len(d_ids), "kb": kb_deleted}


@router.get("/api/projects/{pid}/dialogues")
async def list_dialogues(pid: str):
    rows = pg_client.execute("SELECT id, name, created_at FROM dialogues WHERE project_id=%s AND archived=FALSE ORDER BY created_at", (pid,))
    return {"dialogues": rows}


@router.post("/api/dialogues")
async def create_dialogue(req: dict):
    """创建对话（落库，前端本地 id 与后端一致：用前端生成 id 或后端生成）"""
    pid = req.get("project_id") or "default"
    name = req.get("name") or "对话"
    did = req.get("id") or ("dlg-" + str(int(time.time() * 1000)) + "-" + str(abs(hash(name)) % 10000))
    pg_client.execute("INSERT OR IGNORE INTO dialogues (id, name, project_id) VALUES (%s,%s,%s)", (did, name, pid))
    return {"id": did, "name": name}


@router.get("/api/dialogues/{did}/messages")
async def get_dialogue_messages(did: str):
    from core.sqlite_client import get_db
    rows = get_db().execute("SELECT role, content, think, created_at FROM messages WHERE dialogue_id=%s ORDER BY created_at ASC", (did,))
    for r in rows or []:
        t = r.get("think") or ""
        r["think"] = json.loads(t) if t else []
    return {"messages": rows or []}


@router.post("/api/dialogues/{did}/messages")
async def post_dialogue_message(did: str, req: dict):
    """写入一条对话消息（静态引导等），保证 dialogue 存在"""
    from core.sqlite_client import get_db
    role = req.get("role") if req.get("role") in ("user", "assistant", "thinking") else "assistant"
    content = str(req.get("content") or "")
    if not content:
        return {"status": "ok"}
    pg_client.execute("INSERT OR IGNORE INTO dialogues (id, name, project_id) VALUES (%s,%s,%s)", (did, "对话", "default"))
    get_db().execute("INSERT INTO messages (dialogue_id, role, content) VALUES (%s,%s,%s)", (did, role, content))
    return {"status": "ok"}


@router.delete("/api/dialogues/{did}")
async def delete_dialogue(did: str):
    """级联删除对话：消息+对话画像；并作为一次事件更新项目记忆（移除该对话概要）"""
    rows = pg_client.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
    pid = rows[0]["project_id"] if rows else None
    pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogues WHERE id=%s", (did,))
    if pid:
        try:
            proj_rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
            if proj_rows and proj_rows[0]["data"]:
                proj = _as_dict(proj_rows[0]["data"])
                dlist = proj.get("对话概要", [])
                proj["对话概要"] = [d for d in dlist if d.get("dialogue_id") != did]
                pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                                  (json.dumps(proj, ensure_ascii=False), pid))
        except Exception:
            logger.exception("删除对话时更新项目记忆失败 did=%s", did)
    return {"status": "ok", "project_id": pid}
