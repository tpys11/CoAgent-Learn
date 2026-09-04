from skills import Skill


class UserDiagnosis(Skill):
    name = "user_diagnosis"
    description = "分析用户知识水平和学习背景，输出诊断画像"
    input_schema = {"user_input": {"type": "string", "description": "用户原始输入"}}

    def execute(self, user_input="", **kwargs):
        return {"level": "intermediate", "strengths": ["Python", "LLM"], "gaps": ["LangGraph", "向量检索"], "suggestion": "从LangGraph入手"}
