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
            wf = create_workflow(req.api_key)
            yield f"data: {json.dumps({'type': 'start'})}\n\n"
            # 同步 invoke，分步 yield
            result = wf.invoke({"user_input": req.message, "steps": []})
            for s in result.get("steps", []):
                yield f"data: {json.dumps({'type': 'step', 'agent': s.get('agent', ''), 'status': s.get('status', ''), 'detail': s.get('detail', '')})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'reply': result.get('final_reply', '处理完成'), 'steps': [s for s in result.get('steps', []) if s.get('status') == 'done']})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
