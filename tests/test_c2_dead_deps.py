"""Step C2 守卫：已删除的死依赖不得重新进入 backend/requirements.txt。

C2 经 grep 证伪（backend/ skills/ tests/ scripts/ 全部 *.py，含大小写不敏感
复核与非代码面扫描）确认 langgraph / langchain / langchain-deepseek 零真实
import（仅存的 4 处命中均为 docstring / 字符串字面量），随后从
backend/requirements.txt 删除三行（详见 Step C2 交接文档）。

本测试断言这三个包（含一切 langgraph* / langchain* 变体，langchain 前缀
同时覆盖 langchain-deepseek）不得重新出现，防止后续步骤把它们带回来
重新拖慢镜像构建。
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"

# Step C2 删除的包（声明名前缀，小写比较）。
BANNED_PREFIXES = ["langgraph", "langchain", "langchain-deepseek"]


def _banned_requirement_lines() -> list[str]:
    lines = REQUIREMENTS.read_text(encoding="utf-8-sig").splitlines()
    hits = []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue  # 跳过空行/注释/--extra-index-url 等选项行
        lowered = line.lower()
        if any(lowered.startswith(prefix) for prefix in BANNED_PREFIXES):
            hits.append(raw)
    return hits


def test_c2_dead_deps_stay_removed():
    # utf-8-sig：requirements.txt 带 UTF-8 BOM，用裸 utf-8 会让首行 fastapi
    # 带上 \ufeff 前缀（Step C1 实测的坑，本文件读取已在函数内处理）。
    hits = _banned_requirement_lines()
    assert not hits, (
        f"backend/requirements.txt 重新出现了 Step C2 已删除的死依赖 {hits}；"
        "langgraph/langchain/langchain-deepseek 经证伪零引用（Step C2），"
        "如需恢复必须先给出真实 import 证据并同步更新本守卫"
    )
