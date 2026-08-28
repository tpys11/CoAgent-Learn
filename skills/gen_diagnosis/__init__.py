# -*- coding: utf-8 -*-
"""gen_diagnosis 资源生成技能：根据学习内容与记录生成课程学情诊断。

Wave2 新增：把资源面板的「课程学情诊断」占位变为真实实现。
修正：图表/图片作为嵌入内容（掌握度可视化 echarts + 配图），不设独立板块——复用 gen_report 公共后处理链。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
from skills import Skill


_DIAGNOSIS_PROMPT = (
    "根据下面的学习内容与记录，生成一份课程学情诊断。要求：评估掌握程度（分知识点列出已掌握/薄弱/未覆盖）、"
    "指出学习路径建议、给出复习优先级；"
    "若掌握程度可量化（如百分比/等级），用 ```echarts 代码块给出图表（只允许 line/bar/pie/radar 四种结构，只填数据）；"
    "需要配图的位置输出标记 {{IMG:搜索关键词|图片说明}}，全文最多 4 处；"
    "Markdown 格式、直接输出正文不要额外解释。\n\n内容：\n"
)


class GenDiagnosis(Skill):
    name = "gen_diagnosis"
    category = "resource"
    description = "评估掌握程度并给出复习建议"
    input_schema = {
        "content": {"type": "string", "description": "学习内容与记录"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "Markdown 学情诊断正文"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            from core.base_llm import DeepSeekLLM
            from skills.gen_report import embed_images, sanitize_echarts_blocks
            from core.model_provider import MODEL_MAIN
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or MODEL_MAIN,
                base_url=base_url,
                thinking=False,
            )
            text = llm.chat([{"role": "user", "content": _DIAGNOSIS_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}
            draft = sanitize_echarts_blocks(text)
            return {"content": embed_images(draft)}
        except Exception as e:
            return {"error": str(e)[:200]}