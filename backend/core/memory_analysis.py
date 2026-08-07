import json


def _extract_json(text):
    """从 AI 返回文本中提取 JSON 对象"""
    if not text:
        return {}
    s = text.strip()
    if s.startswith("```"):
        lines = s.split(chr(10))
        lines = [l for l in lines if not l.strip().startswith("```")]
        s = chr(10).join(lines).strip()
    start = s.find("{")
    end = s.rfind("}")
    if start >= 0 and end > start:
        s = s[start:end+1]
    try:
        return json.loads(s)
    except Exception:
        return {}


def update_memories(api_key, project_id, dialogue_id, db, session_id="default"):
    """读 messages 表，AI 提炼生成情景记忆(project_memories)和个人记忆(global_profile)"""
    NL = chr(10)
    import sys as _s
    _s.stderr.write("[um] start pid=" + str(project_id)[:10] + " did=" + str(dialogue_id)[:10] + " sid=" + str(session_id)[:10] + NL); _s.stderr.flush()

    import requests as _req
    from core.config import config as _cfg

    def _call_llm(prompt):
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        try:
            resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                json={"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}]},
                headers=h, timeout=60)
            _s.stderr.write("[call] status=" + str(resp.status_code) + " len=" + str(len(resp.text)) + NL); _s.stderr.flush()
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"] or ""
            return ""
        except Exception as e:
            _s.stderr.write("[call] err=" + str(e)[:150] + NL); _s.stderr.flush()
            return ""

    # 1. 读当前项目所有对话消息
    try:
        dialogs = db.execute("SELECT id FROM dialogues WHERE project_id=%s", (project_id,))
        if not dialogs:
            return
        d_ids = [d["id"] for d in dialogs]
        ph = ",".join(["%s"] * len(d_ids))
        msgs = db.execute("SELECT role, content FROM messages WHERE dialogue_id IN (" + ph + ") ORDER BY created_at LIMIT 60", tuple(d_ids))
        if not msgs:
            return
        _s.stderr.write("[um] msgs=" + str(len(msgs)) + NL); _s.stderr.flush()
        convo = ""
        for m in msgs:
            c = str(m["content"] or "")[:300]
            if c and c != "（系统未生成内容）":
                convo += ("用户: " if m["role"] == "user" else "AI: ") + c + NL
    except Exception as e:
        _s.stderr.write("[um] 读数据失败=" + str(e)[:100] + NL); _s.stderr.flush()
        return

    # 2. 情景记忆（当前项目）
    try:
        p = "根据以下对话内容，提炼本项目的情景记忆（JSON格式）：" + NL + "对话内容：" + NL + convo[:6000]
        p += NL + NL + "JSON格式：" + NL
        p += "{\"项目概述\":\"本项目学习内容概括\",\"当前进度\":\"学到哪了\",\"领域\":\"学科领域\",\"水平\":\"beginner/intermediate/advanced\",\"兴趣\":[\"话题\"],\"偏好\":[\"方式\"],\"知识点\":[\"概念\"],\"薄弱点\":[\"难点\"],\"学习建议\":\"建议\",\"摘要\":\"一句话总结\"}"
        r = _call_llm(p)
        data = _extract_json(r)
        if not isinstance(data, dict):
            data = {}
        if not data:
            _s.stderr.write("[um] 情景JSON解析空" + NL); _s.stderr.flush()
        else:
            rows = db.execute("SELECT data FROM project_memories WHERE session_id=%s AND project_id=%s", (session_id, project_id))
            if rows:
                old = dict(rows[0]["data"]) if rows[0]["data"] else {}
                for k in ["项目概述","当前进度","学习建议","领域","水平","兴趣","偏好"]:
                    if k in data and data[k]: old[k] = data[k]
                for ak in ["知识点","难点","薄弱点"]:
                    if data.get(ak):
                        arr = old.get(ak, [])
                        for item in data[ak]:
                            if item not in arr: arr.append(item)
                        old[ak] = arr
                if data.get("摘要"):
                    old["摘要"] = data["摘要"]
                    ss = old.get("对话摘要", [])
                    ss.append({"摘要": data["摘要"][:200]})
                    old["对话摘要"] = ss[-10:]
                db.execute("UPDATE project_memories SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE session_id=%s AND project_id=%s", (json.dumps(old, ensure_ascii=False), session_id, project_id))
            else:
                db.execute("INSERT INTO project_memories (session_id,project_id,data) VALUES (%s,%s,%s)", (session_id, project_id, json.dumps(data, ensure_ascii=False)))
            _s.stderr.write("[um] 情景写入完成" + NL); _s.stderr.flush()
    except Exception as e:
        _s.stderr.write("[um] 情景异常=" + str(e)[:150] + NL); _s.stderr.flush()

    # 3. 个人记忆（所有项目）
    try:
        all_dialogs = db.execute("SELECT id, project_id FROM dialogues WHERE session_id=%s", (session_id,))
        if not all_dialogs:
            return
        all_ids = [d["id"] for d in all_dialogs]
        ph2 = ",".join(["%s"] * len(all_ids))
        all_msgs = db.execute("SELECT role, content FROM messages WHERE dialogue_id IN (" + ph2 + ") ORDER BY created_at LIMIT 80", tuple(all_ids))
        all_convo = ""
        for m in all_msgs:
            c = str(m["content"] or "")[:300]
            if c and c != "（系统未生成内容）":
                all_convo += ("用户: " if m["role"] == "user" else "AI: ") + c + NL
        p2 = "根据以下对话内容，提炼用户全局个人画像（JSON格式）：" + NL + "对话内容：" + NL + all_convo[:6000]
        p2 += NL + NL + "JSON格式：" + NL
        p2 += "{\"用户背景\":\"身份专业\",\"偏好提问方式\":[\"方式\"],\"偏好学习方式\":[\"方式\"],\"偏好_输出\":[\"格式\"],\"学习时长\":\"\",\"学习内容\":[\"学科\"],\"项目摘要\":{\"项目名\":{\"领域\":\"\",\"水平\":\"\",\"薄弱点\":[\"\"],\"兴趣\":[\"\"],\"偏好\":[\"\"]}}}"
        r2 = _call_llm(p2)
        gd = _extract_json(r2)
        if not isinstance(gd, dict):
            gd = {}
        if not gd:
            _s.stderr.write("[um] 个人JSON解析空" + NL); _s.stderr.flush()
        else:
            old_rows = db.execute("SELECT data FROM global_profile WHERE session_id=%s", (session_id,))
            old = dict(old_rows[0]["data"]) if old_rows and old_rows[0]["data"] else {}
            for k in ["用户背景","偏好提问方式","偏好学习方式","偏好_输出","学习时长","学习内容"]:
                if k in gd and gd[k]: old[k] = gd[k]
            if gd.get("项目摘要"):
                pm = db.execute("SELECT data FROM project_memories WHERE session_id=%s AND project_id=%s", (session_id, project_id))
                proj = pm[0]["data"] if pm and pm[0]["data"] else {}
                label = project_id if project_id != "default" else "默认项目"
                ps = old.get("项目摘要", {})
                ps[label] = {"领域": proj.get("领域",""), "水平": proj.get("水平",""), "薄弱点": proj.get("薄弱点",[]), "兴趣": proj.get("兴趣",[]), "偏好": proj.get("偏好",[])}
                old["项目摘要"] = ps
            has = db.execute("SELECT session_id FROM global_profile WHERE session_id=%s", (session_id,))
            if has:
                db.execute("UPDATE global_profile SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE session_id=%s", (json.dumps(old, ensure_ascii=False), session_id))
            else:
                db.execute("INSERT INTO global_profile (session_id,data) VALUES (%s,%s)", (session_id, json.dumps(old, ensure_ascii=False)))
            _s.stderr.write("[um] 个人写入完成" + NL); _s.stderr.flush()
    except Exception as e:
        _s.stderr.write("[um] 个人异常=" + str(e)[:150] + NL); _s.stderr.flush()