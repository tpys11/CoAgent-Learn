"""健康检查 + 动态服务配置（前端设置界面读写，即时生效无需重启）。"""
import logging

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("coagent.settings")
router = APIRouter()


def _mask_key(key: str) -> str:
    """返回可展示的 key 提示：不泄露完整 key，只显示结尾 4 位。"""
    if not key:
        return ""
    if len(key) <= 4:
        return "****"
    return "sk-****" + key[-4:]


def _apply_dynamic_settings():
    """把 settings 表（前端设置界面写入）的动态配置应用到 config 单例：
    embedding/rerank/视觉 key 等，优先于 .env 环境变量，无需重启即时生效。"""
    try:
        from core.sqlite_client import get_db
        from core.config import config as _cfg
        for _k, _v in get_db().get_all_settings().items():
            if hasattr(_cfg, _k):
                try:
                    setattr(_cfg, _k, int(_v) if _k == "EMBEDDING_DIM" else _v)
                except Exception:
                    logger.warning("应用动态设置 %s 失败", _k)
    except Exception:
        logger.exception("读取 settings 表失败")


@router.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}


class SettingsSave(BaseModel):
    vector_model: str = "bge"   # bge | qwen（知识库向量化服务模型选择）
    embedding_backend: str = "api"
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "BAAI/bge-m3"
    embedding_local_model: str = "BAAI/bge-small-zh-v1.5"
    embedding_dim: int = 1024
    rerank_backend: str = "api"
    rerank_base_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    rerank_local_model: str = "BAAI/bge-reranker-base"
    image_backend: str = "none"   # none | api（通用 OpenAI 兼容视觉接口）
    image_base_url: str = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    image_api_key: str = ""
    image_model: str = "glm-4v-flash"
    vl_api_key: str = ""          # Qwen3-VL-Embedding 卡（视觉/跨模态，文本优先 BGE）
    zhipu_api_key: str = ""
    image_desc_model: str = "Qwen/Qwen3.5-4B"   # 图片描述模型
    kb_mode: str = "full"         # 知识库服务：light=文字向量化+重排；full=再加图片向量/跨模态
    review_enabled: bool = False  # 独立审核模型开关（默认关，审核走 deepseek v4 flash）
    review_model: str = "Qwen/Qwen2.5-72B-Instruct"


