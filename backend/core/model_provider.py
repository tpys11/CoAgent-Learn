# -*- coding: utf-8 -*-
"""统一模型 provider 配置（先只做配置层抽象，后续逐步把调用方切过来）。

主模型：DeepSeek（key 由前端请求携带/设置→基础填）；DeepSeek 默认视觉版 deepseek-v4-flash-vision-exp。
辅助模型：硅基流动（embedding / rerank / VL / review），在设置→AI 服务配。图片理解由视觉主模型直接处理。
（C2 09-04：标准档 zhipu 主对话遗留已整体清除——owner 拍板「彻底没用了」；zai 测试通道走
  ZAI_* 独立配置与 bigmodel 端点，与此处无关。）
"""
from core.config import config

# ── DeepSeek 模型名单一事实源（换模型只改这里）──
MODEL_PRO = "deepseek-v4-pro"
MODEL_MAIN = "deepseek-v4-flash-vision-exp"   # 主对话/生成/审核默认（视觉版）
MODEL_FAST = MODEL_MAIN                        # 轻调用道（规划/分类/学情/追问/记忆），当前跟随主模型


# 快模型映射（按 base_url 域名自动解析；映射不到则与主模型一致）
# C2 09-04：open.bigmodel.cn 条目随标准档 zhipu 主对话一并清除（zai 测试通道走 ZAI_* 独立配置不经此表）
FAST_MODEL_BY_BASE = {
    "api.deepseek.com": MODEL_FAST,
}


class ModelProvider:
    """统一读取主模型与辅助模型配置。"""

    def __init__(self, api_key=None, model=None, base_url=None):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url

    @property
    def fast_model(self):
        if not self.base_url:
            return None
        for host, fm in FAST_MODEL_BY_BASE.items():
            if host in self.base_url:
                return fm
        return None

    def embedding(self):
        return {
            "base_url": config.EMBEDDING_BASE_URL,
            "model": config.EMBEDDING_MODEL,
            "key": config.EMBEDDING_API_KEY,
            "dim": int(getattr(config, "EMBEDDING_DIM", 1024)),
        }

    def rerank(self):
        return {
            "base_url": config.RERANK_BASE_URL or config.EMBEDDING_BASE_URL,
            "model": config.RERANK_MODEL,
            "key": config.RERANK_API_KEY or config.EMBEDDING_API_KEY,
        }

    def vl(self):
        return {
            "base_url": config.VL_BASE_URL,
            "model": config.VL_MODEL,
            "key": config.VL_API_KEY or config.EMBEDDING_API_KEY,
            "dim": int(getattr(config, "VL_EMBEDDING_DIM", 4096)),
        }

    def review(self):
        return {
            "enabled": str(getattr(config, "REVIEW_ENABLED", "0")) == "1",
            "base_url": config.VL_BASE_URL,
            "model": config.REVIEW_MODEL,
            "key": config.EMBEDDING_API_KEY or self.api_key,
        }


def get_model_provider(api_key=None, model=None, base_url=None) -> ModelProvider:
    return ModelProvider(api_key=api_key, model=model, base_url=base_url)


# ══ R-D S1：ModelRegistry（角色×档位注册表）══════════════════════════════════
# 设计对齐 OpenCode 多提供商骨架（注册表+角色解析：调用点只声明「角色=干什么」，
# 「用哪家模型/端点/key」由矩阵统一决策——换模型=改一格）；保留本项目独有的档位维度
# （standard/test，决策 38：测试档除专有能力外全链 zen）。
# 格语义：{provider, model|model_key, base_url_key, api_key_key|api_key_keys}——
#   model 为字面量实名；model_key 表示运行时读 config 同名键（embedding/rerank 用户自填）；
#   api_key_keys 为 or 链（首个非空生效，写进格定义保标准档 key 前序逐字节等价）。
# RC4-S1（owner 09-03 终版）：review=定值格档位定死——standard=SF Qwen2.5-72B（跨厂商
# 独立判卷）、test=zen big-pickle；_review_dynamic 动态格删除（follow_main/REVIEW_MODEL_*
# 设置项退役）。VL||EMBEDDING、ZEN||req 的 key 兜底仍在调用方 pick_judge（可用性判定不入纯函数）。
# parse 非 LLM 不入矩阵（mineru 通道不经此表）。

import dataclasses


@dataclasses.dataclass(frozen=True)
class ModelSpec:
    """注册表解析产物：一格的运行时值。key 可用性副作用归调用方 pick_judge。"""
    model: str
    base_url: str
    api_key: str
    provider: str = "main"


# embedding/rerank 两格两档共用同一 cell 引用=决策 38「专有能力留 SF，test 格沿用 standard」
_EMBEDDING_CELL = {"provider": "siliconflow", "model_key": "EMBEDDING_MODEL",
                   "base_url_key": "EMBEDDING_BASE_URL", "api_key_key": "EMBEDDING_API_KEY"}
