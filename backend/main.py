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


# ---------- API 接口 ----------

class ChatRequest(BaseModel):
    message: str
    project_id: str | None = None
    api_key: str | None = None
    settings: dict | None = None

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None

class ChatResponse(BaseModel):
    reply: str
    steps: list[ChatStep] = []


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
                    result = wf.invoke({"user_input": req.message, "steps": [], "mindchain": []})
                    token_queue.put(("done", result))
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
