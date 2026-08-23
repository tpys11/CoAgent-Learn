# -*- coding: utf-8 -*-
"""记忆编辑：检测 [模块名] 引用 → AI 分析并修改记忆。"""
import json
import re

from core.helpers import _as_dict, extract_json_obj


GLOBAL_MEM_KEYS = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
PROJECT_MEM_KEYS = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]


def memory_edit(api_key: str, message: str, project_id: str, session_id: str) -> dict | None:
    """检测 [模块名] 引用 → AI 分析并修改记忆；返回 {"reply":..., "steps":...}，非引用消息返回 None"""
    m = re.search(r"\[([^\[\]]{1,16})\]", message)
    if not m:
        return None
    key = m.group(1).strip()
    rest = message[m.end():].strip()
    is_global = key in GLOBAL_MEM_KEYS
    is_project = key in PROJECT_MEM_KEYS
    if not (is_global or is_project):
        return None
    from core.postgres_client import pg_client as _pg
    from core.config import config as _cfg
    # 读当前内容
    cur = ""
    if is_global:
        rows = _pg.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    else:
        rows = _pg.execute("SELECT data FROM project_memories WHERE project_id=%s", (project_id,))
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    # LLM 分析修改
    prompt = (
        f"你是记忆管理 Agent。用户希望对记忆模块「{key}」进行修改。\n"
        f"当前内容：{cur or '（空）'}\n"
        f"用户的修改想法：{rest or '（未说明，请自行判断是否需要修改）'}\n"
        f"请分析并给出修改后的内容（可保留、细化或重写，须符合用户想法且不与已有内容矛盾）。\n"
        f"只输出 JSON：{{\"reason\": \"修改理由（一两句）\", \"content\": \"修改后的内容（支持段落、- 列表、1. 列表）\"}}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {"reply": f"⚠️ 修改失败：LLM 调用错误（{resp.status_code}）", "steps": [{"agent": "记忆管理", "status": "done", "detail": "修改失败"}]}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        data = extract_json_obj(raw)
        content = str(data.get("content") or "").strip()
        reason = str(data.get("reason") or "").strip()
        if not content:
            return {"reply": "⚠️ 修改失败：AI 未能生成修改内容", "steps": [{"agent": "记忆管理", "status": "done", "detail": "解析失败"}]}
    except Exception as e:
        return {"reply": f"⚠️ 修改失败：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "调用异常"}]}
    # 写回
    try:
        if is_global:
            rows = _pg.execute("SELECT id FROM global_profile LIMIT 1")
            if rows:
                old = _pg.execute("SELECT data FROM global_profile WHERE id=%s", (rows[0]["id"],))
                d2 = _as_dict(old[0]["data"]) if old and old[0]["data"] else {}
                d2[key] = content
                _pg.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (json.dumps(d2, ensure_ascii=False), rows[0]["id"]))
            else:
                _pg.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", (session_id or "default", json.dumps({key: content}, ensure_ascii=False)))
        else:
            newv: object = content
            if key in ["偏好", "知识点", "难点", "薄弱点", "兴趣"]:
                newv = [s.strip() for s in re.split(r"[,，、\n]+", content) if s.strip()]
            rows = _pg.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
            if rows:
                d2 = _as_dict(rows[0]["data"]) if rows[0]["data"] else {}
                d2[key] = newv
                _pg.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (json.dumps(d2, ensure_ascii=False), project_id))
            else:
                _pg.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", (session_id or "default", project_id, json.dumps({key: newv}, ensure_ascii=False)))
    except Exception as e:
        return {"reply": f"⚠️ 修改失败（写入）：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "写入异常"}]}
    return {"reply": f"✅ 已更新记忆模块「{key}」\n\n**修改理由**：{reason}\n\n**新内容**：\n{content}", "steps": [{"agent": "记忆管理", "status": "done", "detail": f"分析并更新「{key}」"}]}


def memory_chat(api_key: str, message: str, project_id: str) -> dict:
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    from core.postgres_client import pg_client
    from core.config import config as _cfg
    pid = (project_id or "").strip()
    if not pid or pid == "global":
        pid = "global"
        rows = pg_client.execute("SELECT id, data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = GLOBAL_MEM_KEYS
    else:
        rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = PROJECT_MEM_KEYS
    prompt = (
        "你是记忆更新助手。以下是当前记忆字段，以及用户想要修改的内容。"
        "请只输出 JSON：{\"update\": {字段名: 新值}, \"reply\": \"一句话确认（说明更新了哪些字段；若无变更则说明原因）\"}\n"
        "规则：字段名只能是：" + "、".join(ALLOW) + "。数组字段（偏好/知识点/难点/薄弱点/兴趣）给字符串数组，其余给字符串。"
        "用户没有提到的字段不要出现在 update 中；若用户只是询问，update 可为空对象。\n"
        f"当前记忆：{json.dumps(mem, ensure_ascii=False)}\n"
        f"用户输入：{message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(
            _cfg.DEEPSEEK_BASE_URL + "/chat/completions",
            json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
            headers=h, timeout=90,
        )
        if resp.status_code != 200:
            return {"reply": "⚠️ 记忆更新失败：模型调用出错（检查 API Key 是否有效）。", "changed": []}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = extract_json_obj(raw)
        if not d:
            return {"reply": "⚠️ 没有理解你的输入，请换一种说法，例如：「学习目标改为掌握 RAG 原理」。", "changed": []}
        update = d.get("update") if isinstance(d.get("update"), dict) else {}
        reply = str(d.get("reply") or "已处理。")
        changed = []
        if update:
            merged = dict(mem)
            for k, v in update.items():
                if k in ALLOW and v not in (None, ""):
                    merged[k] = v
                    changed.append(k)
            if changed:
                if pid == "global":
                    rows = pg_client.execute("SELECT id FROM global_profile LIMIT 1")
                    if rows:
                        pg_client.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                                          (json.dumps(merged, ensure_ascii=False), rows[0]["id"]))
                    else:
                        pg_client.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)",
                                          ("default", json.dumps(merged, ensure_ascii=False)))
                else:
                    _rows = pg_client.execute("SELECT session_id FROM project_memories WHERE project_id=%s", (pid,))
                    if _rows:
                        pg_client.execute(
                            "UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                            (json.dumps(merged, ensure_ascii=False), pid))
                    else:
                        pg_client.execute(
                            "INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)",
                            ("project", pid, json.dumps(merged, ensure_ascii=False)))
        if not changed and not reply.strip():
            reply = "⚠️ 没有需要更新的字段。"
        return {"reply": reply, "changed": changed}
    except Exception as e:
        return {"reply": f"⚠️ 记忆更新失败：{str(e)[:120]}", "changed": []}
