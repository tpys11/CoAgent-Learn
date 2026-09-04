# -*- coding: utf-8 * -*-
"""FIXMIND 守卫：学情评估节点空内容兜底展示（源级断言）。

背景：评估后台线程 15 秒回收窗超时（go 档思考模型 30-90s）→ except 分支
assess_thinking 保持空串 → mindchain 无「学情与记忆管理」条目 → 前端空节点。
FIXMIND 仅新增展示兜底（超时/空产出两种文案），不改变任何评估/写表行为——
shutdown(wait=False) 不杀线程，assess.py store_level_score 照常写
dialogues.profile，下次对话生效（owner 设计语义）。

三组断言：
- 源级①：超时标记与分支在（assess_timeout = False / if assess_timeout else）
- 源级②：两种兜底文案在（已转后台完成并写入学情表 / 规则地板继续）
- 源级③（回归锚）：评估本体原样（result(timeout=15) / shutdown(wait=False)）

决策 18 范式：读盘一律 utf-8-sig。
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "backend" / "engine" / "pipeline_v2.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


# ── 源级①：超时标记与分支必须存在 ──────────────────────────────────────

def test_assess_timeout_flag_and_branch_present():
    src = _read(PIPELINE)
    assert "assess_timeout = False" in src, \
        "FIXMIND①：超时标记前置初始化缺失"
    assert "if assess_timeout else" in src, \
        "FIXMIND①：超时/空产出双形态分支缺失"


# ── 源级②：两种兜底文案必须存在 ────────────────────────────────────────

def test_fallback_texts_present():
    src = _read(PIPELINE)
    assert "已转后台完成并写入学情表" in src, \
        "FIXMIND②：超时兜底文案缺失（owner 设计语义：转后台写表、下次生效）"
    assert "规则地板继续" in src, \
        "FIXMIND②：空产出兜底文案缺失（本轮降级规则地板）"


# ── 源级③（回归锚）：评估本体不得被兜底改动波及 ────────────────────────

def test_assess_body_unchanged():
    src = _read(PIPELINE)
    assert "result(timeout=15)" in src, \
        "FIXMIND③回归锚：15 秒回收窗被误动（评估本体必须原样）"
    assert "shutdown(wait=False)" in src, \
        "FIXMIND③回归锚：shutdown(wait=False) 被误动（不杀线程是写表生效前提）"
