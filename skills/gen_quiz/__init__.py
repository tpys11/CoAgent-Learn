# -*- coding: utf-8 -*-
"""gen_quiz 资源生成技能：根据内容生成可交互的分阶测试题（react-quiz-component 结构 JSON）。

从 backend/services/resource_gen.py 迁移而来（Wave1 解耦）：prompt、_validate_quiz、chat_with_json 契约保持逐字节一致。
契约：成功 {"content": str} / 失败 {"error": str}——归一化（status/key/label/output）由 resource_gen 层完成。
"""
import json
from typing import Optional

from skills import Skill


_QUIZ_PROMPT = (
    "根据下面的学习内容，生成一套可交互的分阶测试题（选择题与判断题，不要简答题）。"
    "严格输出 JSON（不要 markdown 代码块，不要任何额外文字），结构如下：\n"
    "{\n"
    '  "quizTitle": "测验标题（一句话）",\n'
    '  "quizSynopsis": "测验简介（说明共几题、分阶情况）",\n'
    '  "questions": [\n'
    "    {\n"
    '      "question": "题干",\n'
    '      "questionType": "text",\n'
    '      "answerSelectionType": "single",\n'
    '      "answers": ["选项A", "选项B", "选项C", "选项D"],\n'
    '      "correctAnswer": "2",\n'
    '      "messageForCorrectAnswer": "答对时的鼓励语",\n'
    '      "messageForIncorrectAnswer": "答错时的提示语（可含线索）",\n'
    '      "explanation": "答案解析",\n'
    '      "point": 10\n'
    "    }\n"
    "  ]\n"
    "}\n"
    "要求：共 5-8 题；分阶——基础题 point=10、进阶题 point=20（在 quizSynopsis 中说明）；"
    "选择题 4 个选项、单选（answerSelectionType=single），correctAnswer 填正确选项的 1-based 序号字符串（如 \"2\"）；"
    "判断题 2 个选项 [\"正确\",\"错误\"]，correctAnswer 填 \"1\" 或 \"2\"。\n\n内容：\n"
)

_QUIZ_SCHEMA = {
    "properties": {
        "quizTitle": {"type": "string", "description": "测验标题"},
        "quizSynopsis": {"type": "string", "description": "测验简介"},
        "questions": {
            "type": "array",
            "description": "题目数组，每题含 question/answers/correctAnswer/messageForCorrectAnswer/messageForIncorrectAnswer/explanation/point",
        },
    },
    "required": ["quizTitle", "quizSynopsis", "questions"],
}


def _validate_quiz(data) -> Optional[str]:
    """校验交互式测验 JSON 结构；合法返回 None，否则返回错误信息。"""
    if not isinstance(data, dict):
        return "生成的测验结构不完整，请重试"
    title = data.get("quizTitle")
    synopsis = data.get("quizSynopsis")
    if not isinstance(title, str) or not title.strip():
        return "生成的测验结构不完整，请重试"
    if not isinstance(synopsis, str) or not synopsis.strip():
        return "生成的测验结构不完整，请重试"
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions or len(questions) > 10:
        return "生成的测验结构不完整，请重试"
    for q in questions:
        if not isinstance(q, dict):
            return "生成的测验结构不完整，请重试"
        if not isinstance(q.get("question"), str) or not q["question"].strip():
            return "生成的测验结构不完整，请重试"
        answers = q.get("answers")
        if not isinstance(answers, list) or len(answers) < 2 or not all(isinstance(a, str) and a.strip() for a in answers):
            return "生成的测验结构不完整，请重试"

        def _in_range(x) -> bool:
            try:
                return 1 <= int(x) <= len(answers)
            except (TypeError, ValueError):
                return False

        ca = q.get("correctAnswer")
        if isinstance(ca, list):
            if not ca or not all(_in_range(x) for x in ca):
                return "生成的测验结构不完整，请重试"
        elif not _in_range(ca):
            return "生成的测验结构不完整，请重试"
    return None


class GenQuiz(Skill):
    name = "gen_quiz"
    category = "resource"
    description = "根据内容生成可交互的分阶测试题"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "交互式测验 JSON 字符串（react-quiz-component 结构）"},
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
            # 交互式测验：要求结构化 JSON 输出（chat_with_json 自带 json_object 模式 + 3 次重试）
            data = llm.chat_with_json(
                [{"role": "user", "content": _QUIZ_PROMPT + (content or "")[:4000]}],
                _QUIZ_SCHEMA,
                temperature=0.5,
            )
            err = _validate_quiz(data)
            if err:
                return {"error": err}
            return {"content": json.dumps(data, ensure_ascii=False)}
        except Exception as e:
            return {"error": str(e)[:200]}