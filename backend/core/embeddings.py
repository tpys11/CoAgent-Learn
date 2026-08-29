# -*- coding: utf-8 -*-
"""向量化族：统一 OpenAI 兼容 API（硅基流动）+ 跨模态 VL 通道。

F5（2026-08-30）移除本地模型通道：未配置 EMBEDDING_API_KEY 时 _embed 直接抛错
（硬失败），API 调用失败同样直接抛出——不再有本地模型/伪向量静默降级。
B1 拆分（2026-08-27）：函数自 knowledge_service.py 逐字迁入；
测试补丁经门面命名空间回收保持可用（ks._embed 等照旧可 patch）。"""
import logging

logger = logging.getLogger("coagent.knowledge")


def _embed_api(texts: list[str]) -> list[list[float]]:
    """OpenAI 兼容 embedding API（Qwen3-VL-Embedding-8B，MRL dimensions=1024）"""
    import requests as _req
    from core.config import config as _cfg
    url = (_cfg.EMBEDDING_BASE_URL or "").rstrip("/") + "/embeddings"
    h = {"Authorization": "Bearer " + _cfg.EMBEDDING_API_KEY, "Content-Type": "application/json"}
    resp = _req.post(url, json={"model": _cfg.EMBEDDING_MODEL, "input": list(texts), "dimensions": int(_cfg.EMBEDDING_DIM)}, headers=h, timeout=60)
    resp.raise_for_status()
    data = resp.json().get("data") or []
    data.sort(key=lambda d: d.get("index", 0))  # 部分服务乱序返回，按 index 复原
    vecs = [d["embedding"] for d in data]
    # 维度断言：与配置不符立即报错（向量表维度固定，维度变了需清库重灌）
    for v in vecs:
        if len(v) != _cfg.EMBEDDING_DIM:
            raise RuntimeError(
                f"embedding 维度 {len(v)} 与配置 EMBEDDING_DIM={_cfg.EMBEDDING_DIM} 不符；"
                "切换 embedding 后端后请清空知识库重新入库"
            )
    return vecs


def _embed(texts: list[str]) -> list[list[float]]:
    """批量向量化：统一走 API（F5 起无本地通道/伪向量降级）。

    未配置 EMBEDDING_API_KEY → 硬失败（明确报错）；API 调用失败同样直接抛出。"""
    from core.config import config as _cfg
    if not _cfg.EMBEDDING_API_KEY:
        raise RuntimeError(
            "未配置 EMBEDDING_API_KEY，无法向量化，知识库检索不可用。"
            "请在设置界面填入硅基流动 Key（https://api.siliconflow.cn/v1），"
            "或在 .env 中设置 EMBEDDING_API_KEY=sk-... 后重试。"
        )
    return _embed_api(texts)


def _vl_key() -> str:
    """视觉/跨模态向量 key：VL_API_KEY 优先，未配置复用硅基流动 embedding key"""
    from core.config import config as _cfg
    return getattr(_cfg, "VL_API_KEY", "") or getattr(_cfg, "EMBEDDING_API_KEY", "")


def _embed_vl(inputs: list) -> list[list[float]]:
    """Qwen3-VL-Embedding：把文本/图片映射到同一 4096 维空间（跨模态检索基础）。
    inputs 元素为字符串（文本）或 {"image": data_uri}（图片）。"""
    key = _vl_key()
    if not key:
        raise RuntimeError("未配置 VL_API_KEY / EMBEDDING_API_KEY")
    import requests as _req
    from core.config import config as _cfg
    url = (getattr(_cfg, "VL_BASE_URL", "https://api.siliconflow.cn/v1") or "").rstrip("/") + "/embeddings"
    model = getattr(_cfg, "VL_MODEL", "Qwen/Qwen3-VL-Embedding-8B")
    dim = int(getattr(_cfg, "VL_EMBEDDING_DIM", 1024) or 1024)
    resp = _req.post(
        url,
        json={"model": model, "input": inputs, "dimensions": dim},
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json().get("data") or []
    data.sort(key=lambda d: d.get("index", 0))
    vecs = [d["embedding"] for d in data]
    for v in vecs:
        if len(v) != dim:
            raise RuntimeError(
                f"VL embedding 维度 {len(v)} 与配置 VL_EMBEDDING_DIM={dim} 不符"
            )
    return vecs


def embed_vl_images(image_data_uris: list) -> list[list[float]]:
    """图片向量化（data URI 列表）"""
    return _embed_vl([{"image": u} for u in image_data_uris])


def embed_vl_query(text: str) -> list[float] | None:
    """文本查询向量化（跨模态：文本查询与图片向量同空间）"""
    vecs = _embed_vl([(text or "")])
    return vecs[0] if vecs else None
