"""记忆、画像、统计与学习时间线路由。"""
import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from core.helpers import _as_dict
from services.memory_progress import compute_mastery_items, compute_pace

logger = logging.getLogger("coagent.memory")
router = APIRouter()


@router.get("/api/global-profile")
async def get_global_profile(session_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
    return {"profile": _as_dict(rows[0]["data"]) if rows else {}}


@router.get("/api/project-memory/{project_id}")
async def get_project_memory(project_id: str, session_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id = %s ORDER BY updated_at DESC LIMIT 1", (project_id,))
    return {"memory": _as_dict(rows[0]["data"]) if rows else {}}


@router.get("/api/dialogues/{did}/followups")
async def get_followups(did: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT questions, updated_at FROM followups WHERE dialogue_id=%s", (did,))
    if not rows:
        return {"questions": []}
    try:
        qs = json.loads(rows[0]["questions"] or "[]")
    except Exception:
        qs = []
    return {"questions": qs, "updated_at": rows[0].get("updated_at")}


@router.get("/api/artifacts")
async def list_artifacts(project_id: str = "default"):
    """扫描项目对话消息，解析生成物（定制讲义/实操指南/分阶测试题）"""
    import re
    from core.postgres_client import pg_client
    dialogs = pg_client.execute("SELECT id, name FROM dialogues WHERE project_id=%s", (project_id,))
    if not dialogs:
        return {"artifacts": []}
    d_ids = [d["id"] for d in dialogs]
    d_names = {d["id"]: d["name"] for d in dialogs}
    ph = ",".join(["%s"] * len(d_ids))
    msgs = pg_client.execute(
        "SELECT dialogue_id, content, created_at FROM messages WHERE role='assistant' AND dialogue_id IN (" + ph + ") ORDER BY created_at",
        tuple(d_ids))
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
async def add_feedback(req: FeedbackReq):
    from core.postgres_client import pg_client
    pg_client.execute("INSERT INTO feedback (dialogue_id, project_id, resource_type, feedback, note) VALUES (%s,%s,%s,%s,%s)",
                      (req.dialogue_id, req.project_id, req.resource_type, req.feedback, req.note))
    if req.dialogue_id and req.feedback in ("太难", "太简单"):
        try:
            rows = pg_client.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (req.dialogue_id,))
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
                pg_client.execute("UPDATE dialogue_memories SET profile_data=%s WHERE dialogue_id=%s",
                                  (json.dumps(p, ensure_ascii=False), req.dialogue_id))
        except Exception:
            logger.exception("保存反馈失败 dialogue_id=%s", req.dialogue_id)
    return {"status": "ok"}


@router.get("/api/stats")
async def get_stats(project_id: str = "default"):
    from core.postgres_client import pg_client
    d = pg_client.execute("SELECT count(*) AS c FROM dialogues WHERE project_id=%s", (project_id,))
    m = pg_client.execute("SELECT count(*) AS c, COALESCE(SUM(LENGTH(content)),0) AS chars FROM messages", ())
    s = pg_client.execute("SELECT metrics FROM stats WHERE project_id=%s ORDER BY updated_at DESC LIMIT 1", (project_id,))
    metrics = s[0]["metrics"] if s else {}
    ds = pg_client.execute("SELECT COALESCE(SUM(duration_seconds),0) AS s FROM stats WHERE project_id=%s", (project_id,))
    daily_focus = []
    try:
        if project_id in ("all", ""):
            rows = pg_client.execute(
                "SELECT substr(created_at,1,10) AS d, SUM(duration_seconds) AS s FROM focus_log WHERE created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d",
                ())
        else:
            rows = pg_client.execute(
                "SELECT substr(created_at,1,10) AS d, SUM(duration_seconds) AS s FROM focus_log WHERE project_id=%s AND created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d",
                (project_id,))
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
async def get_task_stats(project_id: str = "default", limit: int = 20):
    from core.postgres_client import pg_client
    rows = pg_client.execute(
        "SELECT dialogue_id, data, created_at FROM task_stats WHERE project_id=%s ORDER BY id DESC LIMIT %s",
        (project_id, min(max(limit, 1), 100)))
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
async def clear_memories():
    from core.postgres_client import pg_client
    pg_client.execute("DELETE FROM global_profile", ())
    pg_client.execute("DELETE FROM project_memories", ())
    pg_client.execute("DELETE FROM dialogue_memories", ())
    return {"status": "ok"}


@router.post("/api/memory/rebuild")
async def memory_rebuild(req: dict):
    from core.background import submit
    from core.memory_analysis import update_memories
    from core.postgres_client import pg_client
    api_key = (req or {}).get("api_key") or ""
    project_id = (req or {}).get("project_id") or ""
    if project_id:
        submit(update_memories, api_key, project_id, None, pg_client, "default")
    else:
        rows = pg_client.execute("SELECT id FROM projects WHERE archived = FALSE")
        for r in rows or []:
            submit(update_memories, api_key, r["id"], None, pg_client, "default")
    return {"status": "ok", "message": "记忆分析已启动，稍后刷新查看"}


@router.delete("/api/projects/{pid}/dialogues")
async def clear_project_dialogues(pid: str):
    from core.postgres_client import pg_client
    dialogs = pg_client.execute("SELECT id FROM dialogues WHERE project_id=%s", (pid,))
    for d in dialogs or []:
        pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (d["id"],))
        pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (d["id"],))
    pg_client.execute("DELETE FROM dialogues WHERE project_id=%s", (pid,))
    return {"status": "ok", "deleted": len(dialogs or [])}


