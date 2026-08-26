# -*- coding: utf-8 -*-
"""指标1 · 幻觉率（目标 <5%）。

双通道设计（fable5 方法论 ∩ 评估体系设计稿 L1）：
- 程序通道（主）：抽取回答中的 [来源: xxx] 引用，逐一核对是否命中真实来源集合。
  幻觉率代理 = 无效引用 / 全部引用。N1 修复后引用格式由生成侧强制注入，
  使"引用锚定"同时成为可验证的溯源证据链——评估系统与创新点互相成就。
- LLM 判卷通道（辅，接缝）：异厂商模型判卷（qwen 判 deepseek 产出），
  与审核双 LLM 同一哲学；离线单测以 FakeLLM 注入，不触网。

兜底口径（与设计稿一致）：零引用回答不计入幻觉率分母
——走通识申明分支的回答由「申明是否存在」另行为诚实性检查，不混入本指标。
"""
import re

_CITE_RE = re.compile(r"\[来源[:：]\s*([^\]]+)\]")


def extract_citations(answer: str) -> list[str]:
    """抽取回答中全部 [来源: xxx] 引用文本。"""
    return [m.strip() for m in _CITE_RE.findall(answer or "")]


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", (s or "")).lower()


def verify_citations(answer: str, sources: list) -> dict:
    """程序通道核验。sources: 检索留存条目列表（title/url/content 字段可选）。

    返回 {total, valid, invalid, invalid_ratio}；
    total==0 时 invalid_ratio=None（不计入口径）。"""
    titles = []
    for s in sources or []:
        if isinstance(s, dict):
            for k in ("title", "source", "url"):
                if s.get(k):
                    titles.append(_norm(str(s[k])))
        elif isinstance(s, str) and s.strip():
            titles.append(_norm(s))
    cits = extract_citations(answer)
    valid = 0
    invalid_items = []
    for c in cits:
        nc = _norm(c)
        if any(nc in t or t in nc for t in titles if t):
            valid += 1
        else:
            invalid_items.append(c)
    total = len(cits)
    return {"total": total, "valid": valid,
            "invalid": total - valid,
            "invalid_items": invalid_items,
            "invalid_ratio": (round((total - valid) / total, 4)) if total else None}


def llm_judge_hallucination(judge_llm, answer: str, context_digest: str) -> dict:
    """LLM 判卷通道接缝：judge_llm 需提供 .chat(messages, max_tokens=...) → str。
    只输出 JSON {hallucinated: true|false, suspicious_claims: [..]}；解析失败返回 {skipped: True}。
    生产注入异厂商模型（qwen 判 deepseek）；离线测试注入脚本化假件。"""
    import json
    prompt = (
        "你是独立事实核查员（与回答生成者不同源）。依据参考上下文判断回答是否含虚构事实。\n"
        '只输出 JSON：{"hallucinated": true|false, "suspicious_claims": ["可疑断言", ...]}\n'
        + (f"【参考上下文】{context_digest[:1500]}\n" if context_digest else "")
        + f"【待核查回答】{(answer or '')[:2000]}"
    )
    try:
        raw = judge_llm.chat([{"role": "user", "content": prompt}], max_tokens=300) or ""
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            return {"skipped": True}
        out = json.loads(m.group())
        return {"hallucinated": bool(out.get("hallucinated")),
                "suspicious_claims": [str(x)[:120] for x in (out.get("suspicious_claims") or [])]}
    except Exception:
        return {"skipped": True}


def hallucination_summary(verifications: list) -> dict:
    """跨样例汇总：全部引用聚合后算总体无效率。verifications 为 verify_citations 输出列表。"""
    tot = sum(v["total"] for v in verifications)
    bad = sum(v["invalid"] for v in verifications)
    return {"citation_total": tot, "citation_invalid": bad,
            "invalid_ratio": round(bad / tot, 4) if tot else None}
