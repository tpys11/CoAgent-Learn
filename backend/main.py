"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
import json, asyncio

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
            async for chunk in wf.astream({"user_input": req.message, "steps": []}, stream_mode="updates"):
                node_name = list(chunk.keys())[0]
                node_data = chunk[node_name]
                steps = node_data.get("steps", [])
                current = steps[-1] if steps else {"agent": node_name, "status": "running"}
                yield f"data: {json.dumps({'type': 'step', 'agent': current.get('agent', node_name), 'status': current.get('status', 'running'), 'detail': current.get('detail', '')})}\n\n"
                await asyncio.sleep(0)
            # Get final result
            final = wf.invoke({"user_input": req.message, "steps": []})
            yield f"data: {json.dumps({'type': 'done', 'reply': final.get('final_reply', '处理完成'), 'steps': [s for s in final.get('steps', []) if s.get('status') == 'done']})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")
