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


def _cursor_rounds(mem, did):
    """last_transferred 游标读取：map 格式 {did: 已传用户轮数}；旧格式 {"dialogue_id": did}（1.4 遗留，无轮数）视为 0。"""
    lt = mem.get("last_transferred")
    if not isinstance(lt, dict):
        return 0
    if "dialogue_id" in lt:
        return 0
    try:
        return int(lt.get(did) or 0)
    except (TypeError, ValueError):
        return 0


def _set_cursor(pid, did, rounds):
    """推进 last_transferred 游标（map 格式，多窗口并存；剔除旧格式遗留的 dialogue_id 键）。"""
    mem = _load_project(pid)
    lt = mem.get("last_transferred")
    _map = {k: v for k, v in (lt.items() if isinstance(lt, dict) else {}) if k != "dialogue_id"}
    _map[did] = rounds
    mem["last_transferred"] = _map
    _save_project(pid, mem)


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
    """单窗口每五轮：对话综合记忆→课程记忆 + 进度条更新 + 课程画像变更计数。
    按 last_transferred 游标幂等：该窗口无新用户轮数（COUNT(user) 未超过游标）直接跳过（钩子重复调用 / 补传均安全）。"""
    cur = get_project_repo().count_user_messages(did)
    if cur <= _cursor_rounds(_load_project(pid), did):
        return
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
    _set_cursor(pid, did, cur)


def catch_up_transfers(pid):
    """新开窗口：补传有增量的窗口概要进课程记忆（补传不触发变更计数）。
    幂等由 transfer_dialogue_to_project 内游标判定兜底；此处只做"无学情窗口跳过"防御。"""
    dialogs = get_project_repo().list_dialogues(pid) or []
    for d in dialogs:
        try:
            # 只补传有学情信息的窗口（无 profile_data = 无对话内容/画像未合成，跳过避免空概要）
            if not get_memory_repo().get_dialogue_profile_data(d["id"]):
                continue
            transfer_dialogue_to_project(pid, d["id"], bump=False)
        except Exception:
            logger.exception("补传失败 pid=%s did=%s", pid, d.get("id"))


# ---------------- 画像（新开课程 / 新开对话） ----------------

def init_course_profile(pid, name="", domain=""):
    """新开课程：个人画像 + 课程初始化信息 → 组合初始课程画像（克制，只并入稳定字段）。"""
    gp = _as_dict(get_memory_repo().get_global_profile())
    data = {}
    if domain:
        data["抽象项目情况"] = domain
    for k in ["偏好提问方式", "偏好学习方式", "偏好_输出"]:
        v = gp.get(k)
        if v:
            data[k] = v
    if not data:
        return
    _save_project(pid, data)


def _synthesize_profile(api_key, gp, mem):
    """flash 合成对话学情画像（个人画像 + 课程画像 → 对话画像 JSON）。"""
    import requests as _req
    from core.config import config as _cfg
    NL = chr(10)
    g_src = json.dumps(gp, ensure_ascii=False)[:1500]
    m_src = json.dumps(mem, ensure_ascii=False)[:1500]
    prompt = (
        "你是学情画像合成器。把个人画像与课程画像合并为一份面向本次对话的学情画像，只输出 JSON：\n"
        "{\"用户背景\":\"...\",\"偏好提问方式\":[\"...\"],\"偏好学习方式\":[\"...\"],\"偏好_输出\":[\"...\"]}\n"
        "要求：用户背景不超过 200 字；偏好数组每项一句话；个人画像优先，课程画像补充；无信息的小节省略。\n\n"
        "个人画像：\n" + g_src + NL + NL + "课程画像：\n" + m_src
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                     json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"},
                           "messages": [{"role": "user", "content": prompt}]},
                     headers=h, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError("synthesize status=" + str(resp.status_code))
    return resp.json()["choices"][0]["message"]["content"] or ""


def generate_dialogue_profile(did, api_key=""):
    """新开对话：后台异步合成对话画像 → dialogues.profile + ready；失败置 failed（不禁发，可重试）。"""
    try:
        from core.db.base import get_db
        db = get_db()
        rows = db.execute("SELECT project_id FROM dialogues WHERE id=%s", (did,))
        if not rows:
            return False
        pid = rows[0]["project_id"] or "default"
        gp = _as_dict(get_memory_repo().get_global_profile())
        mem = _load_project(pid)
        text = _synthesize_profile(api_key, gp, mem)
        profile = _as_dict(text)
        if not profile:
            db.execute("UPDATE dialogues SET profile_status='failed' WHERE id=%s", (did,))
            return False
        db.execute("UPDATE dialogues SET profile=%s, profile_status='ready' WHERE id=%s",
                   (json.dumps(profile, ensure_ascii=False), did))
        return True
    except Exception as e:
        try:
            from core.db.base import get_db
            get_db().execute("UPDATE dialogues SET profile_status='failed' WHERE id=%s", (did,))
        except Exception:
            logger.debug("profile_status 失败标记亦失败", exc_info=True)
        logger.exception("画像合成失败 did=%s err=%s", did, str(e)[:120])
        return False