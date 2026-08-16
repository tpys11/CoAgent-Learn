# -*- coding: utf-8 -*-
"""统一模型 provider 配置（先只做配置层抽象，后续逐步把调用方切过来）。

主模型：DeepSeek / 智谱（用户在对话右下角选，key 在设置→基础填）。
辅助模型：硅基流动（embedding / rerank / VL / review / 图片描述），在设置→AI 服务配。
"""
from core.config import config


# 主对话模型厂家定义（后端单点；前端 CenterPanel / SettingsModal 的厂家列表后续对齐这里）
MAIN_PROVIDERS = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-v4-flash", "deepseek-v4-pro"],
        "fast_model": "deepseek-v4-flash",
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
    "api.deepseek.com": "deepseek-v4-flash",
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

    def image_desc(self):
        return {
            "base_url": config.VL_BASE_URL,
            "model": config.IMAGE_DESC_MODEL,
            "key": config.VL_API_KEY or config.EMBEDDING_API_KEY,
        }


def get_model_provider(api_key=None, model=None, base_url=None) -> ModelProvider:
    return ModelProvider(api_key=api_key, model=model, base_url=base_url)
