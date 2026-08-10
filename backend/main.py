"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
"""
import sys, os
import re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import json

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os, warnings
    required = ["DEEPSEEK_API_KEY"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        warnings.warn(f"缺少环境变量: {', '.join(missing)}。Agent 功能不可用。")
    try:
        _ensure_default_project()
    except Exception:
        pass
    yield


app = FastAPI(
    title="CoAgent-Learn API",
    description="领域知识个性化生成与多智能体协同决策系统",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}


def _as_dict(data):
    """SQLite 存的 JSON 字符串转 dict"""
    import json as _json
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return _json.loads(data)
        except Exception:
            return {}
    return {}


@app.get("/api/global-profile")
async def get_global_profile(session_id: str = "default"):
    from core.postgres_client import pg_client
    # 记忆永久化：不按 session 过滤，取最新一条（刷新后保留）
    rows = pg_client.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
    return {"profile": _as_dict(rows[0]["data"]) if rows else {}}

@app.get("/api/project-memory/{project_id}")
async def get_project_memory(project_id: str, session_id: str = "default"):
    from core.postgres_client import pg_client
    # 记忆永久化：按项目取最新一条（不按 session，刷新后保留）
    rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id = %s ORDER BY updated_at DESC LIMIT 1", (project_id,))
    return {"memory": _as_dict(rows[0]["data"]) if rows else {}}



# ---------- 知识库 API ----------

import threading as _threading


def _process_upload(project_id, text, source, session_id, api_key):
    """后台处理上传：切块+前缀+入库+抽取图谱"""
    try:
        from core.knowledge_service import add_document
        add_document(project_id, text, source, session_id, api_key)
    except Exception:
        pass
    try:
        from core.graph_service import extract_relations, store_relations
        rels = extract_relations(text, api_key)
        store_relations(project_id, rels, source)
    except Exception:
        pass




class KnowledgeUpload(BaseModel):
    project_id: str = "default"
    text: str = ""
    source: str = "未命名"
    session_id: str = "default"
    api_key: str = ""


@app.post("/api/knowledge/upload")
async def knowledge_upload(req: KnowledgeUpload):
    _threading.Thread(target=_process_upload, args=(req.project_id, req.text, req.source, req.session_id, req.api_key), daemon=True).start()
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


@app.post("/api/knowledge/upload-file")
async def knowledge_upload_file(
    project_id: str = Form("default"),
    session_id: str = Form("default"),
    api_key: str = Form(""),
    file: UploadFile = File(...),
):
    from core.file_parser import parse_file
    data = await file.read()
    text = parse_file(file.filename or "file", data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容（可能为空或格式不支持）"}
    _threading.Thread(target=_process_upload, args=(project_id, text, file.filename or "file", session_id, api_key), daemon=True).start()
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


@app.get("/api/knowledge/list")
async def knowledge_list(project_id: str = "default"):
    from core.knowledge_service import list_docs
    return {"docs": list_docs(project_id)}


@app.delete("/api/knowledge/delete")
async def knowledge_delete(project_id: str = "default", source: str = ""):
    from core.knowledge_service import delete_doc
    n = delete_doc(project_id, source)
    graph_n = 0
    try:
        from core.graph_service import delete_relations_by_source
        graph_n = delete_relations_by_source(project_id, source)
    except Exception:
        pass
    return {"status": "ok", "deleted": n, "graph_relations": graph_n}


@app.post("/api/vision")
async def vision_understand(req: dict):
    from core.vision_service import describe_image
    image = req.get("image", "")
    prompt = req.get("prompt", "请描述这张图片的内容")
    desc = describe_image(image, prompt)
    return {"status": "ok", "description": desc}

@app.post("/api/file-to-text")
async def file_to_text(file: UploadFile = File(...)):
    from core.file_parser import parse_file
    data = await file.read()
    text = parse_file(file.filename or "file", data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容"}
    return {"status": "ok", "text": text[:50000], "chars": len(text)}


@app.get("/api/graph")
async def get_graph(project_id: str = "default"):
    from fastapi.responses import JSONResponse
    from core.graph_service import get_graph
    resp = JSONResponse(get_graph(project_id))
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/graph/node")
async def get_graph_node(project_id: str = "default", name: str = ""):
    """节点详情：该实体的关系 + 知识库相关原文"""
    from core.neo4j_client import neo4j_client
    from core.knowledge_service import search
    result = {"relations": [], "kb_refs": []}
    if not name:
        return result
    try:
        rows = neo4j_client.run(
            "MATCH (a:Entity {project_id:$p, name:$n})-[r:REL {project_id:$p}]->(b:Entity) RETURN r.type AS rel, b.name AS to UNION MATCH (a:Entity {project_id:$p})-[r:REL {project_id:$p}]->(b:Entity {project_id:$p, name:$n}) RETURN r.type AS rel, a.name AS to",
            {"p": project_id, "n": name})
        for r in rows:
            result["relations"].append({"rel": r.get("rel", ""), "target": r.get("to", "")})
    except Exception:
        pass
    try:
        refs = search(project_id, name, top_k=3)
        result["kb_refs"] = [{"content": x["content"][:200], "source": (x.get("metadata") or {}).get("source", "")} for x in refs]
    except Exception:
        pass
    return result


@app.get("/api/knowledge/query")
async def knowledge_query(project_id: str = "default", q: str = "", top_k: int = 3):
    from core.knowledge_service import search
    return {"results": search(project_id, q, top_k)}


# ---------- 资源 API ----------

class ResourceSave(BaseModel):
    name: str
    content: str = ""
    project_id: str = "default"


@app.get("/api/resources")
async def list_resources(project_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id, name, content, created_at FROM resources WHERE project_id=%s ORDER BY created_at", (project_id,))
    return {"resources": rows}


@app.post("/api/resources")
async def save_resource(req: ResourceSave):
    import time, hashlib
    from core.postgres_client import pg_client
    rid = hashlib.md5((req.name + req.project_id).encode()).hexdigest()[:16]
    has = pg_client.execute("SELECT id FROM resources WHERE id=%s", (rid,))
    if has:
        pg_client.execute("UPDATE resources SET content=%s WHERE id=%s", (req.content, rid))
    else:
        pg_client.execute("INSERT INTO resources (id, name, content, project_id) VALUES (%s,%s,%s,%s)",
                          (rid, req.name, req.content, req.project_id))
    return {"status": "ok", "id": rid}


@app.delete("/api/resources/{rid}")
async def delete_resource(rid: str):
    from core.postgres_client import pg_client
    pg_client.execute("DELETE FROM resources WHERE id=%s", (rid,))
    return {"status": "ok"}


@app.get("/api/dialogues/{did}/followups")
async def get_followups(did: str):
    from core.postgres_client import pg_client
    import json as _json
    rows = pg_client.execute("SELECT questions, updated_at FROM followups WHERE dialogue_id=%s", (did,))
    if not rows:
        return {"questions": []}
    try:
        qs = _json.loads(rows[0]["questions"] or "[]")
    except Exception:
        qs = []
    return {"questions": qs, "updated_at": rows[0].get("updated_at")}


@app.get("/api/artifacts")
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
    # 生成物小节标题（graph.py 输出格式：## 📘 定制讲义 / ## 🛠 实操指南 / ## 📝 分阶测试题）
    section_re = re.compile(r"^##\s*(?:📘|🛠|📝|🔍)?\s*(定制讲义|讲义|实操指南|分阶测试题|测试题|溯源)\s*$", re.M)
    artifacts = []
    for m in msgs:
        content = str(m["content"] or "")
        marks = list(section_re.finditer(content))
        for i, mk in enumerate(marks):
            title = mk.group(1)
            if title == "溯源":
                continue
            end = marks[i + 1].start() if i + 1 < len(marks) else len(content)
            body = content[mk.end():end].strip()
            if not body:
                continue
            artifacts.append({
                "id": str(m["dialogue_id"]) + "-" + str(mk.start()),
                "dialogue_id": m["dialogue_id"],
                "dialogue_name": d_names.get(m["dialogue_id"], ""),
                "type": title,
                "title": title,
                "content": body,
                "created_at": m["created_at"],
            })
    return {"artifacts": artifacts}


# ---------- 反馈/统计 API ----------

class FeedbackReq(BaseModel):
    dialogue_id: str = ""
    project_id: str = "default"
    resource_type: str = ""
    feedback: str = ""
    note: str = ""


@app.post("/api/feedback")
async def add_feedback(req: FeedbackReq):
    from core.postgres_client import pg_client
    pg_client.execute("INSERT INTO feedback (dialogue_id, project_id, resource_type, feedback, note) VALUES (%s,%s,%s,%s,%s)",
                      (req.dialogue_id, req.project_id, req.resource_type, req.feedback, req.note))
    # 反馈并入对话画像：难度类反馈调整水平
    if req.dialogue_id and req.feedback in ("太难", "太简单"):
        try:
            rows = pg_client.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (req.dialogue_id,))
            if rows:
                import json as _json
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
                                  (_json.dumps(p, ensure_ascii=False), req.dialogue_id))
        except Exception:
            pass
    return {"status": "ok"}


@app.get("/api/stats")
async def get_stats(project_id: str = "default"):
    from core.postgres_client import pg_client
    # 对话数、消息数、token估算、最近学习时间
    d = pg_client.execute("SELECT count(*) AS c FROM dialogues WHERE project_id=%s", (project_id,))
    m = pg_client.execute("SELECT count(*) AS c, COALESCE(SUM(LENGTH(content)),0) AS chars FROM messages", ())
    s = pg_client.execute("SELECT metrics FROM stats WHERE project_id=%s ORDER BY updated_at DESC LIMIT 1", (project_id,))
    metrics = s[0]["metrics"] if s else {}
    return {
        "dialogue_count": d[0]["c"] if d else 0,
        "message_count": m[0]["c"] if m else 0,
        "total_chars": m[0]["chars"] if m else 0,
        "tokens_estimate": int((m[0]["chars"] if m else 0) / 2),
        "metrics": metrics,
    }


@app.get("/api/task-stats")
async def get_task_stats(project_id: str = "default", limit: int = 20):
    """Agent 运行监控：最近 N 次任务的各节点耗时/调用次数/token 估算"""
    import json as _json
    from core.postgres_client import pg_client
    rows = pg_client.execute(
        "SELECT dialogue_id, data, created_at FROM task_stats WHERE project_id=%s ORDER BY id DESC LIMIT %s",
        (project_id, min(max(limit, 1), 100)))
    out = []
    for r in rows:
        d = r.get("data") or "{}"
        try:
            data = _json.loads(d) if isinstance(d, str) else (d or {})
        except Exception:
            data = {}
        out.append({"dialogue_id": r.get("dialogue_id"), "created_at": r.get("created_at"), "data": data})
    return {"tasks": out}


# ---------- 数据管理 ----------

@app.delete("/api/memories")
async def clear_memories():
    """清空全部记忆：全局画像 / 项目记忆 / 对话记忆"""
    from core.postgres_client import pg_client
    pg_client.execute("DELETE FROM global_profile", ())
    pg_client.execute("DELETE FROM project_memories", ())
    pg_client.execute("DELETE FROM dialogue_memories", ())
    return {"status": "ok"}


@app.post("/api/memory/rebuild")
async def memory_rebuild(req: dict):
    """重新分析对话生成记忆（前端携带有效 api_key 调用）：
    - project_id 为空 → 全部项目；否则只分析指定项目
    - 后台异步执行，不阻塞请求
    """
    import threading
    from core.memory_analysis import update_memories
    from core.postgres_client import pg_client
    api_key = (req or {}).get("api_key") or ""
    project_id = (req or {}).get("project_id") or ""
    if project_id:
        threading.Thread(target=update_memories, args=(api_key, project_id, None, pg_client, "default"), daemon=True).start()
    else:
        rows = pg_client.execute("SELECT id FROM projects WHERE archived = FALSE")
        for r in rows or []:
            threading.Thread(target=update_memories, args=(api_key, r["id"], None, pg_client, "default"), daemon=True).start()
    return {"status": "ok", "message": "记忆分析已启动，稍后刷新查看"}


@app.delete("/api/projects/{pid}/dialogues")
async def clear_project_dialogues(pid: str):
    """清空指定项目的全部对话（消息 + 对话画像级联删除，保留项目与项目记忆）"""
    from core.postgres_client import pg_client
    dialogs = pg_client.execute("SELECT id FROM dialogues WHERE project_id=%s", (pid,))
    for d in dialogs or []:
        pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (d["id"],))
        pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (d["id"],))
    pg_client.execute("DELETE FROM dialogues WHERE project_id=%s", (pid,))
    return {"status": "ok", "deleted": len(dialogs or [])}


@app.get("/api/export")
async def export_all(project_id: str = "default"):
    """导出全部数据（JSON 备份）：项目/对话/消息/记忆/资源/知识库"""
    import json as _json
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


# ---------- 学习时间线 ----------

@app.get("/api/learning-log")
async def get_learning_log(project_id: str = ""):
    """按日期聚合的学习时间线：每次对话的名称/主题/产出（project_id 为空=全部项目）"""
    import json as _json
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
                    try: pd = _json.loads(pd)
                    except Exception: pd = {}
                topic = pd.get("topic", "") if isinstance(pd, dict) else ""
        except Exception:
            pass
        arts: list = []
        try:
            from core.sqlite_client import get_db
            msgs = get_db().execute("SELECT content FROM messages WHERE dialogue_id=%s ORDER BY created_at", (d["id"],))
            for m in msgs or []:
                c = str(m.get("content") or "")
                if "## 📘 定制讲义" in c and not any(a["type"] == "讲义" for a in arts):
                    arts.append({"type": "讲义", "title": "定制讲义"})
                elif "## 🛠 实操指南" in c and not any(a["type"] == "实操指南" for a in arts):
                    arts.append({"type": "实操指南", "title": "实操指南"})
                elif "## 📝 分阶测试题" in c and not any(a["type"] == "测试题" for a in arts):
                    arts.append({"type": "测试题", "title": "分阶测试题"})
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


@app.get("/api/memory/progress")
async def memory_progress(project_id: str = "default"):
    """学习效果分析（基于对话内容）：知识点掌握度（遗忘曲线衰减 R=exp(-Δt/S)）+ 每日推进节奏
    - 知识点提及统计：知识点名称出现在对话消息中的日期
    - 记忆强度 S：按提及天数估计（提及越多越稳定）；可检索性 R 随时间指数衰减
    - 掌握度 = 基础分 × R（久未复习的颜色变淡，即"遗忘"）
    """
    import math, datetime
    from collections import defaultdict
    from core.postgres_client import pg_client as _pg
    # 知识点/难点：来自项目记忆
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
    # 对话列表（用于每日节奏）
    dialogs = _pg.execute("SELECT id, created_at FROM dialogues WHERE project_id=%s ORDER BY created_at", (project_id,)) or []
    # 消息（提及统计）
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
        pass
    today = datetime.date.today()
    items = []
    for n in names:
        days = sorted(seen_days.get(n, set()))
        last = days[-1] if days else None
        dt = 999
        if last:
            try:
                dt = (today - datetime.date.fromisoformat(last)).days
            except Exception:
                dt = 999
        mentions = len(days)
        # 记忆稳定性 S（天）：提及越多越稳定，上限 30 天
        stability = min(30, mentions * 2 + 3)
        R = 0.0 if dt >= 999 else math.exp(-dt / max(stability, 1))
        mastery = int(min(95, 20 + mentions * 10) * R)
        items.append({
            "name": n,
            "kind": kind_map.get(n, "知识点"),
            "mastery": mastery,
            "retrievability": round(R, 2),
            "lastSeen": last,
            "daysSince": 999 if dt >= 999 else dt,
            "mentions": mentions,
            "stability": stability,
            "forgotten": dt >= 999 or R < 0.7,
        })
    items.sort(key=lambda x: -x["mastery"])
    # 每日推进节奏：最近 14 天对话数
    day_counts: dict = defaultdict(int)
    for dlg in dialogs:
        d = str(dlg.get("created_at") or "")[:10]
        if d:
            day_counts[d] += 1
    daily = []
    for i in range(13, -1, -1):
        d = (today - datetime.timedelta(days=i)).isoformat()
        daily.append({"date": d, "count": day_counts.get(d, 0)})
    # 节奏总结（规则）：近7天 vs 前7天
    def _sum(arr, start, end):
        return sum(x["count"] for x in arr[start:end])
    w7 = _sum(daily, 7, 14)
    prev7 = max(1, _sum(daily, 0, 7))
    ratio = w7 / prev7
    pace = "↗ 变快" if ratio > 1.3 else ("↘ 变慢" if ratio < 0.7 else "→ 平稳")
    return {"items": items, "daily": daily, "pace": pace, "total_dialogues": len(dialogs)}


# ---------- 画像 API ----------

class ProfileData(BaseModel):
    profile: dict = {}


class DialogueUpdate(BaseModel):
    name: str | None = None
    archived: bool | None = None


@app.post("/api/dialogues/{did}/update")
async def update_dialogue(did: str, req: DialogueUpdate):
    """更新对话信息：改名 / 归档（自动命名、自动清理用）"""
    from core.postgres_client import pg_client
    if req.name is not None:
        pg_client.execute("UPDATE dialogues SET name=%s WHERE id=%s", (req.name, did))
    if req.archived is not None:
        pg_client.execute("UPDATE dialogues SET archived=%s WHERE id=%s", (1 if req.archived else 0, did))
    return {"status": "ok"}


@app.post("/api/global-profile")
async def save_global_profile(req: ProfileData):
    """个人全局性记忆：保存简历式自由要点（upsert 最新一条，单行表 id=1）"""
    import json
    from core.postgres_client import pg_client
    data = json.dumps(req.profile, ensure_ascii=False)
    rows = pg_client.execute("SELECT id FROM global_profile LIMIT 1")
    if rows:
        pg_client.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (data, rows[0]["id"]))
    else:
        pg_client.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", ("default", data))
    return {"status": "ok"}


@app.post("/api/project-memory/{project_id}")
async def save_project_memory(project_id: str, req: ProfileData):
    """项目记忆全字段保存：合并写入 project_memories（保留对话概要/对话摘要等系统字段）"""
    import json
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
    proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
    p = req.profile
    if isinstance(p, dict):
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣", "里程碑"]:
            if k in p:
                proj[k] = p[k]
        # 前端置空的单值字段允许清理
        for k in ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标"]:
            if k in p and not p[k]:
                proj.pop(k, None)
    data = json.dumps(proj, ensure_ascii=False)
    if rows:
        pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (data, project_id))
    else:
        pg_client.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", ("project", project_id, data))
    return {"status": "ok"}


@app.post("/api/projects/{pid}/profile")
async def save_project_profile(pid: str, req: ProfileData):
    import json
    from core.postgres_client import pg_client
    # 项目画像写入 project_memories：合并（不覆盖对话生成的记忆），字段映射成前端可显示键
    rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))
    proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
    p = req.profile
    if isinstance(p, dict):
        if p.get("domain"): proj["抽象项目情况"] = p["domain"]
        if p.get("background"): proj["抽象项目情况"] = p["background"] or proj.get("抽象项目情况", "")
        if p.get("prefer"): proj["偏好"] = p["prefer"]
        if p.get("goal"): proj["目标"] = p["goal"]
    data = json.dumps(proj, ensure_ascii=False)
    if rows:
        pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (data, pid))
    else:
        pg_client.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", ("project", pid, data))
    return {"status": "ok"}


@app.get("/api/projects/{pid}/profile")
async def get_project_profile(pid: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
    return {"profile": rows[0]["data"] if rows else {}}


@app.post("/api/dialogues/{did}/profile")
async def save_dialogue_profile(did: str, req: ProfileData):
    import json
    from core.postgres_client import pg_client
    pid_row = pg_client.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
    pid = pid_row[0]["project_id"] if pid_row else "default"
    data = json.dumps(req.profile, ensure_ascii=False)
    has = pg_client.execute("SELECT dialogue_id FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    if has:
        pg_client.execute("UPDATE dialogue_memories SET profile_data=%s, updated_at=CURRENT_TIMESTAMP WHERE dialogue_id=%s", (data, did))
    else:
        pg_client.execute("INSERT INTO dialogue_memories (dialogue_id, project_id, profile_data) VALUES (%s,%s,%s)", (did, pid, data))
    # 汇总对话画像进项目画像：以"对话概要"形式挂项目下，不污染项目字段
    try:
        rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
        proj = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        # 对话名
        dname = "对话"
        try:
            nrow = pg_client.execute("SELECT name FROM dialogues WHERE id=%s", (did,))
            if nrow and nrow[0].get("name"):
                dname = nrow[0]["name"]
        except Exception:
            pass
        # 概要：对话画像的核心字段
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
        pass
    return {"status": "ok"}


@app.get("/api/dialogues/{did}/profile")
async def get_dialogue_profile(did: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT profile_data FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    return {"profile": rows[0]["profile_data"] if rows else {}}


# ---------- 评估 API ----------

@app.post("/api/evaluate")
async def run_evaluate(project_id: str = "default", api_key: str = ""):
    from core.evaluator import hallucination_rate, adaptation_accuracy, knowledge_coverage
    from core.knowledge_service import list_docs
    from core.postgres_client import pg_client
    import json
    # 1. 读项目知识库作为"标准答案"
    kb_texts = []
    try:
        docs = list_docs(project_id)
        for d in docs:
            for b in d.get("blocks", []):
                kb_texts.append(b.get("content", ""))
    except Exception:
        pass
    # 2. 预置测试题 + 3组画像 + 知识点（垂直领域可换）
    questions = [
        "什么是牛顿第二定律？",
        "欧姆定律的公式是什么？",
        "简述能量守恒定律。",
        "什么是动量守恒？",
        "热力学第二定律讲了什么？",
    ]
    profiles = [
        {"level": "beginner", "topic": "牛顿第一定律"},
        {"level": "beginner", "topic": "电路基础"},
        {"level": "intermediate", "topic": "牛顿第二定律的应用"},
        {"level": "advanced", "topic": "麦克斯韦方程组"},
        {"level": "advanced", "topic": "相对论质能方程"},
    ]
    knowledge_points = ["牛顿第一定律", "牛顿第二定律", "牛顿第三定律", "万有引力", "动量守恒", "能量守恒", "欧姆定律", "楞次定律", "热力学第二定律"]
    # 3. 跑指标
    h = hallucination_rate(questions, kb_texts, api_key)
    a = adaptation_accuracy(profiles, api_key)
    k = knowledge_coverage(knowledge_points, "经典力学", api_key)
    result = {"hallucination": h, "adaptation": a, "coverage": k}
    # 4. 写 stats
    try:
        pg_client.execute(
            "INSERT INTO stats (project_id, metrics) VALUES (%s,%s) ON CONFLICT DO NOTHING",
            (project_id, json.dumps(result, ensure_ascii=False)))
    except Exception:
        pass
    return result


# ---------- 项目/对话持久化 API ----------

class ProjectCreate(BaseModel):
    name: str = "新项目"
    domain: str = ""
    simple: bool = False


@app.get("/api/projects")
async def list_projects():
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id, name, is_default, simple, domain, created_at FROM projects WHERE archived = FALSE ORDER BY created_at")
    return {"projects": rows}


@app.post("/api/projects")
async def create_project(req: ProjectCreate):
    import time
    from core.postgres_client import pg_client
    pid = time.strftime("%Y%m%d%H%M%S") + str(int(time.time() * 1000))[-4:]
    pg_client.execute("INSERT INTO projects (id, name, is_default, simple, domain) VALUES (%s,%s,%s,%s,%s)",
                      (pid, req.name, False, req.simple, req.domain))
    return {"id": pid, "name": req.name, "is_default": False, "simple": req.simple, "domain": req.domain}


@app.patch("/api/projects/{pid}")
async def update_project(pid: str, req: ProjectCreate):
    from core.postgres_client import pg_client
    pg_client.execute("UPDATE projects SET name=%s, domain=%s, simple=%s WHERE id=%s", (req.name, req.domain, req.simple, pid))
    return {"status": "ok"}


@app.delete("/api/projects/{pid}")
async def delete_project(pid: str):
    """级联删除项目：对话+消息+画像+知识库+图谱"""
    from core.postgres_client import pg_client
    # 查该项目对话
    dialogs = pg_client.execute("SELECT id FROM dialogues WHERE project_id=%s", (pid,))
    d_ids = [d["id"] for d in dialogs]
    try:
        # 删消息
        for d in d_ids:
            pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (d,))
        # 删对话画像
        for d in d_ids:
            pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (d,))
        # 删对话
        pg_client.execute("DELETE FROM dialogues WHERE project_id=%s", (pid,))
        # 删项目画像
        pg_client.execute("DELETE FROM project_memories WHERE project_id=%s", (pid,))
        # 删反馈
        pg_client.execute("DELETE FROM feedback WHERE project_id=%s", (pid,))
        # 删项目行
        pg_client.execute("DELETE FROM projects WHERE id=%s", (pid,))
    except Exception as e:
        return {"status": "error", "msg": str(e)}
    # 删知识库（SQLite 向量表）
    kb_deleted = 0
    try:
        from core.knowledge_service import delete_project_kb
        kb_deleted = delete_project_kb(pid)
    except Exception:
        pass
    # 删图谱（Neo4j）
    try:
        from core.neo4j_client import neo4j_client
        neo4j_client.run("MATCH (n:Entity {project_id:$p}) DETACH DELETE n", {"p": pid})
    except Exception:
        pass
    return {"status": "ok", "dialogues": len(d_ids), "kb": kb_deleted}


@app.get("/api/projects/{pid}/dialogues")
async def list_dialogues(pid: str):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id, name, created_at FROM dialogues WHERE project_id=%s AND archived=FALSE ORDER BY created_at", (pid,))
    return {"dialogues": rows}


@app.post("/api/dialogues")
async def create_dialogue(req: dict):
    """创建对话（落库，前端本地 id 与后端一致：用前端生成 id 或后端生成）"""
    from core.postgres_client import pg_client
    pid = req.get("project_id") or "default"
    name = req.get("name") or "对话"
    did = req.get("id") or ("dlg-" + str(int(time.time() * 1000)) + "-" + str(abs(hash(name)) % 10000))
    pg_client.execute("INSERT OR IGNORE INTO dialogues (id, name, project_id) VALUES (%s,%s,%s)", (did, name, pid))
    return {"id": did, "name": name}


@app.get("/api/dialogues/{did}/messages")
async def get_dialogue_messages(did: str):
    import json as _json
    from core.sqlite_client import get_db
    rows = get_db().execute("SELECT role, content, think, created_at FROM messages WHERE dialogue_id=%s ORDER BY created_at ASC", (did,))
    for r in rows or []:
        t = r.get("think") or ""
        r["think"] = _json.loads(t) if t else []
    return {"messages": rows or []}


@app.post("/api/dialogues/{did}/messages")
async def post_dialogue_message(did: str, req: dict):
    """写入一条对话消息（静态引导等），保证 dialogue 存在"""
    from core.postgres_client import pg_client
    from core.sqlite_client import get_db
    role = req.get("role") if req.get("role") in ("user", "assistant", "thinking") else "assistant"
    content = str(req.get("content") or "")
    if not content:
        return {"status": "ok"}
    pg_client.execute("INSERT OR IGNORE INTO dialogues (id, name, project_id) VALUES (%s,%s,%s)", (did, "对话", "default"))
    get_db().execute("INSERT INTO messages (dialogue_id, role, content) VALUES (%s,%s,%s)", (did, role, content))
    return {"status": "ok"}


@app.delete("/api/dialogues/{did}")
async def delete_dialogue(did: str):
    """级联删除对话：消息+对话画像；并作为一次事件更新项目记忆（移除该对话概要）"""
    import json as _json
    from core.postgres_client import pg_client
    # 先查对话所属项目
    rows = pg_client.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
    pid = rows[0]["project_id"] if rows else None
    pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogues WHERE id=%s", (did,))
    # 更新项目记忆：从"对话概要"移除该对话（把删除当作一次事件）
    if pid:
        try:
            proj_rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
            if proj_rows and proj_rows[0]["data"]:
                proj = _as_dict(proj_rows[0]["data"])
                dlist = proj.get("对话概要", [])
                proj["对话概要"] = [d for d in dlist if d.get("dialogue_id") != did]
                pg_client.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                                  (_json.dumps(proj, ensure_ascii=False), pid))
        except Exception:
            pass
    return {"status": "ok", "project_id": pid}


# 启动时确保有默认项目
import time as _time

def _ensure_default_project():
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id FROM projects WHERE is_default=TRUE")
    if rows:
        return rows[0]["id"]
    pid = _time.strftime("%Y%m%d%H%M%S") + "default"
    pg_client.execute("INSERT INTO projects (id, name, is_default) VALUES (%s,%s,%s)", (pid, "默认项目", True))
    return pid


# ---------- Skill 管理 API ----------

@app.get("/api/skills")
async def list_skills():
    from skills.registry import registry
    return {"skills": registry.list_all()}


class SkillUpload(BaseModel):
    name: str
    code: str


@app.post("/api/skills")
async def upload_skill(req: SkillUpload):
    """上传新 Skill（占位——后续实现文件写入）"""
    return {"status": "ok", "name": req.name, "message": "Skill 上传功能即将实现"}


@app.delete("/api/skills/{name}")
async def delete_skill(name: str):
    """删除 Skill（占位）"""
    return {"status": "ok", "name": name, "message": "Skill 删除功能即将实现"}


# ---------- API 接口 ----------

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    dialogue_id: str | None = None
    project_id: str | None = None
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    settings: dict | None = None
    mode: str | None = None
    image: str | None = None
    agents: list = []

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None



# ---------- 记忆修改（AI 分析修改记忆：[模块名] 引用） ----------

GLOBAL_MEM_KEYS = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
PROJECT_MEM_KEYS = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]


def _extract_json_obj(text: str) -> dict:
    """提取文本中的 JSON 对象（容错：裸 JSON 或花括号片段）"""
    try:
        d = json.loads(text)
        return d if isinstance(d, dict) else {}
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            d = json.loads(m.group(0))
            return d if isinstance(d, dict) else {}
        except Exception:
            pass
    return {}


def _auto_settings(api_key: str, message: str, template: str = "基础", infer_model: bool = False) -> dict:
    """Auto 模式：让 AI 读取用户输入，基于用户所选模板自动推断其余设置；infer_model=True 时同时推断模型；失败时返回空 dict（保持默认）"""
    from core.config import config as _cfg
    _model_field = "\"model\": \"deepseek-v4-pro|deepseek-v4-flash|glm-4-plus|glm-4-flash\", " if infer_model else ""
    prompt = (
        "你是对话设置分析器。模板已由用户选定，请根据用户的输入内容，推断其余最适合的对话设置，只输出 JSON：\n"
        "{" + _model_field + "\"inputOptMode\": \"默认模式|详尽模式|不询问模式\", \"searchMode\": \"自由|知识库\", "
        "\"webSearchMode\": \"默认|增强\", \"outputFormat\": \"低结构化|高结构化\", "
        "\"outputStyle\": \"MD文档|对话形式\", \"thinking\": \"开|关\", "
        "\"outputVolume\": \"精简|适中|拓展\", \"depth\": \"浅|中|深\"}\n"
        f"已选模板：{template}（基础=默认编排、检索增强=子Agent整理资料、快速=快模型、输出增强=子Agent产出结构化内容，推断时可参考）\n"
        "推断规则：涉及学习/讲解/推导用较深深度与适中输出；复杂主题适当加重输出量；简单问答用精简；无需搜索则 webSearchMode=默认。\n"
        "模型推断规则（仅在要求推断模型时）：复杂/长篇任务用 deepseek-v4-pro 或 glm-4-plus；简单问答用 deepseek-v4-flash 或 glm-4-flash。\n"
        f"用户输入：{message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = _extract_json_obj(raw)
        if not d:
            return {}
        # 只接受合法取值，非法字段丢弃（template 由用户选择，不参与推断）
        ok = {
            "inputOptMode": ["默认模式", "详尽模式", "不询问模式"],
            "searchMode": ["自由", "知识库"],
            "webSearchMode": ["默认", "增强"],
            "outputFormat": ["低结构化", "高结构化"],
            "outputStyle": ["MD文档", "对话形式"],
            "thinking": ["开", "关"],
            "outputVolume": ["精简", "适中", "拓展"],
            "depth": ["浅", "中", "深"],
        }
        if infer_model:
            ok["model"] = ["deepseek-v4-pro", "deepseek-v4-flash", "glm-4-plus", "glm-4-flash"]
        out = {}
        for k, vals in ok.items():
            v = str(d.get(k, "")).strip()
            if v in vals:
                out[k] = v
        return out
    except Exception:
        return {}


def _apply_template(agents, tpl: str):
    """按模板调整 agents 配置：
    基础=默认编排；检索增强=工作流内知识库管理调用子Agent；快速=主Agent生成用快模型；输出增强=工作流内主Agent调用子Agent产出专项内容。"""
    if not agents:
        return agents
    out = list(agents)
    if tpl == "快速":
        out = [dict(a, model="fast") if (isinstance(a, dict) and a.get("id") == "main") else a for a in out]
    return out


def _memory_edit(api_key: str, message: str, project_id: str, session_id: str) -> dict | None:
    """检测 [模块名] 引用 → AI 分析并修改记忆；返回 {"reply":..., "steps":...}，非引用消息返回 None"""
    m = re.search(r"\[([^\[\]]{1,16})\]", message)
    if not m:
        return None
    key = m.group(1).strip()
    rest = message[m.end():].strip()
    is_global = key in GLOBAL_MEM_KEYS
    is_project = key in PROJECT_MEM_KEYS
    if not (is_global or is_project):
        return None
    from core.postgres_client import pg_client as _pg
    from core.config import config as _cfg
    # 读当前内容
    cur = ""
    if is_global:
        rows = _pg.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    else:
        rows = _pg.execute("SELECT data FROM project_memories WHERE project_id=%s", (project_id,))
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    # LLM 分析修改
    prompt = (
        f"你是记忆管理 Agent。用户希望对记忆模块「{key}」进行修改。\n"
        f"当前内容：{cur or '（空）'}\n"
        f"用户的修改想法：{rest or '（未说明，请自行判断是否需要修改）'}\n"
        f"请分析并给出修改后的内容（可保留、细化或重写，须符合用户想法且不与已有内容矛盾）。\n"
        f"只输出 JSON：{{\"reason\": \"修改理由（一两句）\", \"content\": \"修改后的内容（支持段落、- 列表、1. 列表）\"}}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {"reply": f"⚠️ 修改失败：LLM 调用错误（{resp.status_code}）", "steps": [{"agent": "记忆管理", "status": "done", "detail": "修改失败"}]}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        data = _extract_json_obj(raw)
        content = str(data.get("content") or "").strip()
        reason = str(data.get("reason") or "").strip()
        if not content:
            return {"reply": "⚠️ 修改失败：AI 未能生成修改内容", "steps": [{"agent": "记忆管理", "status": "done", "detail": "解析失败"}]}
    except Exception as e:
        return {"reply": f"⚠️ 修改失败：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "调用异常"}]}
    # 写回
    try:
        if is_global:
            rows = _pg.execute("SELECT id FROM global_profile LIMIT 1")
            if rows:
                old = _pg.execute("SELECT data FROM global_profile WHERE id=%s", (rows[0]["id"],))
                d2 = _as_dict(old[0]["data"]) if old and old[0]["data"] else {}
                d2[key] = content
                _pg.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (json.dumps(d2, ensure_ascii=False), rows[0]["id"]))
            else:
                _pg.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", (session_id or "default", json.dumps({key: content}, ensure_ascii=False)))
        else:
            newv: object = content
            if key in ["偏好", "知识点", "难点", "薄弱点", "兴趣"]:
                newv = [s.strip() for s in re.split(r"[,，、\n]+", content) if s.strip()]
            rows = _pg.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
            if rows:
                d2 = _as_dict(rows[0]["data"]) if rows[0]["data"] else {}
                d2[key] = newv
                _pg.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (json.dumps(d2, ensure_ascii=False), project_id))
            else:
                _pg.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", (session_id or "default", project_id, json.dumps({key: newv}, ensure_ascii=False)))
    except Exception as e:
        return {"reply": f"⚠️ 修改失败（写入）：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "写入异常"}]}
    return {"reply": f"✅ 已更新记忆模块「{key}」\n\n**修改理由**：{reason}\n\n**新内容**：\n{content}", "steps": [{"agent": "记忆管理", "status": "done", "detail": f"分析并更新「{key}」"}]}


@app.post("/api/memory-chat")
async def memory_chat(req: ChatRequest):
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    import json
    from core.postgres_client import pg_client
    from core.memory_analysis import _as_dict
    pid = (req.project_id or "").strip()
    if not pid or pid == "global":
        pid = "global"
        rows = pg_client.execute("SELECT id, data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
    else:
        rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]
    prompt = (
        "你是记忆更新助手。以下是当前记忆字段，以及用户想要修改的内容。"
        "请只输出 JSON：{\"update\": {字段名: 新值}, \"reply\": \"一句话确认（说明更新了哪些字段；若无变更则说明原因）\"}\n"
        "规则：字段名只能是：" + "、".join(ALLOW) + "。数组字段（偏好/知识点/难点/薄弱点/兴趣）给字符串数组，其余给字符串。"
        "用户没有提到的字段不要出现在 update 中；若用户只是询问，update 可为空对象。\n"
        f"当前记忆：{json.dumps(mem, ensure_ascii=False)}\n"
        f"用户输入：{req.message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (req.api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=90)
        if resp.status_code != 200:
            return {"reply": "⚠️ 记忆更新失败：模型调用出错（检查 API Key 是否有效）。"}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = _extract_json_obj(raw)
        if not d:
            return {"reply": "⚠️ 没有理解你的输入，请换一种说法，例如：「学习目标改为掌握 RAG 原理」。"}
        update = d.get("update") if isinstance(d.get("update"), dict) else {}
        reply = str(d.get("reply") or "已处理。")
        changed = []
        if update:
            merged = dict(mem)
            for k, v in update.items():
                if k in ALLOW and v not in (None, ""):
                    merged[k] = v
                    changed.append(k)
            if changed:
                if pid == "global":
                    rows = pg_client.execute("SELECT id FROM global_profile LIMIT 1")
                    if rows:
                        pg_client.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                                          (json.dumps(merged, ensure_ascii=False), rows[0]["id"]))
                    else:
                        pg_client.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)",
                                          ("default", json.dumps(merged, ensure_ascii=False)))
                else:
                    _rows = pg_client.execute("SELECT session_id FROM project_memories WHERE project_id=%s", (pid,))
                    if _rows:
                        pg_client.execute(
                            "UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                            (json.dumps(merged, ensure_ascii=False), pid))
                    else:
                        pg_client.execute(
                            "INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)",
                            ("project", pid, json.dumps(merged, ensure_ascii=False)))
        if not changed and not reply.strip():
            reply = "⚠️ 没有需要更新的字段。"
        return {"reply": reply, "changed": changed}
    except Exception as e:
        return {"reply": f"⚠️ 记忆更新失败：{str(e)[:120]}"}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    async def stream():
        try:
            from agents.graph import create_workflow
            import queue, threading, asyncio
            token_queue = queue.Queue()
            import sys as _s
            _s.stderr.write(f"[chat-dbg] api_key_len={len(req.api_key or '')} model={req.model} base_url={req.base_url}\n"); _s.stderr.flush()

            _seen_agents = set()

            def on_token(agent_name: str, chunk: str):
                if agent_name not in _seen_agents:
                    _seen_agents.add(agent_name)
                    token_queue.put(("step", agent_name))
                token_queue.put(("token", agent_name, chunk))

            def run_workflow():
                try:
                    # Auto / 模型 Auto：AI 读取输入自动推断设置（模型 Auto 同时推断模型）
                    _settings = dict(req.settings or {})
                    _model = req.model
                    _tpl0 = _settings.get("template") or "基础"
                    if _settings.get("modelAuto") or _settings.get("auto"):
                        _auto = _auto_settings(req.api_key, req.message, _tpl0, infer_model=bool(_settings.get("modelAuto")))
                        if _auto:
                            _settings.update(_auto)
                            if _auto.get("model"):
                                _model = _auto["model"]
                    # 模板模式：按所选模板调整 agents（基础 = 不调整）
                    _tpl = _settings.get("template") or "基础"
                    _agents = _apply_template(req.agents, _tpl)
                    wf = create_workflow(req.api_key, _settings, on_token, model=_model, base_url=req.base_url, agents=_agents)
                    pid = req.project_id or "default"
                    _did = req.dialogue_id or "default"
                    # 先存用户消息（invoke 时 generate_node 才能读到）
                    try:
                        from core.postgres_client import pg_client as _pg
                        _exist=_pg.execute("SELECT id FROM dialogues WHERE id=%s",(_did,))
                        if not _exist:
                            _pg.execute("INSERT INTO dialogues(id,project_id,session_id,name) VALUES(%s,%s,%s,%s)",(_did,pid,req.session_id or "default","新对话"))
                        _pg.execute("INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",(_did,"user",req.message))
                    except Exception as _e:
                        print("[存储]",_e)
                    # 记忆修改分支：[模块名] 引用 → 由 AI 分析修改记忆，不走多 Agent 流程
                    try:
                        _edit = _memory_edit(req.api_key, req.message, pid, req.session_id or "default")
                    except Exception as _e:
                        _edit = None
                        print("[记忆修改]", _e)
                    if _edit:
                        _reply2 = _edit["reply"]
                        try:
                            from core.postgres_client import pg_client as _pg2
                            _pg2.execute("INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)", (_did, "assistant", _reply2, ""))
                        except Exception as _e:
                            print("[存储]", _e)
                        token_queue.put(("done", {"final_reply": _reply2, "steps": _edit["steps"], "mindchain": [], "task_stats": {}}))
                        return
                    result = wf.invoke({"user_input": req.message, "project_id": pid, "dialogue_id": _did, "session_id": req.session_id or "default", "mode": req.mode or "kb", "image": req.image or "", "steps": [], "mindchain": []})
                    # 记录本次任务的运行统计（Agent 界面·运行监控）
                    try:
                        import json as _json
                        from core.postgres_client import pg_client as _pg2
                        _ts = result.get("task_stats") or {}
                        if _ts:
                            _pg2.execute("INSERT INTO task_stats(project_id,dialogue_id,data) VALUES(%s,%s,%s)",
                                         (pid, _did, _json.dumps(_ts, ensure_ascii=False)))
                    except Exception as _e:
                        print("[task_stats]", _e)
                    # invoke 后存 AI 回复（含思维链 mindchain 落库，刷新后保留）
                    try:
                        from core.postgres_client import pg_client as _pg
                        _reply=result.get("final_reply","")
                        if _reply:
                            _think = _json.dumps(result.get("mindchain") or [], ensure_ascii=False)
                            _pg.execute("INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)",(_did,"assistant",_reply,_think))
                    except Exception as _e:
                        print("[存储]",_e)
                    # 自动保存生成物到"我的上传"（设置开关 autoSaveResource）
                    if req.settings and req.settings.get('autoSaveResource') and result.get("final_reply"):
                        try:
                            import hashlib as _hl
                            from core.postgres_client import pg_client as _pg3
                            _fr = result.get("final_reply","")
                            _nm = "对话生成·" + _fr.strip()[:14]
                            _rid = _hl.md5((_nm + pid).encode()).hexdigest()[:16]
                            _has = _pg3.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
                            if _has:
                                _pg3.execute("UPDATE resources SET content=%s WHERE id=%s", (_fr[:6000], _rid))
                            else:
                                _pg3.execute("INSERT INTO resources (id, name, content, project_id) VALUES (%s,%s,%s,%s)", (_rid, _nm, _fr[:6000], pid))
                        except Exception as _e:
                            print("[auto-save]", _e)
                    token_queue.put(("done", result))
                    # 后台异步分析记忆 + 生成追问（开关可配）
                    try:
                        reply = result.get("final_reply", "")
                        import sys as _s
                        _s.stderr.write("[mem] reply_len="+str(len(reply or ""))+chr(10));_s.stderr.flush()
                        if reply:
                            from core.memory_analysis import update_memories
                            from core.postgres_client import pg_client
                            import threading
                            threading.Thread(target=update_memories, args=(req.api_key, pid, _did, pg_client, req.session_id or "default"), daemon=True).start()
                            if not (req.settings and req.settings.get('autoFollowups') is False):
                                from core.followups import generate_followups
                                threading.Thread(target=generate_followups, args=(req.api_key, pid, _did, pg_client), daemon=True).start()
                    except Exception as e:
                        print("[记忆] err:", e)
                except Exception as e:
                    token_queue.put(("error", str(e)))

            threading.Thread(target=run_workflow, daemon=True).start()
            yield f"data: {json.dumps({'type': 'start'})}\n\n"
            while True:
                try:
                    msg = token_queue.get(timeout=0.05)
                except queue.Empty:
                    # 心跳：空闲期保持连接活跃（前端按首字节/空闲超时判定，避免被误判为无响应）
                    await asyncio.sleep(0.05)
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    continue
                if msg[0] == "step":
                    yield f"data: {json.dumps({'type': 'step', 'agent': msg[1]})}\n\n"
                elif msg[0] == "token":
                    _, agent, chunk = msg
                    yield f"data: {json.dumps({'type': 'thought_token', 'agent': agent, 'chunk': chunk})}\n\n"
                elif msg[0] == "done":
                    result = msg[1]
                    yield f"data: {json.dumps({'type': 'done', 'reply': result.get('final_reply', '处理完成'), 'steps': result.get('steps', []), 'mindchain': result.get('mindchain', []), 'task_stats': result.get('task_stats', {})})}\n\n"
                    break
                elif msg[0] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': msg[1]})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
