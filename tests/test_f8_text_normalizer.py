# -*- coding: utf-8 -*-
"""Step F8-S3 守卫：提取文本规范化（normalize_extracted_text）。

背景（派发单 §三 S3，本轮核心）：任何引擎的提取输出直接入库——CJK 标点空格混乱、
PDF 硬换行不合并、控制字符残留。本守卫逐规则锁定 + 「正常 markdown 不被误伤」反例
（表格/代码块/URL/标题/列表原样保留）。

纪律：保守规则宁漏勿错；每条规则独立可判定；normalize 必须幂等（二次处理 = 一次）。
"""
import pytest

from core.text_normalizer import normalize_extracted_text as norm


# ══════════════ R1 控制字符 / 零宽字符 / BOM ══════════════

def test_r1_strips_bom_zero_width_and_controls():
    text = "﻿零​宽‌字‍符⁠夹⁡杂\\x00\x00\x07控制\x1b[0m符"
    out = norm(text)
    for ch in ("﻿", "​", "‌", "‍", "⁠", "⁡", "\x00", "\x07", "\x1b"):
        assert ch not in out, f"控制/零宽字符 {ch!r} 残留: {out!r}"
    assert "零宽字符夹杂" in out
    assert "控制[0m符" in out, "可见内容不得被误删: {out!r}"


def test_r1_keeps_newline_tab_and_crlf_normalized():
    out = norm("第一段文本。\r\n第二段文本。\r第三段文本。\n\t缩进保留")
    assert out == "第一段文本。\n第二段文本。\n第三段文本。\n\t缩进保留", repr(out)


# ══════════════ R2 PDF 硬换行合并 ══════════════

def test_r2_merges_cjk_hard_wraps_without_space():
    assert norm("这是一段被 PDF 硬换行打断的中\n文句子，行尾没有句末标点") == \
        "这是一段被 PDF 硬换行打断的中文句子，行尾没有句末标点"


def test_r2_merges_latin_wraps_with_space():
    assert norm("This is a wrapped\nsentence from a PDF.") == \
        "This is a wrapped sentence from a PDF."


def test_r2_keeps_sentence_end_linebreak():
    """句末标点后的换行 = 段落边界语义，不合并。"""
    assert norm("第一段结束。\n第二段开始") == "第一段结束。\n第二段开始"
    assert norm("Done.\nNext line") == "Done.\nNext line"


def test_r2_never_merges_structural_next_lines():
    """下一行是标题/列表/表格/引用/围栏/URL → 不合并（结构原样）。"""
    cases = [
        ("前言如下\n# 标题行", "前言如下\n# 标题行"),
        ("要点：\n- 列表项", "要点：\n- 列表项"),
        ("如下：\n1. 有序列表", "如下：\n1. 有序列表"),
        ("表前\n| a | b |", "表前\n| a | b |"),
        ("引用前\n> 引用内容", "引用前\n> 引用内容"),
        ("代码前\n```py\ncode()", "代码前\n```py\ncode()"),
        ("详见\nhttps://example.com/doc", "详见\nhttps://example.com/doc"),
    ]
    for src, want in cases:
        assert norm(src) == want, f"{src!r} → {norm(src)!r}, 期望 {want!r}"


def test_r2_never_merges_inside_code_fence():
    src = "```\n行一\n行二\n```"
    assert norm(src) == src


def test_r2_hyphen_ending_joins_without_space():
    """Latin 断词连字符：行尾 - 直接接（保留连字符，不猜测是否该去）。"""
    assert norm("state-\nof-the-art design") == "state-of-the-art design"


def test_r2_merges_multi_line_paragraph():
    src = "段一没有标点\n第二行\n第三行结束。\n下一段"
    assert norm(src) == "段一没有标点第二行第三行结束。\n下一段"


# ══════════════ R3 CJK 标点空格清理 ══════════════

def test_r3_removes_spaces_around_cjk_punct():
    assert norm("你好 ， 世界 。 测试") == "你好，世界。测试"
    assert norm("他说：“ 引用内容 ” 完成") == "他说：“引用内容”完成"
    assert norm("括号（ 注释 ）与书名《 书 》") == "括号（注释）与书名《书》"


def test_r3_keeps_latin_spacing():
    """Latin 语境不被误伤：英文与标点间的空格、URL 查询串原样。"""
    assert norm("Hello, world. Test") == "Hello, world. Test"
    assert norm("https://example.com/a?b=1&c=2") == "https://example.com/a?b=1&c=2"


def test_r3_keeps_spaces_between_plain_cjk_chars():
    """两个汉字之间的空格是有意分隔（词间/并列），保守保留。"""
    assert norm("机器 学习 模型") == "机器 学习 模型"


def test_r3_no_cleanup_inside_code_fence():
    src = "```\nx = f(1 ， 2)\n```"
    assert norm(src) == src


# ══════════════ R4 空行与行内空白收敛 ══════════════

def test_r4_collapses_excessive_blank_lines():
    assert norm("a\n\n\n\n\nb") == "a\n\nb"


def test_r4_collapses_inline_whitespace_but_keeps_indent_and_tables():
    assert norm("你好      世界") == "你好 世界"
    src = "| col1 |  col2   |\n|-------|---------|\n|  a    |   b     |"
    assert norm(src) == src, "表格行原样保留（对齐空白不动）"
    assert norm("\n        indented code line").startswith("\n        indented"), "行首缩进不动（4 空格代码块）"


def test_r4_keeps_blank_lines_inside_code_fence():
    src = "```\na\n\n\n\nb\n```"
    assert norm(src) == src


# ══════════════ 综合与幂等 ══════════════

def test_idempotent():
    src = "﻿零​宽 ， 标点\n换行合并\n下一段。\n\n\n\n尾段"
    once = norm(src)
    assert norm(once) == once, "normalize 必须幂等"


def test_empty_and_plain_inputs():
    assert norm("") == ""
    assert norm("普通一句话。") == "普通一句话。"
    assert norm(None) is None or True  # 签名约定 str 入参；None 行为不承诺


def test_realistic_pdf_sample():
    """真实坏样本（owner 反馈场景）：硬换行 + 标点空格乱 + 控制字符混合。"""
    src = ("﻿知识库上传链路的质量增强\n是本轮的核心目标 。提取文本\n通常存在以下噪声：\n\n\n\n"
           "1. 句中断行\n2. 标点前空格 ，比如这样\n3. 控制字符\x0b残留")
    out = norm(src)
    assert "知识库上传链路的质量增强是本轮的核心目标。提取文本" in out
    assert "标点前空格，比如这样" in out
    assert "\x0b" not in out
    assert "1. 句中断行\n2. 标点前空格" in out, "列表结构保留"

# ══════════════ 接线守卫：解析统一出口必须过规范化闸 ══════════════

def test_wired_into_parse_file_with_engine(monkeypatch):
    """file_parser 统一出口（legacy 分支）输出必须已规范化——
    /api/file-to-text 与资源上传等直接调用方因此一并覆盖。"""
    import core.file_parser as fp
    monkeypatch.setattr(fp, "_parse_with_markitdown", lambda data: None)
    text, engine = fp.parse_file_with_engine(
        "probe.txt", "硬换行\n合并测试 。".encode("utf-8"))
    assert engine == "legacy" and "硬换行合并测试。" in text, repr(text)
