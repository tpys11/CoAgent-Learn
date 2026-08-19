# -*- coding: utf-8 -*-
"""gen_flow 资源生成技能：把流程步骤整理为 Mermaid 流程图。

从 backend/services/resource_gen.py 迁移而来（Wave1 解耦）：prompt 逐字节一致。
注意与 form_flowchart 的差异：本技能服务于资源面板，**保留** ```mermaid fence 输出（前端 renderMd 直接渲染），
不做 form_flowchart 的 fence 剥离。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_FLOW_PROMPT = (
    "把下面的内容提炼为步骤/流程，输出一个 Mermaid flowchart 代码块"
    "（只输出 ```mermaid ... ```，不要额外文字）。\n\n内容：\n"
)


class GenFlow(Skill):
    name = "gen_flow"
    category = "resource"
    description = "把流程步骤整理为 Mermaid 流程图"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "mermaid flowchart 代码块"},
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
            text = llm.chat([{"role": "user", "content": _FLOW_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            return {"content": text}
        except Exception as e:
            return {"error": str(e)[:200]}