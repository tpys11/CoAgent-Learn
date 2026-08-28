# -*- coding: utf-8 -*-
"""记忆编辑：检测 [模块名] 引用 → AI 分析并修改记忆。
闭环A（2026-08-25）：读写全部收敛到 core/db/memory_repo.py，文件内不再有裸 SQL；
数组字段归一化两路径统一；session 归一为「传入值或 default」。"""
import json
import re

from core.helpers import _as_dict, extract_json_obj
from core.model_provider import MODEL_FAST


GLOBAL_MEM_KEYS = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
PROJECT_MEM_KEYS = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]
_ARRAY_KEYS = {"偏好", "知识点", "难点", "薄弱点", "兴趣"}


def _normalize_mem_value(key, value):
    """数组型字段的字符串值拆分为列表（D2：edit/chat 两路径统一归一化）。"""
    if key in _ARRAY_KEYS and isinstance(value, str):
        return [s.strip() for s in re.split(r"[,，、\n]+", value) if s.strip()]
    return value


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
    from core.config import config as _cfg
    from core.db.memory_repo import get_memory_repo
    _mrepo = get_memory_repo()
    # 读当前内容（整字典一次读出，写回即全量 upsert——读写保证同一行）
    if is_global:
        d = _as_dict(_mrepo.get_global_profile())
    else:
        d = _as_dict(_mrepo.get_project_memory(project_id))
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
                         json={"model": MODEL_FAST, "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
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
    # 写回（repo 统一 upsert；数组字段统一归一化）
    try:
        d[key] = _normalize_mem_value(key, content)
        payload = json.dumps(d, ensure_ascii=False)
        if is_global:
            _mrepo.save_global_profile(payload)
        else:
            _mrepo.save_project_memory(project_id, payload, session_id or "default")
    except Exception as e:
        return {"reply": f"⚠️ 修改失败（写入）：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "写入异常"}]}
    return {"reply": f"✅ 已更新记忆模块「{key}」\n\n**修改理由**：{reason}\n\n**新内容**：\n{content}", "steps": [{"agent": "记忆管理", "status": "done", "detail": f"分析并更新「{key}」"}]}


def memory_chat(api_key: str, message: str, project_id: str, session_id: str = "") -> dict:
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    from core.config import config as _cfg
    from core.db.memory_repo import get_memory_repo
    _mrepo = get_memory_repo()
    pid = (project_id or "").strip()
    if not pid or pid == "global":
        pid = "global"
        mem = _as_dict(_mrepo.get_global_profile())
        ALLOW = GLOBAL_MEM_KEYS
    else:
        mem = _as_dict(_mrepo.get_project_memory(pid))
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
            json={"model": MODEL_FAST, "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
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
                    merged[k] = _normalize_mem_value(k, v)
                    changed.append(k)
            if changed:
                payload = json.dumps(merged, ensure_ascii=False)
                if pid == "global":
                    _mrepo.save_global_profile(payload)
                else:
                    _mrepo.save_project_memory(pid, payload, session_id or "default")
        if not changed and not reply.strip():
            reply = "⚠️ 没有需要更新的字段。"
        return {"reply": reply, "changed": changed}
    except Exception as e:
        return {"reply": f"⚠️ 记忆更新失败：{str(e)[:120]}", "changed": []}
