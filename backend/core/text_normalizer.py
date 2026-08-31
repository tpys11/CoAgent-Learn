# -*- coding: utf-8 -*-
"""提取文本规范化（F8-S3）：任何解析引擎的输出直接入库——CJK 标点空格混乱、
PDF 硬换行不合并、控制字符残留是「换行/标点错乱」的直接来源。

设计纪律：保守规则宁漏勿错——
- 每条规则只在明确噪声形态上触发，结构（标题/列表/表格/引用/围栏/URL）一律绕行；
- 代码围栏与行内代码内容原样保留（含围栏内的空行/空格/标点）；
- normalize 必须幂等（二次处理 = 一次处理，守卫钉住）。

规则（与 tests/test_f8_text_normalizer.py 一一对应）：
R1 控制字符/零宽字符/BOM 清理（保留 \\n、\\t、行首缩进）
R2 PDF 硬换行合并（行尾非句末标点 + 下一行非结构行；CJK 直接接、Latin 补空格）
R3 CJK 全角标点前后异常空格清理（仅标点↔CJK/标点邻接，不动汉字间空格）
R4 连续 3+ 空行收敛为 1 空行；行内连续空白收敛（表格行与行首缩进不动）
"""
import re

# R1：BOM/零宽/不可见格式字符（soft hyphen、bidi 控制一并清除——渲染层纯噪声）
_INVISIBLE_RE = re.compile("[\ufeff\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064]")
# R1：C0 控制字符（\t \n \r 除外——\r 由行尾归一处理，\t 与行首缩进是有意格式）与 DEL
_CONTROL_RE = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# R2：句末标点（行尾出现 → 段落边界语义，不合并）；成对收尾符剥离后再判
_SENT_END = "。．！？；：!?;:…."
_CLOSERS = "」』”）’】》〉）】"

# R2：结构行特征（下一行为结构行 → 不合并；围栏/缩进代码/表格/标题/引用/列表/URL）
_BULLET_CHARS = "-*+•·●○■◆▪–"
_NUMBERED_RE = re.compile(r"\d+[.、)）]\s")
_HR_RE = re.compile(r"^(-{3,}|\*{3,}|_{3,}|={3,})\s*$")
_INDENT_CODE_RE = re.compile(r"^( {4}|\t)")

# R3：全角标点全集（开+收）与 CJK 汉字类
_CJK_PUNCT = "，。！？；：、）】》〉」』”’…—～·％（《〈【〔［｛「『‘“"
_CJK_CHAR = "\u4e00-\u9fff\u3400-\u4dbf"
_P_ESC = re.escape(_CJK_PUNCT)
_R3_BEFORE = re.compile("([" + _CJK_CHAR + _P_ESC + "])[ \t]+([" + _P_ESC + "])")
_R3_AFTER = re.compile("([" + _P_ESC + "])[ \t]+([" + _CJK_CHAR + _P_ESC + "])")

# R4：空行收敛
_BLANK_RUN_RE = re.compile("\n{3,}")

# 占位哨兵：\x00 已被 R1 清空，此后仅由本模块的 mask/unmask 使用
_FENCE_PH = "\x00F{}\x00"
_CODE_PH = "\x00C{}\x00"


def _is_cjk(ch: str) -> bool:
    return bool(ch) and ("\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf")


def _is_fence_toggle(line: str) -> bool:
    s = line.lstrip()
    return s.startswith("```") or s.startswith("~~~")


def _ends_sentence(s: str) -> bool:
    """行尾（剥离成对收尾符后）是否句末标点。"""
    s = s.rstrip()
    while s and s[-1] in _CLOSERS:
        s = s[:-1]
    return bool(s) and s[-1] in _SENT_END


def _next_structural(line: str) -> bool:
    """下一行是否结构行（合并会破坏其语义 → 禁止并入上一行）。"""
    if _INDENT_CODE_RE.match(line):   # 4 空格/tab 缩进代码块
        return True
    s = line.lstrip()
    if not s:
        return True
    if _is_fence_toggle(line) or _HR_RE.match(s):
        return True
    if s[0] in "#|>":
        return True
    if s[0] in _BULLET_CHARS and (len(s) == 1 or s[1] in " \t"):
        return True
    if _NUMBERED_RE.match(s):
        return True
    if s.startswith(("http://", "https://", "www.")):
        return True
    return False


def _cur_unmergeable(line: str) -> bool:
    """当前行是否禁作合并主体（标题/表格/引用/围栏/分隔线——语义自足，续行并入会污染）。"""
    s = line.lstrip()
    if _is_fence_toggle(line) or _HR_RE.match(s):
        return True
    return bool(s) and (s[0] in "#|>")


