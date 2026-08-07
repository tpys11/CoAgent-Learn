"""LangGraph 多智能体协同工作流（4-Agent 结构）

主Agent(规划调度) → [学情与记忆管理 ∥ 知识库管理] 并行 → 主Agent(生成) → 审核 → 输出/重试
"""
import json
import re
from typing import TypedDict
from langgraph.graph import StateGraph, END
from core.base_llm import DeepSeekLLM
from agents.prompts import (
    MAIN_PLAN_PROMPT, MAIN_GENERATE_PROMPT,
    STUDY_MEMORY_PROMPT, REVIEW_PROMPT,
)

# 决策类节点（规划/学情/审核）使用的快模型：按 base_url 域名自动映射，映射不到则与主模型一致
FAST_MODEL_BY_BASE = {
    'api.deepseek.com': 'deepseek-flash',
    'api.openai.com': 'gpt-4o-mini',
    'dashscope.aliyuncs.com': 'qwen-turbo',
    'open.bigmodel.cn': 'glm-4-flash',
    'api.moonshot.cn': 'moonshot-v1-8k',
    'ark.cn-beijing.volces.com': 'doubao-lite-32k',
}


class AgentState(TypedDict):
    user_input: str
    mode: str
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
    review_feedback: str
    final_reply: str
    steps: list
    _plan: list
    mindchain: list  # [{agent, content}]


