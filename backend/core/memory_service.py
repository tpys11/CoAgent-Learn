# -*- coding: utf-8 -*-
"""学情与记忆 agent 服务包 facade。

统一出口：记忆提炼 / 对话压缩 / 追问生成（画像生成在后续步骤加入）。
物理实现暂留在原模块，本 facade 只做转发与签名归一。
"""
import logging

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