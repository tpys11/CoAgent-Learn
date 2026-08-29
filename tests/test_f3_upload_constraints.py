# -*- coding: utf-8 -*-
"""Step F3（N2-2）守卫：上传约束清单必须覆盖后端实际能处理的图片格式。

N2-2 事故（两份清单漂移）：处理链路 _IMG_EXTS 支持 6 种图片，UPLOAD_CONSTRAINTS
却一张不收——前端 accept 与 allowedExts 动态取自约束端点，于是「点上传 → 选图片」
被文件选择器拒收，只有拖拽能过（拖拽路径的二次过滤又因 catch 吞错而失效）。
本文件断言「声称支持的 ⊇ 实际能处理的」，并钉住派生关系，防止清单再次手写分叉。

守卫范式（决策 18）：存在性守卫硬失败；属性守卫在依赖物缺失时 pytest.skip 兜底，
避免级联红掩盖真实断言。
"""
import re
from pathlib import Path

import routers.knowledge as kmod

PROJECT_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_PY = PROJECT_ROOT / "backend" / "routers" / "knowledge.py"
UPLOAD_PANEL_TSX = PROJECT_ROOT / "frontend" / "src" / "components" / "resource" / "UploadPanel.tsx"

# N2-2 基线：后端图片处理链路当前支持的 6 种格式（评审验收项 2 的钉死清单）。
# 若 owner 未来扩充 _IMG_EXTS，test_extensions_must_cover_module_img_exts 会自动
# 要求新格式进清单；这 6 种则是「不许缩水」的下限。
BASELINE_IMG_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_upload_constraints_must_exist():
    """存在性守卫：UPLOAD_CONSTRAINTS 必须存在且含非空 extensions/accept。"""
    uc = getattr(kmod, "UPLOAD_CONSTRAINTS", None)
    assert isinstance(uc, dict), (
        "backend/routers/knowledge.py 缺少 UPLOAD_CONSTRAINTS——前端 accept 与预校验"
        "失去单一事实源，退回前端手写清单（N2-2 复发土壤）"
    )
    assert isinstance(uc.get("extensions"), list) and uc["extensions"], (
        "UPLOAD_CONSTRAINTS['extensions'] 必须是非空 list"
    )
    assert isinstance(uc.get("accept"), str) and uc["accept"], (
        "UPLOAD_CONSTRAINTS['accept'] 必须是非空 str"
    )


def test_img_exts_must_be_module_level_single_source():
    """存在性守卫：_IMG_EXTS 必须在模块级定义（单一事实源），
    函数内不得再出现局部手写副本（N2-2 事故的原始形态）。"""
    src = _read(KNOWLEDGE_PY)
    assert isinstance(getattr(kmod, "_IMG_EXTS", None), set), (
        "_IMG_EXTS 未在模块级定义——UPLOAD_CONSTRAINTS 与图片分支失去共同事实源"
    )
    module_defs = re.findall(r"^_IMG_EXTS\s*=", src, re.M)
    local_defs = re.findall(r"^\s+_IMG_EXTS\s*=", src, re.M)
    assert len(module_defs) == 1 and not local_defs, (
        f"_IMG_EXTS 定义数异常：模块级 {len(module_defs)} 处、函数内 {len(local_defs)} 处"
        "——必须恰好 1 处模块级定义，禁止函数内手写副本"
    )


def test_extensions_must_cover_module_img_exts():
    """属性守卫（N2-2 主断言）：extensions ⊇ {f'.{e}' for e in _IMG_EXTS}。"""
    uc = getattr(kmod, "UPLOAD_CONSTRAINTS", None)
    img_exts = getattr(kmod, "_IMG_EXTS", None)
    if not (isinstance(uc, dict) and isinstance(uc.get("extensions"), list)) or not isinstance(img_exts, set):
        import pytest
        pytest.skip("UPLOAD_CONSTRAINTS 或 _IMG_EXTS 缺失（由存在性守卫兜底）")
    missing = {f".{e}" for e in img_exts} - set(uc["extensions"])
    assert not missing, (
        f"UPLOAD_CONSTRAINTS['extensions'] 缺少图片扩展名 {sorted(missing)}——"
        "后端实际能处理但声称不支持，前端点选将拒收图片（N2-2 复发）"
    )


def test_baseline_image_exts_must_not_shrink():
    """属性守卫：6 种基线图片格式（N2-2 验收项 2）必须始终在 extensions 里。"""
    uc = getattr(kmod, "UPLOAD_CONSTRAINTS", None)
    if not (isinstance(uc, dict) and isinstance(uc.get("extensions"), list)):
        import pytest
        pytest.skip("UPLOAD_CONSTRAINTS 缺失（由存在性守卫兜底）")
    have = {x.lstrip(".") for x in uc["extensions"]}
    missing = BASELINE_IMG_EXTS - have
    assert not missing, (
        f"基线图片格式 {sorted(missing)} 从 extensions 消失——图片上传能力缩水"
    )


def test_accept_must_be_derived_from_extensions():
    """属性守卫：accept 必须与 extensions 完全同步（由同一清单 join 派生），
    禁止 accept 再手写一份独立字符串（N2-2 的第二份漂移清单）。"""
    uc = getattr(kmod, "UPLOAD_CONSTRAINTS", None)
    if not (isinstance(uc, dict) and isinstance(uc.get("extensions"), list) and isinstance(uc.get("accept"), str)):
        import pytest
        pytest.skip("UPLOAD_CONSTRAINTS 字段缺失（由存在性守卫兜底）")
    assert uc["accept"] == ",".join(uc["extensions"]), (
        "UPLOAD_CONSTRAINTS['accept'] 与 extensions 不同步——accept 必须由 extensions "
        "join 派生，手写第二份就是 N2-2 的漂移形态"
    )


def test_upload_entry_whitelist_must_derive_from_constraints():
    """属性守卫：knowledge_upload_file 的入口白名单 _ALLOWED_EXTS 必须由
    UPLOAD_CONSTRAINTS 派生，不得回退为函数内手写清单（原第三份手写副本）。"""
    src = _read(KNOWLEDGE_PY)
    assert re.search(r'_ALLOWED_EXTS\s*=\s*\{[^\n]*UPLOAD_CONSTRAINTS\["extensions"\]', src), (
        "_ALLOWED_EXTS 未由 UPLOAD_CONSTRAINTS 派生——入口白名单又变回手写清单，"
        "与约束清单构成新的漂移对"
    )


def test_frontend_fallback_accept_must_cover_baseline_image_exts():
    """自守卫：UploadPanel 的静态回退清单（拉取失败兜底）必须覆盖 6 种基线图片格式，
    否则端点故障期间点选图片会再次被拒。"""
    src = _read(UPLOAD_PANEL_TSX)
    m = re.search(r"FALLBACK_ACCEPT\s*=\s*\n?\s*'([^']+)'", src)
    assert m, "UploadPanel.tsx 缺少 FALLBACK_ACCEPT 静态回退清单（F3 修复②被移除？）"
    have = {x.lstrip(".") for x in m.group(1).split(",")}
    missing = BASELINE_IMG_EXTS - have
    assert not missing, (
        f"FALLBACK_ACCEPT 缺少图片扩展名 {sorted(missing)}——约束端点故障期间"
        "点选图片会被文件选择器拒收（N2-2 在降级路径复发）"
    )
