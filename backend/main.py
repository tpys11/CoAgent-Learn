"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
前端由独立的 React 应用提供服务
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

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
    version="0.2.0",
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
    return {"status": "ok", "version": "0.2.0"}


# ---------- API 接口 ----------

class ChatRequest(BaseModel):
    message: str
    project_id: str | None = None

class ChatResponse(BaseModel):
    reply: str

@app.post("/api/chat")
async def chat(req: ChatRequest) -> ChatResponse:
    """对话接口 — Agent 功能接入后由 LangGraph 编排处理"""
    return ChatResponse(
        reply=f"收到你的问题：「{req.message}」\n\nAgent 功能即将接入。"
    )