_RERANK_CELL = {"provider": "siliconflow", "model_key": "RERANK_MODEL",
                "base_url_key": "RERANK_BASE_URL",
                "api_key_keys": ("RERANK_API_KEY", "EMBEDDING_API_KEY")}

# 决策 38 测试档对话/视觉实名（smoke2 对齐 Zen API ID：显示名≠API ID 会 401）
MODEL_ZEN_TEST = "mimo-v2.5-free"
# RC4-S1（owner 09-03 终版）：判卷两格实名定值——换判卷模型=改这两行（改一格机制）
MODEL_REVIEW_SF = "Qwen/Qwen2.5-72B-Instruct"   # 标准档：SF 跨厂商独立判卷
MODEL_ZEN_REVIEW = "big-pickle"                 # 测试档：zen 免费档判卷（与前端 models.ts 双源同值）
# S1（owner 09-04 拍板）：go 第二测试通道——zen 网关 go 计划子通道（S6 实测校正：owner 截图
# 提供确切 API ID=小写 glm-5.3-flash / qwen3.8-flash，且双模型实测 chat/completions 200 通）。
# 换 API ID=改这两行常量+前端镜像 models.ts+两处测试钉字（双源同值守卫会逼同步）
MODEL_GO_MAIN = "glm-5.3-flash"
MODEL_GO_REVIEW = "qwen3.8-flash"

# review 定值格 key=单键（VL_API_KEY / ZEN_API_KEY / GO_API_KEY）；调用方 pick_judge 持有 or 兜底链
_REVIEW_SF_CELL = {"provider": "siliconflow", "model": MODEL_REVIEW_SF,
                   "base_url_key": "VL_BASE_URL", "api_key_key": "VL_API_KEY"}
_REVIEW_ZEN_CELL = {"provider": "zen", "model": MODEL_ZEN_REVIEW,
                    "base_url_key": "ZEN_BASE_URL", "api_key_key": "ZEN_API_KEY"}
# go 格 base_url_key=GO_BASE_URL（config 默认=zen go 计划端点）——detect_tier 按「req.base_url==GO_BASE_URL」判定。
# key=单键 GO_API_KEY（独立通道不复用 ZEN_API_KEY——owner 拍板三通道互相隔离，内容同值也各自持键）
_GO_CELL_MAIN = {"provider": "go", "model": MODEL_GO_MAIN,
                 "base_url_key": "GO_BASE_URL", "api_key_keys": ("GO_API_KEY",)}
_GO_CELL_REVIEW = {"provider": "go", "model": MODEL_GO_REVIEW,
                   "base_url_key": "GO_BASE_URL", "api_key_keys": ("GO_API_KEY",)}
# zai 格（owner 09-04 拍板）：智谱 bigmodel 官方端点——主模型与审核模型均 glm-4.7（同模型自审，
# 专用记忆机制测试，防自我包庇设计在此通道不适用=owner 明示取舍）；key 独立无兜底（ZAI_API_KEY）
MODEL_ZAI_MAIN = "glm-4.7"
MODEL_ZAI_REVIEW = "glm-4.7"
_ZAI_CELL = {"provider": "zai", "model": MODEL_ZAI_MAIN,
             "base_url_key": "ZAI_BASE_URL", "api_key_key": "ZAI_API_KEY"}

REGISTRY: dict = {
    "standard": {
        "main":      {"provider": "main", "model": MODEL_MAIN,
                      "base_url_key": "DEEPSEEK_BASE_URL", "api_key_key": "DEEPSEEK_API_KEY"},
        "fast":      {"provider": "main", "model": MODEL_FAST,
                      "base_url_key": "DEEPSEEK_BASE_URL", "api_key_key": "DEEPSEEK_API_KEY"},
        "review":    _REVIEW_SF_CELL,
        "embedding": _EMBEDDING_CELL,
        "rerank":    _RERANK_CELL,
        "vision":    {"provider": "main", "model": MODEL_MAIN,
                      "base_url_key": "DEEPSEEK_BASE_URL", "api_key_key": "DEEPSEEK_API_KEY"},
    },
    "test": {
        "main":      {"provider": "zen", "model": MODEL_ZEN_TEST,
                      "base_url_key": "ZEN_BASE_URL", "api_key_key": "ZEN_API_KEY"},
        "fast":      {"provider": "zen", "model": MODEL_ZEN_TEST,
                      "base_url_key": "ZEN_BASE_URL", "api_key_key": "ZEN_API_KEY"},
        "review":    _REVIEW_ZEN_CELL,
        "embedding": _EMBEDDING_CELL,
        "rerank":    _RERANK_CELL,
        "vision":    {"provider": "zen", "model": MODEL_ZEN_TEST,
                      "base_url_key": "ZEN_BASE_URL", "api_key_key": "ZEN_API_KEY"},
    },
    # S1：go 测试通道——决策 38 同构（专有能力 embedding/rerank 留 SF），对话/审核全链 go 网关定值
    "go": {
        "main":      _GO_CELL_MAIN,
        "fast":      _GO_CELL_MAIN,
        "review":    _GO_CELL_REVIEW,
        "embedding": _EMBEDDING_CELL,
        "rerank":    _RERANK_CELL,
        "vision":    _GO_CELL_MAIN,
    },
    # C1：zai 测试通道——决策 38 同构；主审同模型 glm-4.7（owner 指定，专用记忆机制测试）
    "zai": {
        "main":      _ZAI_CELL,
        "fast":      _ZAI_CELL,
        "review":    _ZAI_CELL,
        "embedding": _EMBEDDING_CELL,
        "rerank":    _RERANK_CELL,
        "vision":    _ZAI_CELL,
    },
}

