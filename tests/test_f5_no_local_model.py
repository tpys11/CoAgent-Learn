# -*- coding: utf-8 -*-
"""F5 守卫：本地模型通道移除后不得复活。

决策 18 范式：解析文本断言，读盘一律 utf-8-sig（Windows 生成文件可能带 BOM）。
覆盖三道防线：
1. requirements.txt 不得重新引入 torch / sentence-transformers（含 pytorch 镜像 find-links）；
2. 源码不得复活本地模型符号（SentenceTransformer / CrossEncoder / _embed_local 等）；
3. 行为守卫：无 EMBEDDING_API_KEY 时 _embed 硬失败（错误含 原因/后果/怎么办 三点）；
   rerank 无 Key 跳过且降级日志只记一次（不刷屏）；RERANK_BACKEND=none 静默禁用。

实测记录（2026-08-30，Step F5 验收交接）：
- backend 镜像体积：3.25 GB → 1.67 GB（docker images 口径，两侧同源；实际释放 ≈1.58 GB，
  高于预估 ≈1.13 GB，差额为 torch 链其余传递依赖）。
- 冷构建耗时：433 s → 207.9 s（docker compose build --no-cache backend，含网络下载，Get-Date 计时）。
- 容器内 import torch / scipy → ModuleNotFoundError；import markitdown / onnxruntime / fitz → 正常。
- 有 Key（settings 表硅基流动 Key）：真实入库 chunks=1、检索命中、rerank 分数 0.9637。
- 无 Key：入库/检索抛 RuntimeError（含 原因/后果/怎么办 三点），硬失败点 embeddings.py:40。
- rerank 降级：rerank URL 断开后 5 次检索全部返回结果，失败日志恰 1 条；恢复后 rerank 分数回归、日志不新增。
"""
import logging
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1] / "backend"


def _read_rel(*parts: str) -> str:
    return (BACKEND.joinpath(*parts)).read_text(encoding="utf-8-sig")


# ── 1. 依赖守卫：torch 链不得回流 ──────────────────────────────────────────

def test_requirements_no_torch_chain():
    """torch / sentence-transformers / pytorch 镜像 find-links 均不得重新引入。"""
    content = _read_rel("requirements.txt").lower()
    assert "torch" not in content, "requirements.txt 不得重新引入 torch/pytorch 链（F5 禁止）"
    assert "sentence-transformers" not in content, \
        "requirements.txt 不得重新引入 sentence-transformers（F5 禁止）"
    assert "--find-links" not in content, "pytorch CPU 镜像 find-links 不得回流（N1 决策 16 已随 torch 失效）"


# ── 2. 源码守卫：本地模型符号不得复活 ──────────────────────────────────────

def test_config_fields_removed():
    """config.py 不得重新定义三个本地通道字段（注释提及不算，定义行才算）。"""
    import re
    src = _read_rel("core", "config.py")
    for name in ("EMBEDDING_BACKEND", "EMBEDDING_LOCAL_MODEL", "RERANK_LOCAL_MODEL"):
        assert not re.search(rf"(?m)^\s*{name}\s*[:=]", src), \
            f"config.py 不得重新定义 {name}（F5 决策 2）"


def test_embeddings_no_local_channel():
    src = _read_rel("core", "embeddings.py")
    for name in ("SentenceTransformer", "sentence_transformers", "_embed_local", "_get_embedder"):
        assert name not in src, f"embeddings.py 不得复活本地通道符号 {name}（F5 禁止）"


def test_knowledge_service_no_crossencoder():
    src = _read_rel("core", "knowledge_service.py")
    assert "sentence_transformers" not in src, "不得重新 import sentence_transformers（F5 禁止）"
    assert "CrossEncoder(" not in src, "不得重新实例化本地 CrossEncoder（F5 禁止）"
    for name in ("_reranker_local", "_embed_local", "_get_embedder"):
        assert name not in src, f"knowledge_service.py 不得复活本地重排符号 {name}（F5 禁止）"


# ── 3. 行为守卫：无 Key 硬失败 / rerank 优雅降级 ───────────────────────────

def test_embed_without_key_hard_fails(monkeypatch):
    """无 Key：_embed 直接抛 RuntimeError，错误含 原因/后果/怎么办 三点（不是伪向量）。"""
    from core.config import config as _cfg
    from core.embeddings import _embed
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    with pytest.raises(RuntimeError) as ei:
        _embed(["测试文本"])
    msg = str(ei.value)
    assert "EMBEDDING_API_KEY" in msg, "错误须说明原因（未配置 EMBEDDING_API_KEY）"
    assert "知识库检索不可用" in msg, "错误须说明后果（知识库检索不可用）"
    assert "siliconflow.cn" in msg and ".env" in msg, "错误须给出解决办法（设置界面 / .env）"


def test_embed_with_key_routes_to_api(monkeypatch):
    """有 Key：必须走 _embed_api 通道，不得存在任何本地回退。"""
    import core.embeddings as emb
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "sk-test")
    calls = {"n": 0}

    def fake_api(texts):
        calls["n"] += 1
        return [[0.0] * 1024 for _ in texts]

    monkeypatch.setattr(emb, "_embed_api", fake_api)
    assert emb._embed(["a", "b"]) == [[0.0] * 1024] * 2
    assert calls["n"] == 1


def test_reranker_no_key_skips_once(monkeypatch, caplog):
    """无 Key：跳过重排返回 None；降级日志只在状态变化时记一次（5 次调用 1 条，不刷屏）。"""
    import core.knowledge_service as ks
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "RERANK_BACKEND", "api")
    monkeypatch.setattr(_cfg, "RERANK_API_KEY", "")
    monkeypatch.setattr(_cfg, "EMBEDDING_API_KEY", "")
    monkeypatch.setattr(ks, "_reranker_api", None)
    monkeypatch.setattr(ks, "_rerank_state", None)
    with caplog.at_level(logging.WARNING, logger="coagent.knowledge"):
        for _ in range(5):
            assert ks._get_reranker() is None
    skips = [r for r in caplog.records if "重排已跳过" in r.getMessage()]
    assert len(skips) == 1, "降级日志应只在状态首次变化时记一次，不得每次检索刷屏"
    assert "结果未经重排排序" in skips[0].getMessage(), "日志须说明后果：结果未经重排排序"


def test_reranker_none_backend_silent(monkeypatch, caplog):
    """RERANK_BACKEND=none：用户主动禁用，静默返回 None，无告警。"""
    import core.knowledge_service as ks
    from core.config import config as _cfg
    monkeypatch.setattr(_cfg, "RERANK_BACKEND", "none")
    monkeypatch.setattr(ks, "_rerank_state", None)
    with caplog.at_level(logging.WARNING, logger="coagent.knowledge"):
        assert ks._get_reranker() is None
    assert not [r for r in caplog.records if "重排" in r.getMessage()]
