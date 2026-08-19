# -*- coding: utf-8 -*-
"""gen_report 资源生成技能：把学习内容整理为结构化报告。

从 backend/services/resource_gen.py 迁移而来（Wave1 解耦）：prompt 逐字节一致。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_REPORT_PROMPT = (
    "把下面的学习内容整理成一份结构清晰的报告。要求：包含标题、要点分节、结尾小结；"
    "直接输出 Markdown 正文，不要额外解释。\n\n内容：\n"
)


class GenReport(Skill):
    name = "gen_report"
    category = "resource"
    description = "汇总讲解内容为结构化报告"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "Markdown 报告正文"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            from core.base_llm import DeepSeekLLM
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or "deepseek-v4-flash",
                base_url=base_url,
                thinking=False,
            )
            text = llm.chat([{"role": "user", "content": _REPORT_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            return {"content": text}
        except Exception as e:
            return {"error": str(e)[:200]}