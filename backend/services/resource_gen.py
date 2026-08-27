# -*- coding: utf-8 -*-
"""资源生成能力注册表：把「资源生成」的各种形式定义为可插拔能力，按 key 统一生成。

能力注册表 = 单一事实来源：新增/删减一种资源形式，只需改 CAPABILITIES，不再散落各处。
prompt 与生成逻辑已解耦到 skills/gen_* 技能模块（Wave1 解耦），本文件只保留显式有序元信息 + registry 转调。
"""
from typing import Optional

from skills.registry import registry


CAPABILITIES: dict = {
    "report": {
        "key": "report",
        "label": "报告",
        "desc": "汇总讲解内容为结构化报告",
        "output": "markdown",
        "skill": "gen_report",
    },
    # flow/tree 赛前暂下线（赛后可恢复——技能代码保留在 skills/ 中未删除）
    "quiz": {
        "key": "quiz",
        "label": "测试题",
        "desc": "根据内容生成可交互的分阶测试题",
        "output": "markdown",
        "skill": "gen_quiz",
    },
    "guide": {
        "key": "guide",
        "label": "实操指南",
        "desc": "把内容转化为可执行的分步实操指南",
        "output": "markdown",
        "skill": "gen_guide",
    },
    "diagnosis": {
        "key": "diagnosis",
        "label": "课程学情诊断",
        "desc": "评估掌握程度并给出复习建议",
        "output": "markdown",
        "skill": "gen_diagnosis",
    },
}


def list_capabilities() -> list:
    """返回能力注册表的公开元信息（不含 prompt，供前端渲染）。"""
    return [
        {"key": c["key"], "label": c["label"], "desc": c["desc"], "output": c["output"]}
        for c in CAPABILITIES.values()
    ]


def generate_resource(
    api_key: str,
    key: str,
    content: str,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
) -> dict:
    """按能力 key 生成资源内容（同步实现；调用方用线程池执行避免阻塞事件循环）。

    转调 skills/registry 中对应的 gen_* 技能；响应形状与错误文案与解耦前保持一致。
    """
    cap = CAPABILITIES.get(key)
    if not cap:
        return {"status": "error", "msg": "未知能力: " + str(key)}
    src = (content or "").strip()
    if not src:
        return {"status": "error", "msg": "源内容为空"}
    try:
        r = registry.execute(
            cap["skill"],
            content=src[:4000],
            api_key=api_key,
            base_url=base_url or "",
            model=model or "",
        )
        if r.get("error"):
            return {"status": "error", "msg": r["error"]}
        text = (r.get("content") or "").strip()
        if not text:
            return {"status": "error", "msg": "模型未返回内容"}
        return {
            "status": "ok",
            "key": key,
            "label": cap["label"],
            "output": cap["output"],
            "content": text,
        }
    except Exception as e:
        return {"status": "error", "msg": str(e)[:200]}