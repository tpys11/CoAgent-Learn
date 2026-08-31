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
        from core.db import get_settings_repo
        from core.config import config as _cfg
        for _k, _v in get_settings_repo().get_all_settings().items():
            if hasattr(_cfg, _k):
                try:
                    setattr(_cfg, _k, int(_v) if _k == "EMBEDDING_DIM" else _v)
                except Exception:
                    logger.warning("应用动态设置 %s 失败", _k)
    except Exception:
        logger.exception("读取 settings 表失败")


@router.get("/health")
def health_check():
    return {"status": "ok", "version": "0.3.0"}


class SettingsSave(BaseModel):
    vector_model: str = "bge"   # bge | qwen（知识库向量化服务模型选择）
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "BAAI/bge-m3"
    embedding_dim: int = 1024
    rerank_backend: str = "api"
    rerank_base_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    vl_api_key: str = ""          # Qwen3-VL-Embedding 卡（视觉/跨模态，文本优先 BGE）
    zhipu_api_key: str = ""
    kb_mode: str = "full"         # 知识库服务：light=文字向量化+重排；full=再加图片向量/跨模态
    review_enabled: bool = False  # 独立审核模型开关（默认关，审核走 deepseek v4 flash）
    review_model: str = "Qwen/Qwen2.5-72B-Instruct"
    # 文档解析引擎（ParsePort）：pymupdf4llm | mineru | mathpix
    parse_engine: str = "pymupdf4llm"
    mineru_api_token: str = ""
    mathpix_app_id: str = ""
    mathpix_app_key: str = ""
    # 切块与检索参数（改动仅影响之后入库的内容）
    chunk_mode: str = "auto"   # window | markdown | auto
    chunk_size: int = 512
    chunk_overlap: int = 50
    rrf_k: int = 60
    fetch_mult: int = 3


@router.get("/api/settings")
def get_settings():
    """返回当前生效配置（key 只回显是否已配置，不回显内容）"""
    from core.config import config as _cfg
    from core.db import get_settings_repo
    _embed_key = getattr(_cfg, "EMBEDDING_API_KEY", "")
    _vl_key = getattr(_cfg, "VL_API_KEY", "")
    return {
        "vector_model": get_settings_repo().get_setting("VECTOR_MODEL") or "bge",
        "kb_mode": getattr(_cfg, "KB_MODE", "full"),
        "embedding": {
            "base_url": _cfg.EMBEDDING_BASE_URL,
            "model": _cfg.EMBEDDING_MODEL,
            "dim": int(getattr(_cfg, "EMBEDDING_DIM", 1024)),
            "api_key_set": bool(_embed_key),
            "api_key_hint": _mask_key(_embed_key),
        },
        "rerank": {
            "backend": _cfg.RERANK_BACKEND,
            "base_url": _cfg.RERANK_BASE_URL,
            "model": _cfg.RERANK_MODEL,
            "api_key_set": bool(getattr(_cfg, "RERANK_API_KEY", "") or _embed_key),
            "api_key_hint": _mask_key(getattr(_cfg, "RERANK_API_KEY", "") or _embed_key),
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
        "parse": {
            "engine": getattr(_cfg, "PARSE_ENGINE", "pymupdf4llm"),
            "mineru_key_set": bool(getattr(_cfg, "MINERU_API_TOKEN", "")),
            "mathpix_key_set": bool(getattr(_cfg, "MATHPIX_APP_ID", "") and getattr(_cfg, "MATHPIX_APP_KEY", "")),
        },
        "chunking": {
            "mode": getattr(_cfg, "KB_CHUNK_MODE", "auto"),
            "chunk_size": int(getattr(_cfg, "KB_CHUNK_SIZE", 512)),
            "chunk_overlap": int(getattr(_cfg, "KB_CHUNK_OVERLAP", 50)),
            "rrf_k": int(getattr(_cfg, "KB_RRF_K", 60)),
            "fetch_mult": int(getattr(_cfg, "KB_FETCH_MULT", 3)),
        },
    }


@router.put("/api/settings")
def save_settings(req: SettingsSave):
    """保存配置到 settings 表并即时应用到 config 单例（T51 语义）：
    缺省字段不覆写（exclude_unset）；空串不覆写（防默认值/空值打回已存配置）；
    key 类字段空串=保持不变。本端点不提供清除能力（E-22：settings 表保存即永久压过 .env，清除需清库）。"""
    from core.db import get_settings_repo
    _s = get_settings_repo()
    _submitted = req.model_dump(exclude_unset=True)
    # 非空字符串才允许落库（T51：F8 E4 实证缺省/空串会以 pydantic 默认值覆写已存配置）
    _vals = {k: v for k, v in _submitted.items() if not (isinstance(v, str) and not v.strip())}

    def _set(cfg_key: str, field: str, val=None):
        if field in _vals:
            _s.set_setting(cfg_key, str(_vals[field] if val is None else val))

    _set("VECTOR_MODEL", "vector_model")
    _set("EMBEDDING_BASE_URL", "embedding_base_url")
    _set("EMBEDDING_API_KEY", "embedding_api_key")
    _set("EMBEDDING_MODEL", "embedding_model")
    if "embedding_dim" in _vals:
        _s.set_setting("EMBEDDING_DIM", str(_vals["embedding_dim"]))
    _set("RERANK_BACKEND", "rerank_backend")
    _set("RERANK_BASE_URL", "rerank_base_url")
    _set("RERANK_API_KEY", "rerank_api_key")
    _set("RERANK_MODEL", "rerank_model")
    _set("VL_API_KEY", "vl_api_key")
    _set("ZHIPU_API_KEY", "zhipu_api_key")
    _set("KB_MODE", "kb_mode")
    if "review_enabled" in _vals:
        _s.set_setting("REVIEW_ENABLED", "1" if _vals["review_enabled"] else "0")
    _set("REVIEW_MODEL", "review_model")
    _set("PARSE_ENGINE", "parse_engine")
    _set("MINERU_API_TOKEN", "mineru_api_token")
    _set("MATHPIX_APP_ID", "mathpix_app_id")
    _set("MATHPIX_APP_KEY", "mathpix_app_key")
    if "chunk_mode" in _vals:
        _s.set_setting("KB_CHUNK_MODE", _vals["chunk_mode"] if _vals["chunk_mode"] in ("window", "markdown", "auto") else "auto")
    if "chunk_size" in _vals:
        _s.set_setting("KB_CHUNK_SIZE", str(max(100, min(4000, int(_vals["chunk_size"] or 512)))))
    if "chunk_overlap" in _vals:
        _s.set_setting("KB_CHUNK_OVERLAP", str(max(0, min(500, int(_vals["chunk_overlap"] or 0)))))
    if "rrf_k" in _vals:
        _s.set_setting("KB_RRF_K", str(max(1, min(200, int(_vals["rrf_k"] or 60)))))
    if "fetch_mult" in _vals:
        _s.set_setting("KB_FETCH_MULT", str(max(1, min(10, int(_vals["fetch_mult"] or 3)))))
    _apply_dynamic_settings()
    return {"status": "ok", "msg": "配置已保存并即时生效"}


@router.post("/api/settings/test")
def test_settings(req: SettingsSave):
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
