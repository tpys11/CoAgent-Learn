# -*- coding: utf-8 -*-
"""会话记忆压缩（上下文自动压缩，后台线程执行，用户无感知）

对齐 DeepTutor 的 token 预算制：
- 触发：未压缩消息估算 token 超过预算（窗口 × 35%）
- 预算：历史 = max(256, 窗口×35%)；摘要 = max(96, 历史×40%)；近期原文 = 历史 − 摘要；re-summarize 源 = max(1024, 窗口÷2)
- 压缩：把最早的部分压成结构化摘要，近期原文保留；被压原文 ≤ 源预算时用全文重建（rebuild-from-raw）
- 截断守卫：压缩产物（摘要+近期原文）估算 ≥ 预算 95% 时，从保留区间最旧开始丢（硬护栏，只丢最旧）
- 保留：压缩不物理删消息，被压消息向量化存入 message_vectors，生成时可检索召回
- 游标：只在成功时推进；任何失败静默返回 False（原文照常注入）
"""
import sys as _s
import logging

NL = "\n"
logger = logging.getLogger("coagent.compress")

# 模型上下文窗口（无配置源，兜底值；后续档位化时从能力注册表读取）
MODEL_WINDOW_TOKENS = 12000


def _budgets(window: int | None = None):
    w = window or MODEL_WINDOW_TOKENS
    history = max(256, int(w * 0.35))
    summary = max(96, int(history * 0.40))
    keep = history - summary
    re_summarize = max(1024, int(w / 2))
    return history, summary, keep, re_summarize


# 生成侧注入也用它（agents/graph.py import）
HISTORY_TOKEN_BUDGET, _, _, _ = _budgets()


def _est_tokens(text: str) -> int:
    try:
        import tiktoken
        _enc = tiktoken.get_encoding("cl100k_base")
        return len(_enc.encode(text))
    except Exception:
        from core.helpers import estimate_tokens
        return estimate_tokens(text)


def _call_llm(api_key: str, prompt: str, max_tokens: int = 1200) -> str:
    from core.base_llm import DeepSeekLLM
    from core.model_provider import resolve_model, current_tier
    # R-D S3：模型/端点改问注册表 main 格（后台无 req→current_tier，测试档随决策 38 走 zen）；
    # standard 格 key 保持调用方原值（本点原无 or 链，不新增——逐字节等价）
    spec = resolve_model("main", current_tier())
    key = (spec.api_key or api_key) if spec.provider == "zen" else api_key
    llm = DeepSeekLLM(api_key=key, model=spec.model, base_url=spec.base_url)
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
        history_budget, summary_budget, keep_budget, re_summarize_budget = _budgets()
        total_tokens = sum(_est_tokens(str(m.get("content") or "")) for m in msgs)
        if total_tokens <= history_budget:
            return False
        # 从末尾往前，保留近期消息直到塞满 keep 预算；其余压进摘要
        keep_tokens = 0
        keep_from_idx = len(msgs)
        for i in range(len(msgs) - 1, -1, -1):
            t = _est_tokens(str(msgs[i].get("content") or ""))
            if keep_tokens + t > keep_budget:
                break
            keep_tokens += t
            keep_from_idx = i
        to_compress = msgs[:keep_from_idx]
        if not to_compress:
            return False
        # rebuild-from-raw：被压原文估算 ≤ re-summarize 源预算时用全文；超限才截断
        convo = ""
        for m in to_compress:
            c = str(m.get("content") or "")
            if c and c != "（系统未生成内容）":
                convo += ("用户: " if m.get("role") == "user" else "AI: ") + c + NL
        if not convo.strip():
            return False
        if _est_tokens(convo) > re_summarize_budget:
            trimmed = []
            for m in to_compress:
                c = str(m.get("content") or "")[:300]
                if c and c != "（系统未生成内容）":
                    trimmed.append(("用户: " if m.get("role") == "user" else "AI: ") + c)
            # 截断守卫：仍超预算时从尾部逐条丢（丢最后一条，不重排语义）
            while trimmed and _est_tokens(NL.join(trimmed)) > re_summarize_budget:
                trimmed.pop()
            convo = NL.join(trimmed)
            if not convo.strip():
                return False
        # 结构化摘要（对齐 DeepTutor 五段式；目标 80% 预算、max_tokens 100%）
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
        target_chars = int(summary_budget * 0.8 * 2)
        prompt += f"\n新增对话：\n{convo}\n\n只输出新的完整摘要（目标不超过 {target_chars} 字）："
        new_summary = _call_llm(api_key, prompt, max_tokens=summary_budget)
        if not new_summary.strip():
            return False
        # 截断守卫：压缩产物（摘要+近期原文）估算 ≥ 预算 95% 时，从保留区间最旧开始丢（硬护栏，只丢最旧）
        total_after = _est_tokens(new_summary.strip()) + keep_tokens
        guard = history_budget * 0.95
        while total_after >= guard and keep_from_idx < len(msgs):
            t = _est_tokens(str(msgs[keep_from_idx].get("content") or ""))
            total_after -= t
            keep_from_idx += 1
        # 压缩区间消息向量化（历史召回）已移除（2026-08-21）：message_vectors 死表删除，
        # 对话记忆以文本形式承载（summary + compressed_upto 游标），不再做向量召回。
        last_compressed_id = to_compress[-1].get("id", upto)
        db.execute("UPDATE dialogues SET summary=%s, compressed_upto=%s WHERE id=%s",
                   (new_summary.strip()[: summary_budget * 2], last_compressed_id, dialogue_id))
        return True
    except Exception as e:
        _s.stderr.write("[compress] 异常=" + str(e)[:150] + NL)
        return False