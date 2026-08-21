"""从环境变量读取全部配置，统一入口"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    # 智谱 GLM-4V（图片描述入库，多模态）
    ZHIPU_API_KEY: str = os.getenv("ZHIPU_API_KEY", "")
    LLM_MAX_CONCURRENCY: int = int(os.getenv("LLM_MAX_CONCURRENCY", "3"))
    LLM_REQUEST_TIMEOUT: int = int(os.getenv("LLM_REQUEST_TIMEOUT", "120"))
    # 数据目录（SQLite app.db 所在目录）
    SQLITE_DIR: str = os.getenv("SQLITE_DIR", "./data")

    # ── embedding / rerank 后端（统一 Qwen3-VL-Embedding-8B@1024，MRL 实测支持 256~4096）──
    # 配置源唯一：前端设置界面（settings 表）优先，.env 仅作首次默认。切换维度需清空知识库重新入库。
    EMBEDDING_BACKEND: str = os.getenv("EMBEDDING_BACKEND", "api")   # api（唯一后端）
    EMBEDDING_BASE_URL: str = os.getenv("EMBEDDING_BASE_URL", "https://api.siliconflow.cn/v1")
    EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", "")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "Qwen/Qwen3-VL-Embedding-8B")   # 统一向量化模型
    EMBEDDING_LOCAL_MODEL: str = os.getenv("EMBEDDING_LOCAL_MODEL", "")  # 已废弃本地通道，字段保留兼容旧调用
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "1024"))       # Qwen3-VL-Embedding MRL 输出 1024
    RERANK_BACKEND: str = os.getenv("RERANK_BACKEND", "api")         # local | api | none
    RERANK_BASE_URL: str = os.getenv("RERANK_BASE_URL", "")            # 如 https://api.siliconflow.cn/v1
    RERANK_API_KEY: str = os.getenv("RERANK_API_KEY", "")
    RERANK_MODEL: str = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")  # API 重排模型（用户自填）
    RERANK_LOCAL_MODEL: str = os.getenv("RERANK_LOCAL_MODEL", "BAAI/bge-reranker-base")  # 本地重排模型名/路径
    # 图片处理（多模态）：none | api（通用 OpenAI 兼容视觉接口，用户自填地址/key/模型）
    IMAGE_BACKEND: str = os.getenv("IMAGE_BACKEND", "none")
    IMAGE_BASE_URL: str = os.getenv("IMAGE_BASE_URL", "https://open.bigmodel.cn/api/paas/v4/chat/completions")
    IMAGE_API_KEY: str = os.getenv("IMAGE_API_KEY", "")
    IMAGE_MODEL: str = os.getenv("IMAGE_MODEL", "glm-4v-flash")
    # Qwen3-VL-Embedding（视觉/跨模态向量，BGE 卡同级）：文本向量化优先 BGE，此 key 供视觉通道
    VL_API_KEY: str = os.getenv("VL_API_KEY", "")
    VL_MODEL: str = os.getenv("VL_MODEL", "Qwen/Qwen3-VL-Embedding-8B")
    VL_BASE_URL: str = os.getenv("VL_BASE_URL", "https://api.siliconflow.cn/v1")
    # Qwen3-VL-Embedding 输出维度：文本/图片同一模型同一 1024 维空间（MRL 实测）
    VL_EMBEDDING_DIM: int = int(os.getenv("VL_EMBEDDING_DIM", "1024"))
    # 图片描述（多模态对话）：走硅基流动视觉模型（复用硅基流动 key），模型可换
    IMAGE_DESC_MODEL: str = os.getenv("IMAGE_DESC_MODEL", "Qwen/Qwen3.5-4B")
    # 知识库服务档位：light=仅文字向量化+重排；full=再加图片向量化/跨模态检索
    KB_MODE: str = os.getenv("KB_MODE", "full")
    # 独立审核模型（走硅基流动）：开关 + 模型；关闭时审核回退主模型快模型（deepseek v4 flash）
    REVIEW_ENABLED: str = os.getenv("REVIEW_ENABLED", "0")
    REVIEW_MODEL: str = os.getenv("REVIEW_MODEL", "Qwen/Qwen2.5-72B-Instruct")
    # 双 LLM 审核（3.5）：思考档用主模型同系快模型（走用户 key），研究档用独立审核模型（走硅基流动 key）
    REVIEW_MODEL_THINK: str = os.getenv("REVIEW_MODEL_THINK", "deepseek-v4-flash")
    REVIEW_MODEL_RESEARCH: str = os.getenv("REVIEW_MODEL_RESEARCH", "Qwen/Qwen2.5-72B-Instruct")

    # ── 联网代理（可选）：容器访问国外站点（GitHub 等）失败时，配宿主梯子代理 ──
    # 例：PROXY_URL=http://host.docker.internal:7993（宿主梯子监听端口）
    PROXY_URL: str = os.getenv("PROXY_URL", "")


config = Config()
