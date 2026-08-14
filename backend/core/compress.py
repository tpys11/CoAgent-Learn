"""会话记忆压缩（上下文自动压缩，后台线程执行，用户无感知）

方案：
- 触发：每满 30 条未压缩消息，程序级触发
- 压缩量：每次压缩最早的 30%（通常包含上一次摘要与部分原始对话）
- 保留逻辑：与记忆提炼同源（偏好/背景/目标、事实性信息、明确要求记住的、对话脉络；不保留寒暄/重复/被覆盖旧信息）
- 历史找回：压缩不物理删除，消息向量化存入 message_vectors，生成时可检索召回
"""
import sys as _s

NL = "\n"


def _call_llm(api_key: str, prompt: str, max_tokens: int = 1200) -> str:
    from core.base_llm import DeepSeekLLM
    llm = DeepSeekLLM(api_key=api_key)
    try:
        return llm.chat([{"role": "user", "content": prompt}], max_tokens=max_tokens) or ""
    except Exception as e:
        _s.stderr.write("[compress] LLM 异常=" + str(e)[:120] + NL)
        return ""


def compress_dialogue(api_key: str, dialogue_id: str, db) -> bool:
    """压缩对话最早的 30%（后台调用）；返回是否执行了压缩。
    失败静默返回 False（不影响任何功能，原文照常注入）。"""
    if not dialogue_id or dialogue_id == "default":
        return False
    try:
        rows = db.execute("SELECT summary, compressed_upto FROM dialogues WHERE id=%s", (dialogue_id,))
        if not rows:
            return False
        summary = (rows[0].get("summary") or "") if isinstance(rows[0], dict) else ""
        upto = int((rows[0].get("compressed_upto") or 0) if isinstance(rows[0], dict) else 0)
        # 未压缩区消息数
        tr = db.execute("SELECT count(*) AS c FROM messages WHERE dialogue_id=%s AND id > %s", (dialogue_id, upto))
        total = int(tr[0]["c"]) if tr else 0
        if total < 30:
            return False
        # 压缩最早的 30%（至少 9 条，避免过小输入）
        n = max(9, int(total * 0.3))
        msgs = db.execute(
            "SELECT id, role, content FROM messages WHERE dialogue_id=%s AND id > %s ORDER BY id ASC LIMIT %s",
            (dialogue_id, upto, n))
        if not msgs:
            return False
        convo = ""
        for m in msgs:
            c = str(m.get("content") or "")[:300]
            if c and c != "（系统未生成内容）":
                convo += ("用户: " if m.get("role") == "user" else "AI: ") + c + NL
        if not convo.strip():
            return False
        prompt = (
            "把以下对话压缩成会话摘要。保留：用户明确的偏好/背景/目标（身份、学习方式、阅读偏好……）、"
            "事实性信息（学过的知识点、结论、决定）、用户明确说'记住/重要/下次'的内容、对话脉络（问了什么、解决了什么）。"
            "不保留：寒暄、重复、修正过程、已被后续覆盖的旧信息。\n"
        )
        if summary:
            prompt += "\n已有摘要（请合并更新）：\n" + summary[:1500] + "\n"
        prompt += "\n新增对话：\n" + convo[:6000] + "\n\n只输出新的完整摘要（不超过 800 字）："
        new_summary = _call_llm(api_key, prompt)
        if not new_summary.strip():
            return False
        # 压缩区间消息向量化（历史召回：细节可检索找回）
        try:
            from core.knowledge_service import _embed
            texts = [str(m.get("content") or "")[:500] for m in msgs]
            texts = [t for t in texts if t and t != "（系统未生成内容）"]
            if texts:
                embs = _embed(texts)
                for t, e in zip(texts, embs):
                    db.insert_message_vector(dialogue_id, "user", t, e)
        except Exception:
            pass  # 向量化失败不影响压缩本身
        db.execute("UPDATE dialogues SET summary=%s, compressed_upto=%s WHERE id=%s",
                   (new_summary.strip()[:3000], upto + n, dialogue_id))
        return True
    except Exception as e:
        _s.stderr.write("[compress] 异常=" + str(e)[:150] + NL)
        return False
