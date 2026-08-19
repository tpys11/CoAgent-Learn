# -*- coding: utf-8 -*-
"""资源生成能力注册表：把「资源生成」的 6 种形式定义为可插拔能力，按 key 统一生成。

能力注册表 = 单一事实来源：新增/删减一种资源形式，只需改 CAPABILITIES，不再散落各处。
"""
import json
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
        "desc": "根据内容生成可交互的分阶测试题",
        "output": "markdown",
        "prompt": (
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
        ),
    },
}


def list_capabilities() -> list:
    """返回能力注册表的公开元信息（不含 prompt，供前端渲染）。"""
    return [
        {"key": c["key"], "label": c["label"], "desc": c["desc"], "output": c["output"]}
        for c in CAPABILITIES.values()
    ]


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
        if key == "quiz":
            # 交互式测验：要求结构化 JSON 输出（chat_with_json 自带 json_object 模式 + 3 次重试）
            data = llm.chat_with_json(
                [{"role": "user", "content": cap["prompt"] + src[:4000]}],
                {
                    "properties": {
                        "quizTitle": {"type": "string", "description": "测验标题"},
                        "quizSynopsis": {"type": "string", "description": "测验简介"},
                        "questions": {
                            "type": "array",
                            "description": "题目数组，每题含 question/answers/correctAnswer/messageForCorrectAnswer/messageForIncorrectAnswer/explanation/point",
                        },
                    },
                    "required": ["quizTitle", "quizSynopsis", "questions"],
                },
                temperature=0.5,
            )
            err = _validate_quiz(data)
            if err:
                return {"status": "error", "msg": err}
            return {
                "status": "ok",
                "key": key,
                "label": cap["label"],
                "output": cap["output"],
                "content": json.dumps(data, ensure_ascii=False),
            }
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
