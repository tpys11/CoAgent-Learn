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


@router.get("/api/settings")
async def get_settings():
    """返回当前生效配置（key 只回显是否已配置，不回显内容）"""
    from core.config import config as _cfg
    from core.sqlite_client import get_db as _db
    return {
        "vector_model": _db().get_setting("VECTOR_MODEL") or "bge",
        "embedding": {
            "backend": _cfg.EMBEDDING_BACKEND,
            "base_url": _cfg.EMBEDDING_BASE_URL,
            "model": _cfg.EMBEDDING_MODEL,
            "local_model": getattr(_cfg, "EMBEDDING_LOCAL_MODEL", "BAAI/bge-small-zh-v1.5"),
            "dim": int(getattr(_cfg, "EMBEDDING_DIM", 1024)),
            "api_key_set": bool(getattr(_cfg, "EMBEDDING_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "EMBEDDING_API_KEY", "")),
        },
        "rerank": {
            "backend": _cfg.RERANK_BACKEND,
            "base_url": _cfg.RERANK_BASE_URL,
            "model": _cfg.RERANK_MODEL,
            "local_model": getattr(_cfg, "RERANK_LOCAL_MODEL", "BAAI/bge-reranker-base"),
            "api_key_set": bool(getattr(_cfg, "RERANK_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "RERANK_API_KEY", "")),
        },
        "image": {
            "backend": getattr(_cfg, "IMAGE_BACKEND", "none"),
            "base_url": getattr(_cfg, "IMAGE_BASE_URL", ""),
            "model": getattr(_cfg, "IMAGE_MODEL", "glm-4v-flash"),
            "api_key_set": bool(getattr(_cfg, "IMAGE_API_KEY", "") or getattr(_cfg, "ZHIPU_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "IMAGE_API_KEY", "") or getattr(_cfg, "ZHIPU_API_KEY", "")),
        },
        "vl": {
            "api_key_set": bool(getattr(_cfg, "VL_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "VL_API_KEY", "")),
        },
        "zhipu": {
            "api_key_set": bool(getattr(_cfg, "ZHIPU_API_KEY", "")),
            "api_key_hint": _mask_key(getattr(_cfg, "ZHIPU_API_KEY", "")),
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
    if req.vl_api_key:
        _s.set_setting("VL_API_KEY", req.vl_api_key)
    if req.zhipu_api_key:
        _s.set_setting("ZHIPU_API_KEY", req.zhipu_api_key)
    _apply_dynamic_settings()
    return {"status": "ok", "msg": "配置已保存并即时生效"}


@router.post("/api/settings/test")
async def test_settings(req: SettingsSave):
    """用传入配置测试连接（不保存）：embedding/rerank/视觉 各一次最小调用；路由跟随所选模型 vector_model"""
    import requests as _req
    from core.config import config as _cfg
    results = {}
    _vm = req.vector_model or "bge"
    # 前端不回显已存 Key（刷新后输入框为空但后端已保存）：请求体 Key 为空时回退已保存配置
    _embed_key = req.embedding_api_key or getattr(_cfg, "EMBEDDING_API_KEY", "")
    _vl_key = req.vl_api_key or getattr(_cfg, "VL_API_KEY", "")
    _rerank_key = req.rerank_api_key or getattr(_cfg, "RERANK_API_KEY", "")
    _zhipu_key = req.zhipu_api_key or getattr(_cfg, "ZHIPU_API_KEY", "") or getattr(_cfg, "IMAGE_API_KEY", "")
    # embedding（路由跟随所选模型：qwen → Qwen3-VL-Embedding-8B，bge → bge-m3）
    if req.embedding_backend == "api":
        _ek = (_vl_key or _embed_key) if _vm == "qwen" else _embed_key
        _em = "Qwen/Qwen3-VL-Embedding-8B" if _vm == "qwen" else req.embedding_model
        if not _ek:
            results["embedding"] = {"ok": False, "msg": "未配置 API Key"}
        else:
            try:
                _u = (req.embedding_base_url or "").rstrip("/") + "/embeddings"
                _r = _req.post(_u, json={"model": _em, "input": ["测试"]},
                               headers={"Authorization": "Bearer " + _ek}, timeout=20)
                if _r.status_code == 200 and _r.json().get("data"):
                    results["embedding"] = {"ok": True, "dim": len(_r.json()["data"][0]["embedding"])}
                else:
                    results["embedding"] = {"ok": False, "msg": f"HTTP {_r.status_code}: {_r.text[:120]}"}
            except Exception as e:
                results["embedding"] = {"ok": False, "msg": str(e)[:120]}
    else:
        results["embedding"] = {"ok": True, "msg": "本地后端无需测试"}
    # rerank（地址/Key 留空时复用向量化配置，与 _ApiReranker 逻辑一致）
    if req.rerank_backend == "api":
        _rk = _rerank_key or _embed_key
        if not _rk:
            results["rerank"] = {"ok": False, "msg": "未配置重排 Key（可在重排或向量化中填写）"}
        else:
            try:
                _u = ((req.rerank_base_url or req.embedding_base_url) or "").rstrip("/") + "/rerank"
                _r = _req.post(_u, json={"model": req.rerank_model, "query": "测试", "documents": ["测试文档"]},
                               headers={"Authorization": "Bearer " + _rk}, timeout=20)
                if _r.status_code == 200:
                    results["rerank"] = {"ok": True}
                else:
                    results["rerank"] = {"ok": False, "msg": f"HTTP {_r.status_code}: {_r.text[:120]}"}
            except Exception as e:
                results["rerank"] = {"ok": False, "msg": str(e)[:120]}
    else:
        results["rerank"] = {"ok": True, "msg": "本地后端无需测试"}
    # Qwen3-VL-Embedding（视觉/跨模态向量）：Qwen 模式下主模型即覆盖；BGE 模式独立测 vl key
    if _vm == "qwen":
        results["vl"] = {"ok": True, "msg": "当前主模型为 Qwen3-VL，视觉向量已覆盖"}
    elif _vl_key:
        try:
            _u = "https://api.siliconflow.cn/v1/embeddings"
            _r = _req.post(_u, json={"model": "Qwen/Qwen3-VL-Embedding-8B", "input": ["测试"]},
                           headers={"Authorization": "Bearer " + _vl_key}, timeout=20)
            if _r.status_code == 200 and _r.json().get("data"):
                results["vl"] = {"ok": True, "dim": len(_r.json()["data"][0]["embedding"])}
            else:
                results["vl"] = {"ok": False, "msg": f"HTTP {_r.status_code}: {_r.text[:120]}"}
        except Exception as e:
            results["vl"] = {"ok": False, "msg": str(e)[:120]}
    else:
        results["vl"] = {"ok": True, "msg": "未配置，跳过"}
    # 图片描述（硅基流动视觉模型优先，复用硅基流动 Key；回退智谱）
    _desc_key = _vl_key or _embed_key or _zhipu_key
    if _desc_key:
        _is_sf = bool(_vl_key or _embed_key)
        try:
            _desc_url = "https://api.siliconflow.cn/v1/chat/completions" if _is_sf else "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            _desc_model = "Qwen/Qwen2.5-VL-72B-Instruct" if _is_sf else "glm-4v-flash"
            _r = _req.post(_desc_url,
                           json={"model": _desc_model, "messages": [{"role": "user", "content": "ping"}]},
                           headers={"Authorization": "Bearer " + _desc_key}, timeout=20)
            results["zhipu"] = {"ok": _r.status_code == 200, "msg": "" if _r.status_code == 200 else f"HTTP {_r.status_code}: {_r.text[:100]}"}
        except Exception as e:
            results["zhipu"] = {"ok": False, "msg": str(e)[:120]}
    else:
        results["zhipu"] = {"ok": True, "msg": "未配置，跳过"}
    return {"status": "ok", "results": results}
