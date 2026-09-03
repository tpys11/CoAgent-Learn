# -*- coding: utf-8 -*-
"""gen_tree 资源生成技能：把层级结构整理为 Mermaid 树状图。

从 backend/services/resource_gen.py 迁移而来（Wave1 解耦）：prompt 逐字节一致。
**保留** ```mermaid fence 输出（前端 renderMd 直接渲染）。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_TREE_PROMPT = (
    "把下面的内容提炼为层级/分类结构，输出一个 Mermaid mindmap 代码块"
    "（只输出 ```mermaid ... ```，不要额外文字）。\n\n内容：\n"
)


class GenTree(Skill):
    name = "gen_tree"
    category = "resource"
    description = "把层级结构整理为 Mermaid 树状图"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "mermaid mindmap 代码块"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            from core.base_llm import DeepSeekLLM
            from core.model_provider import resolve_model, current_tier
            _spec = resolve_model("main", current_tier())  # R-D S3：缺省模型/端点改问注册表（调用方传值优先，test 档随决策 38）
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or _spec.model,
                base_url=base_url or _spec.base_url,
                thinking=False,
            )
            text = llm.chat([{"role": "user", "content": _TREE_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            return {"content": text}
        except Exception as e:
            return {"error": str(e)[:200]}