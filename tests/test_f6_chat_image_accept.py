# -*- coding: utf-8 -*-
"""F6 守卫：聊天输入框图片白名单与下游处理能力一致（防「声称支持 vs 实际支持」漂移，N2-2 同类风险）。

决策 18 范式：解析文本断言，读盘一律 utf-8-sig（Windows 生成文件可能带 BOM）。
单一事实源说明（Step F6 交接决策）：
- CenterPanel 的 accept 采用静态字符串，与 processFile 下游图片分支
  （CenterPanel.tsx 的 ['png','jpg','jpeg','gif','webp']）保持一致，
  不沿用 F3 的后端 upload-constraints——聊天附件走 VL 视觉理解
  （pipeline_v2 直接把 base64 拼进 image_url 消息），与知识库入库检索
  是两个场景，允许格式本就未必相同（如 bmp：知识库入库清单含 bmp，
  但 VL 通道拒收，E-31）。
- 本守卫把「accept 图片子集 == 下游图片分支」固化为双向断言：
  accept 多了 → 用户选得中、下游 alert「不支持的格式」；
  accept 少了 → 下游支持却选不了（正是 F6 修的缺陷）。
- DragDropInput 反向守卫：下游无图片分支且使用方未传 onFile，
  accept 加图片只会把「选不了」恶化成「选了弹告警」（方案 A 固化）。
"""
import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend" / "src" / "components"
CENTER = FRONTEND / "CenterPanel.tsx"
DRAGDROP = FRONTEND / "DragDropInput.tsx"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def _extract_accept(src: str) -> str:
    """提取 <input ... type="file" ... accept="..."> 的 accept 值（组件内 file input 仅一处）。"""
    m = re.search(r'<input\b[^>]*\btype="file"[^>]*\baccept="([^"]*)"', src)
    return m.group(1) if m else ""


def _extract_downstream_image_exts(src: str) -> list:
    """提取 processFile 下游图片分支的扩展名列表（含 'png' 的 includes(ext) 数组）。"""
    for m in re.finditer(r"\[([^\]]*)\]\s*\.includes\(ext\)", src):
        exts = re.findall(r"'([a-z0-9]+)'", m.group(1))
        if "png" in exts:
            return exts
    return []


# ── 1. 存在性守卫：文件与 accept 属性必须存在 ──────────────────────────────

def test_centerpanel_accept_exists():
    """CenterPanel 的 file input 必须带非空 accept（accept 被删即回归）。"""
    src = _read(CENTER)
    accept = _extract_accept(src)
    assert accept, "CenterPanel.tsx 的 <input type=file> 必须保留 accept 白名单（F6）"


# ── 2. 属性守卫：accept 与下游图片分支双向一致 ─────────────────────────────

def test_centerpanel_accept_covers_downstream_image_exts():
    """下游支持的每种图片扩展都必须出现在 accept 里（少了 = 选不了，F6 修的缺陷）。"""
    src = _read(CENTER)
    downstream = _extract_downstream_image_exts(src)
    if not downstream:
        pytest.skip("未找到 processFile 下游图片分支锚点（可能已重构，属性守卫兜底跳过）")
    accept = _extract_accept(src)
    accept_exts = {x.lstrip(".").lower() for x in accept.split(",") if x}
    missing = [e for e in downstream if e not in accept_exts]
    assert not missing, (
        f"accept 缺少下游已支持的图片扩展 {missing}（accept={accept}）；"
        f"须与 CenterPanel.tsx processFile 图片分支 {downstream} 保持一致"
    )


def test_centerpanel_accept_image_exts_match_downstream():
    """accept 的图片子集不得超出下游分支（多了 = 选得中、下游 alert「不支持的格式」）。"""
    src = _read(CENTER)
    downstream = _extract_downstream_image_exts(src)
    if not downstream:
        pytest.skip("未找到 processFile 下游图片分支锚点（可能已重构，属性守卫兜底跳过）")
    accept = _extract_accept(src)
    accept_exts = {x.lstrip(".").lower() for x in accept.split(",") if x}
    # 图片扩展判定：与下游分支做差集即为「疑似图片超集」；对已知纯图片后缀逐一核对
    image_like = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tiff", "avif"}
    extra = sorted(accept_exts & image_like - set(downstream))
    assert not extra, (
        f"accept 含下游不支持的图片扩展 {extra}（下游仅 {downstream}）；"
        f"选中后只会触发「不支持的格式」告警（bmp 另被 VL 通道拒收，E-31）"
    )


def test_centerpanel_accept_no_bmp():
    """bmp 明确禁止：上游 VL 服务拒收（E-31），加入即「选得中、必失败」。"""
    src = _read(CENTER)
    accept = _extract_accept(src)
    assert "bmp" not in accept.lower(), "accept 不得包含 bmp（VL 通道拒收，见 E-31）"


# ── 3. DragDropInput 反向守卫（方案 A 固化）────────────────────────────────

def test_dragdropinput_accept_no_image_exts():
    """DragDropInput 下游无图片分支、使用方（KnowledgeView）未传 onFile：
    accept 加图片只会把「选不了」恶化成「选了弹『该格式暂不支持』」——保持无图片。"""
    src = _read(DRAGDROP)
    accept = _extract_accept(src)
    if not accept:
        pytest.skip("未找到 DragDropInput 的 accept 锚点（可能已重构，兜底跳过）")
    accept_exts = {x.lstrip(".").lower() for x in accept.split(",") if x}
    image_like = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tiff", "avif"}
    leaked = sorted(accept_exts & image_like)
    assert not leaked, (
        f"DragDropInput.tsx 的 accept 不得包含图片扩展 {leaked}："
        f"其 processFile 无图片分支，且唯一使用方 KnowledgeView 未传 onFile，"
        f"选中图片只会 alert『该格式暂不支持』（F6 方案 A）"
    )
