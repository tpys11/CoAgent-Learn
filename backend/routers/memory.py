"""记忆、画像、统计与学习时间线路由。"""
import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from core.db.memory_repo import get_memory_repo
from core.db.project_repo import get_project_repo
from core.helpers import _as_dict
from services.memory_progress import compute_mastery_items, compute_pace

logger = logging.getLogger("coagent.memory")
router = APIRouter()


@router.get("/api/global-profile")
def get_global_profile(session_id: str = "default"):
    data = get_memory_repo().get_global_profile()
    return {"profile": _as_dict(data) if data else {}}


@router.get("/api/project-memory/{project_id}")
def get_project_memory(project_id: str, session_id: str = "default"):
    data = get_memory_repo().get_project_memory(project_id)
    return {"memory": _as_dict(data) if data else {}}


@router.get("/api/dialogues/{did}/followups")
def get_followups(did: str):
    rows = get_memory_repo().get_followups(did)
    if not rows:
        return {"questions": []}
    try:
        qs = json.loads(rows[0]["questions"] or "[]")
    except Exception:
        qs = []
    return {"questions": qs, "updated_at": rows[0].get("updated_at")}


@router.get("/api/artifacts")
def list_artifacts(project_id: str = "default"):
    """扫描项目对话消息，解析生成物（定制讲义/实操指南/分阶测试题）"""
    import re
    dialogs = get_project_repo().list_dialogue_briefs(project_id)
    if not dialogs:
        return {"artifacts": []}
    d_ids = [d["id"] for d in dialogs]
    d_names = {d["id"]: d["name"] for d in dialogs}
    msgs = get_project_repo().get_assistant_messages(d_ids)
    section_re = re.compile(r"^##\s*(?:📘|🛠|📝|🔍)?\s*(定制讲义|讲义|实操指南|分阶测试题|测试题|溯源)\s*$", re.M)
    artifacts = []
    for m in msgs:
        content = str(m["content"] or "")
        marks = list(section_re.finditer(content))
        quiz_m = next((mk for mk in marks if mk.group(1) in ("分阶测试题", "测试题")), None)
        if quiz_m:
            body = content[quiz_m.end():]
            body = re.sub(r"_溯源：.*$", "", body, flags=re.S).strip()
            if body:
                artifacts.append({
                    "id": str(m["dialogue_id"]) + "-quiz",
                    "dialogue_id": m["dialogue_id"],
                    "dialogue_name": d_names.get(m["dialogue_id"], ""),
                    "type": "测试题",
                    "title": "分阶测试题",
                    "content": body,
                    "created_at": m["created_at"],
                })
        lec_m = next((mk for mk in marks if mk.group(1) in ("定制讲义", "讲义")), None)
        if lec_m:
            lecture = content[lec_m.end():quiz_m.start() if quiz_m else len(content)]
        else:
            lecture = content[:quiz_m.start() if quiz_m else len(content)]
        lecture = section_re.sub("", lecture)
        lecture = re.sub(r"_溯源：.*$", "", lecture, flags=re.S).strip()
        if len(lecture) >= 100:
            artifacts.append({
                "id": str(m["dialogue_id"]) + "-lec",
                "dialogue_id": m["dialogue_id"],
                "dialogue_name": d_names.get(m["dialogue_id"], ""),
                "type": "讲义",
                "title": "讲义",
                "content": lecture,
                "created_at": m["created_at"],
            })
    return {"artifacts": artifacts}


class FeedbackReq(BaseModel):
    dialogue_id: str = ""
    project_id: str = "default"
    resource_type: str = ""
    feedback: str = ""
    note: str = ""