@router.get("/api/export")
async def export_all(project_id: str = "default"):
    from core.postgres_client import pg_client
    def _q(sql, args=()):
        return pg_client.execute(sql, args)
    out = {
        "projects": _q("SELECT id, name, is_default, simple, domain, created_at FROM projects WHERE archived = FALSE"),
        "dialogues": _q("SELECT id, project_id, session_id, name, created_at FROM dialogues"),
        "messages": _q("SELECT dialogue_id, role, content, created_at FROM messages ORDER BY created_at"),
        "global_profile": _q("SELECT data, updated_at FROM global_profile"),
        "project_memories": _q("SELECT project_id, data, updated_at FROM project_memories"),
        "dialogue_memories": _q("SELECT dialogue_id, project_id, profile_data, updated_at FROM dialogue_memories"),
        "resources": _q("SELECT id, name, content, project_id, created_at FROM resources WHERE project_id=%s", (project_id,)),
        "stats": _q("SELECT project_id, tokens, duration_seconds, metrics FROM stats"),
    }
    return {"exported_at": __import__("datetime").datetime.now().isoformat(), "data": out}


@router.get("/api/learning-log")
async def get_learning_log(project_id: str = ""):
    from core.postgres_client import pg_client
    if project_id:
        dialogs = pg_client.execute("SELECT id, project_id, name, created_at FROM dialogues WHERE project_id=%s AND archived=FALSE", (project_id,))
    else:
        dialogs = pg_client.execute("SELECT id, project_id, name, created_at FROM dialogues WHERE archived=FALSE")
    projs = pg_client.execute("SELECT id, name FROM projects")
    pname = {p["id"]: p.get("name", p["id"]) for p in projs or []}
    days: dict = {}
    for d in dialogs or []:
        date = (d.get("created_at") or "")[:10] or "未知日期"
        topic = ""
        try:
            dm = pg_client.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (d["id"],))
            if dm and dm[0].get("profile_data"):
                pd = dm[0]["profile_data"]
                if isinstance(pd, str):
                    try:
                        pd = json.loads(pd)
                    except Exception:
                        pd = {}
                topic = pd.get("topic", "") if isinstance(pd, dict) else ""
        except Exception:
            pass
        arts: list = []
        try:
            from core.sqlite_client import get_db
            msgs = get_db().execute("SELECT content FROM messages WHERE dialogue_id=%s ORDER BY created_at", (d["id"],))
            for m in msgs or []:
                c = str(m.get("content") or "")
                if "## 📝 分阶测试题" in c and not any(a["type"] == "测试题" for a in arts):
                    arts.append({"type": "测试题", "title": "分阶测试题"})
                if len(c) >= 100 and not any(a["type"] == "讲义" for a in arts):
                    arts.append({"type": "讲义", "title": "讲义"})
        except Exception:
            pass
        item = {
            "project_id": d.get("project_id"), "project_name": pname.get(d.get("project_id"), d.get("project_id")),
            "dialogue_id": d["id"], "dialogue_name": d.get("name") or "对话",
            "topic": topic, "artifacts": arts, "created_at": d.get("created_at"),
        }
        days.setdefault(date, []).append(item)
    out = [{"date": k, "items": v} for k, v in sorted(days.items(), key=lambda x: x[0], reverse=True)]
    return {"days": out}


