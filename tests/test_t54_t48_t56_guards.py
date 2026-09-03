# -*- coding: utf-8 * -*-
"""F12-S1 守卫：T54 切块栏移除 + T48 README 死链清零 + T56 生成侧公式定界声明。

定位说明（决策 24①）：本组三条均为回归固化断言（改动先行、守卫后立），非 TDD 红先行——
S1 派发仅对 S0 要求 TDD。守卫钉「删了的东西不回来、修对的指引不漂移」。
决策 18 范式：读盘一律 utf-8-sig。
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE_SETTINGS = ROOT / "frontend" / "src" / "components" / "settings" / "ServiceSettings.tsx"
README = ROOT / "README.md"
PIPELINE = ROOT / "backend" / "engine" / "pipeline_v2.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


# ── T54：切块与检索参数 UI 节已删，但保存 payload 键契约必须保留 ─────────

def test_servicesettings_chunk_section_ui_removed_but_payload_intact():
    src = _read(SERVICE_SETTINGS)
    assert "切块与检索参数" not in src, "T54：切块与检索参数 UI 节回归（应保持移除）"
    # 后端键契约不动：svc 现值仍随保存原样回传（chunk_mode 等 payload 字段必须存活）
    for key in ("chunk_mode", "chunk_size", "chunk_overlap", "rrf_k", "fetch_mult"):
        assert key in src, f"T54 越界误删：保存 payload 字段 {key} 不应随 UI 节一起删除"


# ── T48/D1：README 三条 docs 死链不得回流 ───────────────────────────────

def test_readme_no_dead_docs_links():
    """docs/ 目录不入库（E-24），README 引用 docs/*.md 即死链——评委 clone 后 404。"""
    src = _read(README)
    assert "docs/" not in src, "README 残留 docs/ 死链（T48/D1 回归）"


# ── T48/D2：上传入口指引必须指向真实路径 ────────────────────────────────

def test_readme_upload_entry_guidance_corrected():
    src = _read(README)
    assert "顶部「资源」页可上传" not in src, "T48/D2：失实指引（顶部资源页无上传按钮）回流"
    assert "查看更多" in src, "T48/D2：真实上传入口（资源 → 查看更多 → 上传面板）未写明"


# ── T48/D5：E-22 语义（UI 保存后 .env 同名键失效）必须写透 ───────────────

def test_readme_env_override_semantics_documented():
    src = _read(README)
    assert "settings 表" in src and ".env" in src, "T48/D5：配置优先级语义说明缺失"


# ── T56：生成侧系统提示词必须声明公式用 $ 定界 ──────────────────────────

def test_generate_system_prompt_declares_formula_delimiter():
    """前端 KaTeX 只认 $/$$，\( \) 定界不渲染——声明必须钉在生成侧 sys prompt 构造处。"""
    src = _read(PIPELINE)
    assert "【公式格式】" in src, "T56：生成侧公式定界声明缺失（\\( \\) 定界将渲染为纯文本）"
    assert "$$...$$" in src, "T56：定界声明须同时覆盖行内 $ 与块级 $$"