@router.post("/api/feedback")
def add_feedback(req: FeedbackReq):
    mrepo = get_memory_repo()
    mrepo.insert_feedback(req.dialogue_id, req.project_id, req.resource_type, req.feedback, req.note)
    if req.dialogue_id and req.feedback in ("太难", "太简单"):
        try:
            rows = mrepo.get_dialogue_profile_row(req.dialogue_id)
            if rows:
                p = dict(rows[0]["profile_data"] or {})
                level_map = {"零基础": 1, "有基础": 2, "熟练": 3, "精通": 4}
                cur = level_map.get(p.get("selfLevel", "有基础"), 2)
                if req.feedback == "太难":
                    cur = max(1, cur - 1)
                else:
                    cur = min(4, cur + 1)
                rev = {v: k for k, v in level_map.items()}
                p["selfLevel"] = rev[cur]
                mrepo.update_dialogue_profile_data(req.dialogue_id, json.dumps(p, ensure_ascii=False))
        except Exception:
            logger.exception("保存反馈失败 dialogue_id=%s", req.dialogue_id)
    return {"status": "ok"}


@router.get("/api/stats")
def get_stats(project_id: str = "default"):
    mrepo = get_memory_repo()
    d = mrepo.count_dialogues(project_id)
    m = mrepo.count_messages_total()
    s = mrepo.get_stats_metrics(project_id)
    metrics = s[0]["metrics"] if s else {}
    ds = mrepo.sum_stats_duration(project_id)
    daily_focus = []
    try:
        rows = mrepo.get_focus_daily(project_id)
        daily_focus = [{"date": r["d"], "seconds": int(r["s"] or 0)} for r in (rows or [])]
    except Exception:
        logger.exception("读取专注日志失败 project_id=%s", project_id)
    return {
        "dialogue_count": d[0]["c"] if d else 0,
        "message_count": m[0]["c"] if m else 0,
        "total_chars": m[0]["chars"] if m else 0,
        "tokens_estimate": int((m[0]["chars"] if m else 0) / 2),
        "metrics": metrics,
        "total_duration_seconds": int(ds[0]["s"]) if ds else 0,
        "daily_focus": daily_focus,
    }


@router.get("/api/task-stats")
def get_task_stats(project_id: str = "default", limit: int = 20):
    rows = get_memory_repo().get_task_stats(project_id, min(max(limit, 1), 100))
    out = []
    for r in rows:
        d = r.get("data") or "{}"
        try:
            data = json.loads(d) if isinstance(d, str) else (d or {})
        except Exception:
            data = {}
        out.append({"dialogue_id": r.get("dialogue_id"), "created_at": r.get("created_at"), "data": data})
    return {"tasks": out}


@router.delete("/api/memories")
def clear_memories():
    get_memory_repo().clear_all_memories()
    return {"status": "ok"}


@router.post("/api/memory/rebuild")
def memory_rebuild(req: dict):
    from core.background import submit
    from core.memory_service import distill_memory
    from core.sqlite_client import get_db
    api_key = (req or {}).get("api_key") or ""
    project_id = (req or {}).get("project_id") or ""
    if project_id:
        submit(distill_memory, api_key, project_id, None, get_db(), "default")
    else:
        rows = get_project_repo().list_active_projects()
        for r in rows or []:
            submit(distill_memory, api_key, r["id"], None, get_db(), "default")
    return {"status": "ok", "message": "记忆分析已启动，稍后刷新查看"}


@router.delete("/api/projects/{pid}/dialogues")
def clear_project_dialogues(pid: str):
    repo = get_project_repo()
    dialogs = repo.list_dialogue_ids(pid)
    for d in dialogs or []:
        repo.delete_dialogue_messages(d["id"])
        repo.delete_dialogue_memories(d["id"])
    repo.delete_dialogues(pid)
    return {"status": "ok", "deleted": len(dialogs or [])}


@router.get("/api/export")
def export_all(project_id: str = "default"):
    prepo = get_project_repo()
    mrepo = get_memory_repo()
    out = {
        "projects": prepo.list_projects_full(),
        "dialogues": prepo.list_dialogues_full(),
        "messages": prepo.list_messages_full(),
        "global_profile": mrepo.list_global_profile_full(),
        "project_memories": mrepo.list_project_memories_full(),
        "dialogue_memories": mrepo.list_dialogue_memories_full(),
        "resources": prepo.list_resources(project_id),
        "stats": mrepo.list_stats_full(),
    }
    return {"exported_at": __import__("datetime").datetime.now().isoformat(), "data": out}


