# -*- coding: utf-8 -*-
"""会话记忆压缩（上下文自动压缩，后台线程执行，用户无感知）

对齐 DeepTutor 的 token 预算制：
- 触发：未压缩消息估算 token 超过预算
- 压缩：把最早的部分压成结构化摘要，近期原文保留
- 保留：压缩不物理删消息，被压消息向量化存入 message_vectors，生成时可检索召回
"""
import sys as _s
import logging

NL = "\n"
logger = logging.getLogger("coagent.compress")

# 近期原文保留预算：未压缩消息估算 token 超过此值才触发压缩
HISTORY_TOKEN_BUDGET = 12000


def _est_tokens(text: str) -> int:
    from core.helpers import estimate_tokens
    return estimate_tokens(text)


def _call_llm(api_key: str, prompt: str, max_tokens: int = 1200) -> str:
    from core.base_llm import DeepSeekLLM
    llm = DeepSeekLLM(api_key=api_key)
    try:
        return llm.chat([{"role": "user", "content": prompt}], max_tokens=max_tokens) or ""
    except Exception as e:
        _s.stderr.write("[compress] LLM 异常=" + str(e)[:120] + NL)
        return ""


def compress_dialogue(api_key: str, dialogue_id: str, db) -> bool:
    """压缩对话最早的部分（后台调用）；返回是否执行了压缩。
    失败静默返回 False（不影响任何功能，原文照常注入）。"""
    if not dialogue_id or dialogue_id == "default":
        return False
    try:
        rows = db.execute("SELECT summary, compressed_upto FROM dialogues WHERE id=%s", (dialogue_id,))
        if not rows:
            return False
        summary = (rows[0].get("summary") or "") if isinstance(rows[0], dict) else ""
        upto = int((rows[0].get("compressed_upto") or 0) if isinstance(rows[0], dict) else 0)
        msgs = db.execute(
            "SELECT id, role, content FROM messages WHERE dialogue_id=%s AND id > %s ORDER BY id ASC",
            (dialogue_id, upto))
        if not msgs:
            return False
        total_tokens = sum(_est_tokens(str(m.get("content") or "")) for m in msgs)
        if total_tokens <= HISTORY_TOKEN_BUDGET:
            return False
        # 从末尾往前，保留近期消息直到塞满预算；其余压进摘要
        keep_tokens = 0
        keep_from_idx = len(msgs)
        for i in range(len(msgs) - 1, -1, -1):
            t = _est_tokens(str(msgs[i].get("content") or ""))
            if keep_tokens + t > HISTORY_TOKEN_BUDGET:
                break
            keep_tokens += t
            keep_from_idx = i
        to_compress = msgs[:keep_from_idx]
        if not to_compress:
            return False
        convo = ""
        for m in to_compress:
            c = str(m.get("content") or "")[:300]
            if c and c != "（系统未生成内容）":
                convo += ("用户: " if m.get("role") == "user" else "AI: ") + c + NL
        if not convo.strip():
            return False
        # 结构化摘要（对齐 DeepTutor）
        prompt = (
            "你负责维护一份对话的滚动摘要，供后续轮次无缝衔接。请基于给定材料重写摘要，按以下小节组织"
            "（无内容的小节直接省略）：\n"
            "- 目标：用户想完成什么，以及（如有说明）原因\n"
            "- 关键事实与上下文：稳定的事实、定义、数据、名称、引用\n"
            "- 决定与偏好：已做的选择、被否决的方案、风格/格式偏好、模式切换\n"
            "- 进展：目前已经产出或完成的内容\n"
            "- 待办事项：未回答的问题、未完成的任务、已知阻塞\n"
            "已有摘要中仍然有效的条目应原样保留，仅在新信息与之矛盾时修改，只删除确已过时的内容。"
            "优先保留具体细节，不要抽象转述，绝不虚构。\n"
        )
        if summary:
            prompt += "\n已有摘要（请合并更新）：\n" + summary[:1500] + "\n"
        prompt += "\n新增对话：\n" + convo[:8000] + "\n\n只输出新的完整摘要（不超过 3000 字）："
        new_summary = _call_llm(api_key, prompt)
        if not new_summary.strip():
            return False
        # 压缩区间消息向量化（历史召回）
        try:
            from core.knowledge_service import _embed
            texts = [str(m.get("content") or "")[:500] for m in to_compress]
            texts = [t for t in texts if t and t != "（系统未生成内容）"]
            if texts:
                embs = _embed(texts)
                for t, e in zip(texts, embs):
                    db.insert_message_vector(dialogue_id, "user", t, e)
        except Exception:
            logger.exception("压缩消息向量化失败 dialogue_id=%s", dialogue_id)
        last_compressed_id = to_compress[-1].get("id", upto)
        db.execute("UPDATE dialogues SET summary=%s, compressed_upto=%s WHERE id=%s",
                   (new_summary.strip()[:3000], last_compressed_id, dialogue_id))
        return True
    except Exception as e:
        _s.stderr.write("[compress] 异常=" + str(e)[:150] + NL)
        return False
