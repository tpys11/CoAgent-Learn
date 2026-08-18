"""项目与对话的持久化 CRUD 路由。"""
import json
import logging
import time

from fastapi import APIRouter
from pydantic import BaseModel

from core.db.memory_repo import get_memory_repo
from core.db.project_repo import get_project_repo
from core.helpers import _as_dict

logger = logging.getLogger("coagent.projects")
router = APIRouter()


class ProjectCreate(BaseModel):
    name: str = "新项目"
    domain: str = ""
    simple: bool = False


def _ensure_default_project():
    return get_project_repo().ensure_default_project()


@router.get("/api/projects")
async def list_projects():
    return {"projects": get_project_repo().list_projects()}


@router.post("/api/projects")
async def create_project(req: ProjectCreate):
    pid = time.strftime("%Y%m%d%H%M%S") + str(int(time.time() * 1000))[-4:]
    get_project_repo().insert_project(pid, req.name, req.simple, req.domain)
    return {"id": pid, "name": req.name, "is_default": False, "simple": req.simple, "domain": req.domain}


@router.patch("/api/projects/{pid}")
async def update_project(pid: str, req: ProjectCreate):
    get_project_repo().update_project(pid, req.name, req.domain, req.simple)
    return {"status": "ok"}


@router.delete("/api/projects/{pid}")
async def delete_project(pid: str):
    """级联删除项目：对话+消息+画像+知识库+图谱"""
    repo = get_project_repo()
    mrepo = get_memory_repo()
    dialogs = repo.list_dialogue_ids(pid)
    d_ids = [d["id"] for d in dialogs]
    try:
        for d in d_ids:
            repo.delete_dialogue_messages(d)
        for d in d_ids:
            repo.delete_dialogue_memories(d)
        repo.delete_dialogues(pid)
        mrepo.delete_project_memory(pid)
        mrepo.delete_feedback(pid)
        repo.delete_project_row(pid)
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
    return {"dialogues": get_project_repo().list_dialogues(pid)}


@router.post("/api/dialogues")
async def create_dialogue(req: dict):
    """创建对话（落库，前端本地 id 与后端一致：用前端生成 id 或后端生成）"""
    pid = req.get("project_id") or "default"
    name = req.get("name") or "对话"
    did = req.get("id") or ("dlg-" + str(int(time.time() * 1000)) + "-" + str(abs(hash(name)) % 10000))
    get_project_repo().insert_or_ignore_dialogue(did, name, pid)
    return {"id": did, "name": name}


@router.get("/api/dialogues/{did}/messages")
async def get_dialogue_messages(did: str):
    rows = get_project_repo().get_dialogue_messages(did)
    for r in rows or []:
        t = r.get("think") or ""
        r["think"] = json.loads(t) if t else []
    return {"messages": rows or []}


@router.post("/api/dialogues/{did}/messages")
async def post_dialogue_message(did: str, req: dict):
    """写入一条对话消息（静态引导等），保证 dialogue 存在"""
    role = req.get("role") if req.get("role") in ("user", "assistant", "thinking") else "assistant"
    content = str(req.get("content") or "")
    if not content:
        return {"status": "ok"}
    repo = get_project_repo()
    repo.insert_or_ignore_dialogue(did, "对话", "default")
    repo.insert_dialogue_message(did, role, content)
    return {"status": "ok"}


@router.delete("/api/dialogues/{did}")
async def delete_dialogue(did: str):
    """级联删除对话：消息+对话画像；并作为一次事件更新项目记忆（移除该对话概要）"""
    repo = get_project_repo()
    mrepo = get_memory_repo()
    pid = repo.get_dialogue_project(did)
    repo.delete_dialogue_messages(did)
    repo.delete_dialogue_memories(did)
    repo.delete_dialogue_row(did)
    if pid:
        try:
            data = mrepo.get_project_memory(pid)
            if data:
                proj = _as_dict(data)
                dlist = proj.get("对话概要", [])
                proj["对话概要"] = [d for d in dlist if d.get("dialogue_id") != did]
                mrepo.save_project_memory(pid, json.dumps(proj, ensure_ascii=False))
        except Exception:
            logger.exception("删除对话时更新项目记忆失败 did=%s", did)
    return {"status": "ok", "project_id": pid}