@router.get("/api/learning-log")
def get_learning_log(project_id: str = ""):
    prepo = get_project_repo()
    mrepo = get_memory_repo()
    dialogs = prepo.list_learning_dialogues(project_id or None)
    projs = prepo.list_project_names()
    pname = {p["id"]: p.get("name", p["id"]) for p in projs or []}
    days: dict = {}
    for d in dialogs or []:
        date = (d.get("created_at") or "")[:10] or "未知日期"
        topic = ""
        try:
            pd = mrepo.get_dialogue_profile_data(d["id"])
            if pd:
                if isinstance(pd, str):
                    try:
                        pd = json.loads(pd)
                    except Exception:
                        pd = {}
                topic = pd.get("topic", "") if isinstance(pd, dict) else ""
        except Exception:
            logger.debug("对话画像 topic 读取失败（置空继续）", exc_info=True)
        arts: list = []
        try:
            msgs = prepo.get_dialogue_plain_messages(d["id"])
            for m in msgs or []:
                c = str(m.get("content") or "")
                if "## 📝 分阶测试题" in c and not any(a["type"] == "测试题" for a in arts):
                    arts.append({"type": "测试题", "title": "分阶测试题"})
                if len(c) >= 100 and not any(a["type"] == "讲义" for a in arts):
                    arts.append({"type": "讲义", "title": "讲义"})
        except Exception:
            logger.debug("对话产物扫描失败（置空继续）", exc_info=True)
        item = {
            "project_id": d.get("project_id"), "project_name": pname.get(d.get("project_id"), d.get("project_id")),
            "dialogue_id": d["id"], "dialogue_name": d.get("name") or "对话",
            "topic": topic, "artifacts": arts, "created_at": d.get("created_at"),
        }
        days.setdefault(date, []).append(item)
    out = [{"date": k, "items": v} for k, v in sorted(days.items(), key=lambda x: x[0], reverse=True)]
    return {"days": out}


@router.get("/api/memory/progress")
def memory_progress(project_id: str = "default"):
    import datetime
    from collections import defaultdict
    from core.db.memory_repo import get_memory_repo as _mrepo
    from core.db.project_repo import get_project_repo as _prepo
    data = _mrepo().get_project_memory(project_id)
    mem = _as_dict(data) if data else {}
    names: list = []
    kind_map: dict = {}
    for k in ["知识点", "难点"]:
        v = mem.get(k) or []
        if isinstance(v, list):
            parts = [str(x).strip() for x in v if str(x).strip()]
        elif isinstance(v, str):
            parts = [s.strip() for s in v.split(",") if s.strip()]
        else:
            parts = []
        for p in parts:
            if p and p not in kind_map:
                names.append(p)
                kind_map[p] = k
    names = names[:20]
    dialogs = _prepo().list_dialogue_dates(project_id) or []
    seen_days: dict = defaultdict(set)
    try:
        d_ids = [d["id"] for d in dialogs]
        msgs: list = []
        if d_ids and names:
            msgs = _prepo().get_messages_by_dids(d_ids, 500) or []
        for m in msgs:
            c = str(m.get("content") or "")
            d = str(m.get("created_at") or "")[:10]
            if not d:
                continue
            for n in names:
                if n and n in c:
                    seen_days[n].add(d)
    except Exception:
        logger.exception("扫描消息出现日期失败 project_id=%s", project_id)
    today = datetime.date.today()
    items = compute_mastery_items(names, kind_map, seen_days, today)
    day_counts: dict = defaultdict(int)
    for dlg in dialogs:
        d = str(dlg.get("created_at") or "")[:10]
        if d:
            day_counts[d] += 1
    daily = []
    for i in range(13, -1, -1):
        d = (today - datetime.timedelta(days=i)).isoformat()
        daily.append({"date": d, "count": day_counts.get(d, 0)})
    pace = compute_pace(daily)
    return {"items": items, "daily": daily, "pace": pace, "total_dialogues": len(dialogs)}


