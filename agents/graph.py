"""LangGraph 多智能体协同工作流"""
import json, os
from typing import TypedDict
from langgraph.graph import StateGraph, END
from backend.core.base_llm import DeepSeekLLM
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


def create_workflow(api_key: str | None = None):
    llm = DeepSeekLLM(api_key=api_key)
    api_key_val = api_key or os.getenv("DEEPSEEK_API_KEY", "")

    def input_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "输入信息处理", "status": "running"})
        try:
            result = llm.chat_with_json(
                [{"role": "system", "content": INPUT_AGENT_PROMPT},
                 {"role": "user", "content": state["user_input"]}],
                {"type": "object", "properties": {"processed": {"type": "string"}, "format": {"type": "string"}}}
            )
            state["processed_input"] = result.get("processed", state["user_input"])
        except Exception:
            state["processed_input"] = state["user_input"]
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
            result = llm.chat_with_json(
                [{"role": "system", "content": DISPATCH_AGENT_PROMPT},
                 {"role": "user", "content": context}],
                {"type": "object", "properties": {"action": {"type": "string"}, "agent": {"type": "string"}, "query": {"type": "string"}, "summary": {"type": "string"}}}
            )
        except Exception:
            result = {"action": "enough", "summary": "调度异常，使用已有信息"}
        state.setdefault("steps", []).append({"agent": "调度", "status": "done", "detail": result.get("action", "unknown")})
        state["_dispatch_result"] = result
        return state

    def diagnose_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "running"})
        try:
            result = llm.chat_with_json(
                [{"role": "system", "content": DIAGNOSE_PROMPT}, {"role": "user", "content": state["user_input"]}],
                {"type": "object", "properties": {"level": {"type": "string"}, "strengths": {"type": "array"}, "gaps": {"type": "array"}, "suggestion": {"type": "string"}}}
            )
            state["profile"] = result
        except Exception:
            state["profile"] = {"level": "unknown"}
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "done"})
        return state

    def kb_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "running"})
        try:
            result = llm.chat_with_json(
                [{"role": "system", "content": KB_PROMPT}, {"role": "user", "content": state["user_input"]}],
                {"type": "object", "properties": {"results": {"type": "array"}, "summary": {"type": "string"}}}
            )
            state["knowledge"] = result.get("results", [])
        except Exception:
            state["knowledge"] = []
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "done"})
        return state

    def search_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "搜索", "status": "running"})
        state["search_results"] = [{"content": "搜索功能即将接入 SearXNG+Perplexica", "source": "local"}]
        state.setdefault("steps", []).append({"agent": "搜索", "status": "done"})
        return state

    def memory_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "running"})
        state["memory"] = state.get("memory", {})
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "done"})
        return state

    def generate_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "running"})
        context = f"用户问题: {state['user_input']}\n"
        if state.get("profile"): context += f"学情: {json.dumps(state['profile'], ensure_ascii=False)}\n"
        if state.get("knowledge"): context += f"知识库: {json.dumps(state['knowledge'], ensure_ascii=False)}\n"
        try:
            result = llm.chat_with_json(
                [{"role": "system", "content": GENERATE_PROMPT}, {"role": "user", "content": context}],
                {"type": "object", "properties": {"content": {"type": "string"}, "sources": {"type": "array"}}}
            )
            state["generated"] = result.get("content", "")
        except Exception:
            state["generated"] = "抱歉，生成内容时出现错误。"
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "done"})
        return state

    def review_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "审核裁判", "status": "running"})
        state["retry_count"] = state.get("retry_count", 0) + 1
        try:
            result = llm.chat_with_json(
                [{"role": "system", "content": REVIEW_PROMPT}, {"role": "user", "content": state.get("generated", "")}],
                {"type": "object", "properties": {"passed": {"type": "boolean"}, "score": {"type": "number"}, "issues": {"type": "array"}, "suggestion": {"type": "string"}}}
            )
            state["reviewed"] = result
        except Exception:
            state["reviewed"] = {"passed": True, "score": 80}
        state.setdefault("steps", []).append({"agent": "审核裁判", "status": "done", "detail": f"score={state['reviewed'].get('score', 0)}"})
        return state

    def output_node(state: AgentState) -> AgentState:
        reviewed = state.get("reviewed", {})
        passed = reviewed.get("passed", True)
        if passed:
            state["final_reply"] = state.get("generated", "")
        else:
            state["final_reply"] = (state.get("generated", "") + f"\n\n> ⚠️ 审核未完全通过 (重试{state.get('retry_count', 0)}次)")
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
