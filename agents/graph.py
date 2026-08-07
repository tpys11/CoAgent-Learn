"""LangGraph 多智能体协同工作流"""
import json
from typing import TypedDict
from langgraph.graph import StateGraph, END
from core.base_llm import DeepSeekLLM
from agents.prompts import (
    INPUT_AGENT_PROMPT, DISPATCH_AGENT_PROMPT, DIAGNOSE_PROMPT,
    KB_PROMPT, SEARCH_PROMPT, MEMORY_PROMPT, GENERATE_PROMPT, REVIEW_PROMPT,
    REVIEW_A_PROMPT, REVIEW_B_PROMPT, REVIEW_C_PROMPT, ARBITRATE_PROMPT,
)
from skills.registry import registry


class AgentState(TypedDict):
    user_input: str
    mode: str
    image: str
    project_id: str
    dialogue_id: str
    session_id: str
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


def create_workflow(api_key: str | None = None, settings: dict | None = None, on_token=None, model: str | None = None, base_url: str | None = None):
    settings = settings or {}
    llm_raw = DeepSeekLLM(api_key=api_key, model=model, base_url=base_url)

    import re

    def think_then_json(system_prompt: str, user_prompt: str, agent_name: str) -> tuple[str, dict]:
        """流式思考：用chat_stream逐token推送，收集完整文本后提取JSON"""
        collected = []
        def collect(chunk):
            collected.append(chunk)
            if on_token:
                on_token(agent_name, chunk)
        try:
            llm_raw.chat_stream(
                [{"role": "system", "content": system_prompt + "\n先自然语言思考，再用```json```输出结果。"},
                 {"role": "user", "content": user_prompt}],
                collect
            )
            raw = "".join(collected)
            m = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
            if m:
                thinking = raw[:m.start()].strip()
                result = json.loads(m.group(1))
            else:
                thinking = raw[:500]
                result = {"content": raw}
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
            thinking, result = think_then_json(_INPUT_PROMPT, state["user_input"], "输入信息处理")
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
        # 注入可用 Skill 列表
        skills_desc = json.dumps(registry.list_for_llm(), ensure_ascii=False, indent=1)
        context += f"\n可用功能模块(Skills):\n{skills_desc}\n"
        if state.get("profile"): context += f"学情诊断: {json.dumps(state['profile'], ensure_ascii=False)}\n"
        if state.get("knowledge"): context += f"知识库结果数: {len(state['knowledge'])}\n"
        if state.get("search_results"): context += f"搜索结果数: {len(state['search_results'])}\n"
        context += f"已调度次数: {state['dispatch_count']}"
        try:
            thinking, result = think_then_json(DISPATCH_AGENT_PROMPT, context, "调度")
        except Exception:
            result = {"action": "enough", "summary": "调度异常，使用已有信息"}
        state.setdefault("steps", []).append({"agent": "调度", "status": "done", "detail": result.get("action", "unknown")})
        state["mindchain"].append({"agent": "调度", "content": thinking[:800]})
        state["_dispatch_result"] = result
        return state

    def diagnose_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "running"})
        try:
            thinking, result = think_then_json(DIAGNOSE_PROMPT, state["user_input"], "学情诊断")
            state["profile"] = result
        except Exception:
            state["profile"] = {"level": "unknown"}
        state["mindchain"].append({"agent": "学情诊断", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "学情诊断", "status": "done"})
        return state

    def kb_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "running"})
        thinking = ""
        try:
            from skills.registry import registry
            result = registry.execute("knowledge_retrieval", query=state["user_input"], project_id=state.get("project_id", "default"))
            state["knowledge"] = result.get("results", [])
            thinking = f"知识库检索完成：{result.get('total', 0)}条结果"
        except Exception as e:
            state["knowledge"] = []
            thinking = f"知识库检索异常：{e}"
        state["mindchain"].append({"agent": "知识库管理", "content": thinking})
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "done"})
        return state

    def search_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "搜索", "status": "running"})
        try:
            result = registry.execute("web_search", query=state["user_input"])
            state["search_results"] = result.get("results", [])
            state["mindchain"].append({"agent": "搜索", "content": f"搜索完成：{result.get('total', 0)}条结果"})
        except Exception as e:
            state["search_results"] = []
            state["mindchain"].append({"agent": "搜索", "content": f"搜索异常：{e}"})
        state.setdefault("steps", []).append({"agent": "搜索", "status": "done"})
        return state

    def memory_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "running"})
        try:
            result = registry.execute("memory_ops", action="read", layer="L2")
            state["memory"] = result.get("memory", {})
            state["mindchain"].append({"agent": "记忆管理", "content": f"记忆操作完成"})
        except Exception as e:
            state["memory"] = {}
            state["mindchain"].append({"agent": "记忆管理", "content": f"记忆异常：{e}"})
        state.setdefault("steps", []).append({"agent": "记忆管理", "status": "done"})
        return state

    def generate_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "running"})
        context = f"用户问题: {state['user_input']}" + chr(10)
        # AI 回答时调用视觉分析（用户上传了图片）
        if state.get("image"):
            try:
                from core.vision_service import describe_image
                img_desc = describe_image(state["image"], "请详细描述这张图片的内容，包括其中的文字、物体、图表等")
                context += "【用户上传的图片内容（已调用视觉分析）】" + chr(10) + img_desc + chr(10)
                state["mindchain"].append({"agent": "视觉分析", "content": "已调用 glm-4v-flash 分析用户图片：" + img_desc[:150]})
            except Exception as e:
                context += "【用户上传了图片，但视觉分析失败：%s】" + chr(10) % str(e)[:100]
        mode = state.get("mode", "kb")
        if mode == "kb":
            context += "【输出模式】知识库模式：请优先基于知识库内容回答；若知识库没有相关内容，回答第一句必须明确告知：⚠️ 未在知识库中检索到相关内容，以下为模型通识回答。" + chr(10)
        else:
            context += "【输出模式】默认模式：可自由发挥回答，不限制。" + chr(10)
        if state.get("profile"): context += f"学情: {json.dumps(state['profile'], ensure_ascii=False)}" + chr(10)
        if state.get("knowledge"): context += f"知识库: {json.dumps(state['knowledge'], ensure_ascii=False)}" + chr(10)
        # 读最近对话历史
        try:
            from core.sqlite_client import get_db
            _dbx = get_db()
            _rows = _dbx.execute("SELECT role,content FROM messages WHERE dialogue_id=%s ORDER BY created_at DESC LIMIT 10", (state.get("dialogue_id","default"),))
            _rows.reverse()
            import sys as _s
            _s.stderr.write("[gen-hist] did="+str(state.get("dialogue_id"))[:15]+" rows="+str(len(_rows))+chr(10));_s.stderr.flush()
            if _rows:
                context+=chr(10)+"【历史对话】"+chr(10)
                for _r in _rows[:-1]:
                    _c=str(_r.get("content")) if _r.get("content") else ""
                    if _c and _c!="（系统未生成内容）":
                        context+=("user: " if _r.get("role")=="user" else "assistant: ")+_c[:150]+chr(10)
        except Exception:
            pass
        try:
            thinking, result = think_then_json(_GENERATE_PROMPT, context, "信息整理与生成")
            state["resources"] = result
            NL = chr(10)
            if isinstance(result, dict) and result.get("讲义"):
                parts = ["## 📘 定制讲义", str(result.get("讲义", "")), "", "## 🛠 实操指南", str(result.get("实操指南", ""))]
                tests = result.get("测试题") or []
                if tests:
                    parts.append("")
                    parts.append("## 📝 分阶测试题")
                    for t in tests:
                        if isinstance(t, dict):
                            parts.append("**【" + str(t.get("难度", "基础")) + "】** " + str(t.get("题目", "")))
                            parts.append("> 答案：" + str(t.get("答案", "")))
                src = result.get("溯源")
                if src:
                    parts.append("")
                    parts.append("_溯源：" + "、".join(str(s) for s in src) + "_")
                state["generated"] = NL.join(parts)
            else:
                state["generated"] = (result.get("content", "") or "").replace("\n", NL)
        except Exception as e:
            state["generated"] = f"抱歉，生成内容时出现错误：{str(e)[:200]}"
        state["mindchain"].append({"agent": "信息整理与生成", "content": thinking[:800]})
        state.setdefault("steps", []).append({"agent": "信息整理与生成", "status": "done"})
        return state

    def review_node(state: AgentState) -> AgentState:
        state.setdefault("steps", []).append({"agent": "交叉审核", "status": "running"})
        state["retry_count"] = state.get("retry_count", 0) + 1
        generated = state.get("generated", "")
        profile_txt = json.dumps(state.get("profile", {}), ensure_ascii=False) if state.get("profile") else "未知学情"
        NL = chr(10)
        opinions = []
        reviewers = [
            ("审核A·符实性", REVIEW_A_PROMPT, ""),
            ("审核B·难度适配", REVIEW_B_PROMPT, NL + "学情画像：" + profile_txt),
            ("审核C·规范性", REVIEW_C_PROMPT, ""),
        ]
        for name, prompt, extra in reviewers:
            try:
                thinking, result = think_then_json(prompt, generated + extra, name)
                opinions.append({"agent": name, "thinking": thinking[:300], "result": result})
                state["mindchain"].append({"agent": name, "content": thinking[:400]})
            except Exception:
                opinions.append({"agent": name, "thinking": "", "result": {"passed": True, "score": 80}})
        try:
            arb_txt = json.dumps([{"agent": o["agent"], "opinion": o["result"]} for o in opinions], ensure_ascii=False)
            thinking, result = think_then_json(ARBITRATE_PROMPT, arb_txt, "仲裁Agent")
            state["reviewed"] = result
            state["mindchain"].append({"agent": "仲裁Agent", "content": thinking[:400]})
        except Exception:
            state["reviewed"] = {"passed": True, "score": 80, "verdict": "仲裁异常，默认通过"}
        state["review_opinions"] = opinions
        state.setdefault("steps", []).append({"agent": "交叉审核", "status": "done",
            "detail": "3审核+仲裁 score=" + str(state['reviewed'].get('score', 0))})
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
        if state.get("dispatch_count", 0) >= 3:
            return "enough"
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
