# -*- coding: utf-8 -*-
"""资源生成建议（原特殊形式输出）：模型判断回答适合哪些形式。"""

_SPECIAL_FORM_KEYS = {"report": "报告", "flow": "流程图", "tree": "树状图", "table": "表格", "chart": "统计图", "quiz": "测试题"}

_SPECIAL_SUGGEST_PROMPT = """你是内容形式分析师。分析下面的学习内容，判断它适合转换/补充为哪些资源生成形式（可多选，最多 3 个，选最合适的）：
- report=报告（汇总讲解内容）
- flow=流程图（内容含步骤/流程/时序）
- tree=树状图（内容有层级/分类结构）
- table=表格（内容含多对象对比/数据维度）
- chart=统计图（内容含数据/趋势）
- quiz=测试题（适合检验理解的知识点）

按 JSON Schema 输出 {"keys": ["形式key数组"]}；没有合适的输出 {"keys": []}。"""


def suggest_special_forms(api_key, content, base_url=None):
    """模型判断回答适合哪些资源生成形式（flash 一次调用；失败返回 []）"""
    try:
        from core.base_llm import DeepSeekLLM
        llm = DeepSeekLLM(api_key=api_key, model="deepseek-v4-flash", base_url=base_url, thinking=False)
        res = llm.chat_with_json(
            [{"role": "user", "content": _SPECIAL_SUGGEST_PROMPT + "\n\n内容：\n" + (content or "")[:2500]}],
            {"keys": ["string"]},
        )
        arr = (res or {}).get("keys") or []
        return [k for k in arr if k in _SPECIAL_FORM_KEYS][:3]
    except Exception as e:
        print("[special-suggest]", e)
        return []
