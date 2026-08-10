import json


def _extract_questions(text):
    """从 AI 返回文本中提取问题数组（容错：去代码块围栏 + 取 [...] 部分）"""
    if not text:
        return []
    s = text.strip()
    if s.startswith("```"):
        lines = s.split(chr(10))
        lines = [l for l in lines if not l.strip().startswith("```")]
        s = chr(10).join(lines).strip()
    start = s.find("[")
    end = s.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        arr = json.loads(s[start:end + 1])
    except Exception:
        return []
    out = []
    for q in arr:
        if isinstance(q, str) and q.strip():
            out.append(q.strip())
        elif isinstance(q, dict):
            v = q.get("question") or q.get("问题") or ""
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
    return out[:3]


def generate_followups(api_key, project_id, dialogue_id, db):
    """读当前对话最近一轮问答，LLM 生成 3 条针对性追问，持久化到 followups 表"""
    NL = chr(10)
    import sys as _s

    import requests as _req
    from core.config import config as _cfg

    try:
        msgs = db.execute(
            "SELECT role, content FROM messages WHERE dialogue_id=%s ORDER BY created_at DESC LIMIT 4",
            (dialogue_id,),
        )
        if not msgs:
            return
        convo = ""
        for m in reversed(msgs):
            c = str(m["content"] or "")[:1200]
            if c and c != "（系统未生成内容）":
                convo += ("用户: " if m["role"] == "user" else "AI: ") + c + NL + NL
        if not convo.strip():
            return

        prompt = (
            "基于以下学习对话，为用户生成 3 条最有价值的追问问题。" + NL
            + "要求：1) 每条一句话，不超过 40 字；2) 针对回答中的核心概念深挖、实际应用、进阶学习三个不同角度；3) 以 JSON 数组返回，不要任何额外文字。" + NL + NL
            + "对话内容：" + NL + convo[:4000] + NL + NL
            + 'JSON 格式：["问题1", "问题2", "问题3"]'
        )
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        resp = _req.post(
            _cfg.DEEPSEEK_BASE_URL + "/chat/completions",
            json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
            headers=h, timeout=60,
        )
        if resp.status_code != 200:
            _s.stderr.write("[followups] llm status=" + str(resp.status_code) + NL); _s.stderr.flush()
            return
        questions = _extract_questions(resp.json()["choices"][0]["message"]["content"])
        if not questions:
            _s.stderr.write("[followups] 解析为空" + NL); _s.stderr.flush()
            return
        payload = json.dumps(questions, ensure_ascii=False)
        exist = db.execute("SELECT dialogue_id FROM followups WHERE dialogue_id=%s", (dialogue_id,))
        if exist:
            db.execute("UPDATE followups SET questions=%s, updated_at=CURRENT_TIMESTAMP WHERE dialogue_id=%s", (payload, dialogue_id))
        else:
            db.execute("INSERT INTO followups (dialogue_id, project_id, questions) VALUES (%s,%s,%s)", (dialogue_id, project_id, payload))
        _s.stderr.write("[followups] 写入 " + str(len(questions)) + " 条" + NL); _s.stderr.flush()
    except Exception as e:
        _s.stderr.write("[followups] err=" + str(e)[:150] + NL); _s.stderr.flush()
