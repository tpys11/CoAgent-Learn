# -*- coding: utf-8 -*-
"""F7 文案防回归守卫（T48 + P3）。
背景：T48（README 上传入口死链指引）与 P3（「重试。，请稍后」双标点 +
「请稍后在知识库查看」误导尾缀——条目实际保持未向量化，不会稍后出现）
两处修正已由 f12-1 微改包（4e6cac3）先行落地；本文件钉死旧措辞不复活。
纯文件内容断言，无产品代码导入（T33 安全）；
删掉/改回任一修正处，对应守卫必须红（行为层判据）。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_t48_readme_upload_guidance_fixed():
    """T48：README 使用第 5 步不得再出现「顶部『资源』页可上传」旧死链指引；
    真实入口三要素（资源 → 查看更多 → 上传面板 → 确认上传）必须在场。"""
    text = _read("README.md")
    assert "顶部「资源」页可上传" not in text
    assert "顶部『资源』页可上传" not in text
    assert "「资源」→「查看更多」" in text
    assert "上传面板" in text
    assert "「确认上传」" in text


def test_p3_backend_error_copy_no_misleading_suffix():
    """P3：backend 全目录不得再出现历史误导文案「请稍后在知识库查看」
    与双标点「重试。，」。"""
    bad = ("请稍后在知识库查看", "重试。，")
    for p in (ROOT / "backend").rglob("*.py"):
        text = p.read_text(encoding="utf-8", errors="replace")
        for b in bad:
            assert b not in text, f"{p.name} 出现已废弃文案: {b}"
