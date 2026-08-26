# -*- coding: utf-8 -*-
"""幻觉率双通道（官方目标 <5%）：
通道A（程序）：校验回答里 [来源:xxx#chunk-N] 引用是否真实存在且内容相符
                —— 把系统的"引用锚定机制"变成可验证的溯源证据
通道B（LLM）：智谱逐句找编造陈述（含预埋陷阱事实）
幻觉率 = (虚假引用数 + LLM 判错句数) / (句数 + 引用数)
"""
import json
import re
from ._common import zhipu_judge_json, split_sentences


def check_citations(reply, knowledge):
    """通道A：校验回答里的引用标注。

    knowledge 结构：[{"content": "...", "metadata": {"source": "文档名", "chunk": 0, ...}}]
    回答引用格式：[来源:文档名#chunk-N]
    返回 (虚假引用数, 引用总数)；回答没引用 → (0, 0)（引用通道不参与，不算错）
    """
    if not knowledge:
        return 0, 0
    real = {}
    for k in knowledge:
        meta = k.get("metadata") or {}
        src = (meta.get("source") or "").strip()
        ck = meta.get("chunk", -1)
        if src:
            real[(src, ck)] = k.get("content", "")
    pattern = re.compile(r"\[来源:([^#\]]+)#chunk-(\d+)\]")
    refs = pattern.findall(reply or "")
    fake = 0
    for src, n in refs:
        if (src.strip(), int(n)) not in real:
            fake += 1  # 引用了系统没检索到的 chunk = 无依据陈述（幻觉）
    return fake, len(refs)


def calc(results, annotations):
    """双通道幻觉率 = (虚假引用数 + LLM 判错句数) / (句数 + 引用数)"""
    total_stmt, total_err = 0, 0
    for r in results:
        reply = r["reply"] or ""
        knowledge = (r.get("internals") or {}).get("knowledge")
        # 通道A：程序校验引用
        fake_refs, n_refs = check_citations(reply, knowledge)
        # 通道B：智谱逐句找编造（含陷阱事实）
        kb_key = r["question"].get("kb_key", "")
        traps = (annotations.get(kb_key) or {}).get("陷阱事实", [])
        prompt = (
            "下面是一段 AI 生成的学习内容，请逐句检查，找出其中【错误或编造的陈述】"
            "（尤其与这些陷阱事实相符的：" + json.dumps(traps, ensure_ascii=False) + "）。\n\n"
            "学习内容：\n" + reply[:4000] + "\n\n"
            '输出 JSON 数组：错误陈述的原文列表；没有错误输出 []。'
        )
        errs = zhipu_judge_json(prompt)
        if not isinstance(errs, list):
            errs = []
        n_sent = len(split_sentences(reply))
        total_stmt += max(1, n_sent + n_refs)
        total_err += len(errs) + fake_refs
    return total_err / total_stmt if total_stmt else 1.0
