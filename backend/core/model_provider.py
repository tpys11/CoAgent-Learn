# -*- coding: utf-8 -*-
"""统一模型 provider 配置（先只做配置层抽象，后续逐步把调用方切过来）。

主模型：DeepSeek / 智谱（用户在对话右下角选，key 在设置→基础填）；DeepSeek 默认视觉版 deepseek-v4-flash-vision-exp。
辅助模型：硅基流动（embedding / rerank / VL / review），在设置→AI 服务配。图片理解由视觉主模型直接处理。
"""
from core.config import config

# ── DeepSeek 模型名单一事实源（换模型只改这里）──
MODEL_PRO = "deepseek-v4-pro"
MODEL_MAIN = "deepseek-v4-flash-vision-exp"   # 主对话/生成/审核默认（视觉版）
MODEL_FAST = MODEL_MAIN                        # 轻调用道（规划/分类/学情/追问/记忆），当前跟随主模型


# 主对话模型厂家定义（后端单点；前端 CenterPanel / SettingsModal 的厂家列表后续对齐这里）
MAIN_PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-v4-flash-vision-exp", "deepseek-v4-flash", "deepseek-v4-pro"],
        "fast_model": MODEL_FAST,
    },
    "zhipu": {
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-flash", "glm-4-plus"],
        "fast_model": "glm-4-flash",
    },
}