class ProfileData(BaseModel):
    profile: dict = {}


class DialogueUpdate(BaseModel):
    name: str | None = None
    archived: bool | None = None


@router.post("/api/dialogues/{did}/update")
def update_dialogue(did: str, req: DialogueUpdate):
    get_project_repo().update_dialogue_meta(did, name=req.name, archived=req.archived)
    return {"status": "ok"}


@router.post("/api/global-profile")
def save_global_profile(req: ProfileData):
    get_memory_repo().save_global_profile(json.dumps(req.profile, ensure_ascii=False))
    return {"status": "ok"}


@router.post("/api/project-memory/{project_id}")
def save_project_memory(project_id: str, req: ProfileData):
    mrepo = get_memory_repo()
    rows = mrepo.get_project_memory_with_session(project_id)
    proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
    p = req.profile
    if isinstance(p, dict):
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣", "里程碑", "课程结束时间", "平均每日投入时间", "其他"]:
            if k in p:
                proj[k] = p[k]
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "课程结束时间", "平均每日投入时间", "其他"]:
            if k in p and not p[k]:
                proj.pop(k, None)
    mrepo.save_project_memory(project_id, json.dumps(proj, ensure_ascii=False))
    return {"status": "ok"}


@router.post("/api/projects/{pid}/profile")
def save_project_profile(pid: str, req: ProfileData):
    mrepo = get_memory_repo()
    rows = mrepo.get_project_memory_with_session(pid)
    proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
    p = req.profile
    if isinstance(p, dict):
        if p.get("domain"):
            proj["抽象项目情况"] = p["domain"]
        if p.get("background"):
            proj["抽象项目情况"] = p["background"] or proj.get("抽象项目情况", "")
        if p.get("prefer"):
            proj["偏好"] = p["prefer"]
        if p.get("goal"):
            proj["目标"] = p["goal"]
    mrepo.save_project_memory(pid, json.dumps(proj, ensure_ascii=False))
    return {"status": "ok"}


@router.get("/api/projects/{pid}/profile")
def get_project_profile(pid: str):
    rows = get_memory_repo().get_project_memory_with_session(pid)
    return {"profile": rows[0]["data"] if rows else {}}


@router.post("/api/dialogues/{did}/profile")
def save_dialogue_profile(did: str, req: ProfileData):
    mrepo = get_memory_repo()
    pid = get_project_repo().get_dialogue_project(did) or "default"
    data = json.dumps(req.profile, ensure_ascii=False)
    mrepo.save_dialogue_profile(did, pid, data)
    try:
        proj_data = mrepo.get_project_memory(pid)
        proj = _as_dict(proj_data) if proj_data else {}
        dname = get_project_repo().get_dialogue_name(did) or "对话"
        summary = {
            "topic": req.profile.get("topic", ""),
            "selfLevel": req.profile.get("selfLevel", ""),
            "target": req.profile.get("target", ""),
        }
        dlist = proj.get("对话概要", [])
        updated = False
        for i, d in enumerate(dlist):
            if d.get("dialogue_id") == did:
                dlist[i] = {"dialogue_id": did, "name": dname, "概要": summary}
                updated = True
                break
        if not updated:
            dlist.append({"dialogue_id": did, "name": dname, "概要": summary})
        proj["对话概要"] = dlist
        mrepo.save_project_memory(pid, json.dumps(proj, ensure_ascii=False))
    except Exception:
        logger.exception("保存对话画像时更新项目记忆失败 did=%s", did)
    return {"status": "ok"}


@router.get("/api/dialogues/{did}/profile")
def get_dialogue_profile(did: str):
    return {"profile": get_memory_repo().get_dialogue_profile(did)}
