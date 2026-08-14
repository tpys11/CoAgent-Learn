"""从环境变量读取全部配置，统一入口"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    LLM_MAX_CONCURRENCY: int = int(os.getenv("LLM_MAX_CONCURRENCY", "3"))
    LLM_REQUEST_TIMEOUT: int = int(os.getenv("LLM_REQUEST_TIMEOUT", "120"))
    # 数据目录（SQLite app.db 所在目录）
    SQLITE_DIR: str = os.getenv("SQLITE_DIR", "./data")
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://guashuai-neo4j:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "neo4j123")

    # ── embedding / rerank 后端（local=本地模型，api=OpenAI 兼容服务，如硅基流动）──
    # 切换方式：在 .env 里改 EMBEDDING_BACKEND=api 并填 API key 即可无缝切换；
    # 注意 API embedding 维度（如 bge-m3=1024）与本地 bge-small-zh=512 不同，
    # 切换后需清空知识库重新入库（向量表维度固定）。
    EMBEDDING_BACKEND: str = os.getenv("EMBEDDING_BACKEND", "local")   # local | api
    EMBEDDING_BASE_URL: str = os.getenv("EMBEDDING_BASE_URL", "")      # 如 https://api.siliconflow.cn/v1
    EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", "")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "1024"))       # bge-m3=1024
    RERANK_BACKEND: str = os.getenv("RERANK_BACKEND", "local")         # local | api | none
    RERANK_BASE_URL: str = os.getenv("RERANK_BASE_URL", "")            # 如 https://api.siliconflow.cn/v1
    RERANK_API_KEY: str = os.getenv("RERANK_API_KEY", "")
    RERANK_MODEL: str = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")

    # ── 联网代理（可选）：容器访问国外站点（GitHub 等）失败时，配宿主梯子代理 ──
    # 例：PROXY_URL=http://host.docker.internal:7993（宿主梯子监听端口）
    PROXY_URL: str = os.getenv("PROXY_URL", "")


config = Config()
