# -*- coding: utf-8 -*-
"""FIXDEMO 守卫：主生成链难度适配显式化 + 术语中英对照（源级断言，零网络零真实 key）。

背景（T2 微轮 FIXDEMO）：Wave 2 正式跑数 9 例（go 档 glm-5.3-flash）适配一致率
77.8%<85%（P1 初学者画像 level 0.15 拿到的内容难度 0.6，远超容差 0.25）；
覆盖率 85.7%<90%（QKV/KV缓存/参数高效微调三个标准中文术语未在答案出现）。
根因：主生成提示词（pipeline_v2.py base_system）从未注入画像等级 prev_score，
模型无从贴合；术语无中英对照要求，覆盖判定按字面失配。本守卫在源码层锁定两块
新增条款，防止回退；并保留 T56【公式格式】块回归锚（防本轮误删）。

覆盖面：
- 守卫①【难度适配】：条款存在 + {prev_score:.2f} 画像水平注入 +
  if prev_score is not None None 守卫（prev_score 为 None 时块整体不出现），
  且块须嵌在守卫分支内（钉死 None 分支）。
- 守卫②【术语规范】：条款存在 + 「中英文对照」要求。
- 守卫③（回归锚）：T56【公式格式】块原样存在。
- 变异防护：删【难度适配】块 → 守卫①恰红；删【术语规范】块 → 守卫②恰红；
  全还原 → 复绿。
"""
from pathlib import Path

_PIPELINE = Path(__file__).resolve().parent.parent / "backend" / "engine" / "pipeline_v2.py"


def _source() -> str:
    return _PIPELINE.read_text(encoding="utf-8")


def test_fixdemo_guard1_difficulty_adaptation_in_guard():
    src = _source()
    assert "【难度适配】" in src, "pipeline_v2.py 缺【难度适配】条款（FIXDEMO 回退？）"
    assert "{prev_score:.2f}" in src, "pipeline_v2.py 缺 prev_score 画像水平注入"
    # None 分支钉死：整块必须包在 if prev_score is not None 内（prev_score 为
    # None 时【难度适配】块整体不出现，避免提示词出现空洞水平数字）
    assert "if prev_score is not None" in src, "pipeline_v2.py 缺 prev_score None 守卫"
    lines = src.splitlines()
    idx_if = next(i for i, ln in enumerate(lines) if "if prev_score is not None" in ln)
    idx_block = next(i for i, ln in enumerate(lines) if "【难度适配】" in ln)
    assert idx_block > idx_if, "【难度适配】块必须位于 None 守卫之后"
    indent_if = len(lines[idx_if]) - len(lines[idx_if].lstrip())
    indent_block = len(lines[idx_block]) - len(lines[idx_block].lstrip())
    assert indent_block > indent_if, "【难度适配】块必须嵌在 if prev_score 守卫分支内（None 时整体不出现）"


def test_fixdemo_guard2_terminology_bilingual():
    src = _source()
    assert "【术语规范】" in src, "pipeline_v2.py 缺【术语规范】条款（FIXDEMO 回退？）"
    assert "中英文对照" in src, "【术语规范】须要求关键术语首次出现给中英文对照"


def test_fixdemo_guard3_formula_format_regression_anchor():
    # 回归锚：T56【公式格式】块原样存在，防本轮误删/回退
    src = _source()
    assert "T56：前端 KaTeX 渲染管线只认 $ / $$ 定界" in src, "T56 注释锚丢失"
    assert ("【公式格式】数学公式一律用 $...$（行内）或 $$...$$（独立成块）定界，" in src), \
        "【公式格式】正文条款被改动"
    assert r"禁止使用 \\( \\) 或 \\[ \\] 定界。" in src, "【公式格式】定界禁令子句被改动"