def _join(left: str, right: str) -> str:
    """硬换行拼接：CJK↔CJK 直接接；ASCII 字母数字↔ASCII 字母数字补一个空格；
    行尾连字符（Latin 断词）保留原样直接接（不猜测是否该去连字符——宁漏勿错）。"""
    left, right = left.rstrip(), right.lstrip()
    if not left:
        return right
    if not right:
        return left
    if left.endswith("-") and right[0].isascii() and right[0].isalnum():
        return left + right
    if _is_cjk(left[-1]) and _is_cjk(right[0]):
        return left + right
    if (left[-1].isascii() and left[-1].isalnum()
            and right[0].isascii() and right[0].isalnum()):
        return left + " " + right
    return left + right


def _merge_hard_wraps(lines: list) -> list:
    """R2：围栏感知的行级扫描——行尾非句末标点且下一行非结构行则向后合并（可级联）。"""
    out: list = []
    i, n = 0, len(lines)
    while i < n:
        cur = lines[i]
        if _is_fence_toggle(cur):
            out.append(cur)
            i += 1
            while i < n and not _is_fence_toggle(lines[i]):  # 围栏内原样
                out.append(lines[i])
                i += 1
            if i < n:
                out.append(lines[i])
                i += 1
            continue
        if not cur.strip() or _cur_unmergeable(cur):
            out.append(cur)
            i += 1
            continue
        merged = cur
        j = i
        while j + 1 < n:
            nxt = lines[j + 1]
            if not nxt.strip() or _is_fence_toggle(nxt) or _next_structural(nxt):
                break
            if _ends_sentence(merged):
                break
            merged = _join(merged, nxt)
            j += 1
        out.append(merged)
        i = j + 1
    return out


def _mask_fenced(lines: list) -> tuple:
    """把代码围栏整块换成占位行（含未闭合围栏——保守整块保护）。返回 (行列表, 块列表)。"""
    out, blocks, buf, infence = [], [], [], False
    for ln in lines:
        if _is_fence_toggle(ln):
            if not infence:
                infence, buf = True, [ln]
            else:
                infence = False
                buf.append(ln)
                blocks.append("\n".join(buf))
                out.append(_FENCE_PH.format(len(blocks) - 1))
            continue
        (buf if infence else out).append(ln)
    if infence:  # 未闭合围栏：照常保护（宁漏勿错）
        blocks.append("\n".join(buf))
        out.append(_FENCE_PH.format(len(blocks) - 1))
    return out, blocks


_INLINE_CODE_RE = re.compile("`[^`\n]+`")


def _mask_inline_code(text: str) -> tuple:
    codes: list = []

    def _repl(m):
        codes.append(m.group(0))
        return _CODE_PH.format(len(codes) - 1)

    return _INLINE_CODE_RE.sub(_repl, text), codes


def normalize_extracted_text(text: str) -> str:
    """规范化提取文本（幂等）。见模块 docstring 的规则清单。"""
    if not isinstance(text, str):
        return ""
    # R0 行尾归一 + R1 不可见字符/控制字符清理
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    t = _INVISIBLE_RE.sub("", t)
    t = _CONTROL_RE.sub("", t)
    # R2 硬换行合并（围栏感知，行级）
    lines = _merge_hard_wraps(t.split("\n"))
    # 围栏/行内代码 mask 后再做字符级规则（R3/R4），保证代码内容零触碰
    lines, fences = _mask_fenced(lines)
    t = "\n".join(lines)
    t, codes = _mask_inline_code(t)
    # R3 CJK 标点空格清理（逐行；表格行不动）
    out_lines = []
    for ln in t.split("\n"):
        if ln.lstrip().startswith("|"):
            out_lines.append(ln)
            continue
        ln = _R3_BEFORE.sub(r"\1\2", ln)
        ln = _R3_AFTER.sub(r"\1\2", ln)
        out_lines.append(ln)
    t = "\n".join(out_lines)
    # R4a 空行收敛（围栏已 mask，不会误伤代码内空行）
    t = _BLANK_RUN_RE.sub("\n\n", t)
    # R4b 行内连续空白收敛（表格行不动；行首缩进保留——4 空格代码块语义）
    kept = []
    for ln in t.split("\n"):
        if ln.lstrip().startswith("|"):
            kept.append(ln)
            continue
        m = re.match(r"^([ \t]*)(.*)$", ln, re.S)
        lead, core = m.group(1), m.group(2)
        kept.append(lead + re.sub(r"[ \t]{2,}", " ", core.rstrip()))
    t = "\n".join(kept)
    # unmask：先行内代码后围栏（互不嵌套，占位符不冲突）
    for idx, code in enumerate(codes):
        t = t.replace(_CODE_PH.format(idx), code)
    for idx, block in enumerate(fences):
        t = t.replace(_FENCE_PH.format(idx), block)
    return t
