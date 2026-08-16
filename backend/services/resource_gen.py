# -*- coding: utf-8 -*-
"""资源生成能力注册表：把「资源生成」的 6 种形式定义为可插拔能力，按 key 统一生成。

能力注册表 = 单一事实来源：新增/删减一种资源形式，只需改 CAPABILITIES，不再散落各处。
"""
from typing import Optional


CAPABILITIES: dict = {
    "report": {
        "key": "report",
        "label": "报告",
        "desc": "汇总讲解内容为结构化报告",
        "output": "markdown",
        "prompt": (
            "把下面的学习内容整理成一份结构清晰的报告。要求：包含标题、要点分节、结尾小结；"
            "直接输出 Markdown 正文，不要额外解释。\n\n内容：\n"
        ),
    },
    "flow": {
        "key": "flow",
        "label": "流程图",
        "desc": "把流程步骤整理为 Mermaid 流程图",
        "output": "mermaid",
        "prompt": (
            "把下面的内容提炼为步骤/流程，输出一个 Mermaid flowchart 代码块"
            "（只输出 ```mermaid ... ```，不要额外文字）。\n\n内容：\n"
        ),
    },
    "tree": {
        "key": "tree",
        "label": "树状图",
        "desc": "把层级结构整理为 Mermaid 树状图",
        "output": "mermaid",
        "prompt": (
            "把下面的内容提炼为层级/分类结构，输出一个 Mermaid mindmap 代码块"
            "（只输出 ```mermaid ... ```，不要额外文字）。\n\n内容：\n"
        ),
    },
    "table": {
        "key": "table",
        "label": "表格",
        "desc": "把多对象/多维度内容整理为 Markdown 表格",
        "output": "markdown",
        "prompt": (
            "把下面的内容整理为一张 Markdown 表格（多对象/多维度对比）。"
            "直接输出表格，不要额外解释。\n\n内容：\n"
        ),
    },
    "chart": {
        "key": "chart",
        "label": "统计图",
        "desc": "把数据/趋势整理为 Mermaid 饼图",
        "output": "mermaid",
        "prompt": (
            "把下面的数据/趋势提炼为一个 Mermaid pie 饼图代码块"
            "（只输出 ```mermaid ... ```，不要额外文字）；若无明确数值可自行估算比例。\n\n内容：\n"
        ),
    },
    "quiz": {
        "key": "quiz",
        "label": "测试题",
        "desc": "根据内容生成分阶测试题",
        "output": "markdown",
        "prompt": (
            "根据下面的内容生成一组测试题。要求：分阶（基础/进阶），选择题、判断题、简答题各若干，"
            "附答案与简要解析；直接输出 Markdown 正文，不要额外解释。\n\n内容：\n"
        ),
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
    """按能力 key 生成资源内容（同步实现；调用方用线程池执行避免阻塞事件循环）。"""
    cap = CAPABILITIES.get(key)
    if not cap:
        return {"status": "error", "msg": "未知能力: " + str(key)}
    src = (content or "").strip()
    if not src:
        return {"status": "error", "msg": "源内容为空"}
    try:
        from core.base_llm import DeepSeekLLM
        llm = DeepSeekLLM(
            api_key=api_key,
            model=model or "deepseek-v4-flash",
            base_url=base_url,
            thinking=False,
        )
        text = llm.chat([{"role": "user", "content": cap["prompt"] + src[:4000]}], temperature=0.5)
        text = (text or "").strip()
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
