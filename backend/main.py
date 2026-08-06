"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
"""
import sys, os
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

@app.get("/api/global-profile")
async def get_global_profile(session_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM global_profile WHERE session_id = %s", (session_id,))
    return {"profile": rows[0]["data"] if rows else {}}

@app.get("/api/project-memory/{project_id}")
async def get_project_memory(project_id: str, session_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT data FROM project_memories WHERE session_id = %s AND project_id = %s", (session_id, project_id))
    return {"memory": rows[0]["data"] if rows else {}}



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


@app.post("/api/file-to-text")
async def file_to_text(file: UploadFile = File(...)):
    from core.file_parser import parse_file
    data = await file.read()
    text = parse_file(file.filename or "file", data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容"}
    return {"status": "ok", "text": text[:50000], "chars": len(text)}


@app.post("/api/vision")
async def vision_understand(req: dict):
    from core.vision_service import describe_image
    image = req.get("image", "")
    prompt = req.get("prompt", "请描述这张图片的内容")
    desc = describe_image(image, prompt)
    return {"status": "ok", "description": desc}


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
    rows = pg_client.execute("SELECT id, name, content FROM resources WHERE project_id=%s ORDER BY created_at", (project_id,))
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


# ---------- 画像 API ----------

class ProfileData(BaseModel):
    profile: dict = {}


@app.post("/api/projects/{pid}/profile")
async def save_project_profile(pid: str, req: ProfileData):
    import json
    from core.postgres_client import pg_client
    # 项目画像存 project_memories（session 用 project 维度）
    has = pg_client.execute("SELECT project_id FROM project_memories WHERE project_id=%s", (pid,))
    data = json.dumps(req.profile, ensure_ascii=False)
    if has:
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
    # 汇总对话画像进项目画像
    try:
        rows = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (pid,))
        proj = dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        for k, v in req.profile.items():
            if v and k not in proj:
                proj[k] = v
        # 记录该项目下有哪些对话
        dlist = proj.get("dialogues", [])
        if did not in dlist:
            dlist.append(did)
        proj["dialogues"] = dlist
        proj["topic_summary"] = req.profile.get("topic", proj.get("topic_summary", ""))
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


@app.get("/api/projects")
async def list_projects():
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id, name, is_default, domain, created_at FROM projects WHERE archived = FALSE ORDER BY created_at")
    return {"projects": rows}


@app.post("/api/projects")
async def create_project(req: ProjectCreate):
    import time
    from core.postgres_client import pg_client
    pid = time.strftime("%Y%m%d%H%M%S") + str(int(time.time() * 1000))[-4:]
    pg_client.execute("INSERT INTO projects (id, name, is_default, domain) VALUES (%s,%s,%s,%s)",
                      (pid, req.name, False, req.domain))
    return {"id": pid, "name": req.name, "is_default": False, "domain": req.domain}


@app.patch("/api/projects/{pid}")
async def update_project(pid: str, req: ProjectCreate):
    from core.postgres_client import pg_client
    pg_client.execute("UPDATE projects SET name=%s, domain=%s WHERE id=%s", (req.name, req.domain, pid))
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
    # 删知识库（Chroma）
    kb_deleted = 0
    try:
        import chromadb
        client = chromadb.HttpClient(host="guashuai-chroma", port=8000)
        try:
            client.delete_collection("kb_" + pid)
            kb_deleted = 1
        except Exception:
            pass
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


@app.delete("/api/dialogues/{did}")
async def delete_dialogue(did: str):
    """级联删除对话：消息+对话画像"""
    from core.postgres_client import pg_client
    pg_client.execute("DELETE FROM messages WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogue_memories WHERE dialogue_id=%s", (did,))
    pg_client.execute("DELETE FROM dialogues WHERE id=%s", (did,))
    return {"status": "ok"}


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
    session_id: str | None = None
    dialogue_id: str | None = None
    project_id: str | None = None
    api_key: str | None = None
    settings: dict | None = None
    mode: str | None = None

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None



@app.post("/api/chat")
async def chat(req: ChatRequest):
    async def stream():
        try:
            from agents.graph import create_workflow
            import queue, threading, asyncio
            token_queue = queue.Queue()

            def on_token(agent_name: str, chunk: str):
                token_queue.put(("token", agent_name, chunk))

            def run_workflow():
                try:
                    wf = create_workflow(req.api_key, req.settings, on_token)
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
                    result = wf.invoke({"user_input": req.message, "project_id": pid, "dialogue_id": _did, "session_id": req.session_id or "default", "mode": req.mode or "kb", "steps": [], "mindchain": []})
                    # invoke 后存 AI 回复
                    try:
                        from core.postgres_client import pg_client as _pg
                        _reply=result.get("final_reply","")
                        if _reply:
                            _pg.execute("INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",(_did,"assistant",_reply))
                    except Exception as _e:
                        print("[存储]",_e)
                    token_queue.put(("done", result))
                    # 后台异步分析记忆
                    try:
                        reply = result.get("final_reply", "")
                        import sys as _s
                        _s.stderr.write("[mem] reply_len="+str(len(reply or ""))+chr(10));_s.stderr.flush()
                        if reply:
                            from core.memory_analysis import update_memories
                            from core.postgres_client import pg_client
                            import threading
                            threading.Thread(target=update_memories, args=(req.api_key, pid, _did, pg_client, req.session_id or "default"), daemon=True).start()
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
                    await asyncio.sleep(0.05)
                    continue
                if msg[0] == "token":
                    _, agent, chunk = msg
                    yield f"data: {json.dumps({'type': 'thought_token', 'agent': agent, 'chunk': chunk})}\n\n"
                elif msg[0] == "done":
                    result = msg[1]
                    yield f"data: {json.dumps({'type': 'done', 'reply': result.get('final_reply', '处理完成')})}\n\n"
                    break
                elif msg[0] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': msg[1]})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
