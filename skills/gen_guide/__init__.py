# -*- coding: utf-8 -*-
"""gen_guide 资源生成技能：把内容转化为可执行的分步实操指南。

Wave2 新增：把资源面板的「实操指南」占位变为真实实现。
修正：图表/图片作为嵌入内容（步骤配图），不设独立板块——复用 gen_report 公共后处理链。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_GUIDE_PROMPT = (
    "把下面的内容转化为一份可执行的实操指南。要求：分步骤（每步有明确动作与预期结果）、"
    "含注意事项与常见错误提醒；需要配图的位置输出标记 {{IMG:搜索关键词|图片说明}}，全文最多 4 处；"
    "若含可量化数据（如时长/数量/比例），用 ```echarts 代码块给出图表（只允许 line/bar/pie/radar 四种结构，只填数据）；"
    "Markdown 格式、直接输出正文不要额外解释。\n\n内容：\n"
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
            from skills.gen_report import embed_images, sanitize_echarts_blocks
            from core.model_provider import resolve_model, current_tier
            _spec = resolve_model("main", current_tier())  # R-D S3：缺省模型/端点改问注册表（调用方传值优先，test 档随决策 38）
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or _spec.model,
                base_url=base_url or _spec.base_url,
                thinking=False,
            )
            text = llm.chat([{"role": "user", "content": _GUIDE_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            draft = sanitize_echarts_blocks(text)
            return {"content": embed_images(draft)}
        except Exception as e:
            return {"error": str(e)[:200]}