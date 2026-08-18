# -*- coding: utf-8 -*-
"""学情与记忆 agent 服务包。

统一出口：记忆提炼 / 对话压缩 / 追问生成 / 画像生成（后续步骤加入）。
信息流（对齐既定决策）：
- 向下：新开课程（个人→课程）组合初始课程画像；新开对话（课程→对话）融入一次
- 向上：单窗口每五轮（对话→课程，进度条唯一更新点）；新开窗口先补传；课程画像三次变更→个人（克制）
物理实现暂留在原模块，本 facade 只做转发与签名归一。
"""
import json
import logging

from core.db.memory_repo import get_memory_repo
from core.db.project_repo import get_project_repo
from core.helpers import _as_dict

logger = logging.getLogger("coagent.memory_service")


def distill_memory(api_key, project_id, dialogue_id, db, session_id="default"):
    """对话→课程/个人记忆提炼（后台执行，用户无感知）。"""
    from core.memory_analysis import update_memories
    return update_memories(api_key, project_id, dialogue_id, db, session_id)


def compress_dialogue(api_key, dialogue_id, db):
    """对话上下文压缩（后台执行，token 预算制）。"""
    from core.compress import compress_dialogue as _cd
    return _cd(api_key, dialogue_id, db)


def generate_followups(api_key, project_id, dialogue_id, db, focus="purpose"):
    """为对话生成追问（后台执行）。"""
    from core.followups import generate_followups as _gf
    return _gf(api_key, project_id, dialogue_id, db, focus)


# ---------------- 信息流（对话→课程） ----------------

def _load_project(pid):
    data = get_memory_repo().get_project_memory(pid)
    return _as_dict(data) if data else {}


def _save_project(pid, mem):
    get_memory_repo().save_project_memory(pid, json.dumps(mem, ensure_ascii=False))


def upsert_dialogue_summary(pid, did, name, summary):
    """把对话概要 upsert 进课程记忆（按 dialogue_id 覆盖，不重复）。"""
    mem = _load_project(pid)
    dlist = mem.get("对话概要") if isinstance(mem.get("对话概要"), list) else []
    updated = False
    for i, d in enumerate(dlist):
        if isinstance(d, dict) and d.get("dialogue_id") == did:
            dlist[i] = {"dialogue_id": did, "name": name, "概要": summary}
            updated = True
            break
    if not updated:
        dlist.append({"dialogue_id": did, "name": name, "概要": summary})
    mem["对话概要"] = dlist
    mem["last_transferred"] = {"dialogue_id": did}
    _save_project(pid, mem)
    return mem


def _push_to_global(mem, pid, project_name):
    """课程画像克制并入个人画像（仅目标/当前水平，不覆盖既有课程）。"""
    name = project_name or pid
    gp = _as_dict(get_memory_repo().get_global_profile())
    lc = gp.get("学习情况") if isinstance(gp.get("学习情况"), dict) else {}
    courses = lc.get("课程") if isinstance(lc.get("课程"), list) else []
    by_name = {c.get("课程名"): c for c in courses if isinstance(c, dict) and c.get("课程名")}
    if name in by_name:
        course = by_name[name]
    else:
        course = {"课程名": name}
        courses.append(course)
    for f, key in (("目标", "目标"), ("当前情况", "当前水平")):
        v = mem.get(key)
        if v:
            course[f] = v if isinstance(v, str) else "、".join(str(x) for x in v)
    lc["课程"] = courses
    gp["学习情况"] = lc
    get_memory_repo().save_global_profile(json.dumps(gp, ensure_ascii=False))


def bump_change_count(pid, project_name=None):
    """课程画像变更计数：每 3 次变更触发一次课程→个人传递（克制）。"""
    mem = _load_project(pid)
    cc = int(mem.get("change_count") or 0) + 1
    mem["change_count"] = cc
    if cc % 3 == 0:
        try:
            _push_to_global(mem, pid, project_name)
        except Exception:
            logger.exception("课程→个人传递失败 pid=%s", pid)
    _save_project(pid, mem)
    return cc


def update_progress(pid):
    """进度条数据（唯一更新点：课程记忆更新时调用）；返回 {章节: 完成度}。"""
    mem = _load_project(pid)
    prog = mem.get("progress")
    return prog if isinstance(prog, dict) else {}


def transfer_dialogue_to_project(pid, did, bump=True):
    """单窗口每五轮：对话综合记忆→课程记忆 + 进度条更新 + 课程画像变更计数。"""
    name = get_project_repo().get_dialogue_name(did) or "对话"
    pd = get_memory_repo().get_dialogue_profile_data(did)
    p = _as_dict(pd)
    summary = {
        "topic": p.get("topic", ""),
        "selfLevel": p.get("selfLevel", ""),
        "target": p.get("target", ""),
    }
    upsert_dialogue_summary(pid, did, name, summary)
    update_progress(pid)
    if bump:
        bump_change_count(pid)


def catch_up_transfers(pid):
    """新开窗口：把未传递的对话概要补传进课程记忆（补传不触发变更计数）。"""
    dialogs = get_project_repo().list_dialogues(pid) or []
    mem = _load_project(pid)
    dlist = mem.get("对话概要") if isinstance(mem.get("对话概要"), list) else []
    existing = {d.get("dialogue_id") for d in dlist if isinstance(d, dict)}
    for d in dialogs:
        if d.get("id") not in existing:
            try:
                transfer_dialogue_to_project(pid, d["id"], bump=False)
            except Exception:
                logger.exception("补传失败 pid=%s did=%s", pid, d.get("id"))