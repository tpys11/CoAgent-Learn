# -*- coding: utf-8 -*-
"""知识点覆盖率双通道（官方目标 ≥90%）：
通道A（关键词）：知识点提取关键词（优先 jieba，无 jieba 用滑动窗口），检查是否出现在回答里
通道B（语义）：智谱判回答实际覆盖了清单里的哪些知识点
覆盖率 = (关键词命中率 + 语义覆盖) / 2
"""
import json
from ._common import zhipu_judge_json

_STOPS = set("的了是在一有和与及或这对那也并把被个们于而就都还")


def _info_frags(kp):
    """无 jieba 时的 fallback：从知识点里提取 2-4 字信息片段（跳过纯虚词）"""
    import re
    segs = re.split(r"[，。、；：！？\s]+", kp or "")
    frags = set()
    for seg in segs:
        s = seg.strip()
        if len(s) < 2:
            continue
        for i in range(len(s)):
            for j in range(i + 2, min(i + 7, len(s) + 1)):
                frag = s[i:j]
                if frag[0] in _STOPS or frag[-1] in _STOPS:
                    continue
                if all(ch in _STOPS for ch in frag):
                    continue
                frags.add(frag)
                if len(frags) >= 8:
                    return list(frags)
    return list(frags)


def _keyword_coverage(reply, kl):
    """通道A：每个知识点命中即算覆盖。优先 jieba 分词，缺 jieba 用滑动窗口片段。"""
    if not kl:
        return 0.0
    reply = reply or ""
    try:
        import jieba
        def frags_of(kp):
            return [w for w in jieba.cut(kp) if len(w) >= 2]
    except Exception:
        def frags_of(kp):
            return _info_frags(kp)
    hit = 0
    for kp in kl:
        frags = frags_of(kp)
        if any(f in reply for f in frags):
            hit += 1
    return hit / len(kl)


def _semantic_coverage(reply, kl):
    """通道B：智谱判覆盖"""
    if not kl:
        return 0.0
    covered = zhipu_judge_json(
        "下面是一段 AI 生成的学习内容，请找出其中【实际覆盖到】的核心知识点"
        "（只从给定清单里选，用清单原文）：\n\n"
        "学习内容：\n" + (reply or "")[:4000] + "\n\n"
        "核心知识点清单：" + json.dumps(kl, ensure_ascii=False)
    )
    if not isinstance(covered, list):
        covered = []
    return len(covered) / len(kl)


def calc(results, annotations):
    """双通道覆盖率（取平均）"""
    total = 0.0
    n = 0
    for r in results:
        kb_key = r["question"].get("kb_key", "")
        kl = (annotations.get(kb_key) or {}).get("知识点清单", [])
        if not kl:
            continue
        reply = r["reply"] or ""
        kw = _keyword_coverage(reply, kl)
        sem = _semantic_coverage(reply, kl)
        total += (kw + sem) / 2
        n += 1
    return total / n if n else 0.0
