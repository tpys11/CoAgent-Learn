# -*- coding: utf-8 -*-
"""gen_guide 资源生成技能：把内容转化为可执行的分步实操指南。

Wave2 新增：把资源面板的「实操指南」占位变为真实实现。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_GUIDE_PROMPT = (
    "把下面的内容转化为一份可执行的实操指南。要求：分步骤（每步有明确动作与预期结果）、"
    "含注意事项与常见错误提醒、Markdown 格式、直接输出正文不要额外解释。\n\n内容：\n"
)


class GenGuide(Skill):
    name = "gen_guide"
    category = "resource"
    description = "把内容转化为可执行的分步实操指南"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "Markdown 实操指南正文"},
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
            text = llm.chat([{"role": "user", "content": _GUIDE_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            return {"content": text}
        except Exception as e:
            return {"error": str(e)[:200]}