# 快模型映射（按 base_url 域名自动解析；映射不到则与主模型一致）
FAST_MODEL_BY_BASE = {
    "api.deepseek.com": MODEL_FAST,
    "open.bigmodel.cn": "glm-4-flash",
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
# review=动态格（存路由函数引用，follow_main/research 是运行时配置键非静态值）；
# parse 非 LLM 不入矩阵（mineru 通道不经此表）。

import dataclasses


@dataclasses.dataclass(frozen=True)
class ModelSpec:
    """注册表解析产物：一格的运行时值。review 动态格额外携带 provider/follow_main
    （RA5 resolve_review_route 契约三键的载体；key 可用性副作用仍归调用方 pick_judge）。"""
    model: str
    base_url: str
    api_key: str
    provider: str = "main"
    follow_main: bool = False


def _review_dynamic(template):
    """review 动态格：RA5-S1 resolve_review_route 四分支逻辑原样搬迁（行为零变化）。
    follow_main='1' 短路主模型；research 档 zen: 前缀走 Zen、含"/"走硅基流动跨厂商、
    空/其余回落主模型。key 值仅随 provider 给缺省映射（SF=VL||EMBEDDING、zen=ZEN、
    主=req 兜底 DEEPSEEK），缺 key 的响亮回退判定仍归调用方。"""
    from core.config import config as _cfg
    if template == "研究" and str(getattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")) == "1":
        return ModelSpec(MODEL_MAIN, _cfg.DEEPSEEK_BASE_URL, _cfg.DEEPSEEK_API_KEY,
                         provider="main", follow_main=True)
    model = ((_cfg.REVIEW_MODEL_RESEARCH if template == "研究" else _cfg.REVIEW_MODEL_THINK) or "").strip() or MODEL_MAIN
    if model.startswith("zen:"):
        return ModelSpec(model[4:].strip(), _cfg.ZEN_BASE_URL, _cfg.ZEN_API_KEY, provider="zen")
    if template == "研究" and "/" in model:
        return ModelSpec(model, _cfg.VL_BASE_URL, _cfg.VL_API_KEY or _cfg.EMBEDDING_API_KEY,
                         provider="siliconflow")
    return ModelSpec(model, _cfg.DEEPSEEK_BASE_URL, _cfg.DEEPSEEK_API_KEY, provider="main")


# embedding/rerank 两格两档共用同一 cell 引用=决策 38「专有能力留 SF，test 格沿用 standard」
_EMBEDDING_CELL = {"provider": "siliconflow", "model_key": "EMBEDDING_MODEL",
                   "base_url_key": "EMBEDDING_BASE_URL", "api_key_key": "EMBEDDING_API_KEY"}
_RERANK_CELL = {"provider": "siliconflow", "model_key": "RERANK_MODEL",
                "base_url_key": "RERANK_BASE_URL",
                "api_key_keys": ("RERANK_API_KEY", "EMBEDDING_API_KEY")}

# 决策 38 测试档对话/视觉实名（smoke2 对齐 Zen API ID：显示名≠API ID 会 401）
MODEL_ZEN_TEST = "mimo-v2.5-free"

REGISTRY: dict = {
    "standard": {
        "main":      {"provider": "main", "model": MODEL_MAIN,
                      "base_url_key": "DEEPSEEK_BASE_URL", "api_key_key": "DEEPSEEK_API_KEY"},
        "fast":      {"provider": "main", "model": MODEL_FAST,
                      "base_url_key": "DEEPSEEK_BASE_URL", "api_key_key": "DEEPSEEK_API_KEY"},
        "review":    _review_dynamic,
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
        "review":    _review_dynamic,
        "embedding": _EMBEDDING_CELL,
        "rerank":    _RERANK_CELL,
        "vision":    {"provider": "zen", "model": MODEL_ZEN_TEST,
                      "base_url_key": "ZEN_BASE_URL", "api_key_key": "ZEN_API_KEY"},
    },
}

_TIERS = ("standard", "test")
_ZEN_URL_MARK = "opencode.ai/zen"   # RC1 先例：req 端点含 Zen 网关标记 → 测试档


def resolve_model(role: str, tier: str, template: str | None = None) -> ModelSpec:
    """注册表唯一解析入口：role=干什么（main/fast/review/embedding/rerank/vision），
    tier=什么环境（standard/test——有 req 用 detect_tier(req.base_url)，后台无 req 用 current_tier()）。
    未知 role/tier 直接 raise ValueError——错误配置应响亮失败，防静默错路由。"""
    tier_cell = REGISTRY.get(tier)
    if tier_cell is None:
        raise ValueError(f"未知档位 tier={tier!r}（合法：{list(_TIERS)}）")
    cell = tier_cell.get(role)
    if cell is None:
        raise ValueError(f"未知角色 role={role!r}（合法：{sorted(tier_cell)}；parse 非 LLM 不入矩阵）")
    if callable(cell):
        return cell(template)
    from core.config import config as _cfg
    model = cell["model"] if "model" in cell else getattr(_cfg, cell["model_key"])
    if "api_key_keys" in cell:
        api_key = next((v for v in (getattr(_cfg, name, "") for name in cell["api_key_keys"]) if v), "")
    else:
        api_key = getattr(_cfg, cell.get("api_key_key", ""), "")
    return ModelSpec(model=model, base_url=getattr(_cfg, cell["base_url_key"]),
                     api_key=api_key, provider=cell.get("provider", "main"))


def resolve_review_route(template: str) -> dict:
    """R-D S1：判卷路由单一事实源自 engine.review 搬迁入注册表（review 动态格的 dict 视图，
    RA5 契约 {"model","provider","follow_main"} 不变）——S2 起 engine.review 转调此处。"""
    spec = resolve_model("review", current_tier(), template=template)
    return {"model": spec.model, "provider": spec.provider, "follow_main": spec.follow_main}


def detect_tier(req_base_url: str | None) -> str:
    """请求级档位判定：req.base_url 指向 Zen 网关（含 opencode.ai/zen）→ test；其余含 None → standard。"""
    return "test" if (req_base_url and _ZEN_URL_MARK in req_base_url) else "standard"


def current_tier() -> str:
    """全局档位判定（无 req 的后台调用）：ZEN_TEST_MODE=='1' → test，否则 standard。
    S4 起该键由设置页 PUT/GET 透传。"""
    from core.config import config as _cfg
    return "test" if str(getattr(_cfg, "ZEN_TEST_MODE", "0")) == "1" else "standard"
