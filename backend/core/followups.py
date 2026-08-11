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


def generate_followups(api_key, project_id, dialogue_id, db, focus="purpose"):
    """读当前对话最近一轮问答，LLM 生成 3 条追问，持久化到 followups 表。
    focus="purpose"：追问聚焦推进用户的学习目的（注入课程记忆中的目的/目标/当前水平）；
    focus="expand"：追问聚焦横向拓展或轻松闲聊（不严肃、无压力）。"""
    NL = chr(10)
    import sys as _s
    import json as _json

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

        # 课程记忆：目的推进风格需要注入学习目的/目标/当前水平
        goal_txt = ""
        if focus == "purpose":
            try:
                rows = db.execute("SELECT data FROM project_memories WHERE project_id=%s", (project_id,))
                if rows and rows[0].get("data"):
                    mem = rows[0]["data"]
                    if isinstance(mem, str):
                        try:
                            mem = _json.loads(mem)
                        except Exception:
                            mem = {}
                    if isinstance(mem, dict):
                        parts = []
                        for k in ("抽象目的", "目标", "当前水平", "难点", "薄弱点"):
                            v = mem.get(k)
                            if v:
                                parts.append(f"{k}：{v if isinstance(v, str) else '、'.join(str(x) for x in v)}")
                        if parts:
                            goal_txt = NL + "课程学习目的/现状：" + NL + NL.join(parts)
            except Exception:
                goal_txt = ""

        if focus == "expand":
            prompt = (
                "基于以下学习对话，为用户生成 3 条横向拓展或轻松闲聊性质的追问。" + NL
                + "要求：1) 每条一句话，不超过 20 字；2) 问句必须以用户本人会亲自输入的口吻写出（第一人称或无主语祈使句，如\"我想知道…\"、\"怎么理解…\"、\"能举几个例子吗\"），禁止\"你是否想…\"、\"建议你…\"、\"你想学…\"等产品口吻；3) 聚焦话题的横向延伸（相关概念、实际生活应用、有趣冷知识等）或轻松闲聊（不严肃、无学习压力）；4) 以 JSON 数组返回，不要任何额外文字。" + NL + NL
                + "对话内容：" + NL + convo[:4000] + NL + NL
                + 'JSON 格式：["问题1", "问题2", "问题3"]'
            )
        else:
            prompt = (
                "基于以下学习对话与课程学习目的，为用户生成 3 条最能推进学习目的达成的追问。" + NL
                + "要求：1) 每条一句话，不超过 20 字；2) 问句必须以用户本人会亲自输入的口吻写出（第一人称或无主语祈使句，如\"我想知道…\"、\"怎么理解…\"、\"能举个例子吗\"），禁止\"你是否想…\"、\"建议你…\"、\"你想学…\"等产品口吻；3) 追问聚焦于推进学习进程（检验是否理解、攻克薄弱点、衔接下一步学习内容、向学习目标迈进），不闲聊；4) 以 JSON 数组返回，不要任何额外文字。" + NL
                + goal_txt + NL + NL
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
    except Exception as e:
        _s.stderr.write("[followups] err=" + str(e)[:150] + NL); _s.stderr.flush()
