# -*- coding: utf-8 -*-
"""IMGKEY 守卫：IMG 检索关键词英文化（源级 + 纯函数，零网络零真实 key）。

背景（T2 微轮 IMGKEY）：Wikimedia Commons / Openverse 为英文主导库，LLM 把
{{IMG:关键词|说明}} 标记的关键词写成中文泛词时命中无关档案（URL 解码取证）。
本守卫在源码层锁定四处提示词的英文化约束，防止回退；并断言 embed_images
搜索链不经任何翻译层（英文化在生成端完成，防未来画蛇添足）。

覆盖面：
- gen_guide / gen_report / gen_diagnosis：IMG 标记指令行须含「英文」约束
  （grep 计数断言）；gen_diagnosis 若未来移除 IMG 标记指令则豁免该项，
  但须断言豁免依据成立（源码确无 IMG 标记指令锚）。
- gen_image：_LLM_KEYWORD_PROMPT 须为「英文关键词（供 Wikimedia 检索）」版文案。
- 变异防护：任一 prompt 去「英文」字样 → 对应用例恰红；全还原 → 复绿。
"""
from pathlib import Path

_SKILLS = Path(__file__).resolve().parent.parent / "skills"

# IMG 标记指令行锚（三技能同款指令措辞，各文件内唯一出现处；docstring/正则不含此锚）
_IMG_INSTRUCTION_ANCHOR = "需要配图的位置输出标记 {{IMG:"
# IMGKEY 规格追加子句（三技能同款）
_IMG_ENGLISH_CLAUSE = (
    "IMG 标记的搜索关键词必须用英文（2-3 个词，供 Wikimedia 检索），图片说明保留中文"
)
# gen_image 规格 after 文案（截取到句号，不含字符串字面量里的 \\n，避免转义歧义）
_KEYWORD_PROMPT_AFTER = (
    "从以下内容提取 2 个最适合搜索配图的英文关键词（供 Wikimedia 检索），"
    "只输出逗号分隔，不要其他文字。"
)


def _source(skill: str) -> str:
    return (_SKILLS / skill / "__init__.py").read_text(encoding="utf-8")


def _img_instruction_lines(src: str) -> list:
    """含 IMG 标记指令锚的源码行（即提示词里的标记生成指令行）。"""
    return [ln for ln in src.splitlines() if _IMG_INSTRUCTION_ANCHOR in ln]


def _assert_img_line_english(src: str, skill: str) -> None:
    lines = _img_instruction_lines(src)
    assert len(lines) == 1, f"{skill}: IMG 标记指令行应恰 1 处，实得 {len(lines)}"
    assert lines[0].count("英文") >= 1, f"{skill}: IMG 标记指令行须含「英文」检索约束"


def test_gen_guide_prompt_img_keywords_english():
    src = _source("gen_guide")
    assert src.count("英文") >= 1, "gen_guide: _GUIDE_PROMPT 源码须含「英文」"
    assert _IMG_ENGLISH_CLAUSE in src, "gen_guide: 缺 IMGKEY 规格追加子句"
    _assert_img_line_english(src, "gen_guide")


def test_gen_report_prompt_img_keywords_english():
    src = _source("gen_report")
    assert src.count("英文") >= 1, "gen_report: _REPORT_PROMPT 源码须含「英文」"
    assert _IMG_ENGLISH_CLAUSE in src, "gen_report: 缺 IMGKEY 规格追加子句"
    _assert_img_line_english(src, "gen_report")


def test_gen_diagnosis_prompt_img_keywords_english_or_exempt():
    src = _source("gen_diagnosis")
    if not _img_instruction_lines(src):
        # 豁免分支：无 IMG 标记指令则无需英文化——豁免依据=源码确无标记指令锚，
        # 若此断言失败说明豁免判定失真（文件仍含 IMG 标记字样），须人工复核
        assert "{{IMG:" not in src, "gen_diagnosis 豁免依据不成立：源码仍含 {{IMG: 字样"
        return
    assert src.count("英文") >= 1, "gen_diagnosis: _DIAGNOSIS_PROMPT 源码须含「英文」"
    assert _IMG_ENGLISH_CLAUSE in src, "gen_diagnosis: 缺 IMGKEY 规格追加子句"
    _assert_img_line_english(src, "gen_diagnosis")


def test_gen_image_llm_keyword_prompt_english():
    src = _source("gen_image")
    assert src.count("英文") >= 1, "gen_image: _LLM_KEYWORD_PROMPT 源码须含「英文」"
    assert _KEYWORD_PROMPT_AFTER in src, (
        "gen_image: _LLM_KEYWORD_PROMPT 须为「英文关键词（供 Wikimedia 检索）」版文案"
    )


def test_embed_search_chain_has_no_translation_layer():
    # embed_images 搜索链 = gen_report.embed_images/search_images → gen_image.search_images：
    # 英文化在生成端（提示词）完成，搜索函数不做任何翻译——防未来在链路上加翻译层
    for skill in ("gen_report", "gen_image"):
        src = _source(skill)
        assert "translate" not in src.lower(), f"{skill}: 搜索链不得引入 translate"
        assert "翻译" not in src, f"{skill}: 搜索链不得引入翻译层"