def create_workflow(api_key: str | None = None, settings: dict | None = None, on_token=None, model: str | None = None, base_url: str | None = None):
    settings = settings or {}
    # 主模型：生成节点使用（用户所选模型）
    llm_main = DeepSeekLLM(api_key=api_key, model=model, base_url=base_url)
    # 快模型：决策类节点（规划/学情/审核）使用
    fast_model = None
    if base_url:
        for host, fm in FAST_MODEL_BY_BASE.items():
            if host in base_url:
                fast_model = fm
                break
    llm_fast = DeepSeekLLM(api_key=api_key, model=fast_model, base_url=base_url) if (fast_model and fast_model != model) else llm_main

    def think_then_json(llm, system_prompt: str, user_prompt: str, agent_name: str) -> tuple[str, dict]:
        """流式思考：用chat_stream逐token推送，收集完整文本后提取JSON"""
        collected = []
        def collect(chunk):
            collected.append(chunk)
            if on_token:
                on_token(agent_name, chunk)
        try:
            llm.chat_stream(
                [{"role": "system", "content": system_prompt},
                 {"role": "user", "content": user_prompt}],
                collect
            )
            raw = "".join(collected)
            m = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
            if m:
                thinking = raw[:m.start()].strip()
                result = json.loads(m.group(1))
            else:
                m2 = re.search(r'\{[\s\S]*\}', raw)
                if m2:
                    thinking = raw[:m2.start()].strip()
                    result = json.loads(m2.group())
                else:
                    thinking = raw[:300]
                    result = {"content": raw}
            return thinking, result
        except Exception as e:
            return f"执行异常: {e}", {}

    # 根据设置构建 Agent 专属约束
    output_format = settings.get('outputFormat', '高结构化')
    output_style = settings.get('outputStyle', 'MD文档')
    thinking_on = settings.get('thinking', '关') == '开'
    volume = settings.get('outputVolume', '适中')
    depth = settings.get('depth', '中')
    input_mode = settings.get('inputOptMode', '默认模式')

    _GENERATE_PROMPT = MAIN_GENERATE_PROMPT + (
        f"\n输出要求: 结构化程度={output_format}，格式={output_style}，"
        f"思考链={'展示' if thinking_on else '不展示'}，输出量={volume}，学习深度={depth}。"
    )
    _PLAN_PROMPT = MAIN_PLAN_PROMPT + (
        f"\n用户设定了'输入优化-{input_mode}'模式，请据此决定询问策略。"
    )

    # ---------------- 节点 ----------------

    def plan_node(state: AgentState) -> AgentState:
        """主 Agent·规划调度：输入处理 + 一次规划出子 Agent 调用清单（可并行）"""
        state.setdefault("steps", []).append({"agent": "主Agent", "status": "running", "detail": "规划调度"})
        state.setdefault("mindchain", [])
        try:
            thinking, result = think_then_json(llm_fast, _PLAN_PROMPT, state["user_input"], "主Agent")
            state["processed_input"] = result.get("processed", state["user_input"])
            state["_plan"] = result.get("plan", []) or []
        except Exception:
            thinking = "规划失败，使用原始输入"
            state["processed_input"] = state["user_input"]
            state["_plan"] = []
        state["mindchain"].append({"agent": "主Agent", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "主Agent", "status": "done",
            "detail": f"规划完成，调用: {state['_plan'] if state['_plan'] else '无需子Agent'}"})
        return state

    def study_memory_node(state: AgentState) -> AgentState:
        """学情与记忆管理：读取记忆 + 学情画像（快模型，一次调用）"""
        state.setdefault("steps", []).append({"agent": "学情与记忆管理", "status": "running"})
        from skills.registry import registry
        memory_txt = ""
        try:
            mem = registry.execute("memory_ops", action="read", layer="L2")
            state["memory"] = mem.get("memory", {})
            if state["memory"]:
                memory_txt = "\n已有记忆: " + json.dumps(state["memory"], ensure_ascii=False)
        except Exception:
            state["memory"] = {}
        try:
            thinking, result = think_then_json(llm_fast, STUDY_MEMORY_PROMPT,
                state["user_input"] + memory_txt, "学情与记忆管理")
            state["profile"] = result if isinstance(result, dict) else {}
        except Exception:
            state["profile"] = {"level": "unknown"}
        state["mindchain"].append({"agent": "学情与记忆管理", "content": thinking[:600]})
        state.setdefault("steps", []).append({"agent": "学情与记忆管理", "status": "done"})
        return state

    def kb_node(state: AgentState) -> AgentState:
        """知识库管理：知识库检索 + 联网搜索（工具调用，不耗 LLM 推理）"""
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "running"})
        from skills.registry import registry
        query = state.get("processed_input", state["user_input"])
        thinking = ""
        try:
            result = registry.execute("knowledge_retrieval", query=query, project_id=state.get("project_id", "default"))
            state["knowledge"] = result.get("results", [])
            thinking = f"知识库检索完成：{result.get('total', 0)}条结果"
        except Exception as e:
            state["knowledge"] = []
            thinking = f"知识库检索异常：{e}"
        try:
            sres = registry.execute("web_search", query=query)
            state["search_results"] = sres.get("results", [])
            thinking += f"；联网搜索 {sres.get('total', 0)} 条"
        except Exception:
            state["search_results"] = []
        state["mindchain"].append({"agent": "知识库管理", "content": thinking})
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "done"})
        return state

    def generate_node(state: AgentState) -> AgentState:
        """主 Agent·生成：基于学情/知识库/历史生成三种学习资源（强模型）"""
        state.setdefault("steps", []).append({"agent": "主Agent", "status": "running", "detail": "生成输出"})
        NL = chr(10)
        context = f"用户问题: {state['user_input']}" + NL
        mode = state.get("mode", "kb")
        if mode == "kb":
            context += "【输出模式】知识库模式：请优先基于知识库内容回答；若知识库没有相关内容，回答第一句必须明确告知：⚠️ 未在知识库中检索到相关内容，以下为模型通识回答。" + NL
        else:
            context += "【输出模式】默认模式：可自由发挥回答，不限制。" + NL
        if state.get("profile"): context += f"学情: {json.dumps(state['profile'], ensure_ascii=False)}" + NL
        if state.get("knowledge"): context += f"知识库: {json.dumps(state['knowledge'], ensure_ascii=False)}" + NL
        if state.get("search_results"): context += f"联网搜索: {json.dumps(state['search_results'], ensure_ascii=False)}" + NL
        if state.get("review_feedback"): context += NL + "【审核修正要求】上一版未通过审核，请针对以下意见修改后再生成：" + NL + state["review_feedback"] + NL
        # 读最近对话历史
        try:
            from core.sqlite_client import get_db
            _dbx = get_db()
            _rows = _dbx.execute("SELECT role,content FROM messages WHERE dialogue_id=%s ORDER BY created_at DESC LIMIT 10", (state.get("dialogue_id", "default"),))
            _rows.reverse()
            if _rows:
                context += NL + "【历史对话】" + NL
                for _r in _rows[:-1]:
                    _c = str(_r.get("content")) if _r.get("content") else ""
                    if _c and _c != "（系统未生成内容）":
                        context += ("user: " if _r.get("role") == "user" else "assistant: ") + _c[:150] + NL
        except Exception:
            pass
        try:
            thinking, result = think_then_json(llm_main, _GENERATE_PROMPT, context, "主Agent")
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
        state["mindchain"].append({"agent": "主Agent", "content": thinking[:800]})
        state.setdefault("steps", []).append({"agent": "主Agent", "status": "done", "detail": "生成完成"})
        return state

    def review_node(state: AgentState) -> AgentState:
        """审核：一次调用完成符实性/难度适配/规范性三维审查 + 综合裁定（快模型）"""
        state["retry_count"] = state.get("retry_count", 0) + 1
        state.setdefault("steps", []).append({"agent": "审核", "status": "running"})
        generated = state.get("generated", "")
        profile_txt = json.dumps(state.get("profile", {}), ensure_ascii=False) if state.get("profile") else "未知学情"
        try:
            thinking, result = think_then_json(llm_fast, REVIEW_PROMPT,
                generated + chr(10) + "学情画像：" + profile_txt, "审核")
            state["reviewed"] = result if isinstance(result, dict) else {"passed": True, "score": 80}
            if not state["reviewed"].get("passed", True):
                issues = state["reviewed"].get("issues") or []
                state["review_feedback"] = "审核意见：" + str(state["reviewed"].get("suggestion", "")) + " " + "；".join(str(i.get("fix", "")) for i in issues if isinstance(i, dict))
        except Exception:
            state["reviewed"] = {"passed": True, "score": 80, "verdict": "审核异常，默认通过"}
        state["mindchain"].append({"agent": "审核", "content": thinking[:400]})
        state.setdefault("steps", []).append({"agent": "审核", "status": "done",
            "detail": f"score={state['reviewed'].get('score', 0)} passed={state['reviewed'].get('passed', True)}"})
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

    # ---------------- 路由 ----------------

    def route_plan(state: AgentState) -> list[str]:
        """一次规划 → 并行分发到需要的子 Agent（可同时触发多个）"""
        plan = state.get("_plan") or []
        targets = []
        if "学情与记忆管理" in plan:
            targets.append("study_memory")
        if "知识库管理" in plan:
            targets.append("kb")
        return targets or ["generate"]

    def route_review(state: AgentState) -> str:
        if state.get("reviewed", {}).get("passed", True):
            return "passed"
        if state.get("retry_count", 0) >= 2:
            return "max_retry"
        return "retry"

    # ---------------- 图组装 ----------------

    graph = StateGraph(AgentState)
    for name, node in [("plan", plan_node), ("study_memory", study_memory_node), ("kb", kb_node),
                       ("generate", generate_node), ("review", review_node), ("output", output_node)]:
        graph.add_node(name, node)
    graph.set_entry_point("plan")
    graph.add_conditional_edges("plan", route_plan,
        {"study_memory": "study_memory", "kb": "kb", "generate": "generate"})
    graph.add_edge("study_memory", "generate")
    graph.add_edge("kb", "generate")
    graph.add_edge("generate", "review")
    graph.add_conditional_edges("review", route_review,
        {"passed": "output", "retry": "generate", "max_retry": "output"})
    graph.add_edge("output", END)
    return graph.compile()
