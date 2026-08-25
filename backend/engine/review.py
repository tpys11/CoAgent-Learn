# -*- coding: utf-8 -*-
"""S5 ReviewGate（Loop4）：双LLM异构终审——知识正确性 + 指令遵从。
模式矩阵：研究必开(qwen72B跨厂商防自我包庇)｜思考可配(默认关,开则dsv4f)｜极速关。"""
from engine.llm_io import think_then_json

REVIEW_MAX_RETRY = 2
JUDGE_THINKING_MODEL = "deepseek-v4-flash"
JUDGE_RESEARCH_MODEL = "qwen2.5-72b-instruct"


def review_enabled(template: str, settings: dict | None) -> bool:
    """门控谓词：极速恒关；研究恒开；思考由 settings.reviewEnabled 控制。"""
    if template == "极速":
        return False
    if template == "研究":
        return True
    return bool((settings or {}).get("reviewEnabled"))


def pick_judge_llm(template: str, req):
    """审核模型选择：研究=qwen72B跨厂商；其余=dsv4f；构造失败回退主模型接缝。"""
    from core.base_llm import DeepSeekLLM
    from core.config import config as _cfg
    model = JUDGE_RESEARCH_MODEL if template == "研究" else JUDGE_THINKING_MODEL
    try:
        return DeepSeekLLM(api_key=req.api_key or _cfg.DEEPSEEK_API_KEY,
                           model=model, base_url=req.base_url)
    except Exception:
        from engine.pipeline_v2 import _make_llm
        return _make_llm(req)


def review_once(llm_review, answer: str, context_digest: str,
                strategy_directive: str) -> dict:
    """单次评审：{"passed": bool, "reasons": str, "skipped": bool}。
    解析失败/审核器不可用 → skipped=True 且视为通过（不阻塞主流程），理由留痕。"""
    prompt = (
        "你是独立质检员，对学习助手的回答做终审（你与生成者不同源，请严格）。"
        "维度：①知识正确性——与参考上下文矛盾或明显虚构即不通过；引用标注是否可回指。"
        "②指令遵从——是否落实【输出策略指令】的信息密度与专业名词解释方式。\n"
        '只输出 JSON：{"passed": true|false, "reasons": "未通过原因（通过则为空）"}\n'
        f"【输出策略指令】{strategy_directive}\n"
        + (f"【参考上下文摘要】{context_digest[:1200]}\n" if context_digest else "")
        + f"【待审回答】{answer[:2500]}"
    )
    try:
        _, result = think_then_json(llm_review, prompt, "", "审核", silent=True)
        if not isinstance(result, dict) or "passed" not in result:
            return {"passed": True, "reasons": "审核器输出不可解析，跳过本轮", "skipped": True}
        return {"passed": bool(result.get("passed")),
                "reasons": str(result.get("reasons") or ""),
                "skipped": False}
    except Exception as e:
        return {"passed": True, "reasons": f"审核器异常跳过：{str(e)[:80]}", "skipped": True}
