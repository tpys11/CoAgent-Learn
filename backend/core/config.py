"""从环境变量读取全部配置，统一入口"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    # 智谱（备用厂家通道 key；主对话模型 key 由前端请求携带）
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
    # 图片描述服务已移除（2026-08-22）：主模型 deepseek-v4-flash-vision-exp 自带识图，图片理解统一走主模型
    # Qwen3-VL-Embedding（视觉/跨模态向量，BGE 卡同级）：文本向量化优先 BGE，此 key 供视觉通道
    VL_API_KEY: str = os.getenv("VL_API_KEY", "")
    VL_MODEL: str = os.getenv("VL_MODEL", "Qwen/Qwen3-VL-Embedding-8B")
    VL_BASE_URL: str = os.getenv("VL_BASE_URL", "https://api.siliconflow.cn/v1")
    # Qwen3-VL-Embedding 输出维度：文本/图片同一模型同一 1024 维空间（MRL 实测）
    VL_EMBEDDING_DIM: int = int(os.getenv("VL_EMBEDDING_DIM", "1024"))
    # 知识库服务档位：light=仅文字向量化+重排；full=再加图片向量化/跨模态检索
    KB_MODE: str = os.getenv("KB_MODE", "full")
    # ── 文档解析引擎（PDF 高质量解析，ParsePort）：pymupdf4llm | mineru | mathpix ──
    PARSE_ENGINE: str = os.getenv("PARSE_ENGINE", "pymupdf4llm")
    MINERU_API_TOKEN: str = os.getenv("MINERU_API_TOKEN", "")      # mineru.net 免费申请
    MATHPIX_APP_ID: str = os.getenv("MATHPIX_APP_ID", "")
    MATHPIX_APP_KEY: str = os.getenv("MATHPIX_APP_KEY", "")
    # ── 切块与检索参数（对齐 DeepTutor SentenceSplitter 可配置语义）──
    # 改动仅影响之后入库的内容；已有文档需删除重传才会按新参数重切。
    KB_CHUNK_MODE: str = os.getenv("KB_CHUNK_MODE", "auto")        # window | markdown | auto
    KB_CHUNKER: str = os.getenv("KB_CHUNKER", "self")              # self | llamaindex | semantic（semantic 仅无标题文本生效）
    KB_CHUNK_SIZE: int = int(os.getenv("KB_CHUNK_SIZE", "512"))    # 块大小（字符）
    KB_CHUNK_OVERLAP: int = int(os.getenv("KB_CHUNK_OVERLAP", "50"))  # 相邻块重叠（字符）
    KB_META_ENHANCE: int = int(os.getenv("KB_META_ENHANCE", "1"))  # B1：入库后为每块生成≤3个可答问题存旁路表喂 BM25（0 关）
    KB_KG_EDGES: int = int(os.getenv("KB_KG_EDGES", "1"))          # 闭环五：入库后从标题树推断先修/相关边存 kg_edges（0 关）
    KB_RRF_K: int = int(os.getenv("KB_RRF_K", "60"))               # RRF 融合常数 score=Σ1/(k+rank)
    KB_FETCH_MULT: int = int(os.getenv("KB_FETCH_MULT", "3"))      # 向量/BM25 召回倍数（top_k×此值）
    # 独立审核模型（走硅基流动）：开关 + 模型；关闭时审核回退主模型快模型（deepseek v4 flash）
    REVIEW_ENABLED: str = os.getenv("REVIEW_ENABLED", "0")
    REVIEW_MODEL: str = os.getenv("REVIEW_MODEL", "Qwen/Qwen2.5-72B-Instruct")
    # 审核判卷模型覆盖（3.5 双 LLM 审核）：空=跟随 core/model_provider.MODEL_MAIN 单一事实源；
    # 研究档可设硅基流动模型名（含"/"，如 Qwen/Qwen2.5-72B-Instruct）+ 设置里配硅基流动 key → 跨厂商判卷
    REVIEW_MODEL_THINK: str = os.getenv("REVIEW_MODEL_THINK", "")
    REVIEW_MODEL_RESEARCH: str = os.getenv("REVIEW_MODEL_RESEARCH", "")

    # ── 联网代理（可选）：容器访问国外站点（GitHub 等）失败时，配宿主梯子代理 ──
    # 例：PROXY_URL=http://host.docker.internal:7993（宿主梯子监听端口）
    PROXY_URL: str = os.getenv("PROXY_URL", "")


config = Config()
