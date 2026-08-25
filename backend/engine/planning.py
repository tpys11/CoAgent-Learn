# -*- coding: utf-8 -*-
"""Plan 阶段：意图分类与目标解析（Loop2）。
is_rule_simple / resolve_retrieval_decision 自旧 _is_rule_simple/_resolve_plan_targets
逐字复制适配（去 state 耦合改传参，关键词表原样）；classify_intent 为新写精简分类
（自研理由：旧 PLAN_PROMPT 输出计划列表，新引擎只需三分类+检索开关，照抄反需裁剪）。"""

# 学习/深度类关键词：出现则不算简单（宁可交给模型/深度路径）
_HARD_KEYS = ["讲解", "推导", "证明", "为什么", "原理", "详解", "如何", "区别", "教程",
              "学习", "分析", "比较", "介绍", "总结", "作业", "题", "公式", "应用",
              "讲讲", "讲一下", "说说", "说下", "什么是", "啥是", "解释", "了解", "理解", "掌握"]
# 问候/闲聊/简短问答
_SOFT_KEYS = ["你好", "您好", "hi", "hello", "嗨", "哈喽", "在吗", "谢谢", "感谢", "再见", "拜拜",
              "你是谁", "你能做什么", "早上好", "中午好", "晚上好", "晚安", "1+1", "2+2", "几点"]

_CLASSIFY_PROMPT = (
    "你是学习助手的意图分类器。对用户消息输出 JSON：\n"
    '{"complexity": "simple_direct|standard|research_deep"}\n'
    "规则：寒暄闲聊或极短问答=simple_direct；常规学习问答=standard；"
    "明确要求深入调研/多源交叉/最新信息=research_deep。只输出 JSON。"
)


def is_rule_simple(text: str) -> bool:
    """程序规则优先判定"简单问题"：问候/闲聊/极短问答 → True（确定性，不依赖模型判断）。
    命中后跳过规划 LLM，直接生成回答（最快路径）。"""
    t = (text or "").strip()
    if not t:
        return True
    if len(t) > 30:
        return False
    if any(k in t for k in _HARD_KEYS):
        return False
    if any(k in t.lower() for k in _SOFT_KEYS):
        return True
    # 极短输入（≤10字）且无硬关键词 → 简单
    if len(t) <= 10:
        return True
    return False


def resolve_plan_targets(tpl: str, plan: list) -> list[str]:
    """规划路由的目标判定（纯函数，逻辑自旧版逐字保留，供测试与管线双用）：
    - 三档模式均默认走检索（kb）
    - 用户计划点名 知识库管理/搜索增强/联网搜索 时亦走检索
    - 其余 → 直接生成"""
    plan = list(plan or [])
    if tpl == "研究" and "搜索增强" not in plan and "联网搜索" not in plan:
        plan.append("搜索增强")
    if tpl in ("极速", "思考", "研究"):
        return ["kb"]
    if "知识库管理" in plan or "搜索增强" in plan or "联网搜索" in plan:
        return ["kb"]
    return ["generate"]


def classify_intent(llm_fast, message: str, template: str) -> dict:
    """flash 意图分类：只产出 {complexity}。
    检索与否由模式决定（思考/研究必检索、极速不检索）——分类器不越权。"""
    from engine.llm_io import think_then_json
    _, result = think_then_json(
        llm_fast, _CLASSIFY_PROMPT, message[:1500], "学习助手·规划", silent=True)
    complexity = result.get("complexity")
    if complexity not in ("simple_direct", "standard", "research_deep"):
        complexity = "standard"
    return {"complexity": complexity}
