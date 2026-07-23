"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
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

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None

class ChatResponse(BaseModel):
    reply: str
    steps: list[ChatStep] = []


@app.post("/api/chat")
async def chat(req: ChatRequest) -> ChatResponse:
    try:
        from agents.graph import workflow
        result = workflow.invoke({"user_input": req.message, "steps": []})
        steps = [ChatStep(**s) for s in result.get("steps", []) if s.get("status") == "done"]
        return ChatResponse(reply=result.get("final_reply", "处理完成"), steps=steps)
    except Exception as e:
        return ChatResponse(
            reply=f"抱歉，系统处理时出现错误：{str(e)}。请检查 DEEPSEEK_API_KEY 是否已配置。",
            steps=[ChatStep(agent="系统", status="error", detail=str(e))]
        )