_TIERS = ("standard", "test", "go", "zai")
_ZEN_URL_MARK = "opencode.ai/zen"   # RC1 先例：req 端点含 Zen 网关标记 → 测试档


def resolve_model(role: str, tier: str, template: str | None = None) -> ModelSpec:
    """注册表唯一解析入口：role=干什么（main/fast/review/embedding/rerank/vision），
    tier=什么环境（standard/test/go——有 req 用 detect_tier(req.base_url)，后台无 req 用 current_tier()）。
    template 参数已退役（RC4-S1 删 _review_dynamic 后无消费者；保留签名防调用点连锁改动）。
    未知 role/tier 直接 raise ValueError——错误配置应响亮失败，防静默错路由。"""
    tier_cell = REGISTRY.get(tier)
    if tier_cell is None:
        raise ValueError(f"未知档位 tier={tier!r}（合法：{list(_TIERS)}）")
    cell = tier_cell.get(role)
    if cell is None:
        raise ValueError(f"未知角色 role={role!r}（合法：{sorted(tier_cell)}；parse 非 LLM 不入矩阵）")
    from core.config import config as _cfg
    model = cell["model"] if "model" in cell else getattr(_cfg, cell["model_key"])
    if "api_key_keys" in cell:
        api_key = next((v for v in (getattr(_cfg, name, "") for name in cell["api_key_keys"]) if v), "")
    else:
        api_key = getattr(_cfg, cell.get("api_key_key", ""), "")
    return ModelSpec(model=model, base_url=getattr(_cfg, cell["base_url_key"]),
                     api_key=api_key, provider=cell.get("provider", "main"))


def resolve_review_route(template: str | None = None) -> dict:
    """R-D S1：判卷路由单一事实源。RC4-S1 契约收敛两键 {"model","provider"}
    （follow_main 随动态格退役删除；template 参数退役保留签名，调用方零连锁改动）。"""
    spec = resolve_model("review", current_tier(), template=template)
    return {"model": spec.model, "provider": spec.provider}


def detect_tier(req_base_url: str | None, req_model: str | None = None) -> str:
    """请求级档位判定：与已配置 GO_BASE_URL 精确相等（尾斜杠容忍）→ go——**必须先于 zen 标记判定**
    （S6：go 端点默认值 https://opencode.ai/zen/go/v1 含 zen 标记子串，先判 zen 会误归 test）；
    与 ZAI_BASE_URL 相等且 req_model==MODEL_ZAI_MAIN → zai——**model 双参缺一不可**（C1：
    zai 默认端点与标准档 zhipu 主对话完全相同，单看 URL 会误判；C2 09-04 zhipu 主对话虽已清除，
    双参判定保留为防御性契约——任何走 bigmodel 端点的非 zai 请求不得误归 zai 档）；
    req.base_url 指向 Zen 网关（含 opencode.ai/zen）→ test；其余含 None → standard。"""
    from core.config import config as _cfg
    _go_base = str(getattr(_cfg, "GO_BASE_URL", "") or "")
    if req_base_url and _go_base and req_base_url.rstrip("/") == _go_base.rstrip("/"):
        return "go"
    _zai_base = str(getattr(_cfg, "ZAI_BASE_URL", "") or "")
    if (req_base_url and _zai_base and req_base_url.rstrip("/") == _zai_base.rstrip("/")
            and req_model == MODEL_ZAI_MAIN):
        return "zai"
    if req_base_url and _ZEN_URL_MARK in req_base_url:
        return "test"
    return "standard"


def current_tier() -> str:
    """全局档位判定（无 req 的后台调用）：ZEN_TEST_MODE=='1' → TEST_CHANNEL 定向
    （'go'→go 档 / 'zai'→zai 档，其余→test 兼容旧语义），否则 standard。S4 起该键由设置页 PUT/GET 透传。"""
    from core.config import config as _cfg
    if str(getattr(_cfg, "ZEN_TEST_MODE", "0")) != "1":
        return "standard"
    _ch = str(getattr(_cfg, "TEST_CHANNEL", "zen"))
    return "go" if _ch == "go" else ("zai" if _ch == "zai" else "test")
