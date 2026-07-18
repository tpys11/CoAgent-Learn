"""
CoAgent-Learn 后端主入口
FastAPI + 多智能体协同调度 + RAG向量检索
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：校验环境变量
    import os
    required = ["DEEPSEEK_API_KEY"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        raise RuntimeError(f"缺少必需的环境变量: {', '.join(missing)}。请复制 .env.template 为 .env 并填写。")
    yield
    # 关闭时清理


app = FastAPI(
    title="CoAgent-Learn",
    description="领域知识个性化生成与多智能体协同决策系统",
    version="0.1.0",
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
    return {"status": "ok", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
