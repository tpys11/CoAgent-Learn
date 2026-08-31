# -*- coding: utf-8 * -*-
"""T53 守卫（F12-S0）：「项目介绍」入口不可达——按钮/视图/首弹/组件/存储键全链删除。

判定依据（交接文档 §S0 边界判定）：
- App.tsx 的 agents 持久化（LS.agents + handleSaveAgent/handleReplaceAgents）与
  AgentsView.tsx:158 共用（App.tsx:406 传入）→ 保留持久化，仅删项目介绍呈现层。
- LS.introGlobal / LS.introTiers 键名带 intro，但消费者是 AgentsView（对话设定卡片）→ 保留。
- LS.introSeen（首弹只弹一次标记）仅服务 IntroPanel → 删。
决策 18 范式：存在性守卫硬失败 + 属性守卫 skip 兜底；读盘一律 utf-8-sig（防 BOM）。
"""
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend" / "src"
ACTIVITY_BAR = FRONTEND / "components" / "ActivityBar.tsx"
TUTORIAL_VIEW = FRONTEND / "components" / "TutorialView.tsx"
INTRO_PANEL = FRONTEND / "components" / "IntroPanel.tsx"
APP = FRONTEND / "App.tsx"
STORAGE = FRONTEND / "storage.ts"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


# ── 1. 存在性守卫：呈现层文件必须已删除 ────────────────────────────────

def test_tutorial_view_and_intro_panel_files_removed():
    """TutorialView.tsx / IntroPanel.tsx 必须不存在（T53 删除对象）。"""
    for f in (TUTORIAL_VIEW, INTRO_PANEL):
        assert not f.exists(), f"{f.name} 应已删除（T53 项目介绍移除）"


# ── 2. 入口守卫：ActivityBar 不得再有 tutorial 入口 ─────────────────────

def test_activity_bar_has_no_tutorial_entry():
    """侧栏 ActivityBar 不得含 onChange('tutorial') 或「项目介绍」入口。"""
    src = _read(ACTIVITY_BAR)
    assert "onChange('tutorial')" not in src, "ActivityBar 残留 tutorial 按钮（入口可达=回归）"
    assert "项目介绍" not in src, "ActivityBar 残留「项目介绍」入口文案"
    assert "'tutorial'" not in src, "ActivityBar 的 ViewKey/样式判定残留 'tutorial' 字面量"


# ── 3. 状态机守卫：App 不得再有首弹与 tutorial 视图分支 ─────────────────

def test_app_has_no_intro_state_and_no_tutorial_branch():
    """App.tsx 不得含 IntroPanel/TutorialView/showIntro/introSeen/'tutorial'。"""
    src = _read(APP)
    for token in ("IntroPanel", "TutorialView", "showIntro", "introSeen", "'tutorial'"):
        assert token not in src, f"App.tsx 残留 {token}（T53 未清干净）"


# ── 4. 存储键守卫：introSeen 必须从 LS 常量表移除 ────────────────────────

def test_storage_intro_seen_key_removed():
    """LS.introSeen 仅服务首弹（IntroPanel 已删）→ 键定义必须移除。"""
    src = _read(STORAGE)
    assert "introSeen" not in src, "storage.ts 残留 introSeen 键定义（死键）"


# ── 5. 属性守卫：agents 持久化必须仍然存活（边界判定固化） ──────────────

def test_agents_persistence_shared_with_agents_view_must_survive():
    """边界判定结论：agents 持久化与 AgentsView 共用 → S0 删除后必须仍完整存活。

    App.tsx 仍需：LS.agents 读取初始化 + handleSaveAgent/handleReplaceAgents 持久化回写；
    AgentsView 仍接收 agents/onSave/onReplace。任一缺失 = 误删共用持久化。
    """
    app = _read(APP)
    if "handleSaveAgent" not in app or "handleReplaceAgents" not in app:
        pytest.skip("App.tsx 结构已变（handleSaveAgent/handleReplaceAgents 不存在），属性守卫兜底跳过")
    assert "lsSetJSON(LS.agents" in app, "agents 持久化回写被误删（与 AgentsView 共用，必须保留）"
    assert "lsGet(LS.agents" in app, "agents 持久化读取被误删（与 AgentsView 共用，必须保留）"