@router.get("/api/settings")
async def get_settings():
    """返回当前生效配置（key 只回显是否已配置，不回显内容）"""
    from core.config import config as _cfg
    from core.sqlite_client import get_db as _db
    _embed_key = getattr(_cfg, "EMBEDDING_API_KEY", "")
    _vl_key = getattr(_cfg, "VL_API_KEY", "")
    _image_eff = getattr(_cfg, "IMAGE_API_KEY", "") or _vl_key or _embed_key or getattr(_cfg, "ZHIPU_API_KEY", "")
    return {
        "vector_model": _db().get_setting("VECTOR_MODEL") or "bge",
        "kb_mode": getattr(_cfg, "KB_MODE", "full"),
        "embedding": {
            "backend": _cfg.EMBEDDING_BACKEND,
            "base_url": _cfg.EMBEDDING_BASE_URL,
            "model": _cfg.EMBEDDING_MODEL,
            "local_model": getattr(_cfg, "EMBEDDING_LOCAL_MODEL", "BAAI/bge-small-zh-v1.5"),
            "dim": int(getattr(_cfg, "EMBEDDING_DIM", 1024)),
            "api_key_set": bool(_embed_key),
            "api_key_hint": _mask_key(_embed_key),
        },
        "rerank": {
            "backend": _cfg.RERANK_BACKEND,
            "base_url": _cfg.RERANK_BASE_URL,
            "model": _cfg.RERANK_MODEL,
            "local_model": getattr(_cfg, "RERANK_LOCAL_MODEL", "BAAI/bge-reranker-base"),
            "api_key_set": bool(getattr(_cfg, "RERANK_API_KEY", "") or _embed_key),
            "api_key_hint": _mask_key(getattr(_cfg, "RERANK_API_KEY", "") or _embed_key),
        },
        "image": {
            "backend": getattr(_cfg, "IMAGE_BACKEND", "none"),
            "base_url": getattr(_cfg, "IMAGE_BASE_URL", ""),
            "model": getattr(_cfg, "IMAGE_DESC_MODEL", "Qwen/Qwen3.5-4B"),
            "api_key_set": bool(_image_eff),
            "api_key_hint": _mask_key(_image_eff),
        },
        "vl": {
            "model": getattr(_cfg, "VL_MODEL", "Qwen/Qwen3-VL-Embedding-8B"),
            "api_key_set": bool(_vl_key or _embed_key),
            "api_key_hint": _mask_key(_vl_key or _embed_key),
        },
        "zhipu": {
            "api_key_set": bool(getattr(_cfg, "ZHIPU_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "ZHIPU_API_KEY", "")),
        },
        "review": {
            "model": getattr(_cfg, "REVIEW_MODEL", "Qwen/Qwen2.5-72B-Instruct"),
            "enabled": str(getattr(_cfg, "REVIEW_ENABLED", "0")) == "1",
        },
    }


@router.put("/api/settings")
async def save_settings(req: SettingsSave):
    """保存配置到 settings 表并即时应用到 config 单例；空 key 表示清除（恢复 .env）"""
    from core.sqlite_client import get_db as _db
    _s = _db()
    _s.set_setting("VECTOR_MODEL", req.vector_model)
    _s.set_setting("EMBEDDING_BACKEND", req.embedding_backend)
    _s.set_setting("EMBEDDING_BASE_URL", req.embedding_base_url)
    # 前端不回显已存 Key，空输入 = 保持不变（不清除已保存的 Key）
    if req.embedding_api_key:
        _s.set_setting("EMBEDDING_API_KEY", req.embedding_api_key)
    _s.set_setting("EMBEDDING_MODEL", req.embedding_model)
    _s.set_setting("EMBEDDING_LOCAL_MODEL", req.embedding_local_model)
    _s.set_setting("EMBEDDING_DIM", str(req.embedding_dim))
    _s.set_setting("RERANK_BACKEND", req.rerank_backend)
    _s.set_setting("RERANK_BASE_URL", req.rerank_base_url)
    if req.rerank_api_key:
        _s.set_setting("RERANK_API_KEY", req.rerank_api_key)
    _s.set_setting("RERANK_MODEL", req.rerank_model)
    _s.set_setting("RERANK_LOCAL_MODEL", req.rerank_local_model)
    _s.set_setting("IMAGE_BACKEND", req.image_backend)
    _s.set_setting("IMAGE_BASE_URL", req.image_base_url)
    if req.image_api_key:
        _s.set_setting("IMAGE_API_KEY", req.image_api_key)
    _s.set_setting("IMAGE_MODEL", req.image_model)
    if req.image_desc_model:
        _s.set_setting("IMAGE_DESC_MODEL", req.image_desc_model)
    if req.vl_api_key:
        _s.set_setting("VL_API_KEY", req.vl_api_key)
    if req.zhipu_api_key:
        _s.set_setting("ZHIPU_API_KEY", req.zhipu_api_key)
    _s.set_setting("KB_MODE", req.kb_mode)
    _s.set_setting("REVIEW_ENABLED", "1" if req.review_enabled else "0")
    _s.set_setting("REVIEW_MODEL", req.review_model)
    _apply_dynamic_settings()
    return {"status": "ok", "msg": "配置已保存并即时生效"}


@router.post("/api/settings/test")
async def test_settings(req: SettingsSave):
    """测试知识库服务连接（不保存）：文字向量化、重排；full 档额外测图片向量/跨模态。
    只返回功能级结果（ok + 简短 msg），不暴露具体模型名。"""
    import requests as _req
    from core.config import config as _cfg
    results = {}
    # Key 回退链与运行时一致（输入框留空时回退已保存配置）
    _embed_key = req.embedding_api_key or getattr(_cfg, "EMBEDDING_API_KEY", "")
    _rerank_key = req.rerank_api_key or getattr(_cfg, "RERANK_API_KEY", "") or _embed_key
    _kb_mode = req.kb_mode or getattr(_cfg, "KB_MODE", "full")

    # 文字向量化
    if not _embed_key:
        results["text_embedding"] = {"ok": False, "msg": "未配置 Key"}
    else:
        try:
            _u = (req.embedding_base_url or getattr(_cfg, "EMBEDDING_BASE_URL", "") or "").rstrip("/") + "/embeddings"
            _r = _req.post(_u, json={"model": req.embedding_model or getattr(_cfg, "EMBEDDING_MODEL", ""), "input": ["测试"]},
                           headers={"Authorization": "Bearer " + _embed_key}, timeout=20)
            ok = _r.status_code == 200 and bool(_r.json().get("data"))
            results["text_embedding"] = {"ok": ok, "msg": "" if ok else f"HTTP {_r.status_code}"}
        except Exception as e:
            results["text_embedding"] = {"ok": False, "msg": str(e)[:100]}

    # 重排
    if not _rerank_key:
        results["rerank"] = {"ok": False, "msg": "未配置 Key"}
    else:
        try:
            _u = ((req.rerank_base_url or getattr(_cfg, "RERANK_BASE_URL", "") or req.embedding_base_url or getattr(_cfg, "EMBEDDING_BASE_URL", "")) or "").rstrip("/") + "/rerank"
            _r = _req.post(_u, json={"model": req.rerank_model or getattr(_cfg, "RERANK_MODEL", ""), "query": "测试", "documents": ["测试文档"]},
                           headers={"Authorization": "Bearer " + _rerank_key}, timeout=20)
            ok = _r.status_code == 200
            results["rerank"] = {"ok": ok, "msg": "" if ok else f"HTTP {_r.status_code}"}
        except Exception as e:
            results["rerank"] = {"ok": False, "msg": str(e)[:100]}

    # 图片向量/跨模态（仅 full 档）
    if _kb_mode == "full":
        _vl_key = req.vl_api_key or getattr(_cfg, "VL_API_KEY", "") or _embed_key
        if not _vl_key:
            results["image_embedding"] = {"ok": False, "msg": "未配置 Key"}
        else:
            try:
                _u = (getattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1") or "").rstrip("/") + "/embeddings"
                _r = _req.post(_u, json={"model": getattr(_cfg, "VL_MODEL", "Qwen/Qwen3-VL-Embedding-8B"), "input": ["测试"]},
                               headers={"Authorization": "Bearer " + _vl_key}, timeout=20)
                ok = _r.status_code == 200 and bool(_r.json().get("data"))
                results["image_embedding"] = {"ok": ok, "msg": "" if ok else f"HTTP {_r.status_code}"}
            except Exception as e:
                results["image_embedding"] = {"ok": False, "msg": str(e)[:100]}

    return {"status": "ok", "results": results}
