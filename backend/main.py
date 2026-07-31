"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import asynccontextmanager
from fastapi import FastAPI
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
    settings: dict | None = None

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
                            _pg.execute("INSERT INTO dialogues(id,project_id,name) VALUES(%s,%s,%s)",(_did,pid,"新对话"))
                        _pg.execute("INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",(_did,"user",req.message))
                    except Exception as _e:
                        print("[存储]",_e)
                    result = wf.invoke({"user_input": req.message, "project_id": pid, "dialogue_id": _did, "session_id": req.session_id or "default", "steps": [], "mindchain": []})
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
                        if reply:
                            from core.memory_analysis import update_memories
                            from core.postgres_client import pg_client
                            import threading
                            threading.Thread(target=update_memories, args=(req.api_key, pid, "用户:" + req.message + chr(10) + "AI:" + reply, pg_client, req.session_id or "default"), daemon=True).start()
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
