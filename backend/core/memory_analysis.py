import json
import logging

logger = logging.getLogger("coagent.memory_analysis")


def _as_dict(data):
    """SQLite 存的 JSON 字符串转 dict"""
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            return {}
    return {}


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

    import requests as _req
    from core.config import config as _cfg

    def _call_llm(prompt):
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        try:
            resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                headers=h, timeout=60)
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
        # 章节结构（进度条依据：顶层章节标题）
        chapters = []
        try:
            _tree_rows = db.execute("SELECT tree FROM kb_tree WHERE project_id=%s", (project_id,))
            for _tr in _tree_rows or []:
                _t = _tr.get("tree")
                if not _t:
                    continue
                try:
                    _tl = json.loads(_t)
                except json.JSONDecodeError:
                    continue
                for _n in _tl if isinstance(_tl, list) else []:
                    if isinstance(_n, dict) and _n.get("title"):
                        chapters.append(_n["title"])
        except Exception:
            chapters = []
        p = "根据以下对话内容，提炼本项目的情景记忆（JSON格式）：" + NL + "对话内容：" + NL + convo[:6000]
        if chapters:
            p += NL + NL + "课程章节结构（用于判断学习进度）：" + NL + "、".join(chapters[:20])
            p += NL + "请根据对话内容判断每个章节的学习完成度（0-100 的整数，未学到的章节为 0）。"
        p += NL + NL + "JSON格式：" + NL
        p += "{\"抽象目的\":\"项目要达到的目标\",\"抽象项目情况\":\"项目整体情况概括\",\"起点\":\"开始时的水平\",\"当前水平\":\"现在的水平\",\"目标\":\"学习目标\",\"偏好\":[\"方式\"],\"知识点\":[\"概念\"],\"难点\":[\"难点\"],\"薄弱点\":[\"难点\"],\"学习建议\":\"建议\",\"摘要\":\"一句话总结\",\"进度\":{\"章节名\": 完成度整数}}"
        r = _call_llm(p)
        data = _extract_json(r)
        if not isinstance(data, dict):
            data = {}
        if not data:
            _s.stderr.write("[um] 情景JSON解析空" + NL); _s.stderr.flush()
        else:
            # 一个项目只保留一条 project_memories：按 project_id 查（忽略 session）
            rows = db.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
            if rows:
                old = _as_dict(rows[0]["data"]) if rows[0]["data"] else {}
                for k in ["抽象目的","抽象项目情况","起点","当前水平","目标","学习建议","偏好"]:
                    if k in data and data[k]: old[k] = data[k]
                for ak in ["知识点","难点","薄弱点"]:
                    if data.get(ak):
                        arr = old.get(ak, []) if isinstance(old.get(ak), list) else []
                        for item in data[ak]:
                            if item not in arr: arr.append(item)
                        old[ak] = arr
                if data.get("摘要"):
                    old["摘要"] = data["摘要"]
                    ss = old.get("对话摘要", []) if isinstance(old.get("对话摘要"), list) else []
                    ss.append({"摘要": data["摘要"][:200]})
                    old["对话摘要"] = ss[-10:]
                if data.get("进度") and isinstance(data["进度"], dict):
                    old["进度"] = data["进度"]
                db.execute("UPDATE project_memories SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (json.dumps(old, ensure_ascii=False), project_id))
            else:
                db.execute("INSERT INTO project_memories (session_id,project_id,data) VALUES (%s,%s,%s)", (session_id, project_id, json.dumps(data, ensure_ascii=False)))
    except Exception as e:
        _s.stderr.write("[um] 情景异常=" + str(e)[:150] + NL); _s.stderr.flush()

    # 3. 个人记忆（所有项目）
    try:
        # 个人记忆：所有项目所有对话（永久化，不按 session）
        all_dialogs = db.execute("SELECT id, project_id FROM dialogues WHERE archived = 0")
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
        p2 += "{\"基本情况\":\"一段不超过500字的身份与背景概述\",\"学习情况\":{\"总体概述\":\"一小段学习总况概述\",\"课程\":[{\"课程名\":\"\",\"目标\":\"学习目标\",\"当前情况\":\"当前水平概况\"}]}}"
        p2 += NL + "注意：不要输出阅读偏好（阅读偏好由用户手动设置，你只提炼基本情况与学习情况）；每门课程概述不超过500字。"
        r2 = _call_llm(p2)
        gd = _extract_json(r2)
        if not isinstance(gd, dict):
            gd = {}
        if not gd:
            _s.stderr.write("[um] 个人JSON解析空" + NL); _s.stderr.flush()
        else:
            old_rows = db.execute("SELECT data FROM global_profile WHERE session_id=%s", (session_id,))
            old = _as_dict(old_rows[0]["data"]) if old_rows and old_rows[0]["data"] else {}
            # 三栏结构合并：基本情况 / 学习情况（阅读偏好不在此提炼，只由用户问卷/手动设置）
            if gd.get("基本情况"):
                old["基本情况"] = gd["基本情况"]
            if gd.get("学习情况") and isinstance(gd["学习情况"], dict):
                lc = gd["学习情况"]
                old_lc = old.get("学习情况") if isinstance(old.get("学习情况"), dict) else {}
                if lc.get("总体概述"):
                    old_lc["总体概述"] = lc["总体概述"]
                if lc.get("课程"):
                    old_courses = old_lc.get("课程") if isinstance(old_lc.get("课程"), list) else []
                    by_name = {c.get("课程名"): c for c in old_courses if isinstance(c, dict)}
                    for c in lc["课程"]:
                        if not isinstance(c, dict) or not c.get("课程名"):
                            continue
                        nm = c["课程名"]
                        if nm in by_name:
                            for f in ["目标", "当前情况"]:
                                if c.get(f):
                                    by_name[nm][f] = c[f]
                        else:
                            old_courses.append(c)
                    old_lc["课程"] = old_courses
                old["学习情况"] = old_lc
            # 旧字段 → 三栏兼容迁移：用户背景并入基本情况、项目摘要并入学习情况课程（一次性，之后以新结构为准）
            if not old.get("基本情况") and old.get("用户背景"):
                old["基本情况"] = str(old["用户背景"])
                old.pop("用户背景", None)
            if not old.get("学习情况") and old.get("项目摘要"):
                try:
                    _courses = []
                    for _pname, _pv in (old["项目摘要"] or {}).items():
                        if isinstance(_pv, dict):
                            _courses.append({"课程名": str(_pname), "目标": str(_pv.get("目标", "")), "当前情况": str(_pv.get("当前水平", ""))})
                    if _courses:
                        old["学习情况"] = {"总体概述": "", "课程": _courses}
                except Exception:
                    logger.debug("画像项目摘要→课程迁移跳过", exc_info=True)
            has = db.execute("SELECT session_id FROM global_profile WHERE session_id=%s", (session_id,))
            if has:
                db.execute("UPDATE global_profile SET data=%s,updated_at=CURRENT_TIMESTAMP WHERE session_id=%s", (json.dumps(old, ensure_ascii=False), session_id))
            else:
                db.execute("INSERT INTO global_profile (session_id,data) VALUES (%s,%s)", (session_id, json.dumps(old, ensure_ascii=False)))
    except Exception as e:
        _s.stderr.write("[um] 个人异常=" + str(e)[:150] + NL); _s.stderr.flush()