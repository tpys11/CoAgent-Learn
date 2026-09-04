"""从环境变量读取全部配置，统一入口"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    # C2 09-04：ZHIPU_API_KEY 随标准档 zhipu 主对话整体清除（owner 拍板「彻底没用了」）；
    # zai 测试通道走下方 ZAI_API_KEY（独立配置），互不相干
    LLM_MAX_CONCURRENCY: int = int(os.getenv("LLM_MAX_CONCURRENCY", "3"))
    LLM_REQUEST_TIMEOUT: int = int(os.getenv("LLM_REQUEST_TIMEOUT", "120"))
    # 数据目录（SQLite app.db 所在目录）
    SQLITE_DIR: str = os.getenv("SQLITE_DIR", "./data")

    # ── embedding / rerank 后端（统一 Qwen3-VL-Embedding-8B@1024，MRL 实测支持 256~4096）──
    # 配置源唯一：前端设置界面（settings 表）优先，.env 仅作首次默认。切换维度需清空知识库重新入库。
    # F5（2026-08-30）：EMBEDDING_BACKEND / EMBEDDING_LOCAL_MODEL / RERANK_LOCAL_MODEL 已删除——
    # 向量化统一走 API，路由判定简化为「有没有 EMBEDDING_API_KEY」；RERANK_BACKEND 收敛为 api | none。
    EMBEDDING_BASE_URL: str = os.getenv("EMBEDDING_BASE_URL", "https://api.siliconflow.cn/v1")
    EMBEDDING_API_KEY: str = os.getenv("EMBEDDING_API_KEY", "")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "Qwen/Qwen3-VL-Embedding-8B")   # 统一向量化模型
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", "1024"))       # Qwen3-VL-Embedding MRL 输出 1024
    RERANK_BACKEND: str = os.getenv("RERANK_BACKEND", "api")         # api | none
    RERANK_BASE_URL: str = os.getenv("RERANK_BASE_URL", "")            # 如 https://api.siliconflow.cn/v1
    RERANK_API_KEY: str = os.getenv("RERANK_API_KEY", "")
    RERANK_MODEL: str = os.getenv("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")  # API 重排模型（用户自填）
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
    KB_LLM_OUTLINE: int = int(os.getenv("KB_LLM_OUTLINE", "1"))    # F9-S1：无书签且无标题行时 LLM 兜底提取大纲（0 关；有前两通道永不触发）
    KB_RRF_K: int = int(os.getenv("KB_RRF_K", "60"))               # RRF 融合常数 score=Σ1/(k+rank)
    KB_FETCH_MULT: int = int(os.getenv("KB_FETCH_MULT", "3"))      # 向量/BM25 召回倍数（top_k×此值）
    # 独立审核模型（走硅基流动）：开关 + 模型；关闭时审核回退主模型快模型（deepseek v4 flash）
    REVIEW_ENABLED: str = os.getenv("REVIEW_ENABLED", "0")
    # RA-S1：审核子开关「关=审核时用主模型」——T51 空串不覆写，关闭语义无法写
    # REVIEW_MODEL_RESEARCH=''（会被吞掉=假关闭），故用独立布尔键承载（'1'=判卷直接用主模型）
    REVIEW_FOLLOW_MAIN: str = os.getenv("REVIEW_FOLLOW_MAIN", "0")
    REVIEW_MODEL: str = os.getenv("REVIEW_MODEL", "Qwen/Qwen2.5-72B-Instruct")
    # 审核判卷模型覆盖（3.5 双 LLM 审核）：空=跟随 core/model_provider.MODEL_MAIN 单一事实源；
    # 研究档可设硅基流动模型名（含"/"，如 Qwen/Qwen2.5-72B-Instruct）+ 设置里配硅基流动 key → 跨厂商判卷
    REVIEW_MODEL_THINK: str = os.getenv("REVIEW_MODEL_THINK", "")
    REVIEW_MODEL_RESEARCH: str = os.getenv("REVIEW_MODEL_RESEARCH", "")

    # ── OpenCode Zen（F14）：OpenAI 兼容网关，免费模型限时轮换（/models 动态拉取+名单兜底）──
    # 免费档隐私：免费期内部分模型数据可能被用于模型改进——UI 必须提示（ZenProviderCard 文案）。
    # Zen 不提供 embedding：embedding 仍走硅基流动（EMBEDDING_*）。
    ZEN_BASE_URL: str = os.getenv("ZEN_BASE_URL", "https://opencode.ai/zen/v1")
    ZEN_API_KEY: str = os.getenv("ZEN_API_KEY", "")
    ZEN_MODEL_MAIN: str = os.getenv("ZEN_MODEL_MAIN", "deepseek-v4-flash-free")   # 主对话免费默认（轮换时 UI 下拉改）
    ZEN_MODEL_REVIEW: str = os.getenv("ZEN_MODEL_REVIEW", "")                      # 空=审核不指定 Zen 模型
    # R-D S1：测试档全局开关（'1'=后台链路走 test 档语义，决策 38）；S4 起设置页 PUT/GET 透传
    ZEN_TEST_MODE: str = os.getenv("ZEN_TEST_MODE", "0")

    # ── GO 通道（owner 09-04 拍板）：zen 网关 go 计划子通道，与 zen 上下并列的第二测试通道 ──
    # 主对话 glm-5.3-flash / 审核 qwen3.8-flash（model_provider MODEL_GO_* 定值，S6 实测 200 通）；
    # 端点默认=zen go 计划（S6 实测同一 Bearer 鉴权复用 ZEN_API_KEY——key 空时 or 链兜底，零配置可开）
    GO_BASE_URL: str = os.getenv("GO_BASE_URL", "https://opencode.ai/zen/go/v1")
    GO_API_KEY: str = os.getenv("GO_API_KEY", "")
    # 测试态通道定向（ZEN_TEST_MODE='1' 时生效）：'zen'→test 档 / 'go'→go 档 / 'zai'→zai 档；默认 zen 兼容旧语义
    TEST_CHANNEL: str = os.getenv("TEST_CHANNEL", "zen")

    # ── Z.AI 通道（owner 09-04 拍板）：智谱 bigmodel 官方端点，与 zen/go 并列的第三测试通道 ──
    # 主模型与审核模型均 glm-4.7（owner 指定同模型自审，专用记忆机制测试——防自我包庇设计在
    # 此通道不适用，如实备案）；OpenAI chat/completions 兼容+标准 Bearer（官方文档实测核对）
    ZAI_BASE_URL: str = os.getenv("ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    ZAI_API_KEY: str = os.getenv("ZAI_API_KEY", "")

    # ── 联网代理（可选）：容器访问国外站点（GitHub 等）失败时，配宿主梯子代理 ──
    # 例：PROXY_URL=http://host.docker.internal:7993（宿主梯子监听端口）
    PROXY_URL: str = os.getenv("PROXY_URL", "")


config = Config()
