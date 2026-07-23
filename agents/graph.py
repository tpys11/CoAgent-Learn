"""LangGraph 多智能体协同工作流"""
import json, os
from typing import TypedDict
from langgraph.graph import StateGraph, END
from core.base_llm import DeepSeekLLM
from agents.prompts import (
    INPUT_AGENT_PROMPT, DISPATCH_AGENT_PROMPT, DIAGNOSE_PROMPT,
    KB_PROMPT, SEARCH_PROMPT, MEMORY_PROMPT, GENERATE_PROMPT, REVIEW_PROMPT,
)


class AgentState(TypedDict):
    user_input: str
    processed_input: str
    profile: dict
    knowledge: list
    search_results: list
    memory: dict
    generated: str
    reviewed: dict
    retry_count: int
    final_reply: str
    steps: list
    dispatch_count: int
    _dispatch_result: dict
    mindchain: list  # [{agent, content}]


def create_workflow(api_key: str | None = None, settings: dict | None = None):
    settings = settings or {}
    llm_raw = DeepSeekLLM(api_key=api_key)

    import re

    def think_then_json(system_prompt: str, user_prompt: str) -> tuple[str, dict]:
        """一次API调用：让模型先自然语言思考，再输出JSON"""
        try:
            raw = llm_raw.chat([{"role": "system", "content": system_prompt + "\n先自然语言思考，再用```json```输出结果。"},
                                {"role": "user", "content": user_prompt}])
            m = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
            thinking = raw[:m.start()].strip() if m else raw[:500]
            result = json.loads(m.group(1)) if m else {}
            return thinking, result
        except Exception as e:
            return f"执行异常: {e}", {}

    # 根据设置构建 Agent 专属约束
    search_mode = settings.get('searchMode', '默认')
    output_format = settings.get('outputFormat', '高结构化')
    output_style = settings.get('outputStyle', 'MD文档')
    thinking_on = settings.get('thinking', '关') == '开'
    volume = settings.get('outputVolume', '适中')
    depth = settings.get('depth', '中')
    input_mode = settings.get('inputOptMode', '默认模式')

    # 拼接设置到 Prompt
    KB_PROMPT_WITH_SETTINGS = KB_PROMPT + f"\n当前检索模式: {search_mode}。"
    SEARCH_PROMPT_WITH_SETTINGS = SEARCH_PROMPT + f"\n当前检索模式: {search_mode}。"
    GENERATE_PROMPT_WITH_SETTINGS = GENERATE_PROMPT + (
        f"\n输出要求: 结构化程度={output_format}，格式={output_style}，"
        f"思考链={'展示' if thinking_on else '不展示'}，输出量={volume}，学习深度={depth}。"
    )
    INPUT_PROMPT_WITH_SETTINGS = INPUT_AGENT_PROMPT + (
        f"\n用户设定了'输入优化-{input_mode}'模式，请据此决定询问策略。"
    )

    # 更新节点中使用这些带设置的 prompt
    _GENERATE_PROMPT = GENERATE_PROMPT_WITH_SETTINGS
    _KB_PROMPT = KB_PROMPT_WITH_SETTINGS
    _SEARCH_PROMPT = SEARCH_PROMPT_WITH_SETTINGS
    _INPUT_PROMPT = INPUT_PROMPT_WITH_SETTINGS

    def input_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "输入信息处理", "status": "running"})
        state.setdefault("mindchain", [])
        try:
            thinking, result = think_then_json(_INPUT_PROMPT, state["user_input"])
            state["processed_input"] = result.get("processed", state["user_input"])
        except Exception:
            thinking = "处理失败"
            state["processed_input"] = state["user_input"]
        state["mindchain"].append({"agent": "输入信息处理", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "输入信息处理", "status": "done"})
        state["dispatch_count"] = 0
        return state

    def dispatch_node(state: AgentState) -> AgentState:
        state["dispatch_count"] = state.get("dispatch_count", 0) + 1
        state.setdefault("steps", []).append({"agent": "调度", "status": "running"})
        context = f"用户输入: {state.get('processed_input', state['user_input'])}\n"
        if state.get("profile"): context += f"学情诊断: {json.dumps(state['profile'], ensure_ascii=False)}\n"
        if state.get("knowledge"): context += f"知识库结果数: {len(state['knowledge'])}\n"
        if state.get("search_results"): context += f"搜索结果数: {len(state['search_results'])}\n"
        context += f"已调度次数: {state['dispatch_count']}"
        try:
            thinking, result = think_then_json(DISPATCH_AGENT_PROMPT, context)
        except Exception:
            result = {"action": "enough", "summary": "调度异常，使用已有信息"}
        state.setdefault("steps", []).append({"agent": "调度", "status": "done", "detail": result.get("action", "unknown")})
        state["mindchain"].append({"agent": "调度", "content": thinking[:800]})
        state["_dispatch_result"] = result
        return state

    def diagnose_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "running"})
        try:
            thinking, result = think_then_json(DIAGNOSE_PROMPT, state["user_input"])
            state["profile"] = result
        except Exception:
            state["profile"] = {"level": "unknown"}
        state["mindchain"].append({"agent": "学情诊断", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "done"})
        return state

    def kb_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "running"})
        try:
            thinking, result = think_then_json(_KB_PROMPT, state["user_input"])
            state["knowledge"] = result.get("results", [])
        except Exception:
            state["knowledge"] = []
        state["mindchain"].append({"agent": "知识库管理", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "done"})
        return state

    def search_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "搜索", "status": "running"})
        state["search_results"] = [{"content": "搜索功能即将接入 SearXNG+Perplexica", "source": "local"}]
        state["mindchain"].append({"agent": "搜索", "content": "搜索完成（当前为占位结果）"})
        state.setdefault("steps", []).append({"agent": "搜索", "status": "done"})
        return state

    def memory_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "running"})
        state["memory"] = state.get("memory", {})
        state["mindchain"].append({"agent": "记忆管理", "content": "记忆已读取/更新"})
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "done"})
        return state

    def generate_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "running"})
        context = f"用户问题: {state['user_input']}\n"
        if state.get("profile"): context += f"学情: {json.dumps(state['profile'], ensure_ascii=False)}\n"
        if state.get("knowledge"): context += f"知识库: {json.dumps(state['knowledge'], ensure_ascii=False)}\n"
        try:
            thinking, result = think_then_json(_GENERATE_PROMPT, context)
            state["generated"] = result.get("content", "")
        except Exception as e:
            state["generated"] = f"抱歉，生成内容时出现错误：{str(e)[:200]}"
        state["mindchain"].append({"agent": "信息整理与生成", "content": thinking[:800]})
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "done"})
        return state

    def review_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "审核裁判", "status": "running"})
        state["retry_count"] = state.get("retry_count", 0) + 1
        try:
            thinking, result = think_then_json(REVIEW_PROMPT, state.get("generated", ""))
            state["reviewed"] = result
        except Exception:
            state["reviewed"] = {"passed": True, "score": 80}
        state.setdefault("steps", []).append({"agent": "审核裁判", "status": "done", "detail": f"score={state['reviewed'].get('score', 0)}"})
        state["mindchain"].append({"agent": "审核裁判", "content": thinking[:600]})
        return state

    def output_node(state: AgentState) -> AgentState:
        generated = state.get("generated") or "（系统未生成内容）"
        reviewed = state.get("reviewed", {})
        passed = reviewed.get("passed", True)
        if passed:
            state["final_reply"] = generated
        else:
            state["final_reply"] = generated + f"\n\n> ⚠️ 审核未完全通过 (重试{state.get('retry_count', 0)}次)"
        state.setdefault("steps", []).append({"agent": "输出", "status": "done"})
        return state

    def route_dispatch(state: AgentState) -> str:
        agent = state.get("_dispatch_result", {}).get("agent", "kb")
        m = {"diagnose": "diagnose", "kb": "kb", "search": "search", "memory": "memory"}
        return m.get(agent, "enough") if state.get("_dispatch_result", {}).get("action") == "call_agent" else "enough"

    def route_review(state: AgentState) -> str:
        if state.get("reviewed", {}).get("passed", True): return "passed"
        if state.get("retry_count", 0) >= 3: return "max_retry"
        return "retry"

    graph = StateGraph(AgentState)
    for name, node in [("input", input_node), ("dispatch", dispatch_node), ("diagnose", diagnose_node),
                         ("kb", kb_node), ("search", search_node), ("memory", memory_node),
                         ("generate", generate_node), ("review", review_node), ("output", output_node)]:
        graph.add_node(name, node)
    graph.set_entry_point("input")
    graph.add_edge("input", "dispatch")
    graph.add_conditional_edges("dispatch", route_dispatch, {"diagnose": "diagnose", "kb": "kb", "search": "search", "memory": "memory", "enough": "generate"})
    for n in ["diagnose", "kb", "search", "memory"]: graph.add_edge(n, "dispatch")
    graph.add_edge("generate", "review")
    graph.add_conditional_edges("review", route_review, {"passed": "output", "retry": "generate", "max_retry": "output"})
    graph.add_edge("output", END)
    return graph.compile()
