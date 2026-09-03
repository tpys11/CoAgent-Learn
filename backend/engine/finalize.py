# -*- coding: utf-8 -*-
"""S6 Finalize 后台副作用（Loop4 自旧引擎逐字平移；触发口径按定稿统一）。
由 core.background.submit 调度执行，绝不阻塞台前流。"""
import json
import logging

logger = logging.getLogger(__name__)


def five_round_hook(pid: str, did: str) -> None:
    """单窗口每五轮对话 → 课程记忆 + 进度条（进度条唯一更新逻辑）。
    轮数按 messages 表 COUNT(role='user') 计；transfer 内部按游标幂等。"""
    try:
        from core.postgres_client import pg_client as _pg5
        _n = _pg5.execute("SELECT COUNT(*) AS n FROM messages WHERE dialogue_id=%s AND role='user'", (did,))
        _cnt = int(_n[0]["n"]) if _n else 0
        if _cnt > 0 and _cnt % 5 == 0:
            from core.memory_service import transfer_dialogue_to_project
            transfer_dialogue_to_project(pid, did)
            logger.info("五轮对话传递：did=%s 第%d轮 → 课程记忆+进度条", did, _cnt)
    except Exception:
        logger.exception("五轮对话传递失败 did=%s", did)


def finalize_side_effects(req, pid: str, did: str, result: dict, t0: float) -> None:
    """流后落库与统计（原 worker 内 _persist 体平移）。"""
    import time as _time2
    # 五轮对话→课程记忆钩子
    try:
        five_round_hook(pid, did)
    except Exception:
        logger.exception("五轮对话传递钩子异常 did=%s", did)
    # 专注时长：累加进项目 stats + 按天 focus_log
    try:
        from core.postgres_client import pg_client as _pg4
        _dur = max(0, int(_time2.time() - t0))
        _srow = _pg4.execute("SELECT id, duration_seconds FROM stats WHERE project_id=%s ORDER BY updated_at DESC LIMIT 1", (pid,))
        if _srow:
            _pg4.execute("UPDATE stats SET duration_seconds=%s, updated_at=datetime('now') WHERE id=%s",
                         ((_srow[0]["duration_seconds"] or 0) + _dur, _srow[0]["id"]))
        else:
            _pg4.execute("INSERT INTO stats(project_id, duration_seconds) VALUES(%s,%s)", (pid, _dur))
        if _dur > 0:
            _pg4.execute("INSERT INTO focus_log(project_id, dialogue_id, duration_seconds) VALUES(%s,%s,%s)",
                         (pid, did, _dur))
    except Exception:
        logger.exception("累计专注时长失败 did=%s", did)
    # 运行统计（Agent 界面·运行监控）
    try:
        _ts = result.get("task_stats") or {}
        if _ts:
            from core.postgres_client import pg_client as _pg2
            _pg2.execute("INSERT INTO task_stats(project_id,dialogue_id,data) VALUES(%s,%s,%s)",
                         (pid, did, json.dumps(_ts, ensure_ascii=False)))
    except Exception:
        logger.exception("保存运行统计失败 did=%s", did)
    # AI 回复落库（含思维链 mindchain）
    try:
        _reply = result.get("final_reply", "")
        if _reply:
            _think = json.dumps(result.get("mindchain") or [], ensure_ascii=False)
            from core.postgres_client import pg_client as _pg
            _pg.execute("INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)",
                        (did, "assistant", _reply, _think))
    except Exception:
        logger.exception("保存 AI 回复失败 did=%s", did)
    # 自动保存生成物到“我的上传”
    if req.settings and req.settings.get('autoSaveResource') and result.get("final_reply"):
        try:
            import hashlib as _hl
            from core.postgres_client import pg_client as _pg3
            _fr = result.get("final_reply", "")
            _head = _fr.strip()[:40]
            _junk = ("生成内容时出现错误" in _head
                     or _head.startswith("⚠️")
                     or _head.startswith("（系统未生成内容）")
                     or len(_fr.strip()) < 120)
            if not _junk:
                _nm = "对话生成·" + _fr.strip()[:14]
                _rid = _hl.md5((_nm + pid).encode()).hexdigest()[:16]
                _has = _pg3.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
                if _has:
                    _pg3.execute("UPDATE resources SET content=%s WHERE id=%s", (_fr, _rid))
                else:
                    _pg3.execute("INSERT INTO resources (id, name, content, project_id) VALUES (%s,%s,%s,%s)",
                                 (_rid, _nm, _fr, pid))
        except Exception:
            logger.exception("自动保存生成物失败 did=%s", did)


def schedule_post_turn(req, pid: str, did: str, result: dict) -> None:
    """后台异步分析记忆 + 上下文压缩 + 追问生成（开关可配）。"""
    try:
        reply = result.get("final_reply", "")
        if not reply:
            return
        from core.background import submit
        from core.memory_service import compress_dialogue, distill_memory, generate_followups
        from core.postgres_client import pg_client
        submit(distill_memory, req.api_key, pid, did, pg_client, req.session_id or "default")
        submit(compress_dialogue, req.api_key, did, pg_client)
        if not (req.settings and req.settings.get('autoFollowups') is False):
            submit(generate_followups, req.api_key, pid, did, pg_client, req.followup_focus or "purpose")
        if req.extra_followup_did:
            try:
                submit(generate_followups, req.api_key, pid, req.extra_followup_did,
                       pg_client, req.extra_followup_focus or "expand")
            except Exception:
                logger.exception("启动第二对话追问失败 did=%s", req.extra_followup_did)
    except Exception:
        logger.exception("启动后台记忆/压缩/追问任务失败 did=%s", did)