@router.get("/api/memory/progress")
async def memory_progress(project_id: str = "default"):
    import datetime
    from collections import defaultdict
    from core.postgres_client import pg_client as _pg
    rows = _pg.execute("SELECT data FROM project_memories WHERE project_id=%s", (project_id,))
    mem = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
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
    dialogs = _pg.execute("SELECT id, created_at FROM dialogues WHERE project_id=%s ORDER BY created_at", (project_id,)) or []
    seen_days: dict = defaultdict(set)
    try:
        from core.sqlite_client import get_db
        d_ids = [d["id"] for d in dialogs]
        msgs: list = []
        if d_ids and names:
            ph = ",".join(["%s"] * len(d_ids))
            msgs = get_db().execute("SELECT content, created_at FROM messages WHERE dialogue_id IN (" + ph + ") ORDER BY created_at LIMIT 500", tuple(d_ids)) or []
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
async def update_dialogue(did: str, req: DialogueUpdate):
    from core.postgres_client import pg_client
    if req.name is not None:
        pg_client.execute("UPDATE dialogues SET name=%s WHERE id=%s", (req.name, did))
    if req.archived is not None:
        pg_client.execute("UPDATE dialogues SET archived=%s WHERE id=%s", (1 if req.archived else 0, did))
    return {"status": "ok"}


@router.post("/api/global-profile")
async def save_global_profile(req: ProfileData):
    from core.postgres_client import pg_client
    data = json.dumps(req.profile, ensure_ascii=False)
    rows = pg_client.execute("SELECT id FROM global_profile LIMIT 1")
    if rows:
        pg_client.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (data, rows[0]["id"]))
    else:
        pg_client.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", ("default", data))
    return {"status": "ok"}


@router.post("/api/project-memory/{project_id}")
async def save_project_memory(project_id: str, req: ProfileData):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
    proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
    p = req.profile
    if isinstance(p, dict):
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣", "里程碑", "课程结束时间", "平均每日投入时间", "其他"]:
            if k in p:
                proj[k] = p[k]
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "课程结束时间", "平均每日投入时间", "其他"]:
            if k in p and not p[k]:
                proj.pop(k, None)
    data = json.dumps(proj, ensure_ascii=False)
    if rows:
        pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (data, project_id))
    else:
        pg_client.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", ("project", project_id, data))
    return {"status": "ok"}


@router.post("/api/projects/{pid}/profile")
async def save_project_profile(pid: str, req: ProfileData):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))
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
    data = json.dumps(proj, ensure_ascii=False)
    if rows:
        pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (data, pid))
    else:
        pg_client.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", ("project", pid, data))
    return {"status": "ok"}


@router.get("/api/projects/{pid}/profile")
async def get_project_profile(pid: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
    return {"profile": rows[0]["data"] if rows else {}}


@router.post("/api/dialogues/{did}/profile")
async def save_dialogue_profile(did: str, req: ProfileData):
    from core.postgres_client import pg_client
    pid_row = pg_client.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
    pid = pid_row[0]["project_id"] if pid_row else "default"
    data = json.dumps(req.profile, ensure_ascii=False)
    has = pg_client.execute("SELECT dialogue_id FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    if has:
        pg_client.execute("UPDATE dialogue_memories SET profile_data=%s, updated_at=CURRENT_TIMESTAMP WHERE dialogue_id=%s", (data, did))
    else:
        pg_client.execute("INSERT INTO dialogue_memories (dialogue_id, project_id, profile_data) VALUES (%s,%s,%s)", (did, pid, data))
    try:
        rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
        proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        dname = "对话"
        try:
            nrow = pg_client.execute("SELECT name FROM dialogues WHERE id=%s", (did,))
            if nrow and nrow[0].get("name"):
                dname = nrow[0]["name"]
        except Exception:
            pass
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
        pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                          (json.dumps(proj, ensure_ascii=False), pid))
    except Exception:
        logger.exception("保存对话画像时更新项目记忆失败 did=%s", did)
    return {"status": "ok"}


@router.get("/api/dialogues/{did}/profile")
async def get_dialogue_profile(did: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    return {"profile": rows[0]["profile_data"] if rows else {}}
