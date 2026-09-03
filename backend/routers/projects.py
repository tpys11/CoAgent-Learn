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
def list_projects():
    return {"projects": get_project_repo().list_projects()}


@router.post("/api/projects")
def create_project(req: ProjectCreate):
    pid = time.strftime("%Y%m%d%H%M%S") + str(int(time.time() * 1000))[-4:]
    get_project_repo().insert_project(pid, req.name, req.simple, req.domain)
    try:
        # 新开课程：个人画像 + 课程初始化信息 → 初始课程画像
        from core.memory_service import init_course_profile
        init_course_profile(pid, req.name, req.domain)
    except Exception:
        logger.exception("初始化课程画像失败 pid=%s", pid)
    return {"id": pid, "name": req.name, "is_default": False, "simple": req.simple, "domain": req.domain}


@router.patch("/api/projects/{pid}")
def update_project(pid: str, req: ProjectCreate):
    get_project_repo().update_project(pid, req.name, req.domain, req.simple)
    return {"status": "ok"}


@router.delete("/api/projects/{pid}")
def delete_project(pid: str):
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
def list_dialogues(pid: str):
    return {"dialogues": get_project_repo().list_dialogues(pid)}


@router.post("/api/dialogues")
def create_dialogue(req: dict):
    """创建对话（落库，前端本地 id 与后端一致：用前端生成 id 或后端生成）"""
    pid = req.get("project_id") or "default"
    name = req.get("name") or "对话"
    did = req.get("id") or ("dlg-" + str(int(time.time() * 1000)) + "-" + str(abs(hash(name)) % 10000))
    repo = get_project_repo()
    exist = repo.get_dialogue_status(did)
    if exist is None:
        # 新窗口补传（4.3）：建对话前把旧窗口未传递的对话概要补进课程记忆（幂等：已传递的不重复；
        # 不触发课程→个人变更计数），再建新对话 + 画像合成 pending
        try:
            from core.memory_service import catch_up_transfers
            catch_up_transfers(pid)
        except Exception:
            logger.exception("新窗口补传失败 pid=%s", pid)
    repo.insert_or_ignore_dialogue(did, name, pid)
    if exist is None:
        # 新对话：画像后台异步合成（pending 期间 chat 接口守卫禁发，前端禁发送）
        try:
            from core.background import submit
            from core.memory_service import generate_dialogue_profile
            repo.mark_dialogue_status(did, "pending")
            submit(generate_dialogue_profile, did, str(req.get("api_key") or ""))
        except Exception:
            logger.exception("启动画像合成失败 did=%s", did)
    return {"id": did, "name": name}


@router.get("/api/dialogues/{did}/profile_status")
def get_dialogue_profile_status(did: str):
    status = get_project_repo().get_dialogue_status(did)
    return {"status": status or "ready"}


@router.get("/api/dialogues/{did}/messages")
def get_dialogue_messages(did: str, light: bool = False):
    """对话历史。light=true（闭环六资源编辑会话用）：跳过 think JSON 解析——
    编辑窗口不渲染思维链，长会话下逐条 loads 是纯浪费；默认行为不变。"""
    rows = get_project_repo().get_dialogue_messages(did)
    if light:
        return {"messages": [
            {"role": r.get("role"), "content": r.get("content"), "created_at": r.get("created_at")}
            for r in rows or []]}
    for r in rows or []:
        t = r.get("think") or ""
        r["think"] = json.loads(t) if t else []
    return {"messages": rows or []}


@router.post("/api/dialogues/{did}/messages")
def post_dialogue_message(did: str, req: dict):
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
def delete_dialogue(did: str):
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
