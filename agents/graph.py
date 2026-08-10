"""LangGraph 多智能体协同工作流（4-Agent 结构）

主Agent(规划调度) → [学情与记忆管理 ∥ 知识库管理] 并行 → 主Agent(生成) → 审核 → 输出/重试

支持按 Agent 配置覆盖：模型选择(跟随全局/强模型/快模型)、重试上限、记忆注入开关、
启用/禁用、few-shot 示例；并收集 task_stats（各节点耗时/LLM调用次数/token估算）。
"""
import json
import re
import time
from typing import TypedDict
from langgraph.graph import StateGraph, END
from core.base_llm import DeepSeekLLM
from agents.prompts import (
    MAIN_PLAN_PROMPT, MAIN_GENERATE_PROMPT,
    STUDY_MEMORY_PROMPT, REVIEW_PROMPT,
)

# 决策类节点（规划/学情/审核）使用的快模型：按 base_url 域名自动映射，映射不到则与主模型一致
FAST_MODEL_BY_BASE = {
    'api.deepseek.com': 'deepseek-v4-flash',
    'api.openai.com': 'gpt-4o-mini',
    'dashscope.aliyuncs.com': 'qwen-turbo',
    'open.bigmodel.cn': 'glm-4-flash',
    'api.moonshot.cn': 'moonshot-v1-8k',
    'ark.cn-beijing.volces.com': 'doubao-lite-32k',
}

# Agent 配置 id → 节点名
AGENT_NODE = {'main': 'main', 'study': 'study', 'kb': 'kb', 'review': 'review'}


class AgentState(TypedDict):
    user_input: str
    mode: str
    image: str
    project_id: str
    dialogue_id: str
    session_id: str
    processed_input: str
    complexity: str
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
    task_stats: dict  # 运行监控：{node: {ms, llm_calls}, token_estimate}
    sub_outputs: dict  # 子Agent产出：{kb: str, gen: str}
    _output_subs: list  # 输出增强模板：主Agent规划时按需选择的输出子Agent列表


# 检索增强模板的内置默认子 Agent（知识库与搜索 Agent 强制调用；用户配置了 subAgents 则用自定义）
_DEFAULT_KB_SUBS = [
    {"id": "kb-manage", "name": "知识库管理", "subPrompt": "你是知识库检索整理助手。把检索到的知识库片段整理为「来源→核心观点→关键数据」的条目，只输出整理结果本身。", "form": "检索"},
    {"id": "search", "name": "搜索增强", "subPrompt": "你是搜索增强整理助手。把联网搜索到的资料整理为「来源→核心观点→关键数据」的条目并标注来源网址，只输出整理结果本身。", "form": "搜索"},
]


def _build_out_cand(agents: list, tpl: str) -> str:
    """输出增强模板：构造主 Agent 可选的输出子 Agent 候选提示；非输出增强或无子 Agent 时返回空串"""
    if tpl != "输出增强":
        return ""
    _cfg = next((a for a in agents if isinstance(a, dict) and a.get("id") == "main"), {})
    _subs = _cfg.get("subAgents") or []
    if not _subs:
        return ""
    _cand = "；".join(f"{s.get('id')}={s.get('name')}({s.get('form', '')})" for s in _subs)
    return (
        f"\n输出增强模板：请根据用户问题按需选择 0-3 个输出子Agent，在返回 JSON 中额外给出 \"output_subs\": [子Agent id 数组]。"
        f"候选：{_cand}。若用户问题不需要结构化输出则返回空数组。"
    )


def create_workflow(api_key: str | None = None, settings: dict | None = None, on_token=None,
                    model: str | None = None, base_url: str | None = None, agents: list | None = None,
                    on_answer=None):
    # on_answer：主Agent生成节点的最终回答逐 token 直接流式推送（不进思维链，对话区实时显示）
    settings = settings or {}
    agents = agents or []
    tpl = settings.get("template") or "基础"  # 基础 / 检索增强 / 快速 / 输出增强
    # 主模型：生成节点使用（用户所选模型）
    llm_main = DeepSeekLLM(api_key=api_key, model=model, base_url=base_url)
    # 快模型：决策类节点（规划/学情/审核）使用
    fast_model = None
    if base_url:
        for host, fm in FAST_MODEL_BY_BASE.items():
            if host in base_url:
                fast_model = fm
                break
    llm_fast = DeepSeekLLM(api_key=api_key, model=fast_model, base_url=base_url, thinking=False) if (fast_model and fast_model != model) else llm_main
    # 非思考模式主模型：快速模板用（直接生成，不推理）
    llm_main_no_think = DeepSeekLLM(api_key=api_key, model=model, base_url=base_url, thinking=False)
    # 简单问题主模型：保留思考模式（思维链展示）但 effort=low（极短思考，秒级完成）
    llm_main_low = DeepSeekLLM(api_key=api_key, model=model, base_url=base_url, thinking=True, effort='low')

    def _agent_cfg(aid: str) -> dict:
        """按 Agent id 取配置（缺失时返回空）"""
        for a in agents:
            if isinstance(a, dict) and a.get("id") == aid:
                return a
        return {}

    def _pick_llm(cfg: dict, default_llm) -> object:
        """模型选择：main=强模型 / fast=快模型 / global=跟随节点默认"""
        choice = (cfg or {}).get("model") or "global"
        if choice == "main":
            return llm_main
        if choice == "fast":
            return llm_fast
        return default_llm

    def _append_example(cfg: dict, user_prompt: str) -> str:
        """few-shot：追加该 Agent 的输入输出示例"""
        ex = (cfg or {}).get("example") or ""
        if ex:
            user_prompt += "\n\n【输入输出示例】\n" + str(ex)
        return user_prompt

    def _stats(state: AgentState, node: str, ms: int, llm_calls: int = 0, tokens: int = 0):
        st = state.setdefault("task_stats", {})
        cur = st.get(node, {"ms": 0, "llm_calls": 0})
        cur["ms"] += ms
        cur["llm_calls"] += llm_calls
        st[node] = cur
        st["token_estimate"] = st.get("token_estimate", 0) + tokens

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
    thinking_on = settings.get('thinking', '开') == '开'
    volume = settings.get('outputVolume', '适中')
    depth = settings.get('depth', '中')
    input_mode = settings.get('inputOptMode', '默认模式')

    _GENERATE_PROMPT = MAIN_GENERATE_PROMPT + (
        f"\n输出要求: 结构化程度={output_format}，格式={output_style}，"
        f"思考链={'展示' if thinking_on else '不展示'}，输出量={volume}，学习深度={depth}。"
    )
    _PLAN_PROMPT = MAIN_PLAN_PROMPT + (
        f"\n用户设定了'输入优化-{input_mode}'模式，请据此决定询问策略。"
        + (_OUT_CAND_PROMPT if (_OUT_CAND_PROMPT := _build_out_cand(agents, tpl)) else "")
    )

    # ---------------- 节点 ----------------

    def plan_node(state: AgentState) -> AgentState:
        """主 Agent·规划调度：输入处理 + 一次规划出子 Agent 调用清单（可并行）"""
        state.setdefault("steps", []).append({"agent": "主Agent·规划", "status": "running", "detail": "规划调度"})
        state.setdefault("mindchain", [])
        t0 = time.time()
        cfg = _agent_cfg("main")
        # 快速模板：主 Agent 直接从综合概述性记忆生成，规划不再调用 LLM（流程只剩主 Agent 与审核与输出）
        if tpl == "快速":
            thinking = "快速模板：跳过规划，直接基于综合概述性记忆生成"
            state["processed_input"] = state["user_input"]
            state["_plan"] = []
            state["_output_subs"] = []
            state["complexity"] = "simple"  # 快速模板：跳过规划直接生成，视为简单问题
            _stats(state, "plan", int((time.time() - t0) * 1000), 0, 0)
            state["mindchain"].append({"agent": "主Agent·规划", "content": thinking})
            state.setdefault("steps", []).append({"agent": "主Agent·规划", "status": "done", "detail": "快速模板：跳过规划"})
            return state
        try:
            thinking, result = think_then_json(_pick_llm(cfg, llm_fast), _PLAN_PROMPT,
                _append_example(cfg, state["user_input"]), "主Agent·规划")
            state["processed_input"] = result.get("processed", state["user_input"])
            state["_plan"] = result.get("plan", []) or []
            state["complexity"] = result.get("complexity", "normal")
            # 输出增强模板：解析主 Agent 按需选择的输出子 Agent
            if tpl == "输出增强":
                _all_subs = cfg.get("subAgents") or []
                _sel = result.get("output_subs") or []
                state["_output_subs"] = [s for s in _all_subs if s.get("id") in _sel][:3]
            else:
                state["_output_subs"] = []
        except Exception:
            thinking = "规划失败，使用原始输入"
            state["processed_input"] = state["user_input"]
            state["_plan"] = []
        _stats(state, "plan", int((time.time() - t0) * 1000), 1, len(thinking) // 2)
        state["mindchain"].append({"agent": "主Agent·规划", "content": thinking})
        state.setdefault("steps", []).append({"agent": "主Agent·规划", "status": "done",
            "detail": f"规划完成，调用: {state['_plan'] if state['_plan'] else '无需子Agent'}"})
        return state

    def study_memory_node(state: AgentState) -> AgentState:
        """学情与记忆管理：读取记忆（可关）+ 学情画像（快模型，一次调用）"""
        state.setdefault("steps", []).append({"agent": "学情与记忆管理", "status": "running"})
        t0 = time.time()
        cfg = _agent_cfg("study")
        from skills.registry import registry
        memory_txt = ""
        try:
            if (cfg.get("memoryEnabled") is not False):
                mem = registry.execute("memory_ops", action="read", layer=settings.get('memoryLayer', 'L2'), project_id=state.get("project_id", "default"))
                state["memory"] = mem.get("memory", {})
                if state["memory"]:
                    memory_txt = "\n已有记忆: " + json.dumps(state["memory"], ensure_ascii=False)
            else:
                state["memory"] = {}
        except Exception:
            state["memory"] = {}
        try:
            thinking, result = think_then_json(_pick_llm(cfg, llm_fast), STUDY_MEMORY_PROMPT,
                _append_example(cfg, state["user_input"] + memory_txt), "学情与记忆管理")
            state["profile"] = result if isinstance(result, dict) else {}
        except Exception:
            thinking = "学情分析异常"
            state["profile"] = {"level": "unknown"}
        _stats(state, "study_memory", int((time.time() - t0) * 1000), 1, len(thinking) // 2)
        state["mindchain"].append({"agent": "学情与记忆管理", "content": thinking})
        state.setdefault("steps", []).append({"agent": "学情与记忆管理", "status": "done"})
        return state

    def kb_node(state: AgentState) -> AgentState:
        """知识库管理：知识库检索 + 联网搜索（工具调用，不耗 LLM 推理）"""
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "running"})
        t0 = time.time()
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
        # 检索增强模板：强制调用知识库与搜索 Agent 的子 Agent（内置默认：知识库管理/搜索；用户自定义则用自定义）
        kb_cfg = _agent_cfg("kb")
        kb_subs = kb_cfg.get("subAgents") or _DEFAULT_KB_SUBS
        if tpl == "检索增强" and kb_subs:
            sub_parts = []
            for sub in kb_subs:
                try:
                    _sp = (sub.get("subPrompt") or "") + "\n请只输出整理结果本身。"
                    _sid = sub.get("id") or ""
                    # 分工：知识库管理子Agent 只整理知识库片段，搜索子Agent 只整理联网结果，其余子Agent 喂全部
                    if _sid == "kb-manage":
                        _feed = {"knowledge": state.get("knowledge", [])}
                    elif _sid == "search":
                        _feed = {"search": state.get("search_results", [])}
                    else:
                        _feed = {"knowledge": state.get("knowledge", []), "search": state.get("search_results", [])}
                    _in = "检索材料：\n" + json.dumps(_feed, ensure_ascii=False)[:4000]
                    _t, _r = think_then_json(llm_fast, _sp, _in, sub.get("name") or "资料解析")
                    _c = (_r.get("content") if isinstance(_r, dict) and _r.get("content") else _t) or ""
                    if _c:
                        sub_parts.append(f"【{sub.get('name')}】\n" + str(_c)[:1200])
                except Exception:
                    pass
            if sub_parts:
                state["sub_outputs"] = {**(state.get("sub_outputs") or {}), "kb": "\n".join(sub_parts)}
                state.setdefault("mindchain", []).append({"agent": "知识库与搜索·子Agent", "content": f"强制调用 {len(sub_parts)} 个子Agent整理资料"})
                thinking += f"；子Agent整理 {len(sub_parts)} 项"
        _stats(state, "kb", int((time.time() - t0) * 1000), 0, 0)
        state["mindchain"].append({"agent": "知识库管理", "content": thinking})
        state.setdefault("steps", []).append({"agent": "知识库管理", "status": "done"})
        return state

    def generate_node(state: AgentState) -> AgentState:
        """主 Agent·生成：基于学情/知识库/历史生成三种学习资源（强模型）"""
        state.setdefault("steps", []).append({"agent": "主Agent·生成", "status": "running", "detail": "生成输出"})
        t0 = time.time()
        cfg = _agent_cfg("main")
        NL = chr(10)
        context = f"用户问题: {state['user_input']}" + NL
        # AI 回答时调用视觉分析（用户上传了图片）
        if state.get("image"):
            try:
                from core.vision_service import describe_image
                img_desc = describe_image(state["image"], "请详细描述这张图片的内容，包括其中的文字、物体、图表等")
                context += "【用户上传的图片内容（已调用视觉分析）】" + NL + img_desc + NL
                state.setdefault("mindchain", []).append({"agent": "视觉分析", "content": "已调用 glm-4v-flash 分析用户图片：" + img_desc[:150]})
            except Exception as e:
                context += "【用户上传了图片，但视觉分析失败：" + str(e)[:100] + "】" + NL
        mode = state.get("mode", "kb")
        if mode == "kb":
            context += "【输出模式】知识库模式：请优先基于知识库内容回答；若知识库没有相关内容，回答第一句必须明确告知：⚠️ 未在知识库中检索到相关内容，以下为模型通识回答。" + NL
        else:
            context += "【输出模式】默认模式：可自由发挥回答，不限制。" + NL
        if state.get("profile") and (cfg.get("memoryEnabled") is not False):
            context += f"学情: {json.dumps(state['profile'], ensure_ascii=False)}" + NL
        if state.get("knowledge"): context += f"知识库: {json.dumps(state['knowledge'], ensure_ascii=False)}" + NL
        if state.get("search_results"): context += f"联网搜索: {json.dumps(state['search_results'], ensure_ascii=False)}" + NL
        # 快速模板：不调用学情与记忆管理/知识库管理，改为合并已保存的信息为「综合概述性记忆」直接发送
        # 前提：首次使用时各 Agent 调用后已保存（个人全局记忆 / 项目记忆 / 知识库概述）
        if tpl == "快速":
            _summary = []
            try:
                from core.postgres_client import pg_client
                from core.memory_analysis import _as_dict
                _pid = state.get("project_id") or "default"
                _g = pg_client.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
                if _g and _g[0].get("data"):
                    _summary.append("个人记忆概述：" + json.dumps(_as_dict(_g[0]["data"]), ensure_ascii=False))
                _m = pg_client.execute("SELECT data FROM project_memories WHERE project_id=%s", (_pid,))
                if _m and _m[0].get("data"):
                    _summary.append("项目记忆概述：" + json.dumps(_as_dict(_m[0]["data"]), ensure_ascii=False))
                try:
                    from core.knowledge_service import list_docs
                    _docs = list_docs(_pid)
                    if _docs:
                        _summary.append("知识库概述：" + "；".join(f"{d.get('source','')}({d.get('chunks',0)}块)" for d in _docs[:20]))
                except Exception:
                    pass
            except Exception:
                pass
            if _summary:
                context += NL + "【综合概述性记忆】" + NL + NL.join(_summary) + NL
                state.setdefault("mindchain", []).append({"agent": "综合概述性记忆", "content": "快速模板：合并个人/项目记忆与知识库概述，不额外调用各 Agent"})
            else:
                context += NL + "【综合概述性记忆】暂无已保存的记忆与知识库数据（首次使用时请先走完整流程，让各 Agent 保存信息后再用快速模板）。" + NL
        if state.get("sub_outputs") and state["sub_outputs"].get("kb"):
            context += NL + "【知识库子Agent整理】" + NL + state["sub_outputs"]["kb"] + NL
        if state.get("review_feedback"): context += NL + "【审核修正要求】上一版未通过审核，请针对以下意见修改后再生成：" + NL + state["review_feedback"] + NL
        # 可用 Skill：让主 Agent 知道自己可调用的技能（来自 Agent 配置的 skill 字段）
        if cfg.get("skill"):
            context += NL + "【可用 Skill】" + NL + str(cfg["skill"]) + NL
        # 读最近对话历史（历史条数可配置）
        try:
            from core.sqlite_client import get_db
            _dbx = get_db()
            _limit = int(settings.get('historyLimit') or 10)
            _rows = _dbx.execute("SELECT role,content FROM messages WHERE dialogue_id=%s ORDER BY created_at DESC LIMIT %s", (state.get("dialogue_id", "default"), _limit))
            _rows.reverse()
            if _rows:
                context += NL + "【历史对话】" + NL
                for _r in _rows[:-1]:
                    _c = str(_r.get("content")) if _r.get("content") else ""
                    if _c and _c != "（系统未生成内容）":
                        context += ("user: " if _r.get("role") == "user" else "assistant: ") + _c[:150] + NL
        except Exception:
            pass
        # 输出增强模板：调用主 Agent 的子 Agent（如 树状结构/要点卡片）产出专项内容，主 Agent 基于其生成
        main_subs = cfg.get("subAgents") or []
        # 输出增强模板：按主 Agent 规划时选择的子 Agent 调用（按需）
        if tpl == "输出增强" and main_subs:
            sel_ids = [s.get("id") for s in (state.get("_output_subs") or [])]
            subs = [s for s in main_subs if s.get("id") in sel_ids] if sel_ids else []
            sub_parts = []
            for sub in subs:
                try:
                    _sp = (sub.get("subPrompt") or "") + "\n只输出该形式的内容本身。"
                    _form = sub.get("form") or ""
                    _in = f"主题：{state['user_input'][:500]}\n\n参考材料：\n" + context[-2500:]
                    _t, _r = think_then_json(llm_fast, _sp, _in, sub.get("name") or "输出子Agent")
                    _c = (_r.get("content") if isinstance(_r, dict) and _r.get("content") else _t) or ""
                    if _c:
                        sub_parts.append(f"【{sub.get('name')}{'（' + _form + '）' if _form else ''}】\n" + str(_c)[:1500])
                        state.setdefault("mindchain", []).append({"agent": "主Agent·子Agent", "content": f"{sub.get('name')} 产出完成"})
                except Exception:
                    pass
            if sub_parts:
                state["sub_outputs"] = {**(state.get("sub_outputs") or {}), "gen": "\n\n".join(sub_parts)}
                context += "\n\n【子Agent 专项产出（请基于这些产出组织最终回答）】\n" + state["sub_outputs"]["gen"]
        try:
            # 简单问题/快速模板：思考模式+effort=low（很短的思维链，响应最快）；复杂问题：深入思考
            _gen_llm = _pick_llm(cfg, llm_main_low if (state.get("complexity") == "simple" or tpl == "快速") else llm_main)
            _short_hint = ("（用户问题为简单问答：请直接给出简洁准确的回答，用 content 字段返回，"
                           "不要生成讲义/实操指南/测试题等长内容）") if state.get("complexity") == "simple" else ""
            # 生成节点的思考不进思维链；最终回答 content 逐 token 直接流式推送给前端（对话区实时显示）
            _gen_collected = []
            def _gen_collect(chunk):
                _gen_collected.append(chunk)
            def _gen_answer(piece):
                if on_answer:
                    on_answer(piece)
            if on_token:
                on_token("主Agent·生成", "")  # 触发 step：状态"正在思考生成…"
            _gen_llm.chat_stream(
                [{"role": "system", "content": _GENERATE_PROMPT},
                 {"role": "user", "content": _append_example(cfg, context) + _short_hint}],
                _gen_collect, on_content=_gen_answer
            )
            _raw = "".join(_gen_collected)
            # 提取 JSON（复用 think_then_json 逻辑）
            _m = re.search(r'```json\s*([\s\S]*?)\s*```', _raw)
            if _m:
                thinking = _raw[:_m.start()].strip()
                result = json.loads(_m.group(1))
            else:
                _m2 = re.search(r'\{[\s\S]*\}', _raw)
                if _m2:
                    thinking = _raw[:_m2.start()].strip()
                    result = json.loads(_m2.group())
                else:
                    thinking = _raw[:200]
                    result = {"content": _raw}
            if not isinstance(result, dict):
                result = {"content": str(result)}
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
        _stats(state, "generate", int((time.time() - t0) * 1000), 1, len(thinking) // 2)
        # 生成节点的思考不写入思维链（回答已直接流式输出）
        state.setdefault("steps", []).append({"agent": "主Agent·生成", "status": "done", "detail": "生成完成"})
        return state

    def review_node(state: AgentState) -> AgentState:
        """审核：一次调用完成符实性/难度适配/规范性三维审查 + 综合裁定（快模型）。
        简单问题（complexity=simple）跳过审核直接交付，保证极短响应。"""
        if state.get("complexity") == "simple":
            generated = state.get("generated") or "（系统未生成内容）"
            state["final_reply"] = generated
            state.setdefault("steps", []).append({"agent": "审核", "status": "done", "detail": "简单问题跳过审核"})
            state["reviewed"] = {"passed": True, "score": 100, "issues": [], "suggestion": "简单问题跳过审核"}
            _stats(state, "review", 0, 0, 0)
            return state
        state["retry_count"] = state.get("retry_count", 0) + 1
        state.setdefault("steps", []).append({"agent": "审核", "status": "running"})
        t0 = time.time()
        cfg = _agent_cfg("review")
        generated = state.get("generated", "")
        profile_txt = json.dumps(state.get("profile", {}), ensure_ascii=False) if state.get("profile") else "未知学情"
        try:
            thinking, result = think_then_json(_pick_llm(cfg, llm_fast), REVIEW_PROMPT,
                _append_example(cfg, generated + chr(10) + "学情画像：" + profile_txt), "审核")
            state["reviewed"] = result if isinstance(result, dict) else {"passed": True, "score": 80}
            if not state["reviewed"].get("passed", True):
                issues = state["reviewed"].get("issues") or []
                state["review_feedback"] = "审核意见：" + str(state["reviewed"].get("suggestion", "")) + " " + "；".join(str(i.get("fix", "")) for i in issues if isinstance(i, dict))
        except Exception:
            thinking = "审核异常"
            state["reviewed"] = {"passed": True, "score": 80, "verdict": "审核异常，默认通过"}
        _stats(state, "review", int((time.time() - t0) * 1000), 1, len(thinking) // 2)
        state["mindchain"].append({"agent": "审核", "content": thinking})
        state.setdefault("steps", []).append({"agent": "审核", "status": "done",
            "detail": f"score={state['reviewed'].get('score', 0)} passed={state['reviewed'].get('passed', True)}"})
        # 输出：审核通过直接交付；不通过（已到重试上限）交付并标注
        generated = state.get("generated") or "（系统未生成内容）"
        passed = state.get("reviewed", {}).get("passed", True)
        if passed:
            state["final_reply"] = generated
        else:
            state["final_reply"] = generated + f"\n\n> ⚠️ 审核未完全通过 (重试{state.get('retry_count', 0)}次)"
        state.setdefault("steps", []).append({"agent": "输出", "status": "done"})
        return state

    # ---------------- 路由 ----------------

    def route_plan(state: AgentState) -> list[str]:
        """一次规划 → 并行分发到需要的子 Agent（跳过被禁用的节点）
        快速模板：不调用任何 Agent，直接进入主 Agent 生成（综合概述性记忆由生成节点合并已保存信息）"""
        if (settings.get("template") or "基础") == "快速":
            return ["generate"]
        plan = state.get("_plan") or []
        cfg_study = _agent_cfg("study")
        cfg_kb = _agent_cfg("kb")
        targets = []
        # 检索增强模板：强制执行知识库节点（检索+联网+子Agent整理），不依赖主 Agent 规划
        if (settings.get("template") or "基础") == "检索增强" and (cfg_kb.get("enabled") is not False):
            targets.append("kb")
        if "学情与记忆管理" in plan and (cfg_study.get("enabled") is not False):
            targets.append("study_memory")
        if "知识库管理" in plan and (cfg_kb.get("enabled") is not False) and "kb" not in targets:
            targets.append("kb")
        return targets or ["generate"]

    def route_review(state: AgentState) -> str:
        # 审核 Agent 被禁用：直接通过
        if _agent_cfg("review").get("enabled") is False:
            state["reviewed"] = {"passed": True, "score": 80, "verdict": "审核已禁用"}
            return "passed"
        # passed 兼容字符串 "false"/"0"/"no"（LLM 偶发输出字符串）
        _p = state.get("reviewed", {}).get("passed", True)
        if isinstance(_p, str):
            _p = _p.strip().lower() not in ("false", "0", "no", "")
        if _p:
            return "passed"
        max_retry = int(_agent_cfg("review").get("retryMax") or 2)
        if state.get("retry_count", 0) >= max_retry:
            return "max_retry"
        return "retry"

    # ---------------- 图组装 ----------------

    graph = StateGraph(AgentState)
    for name, node in [("plan", plan_node), ("study_memory", study_memory_node), ("kb", kb_node),
                       ("generate", generate_node), ("review", review_node)]:
        graph.add_node(name, node)
    graph.set_entry_point("plan")
    graph.add_conditional_edges("plan", route_plan,
        {"study_memory": "study_memory", "kb": "kb", "generate": "generate"})
    graph.add_edge("study_memory", "generate")
    graph.add_edge("kb", "generate")
    graph.add_edge("generate", "review")
    graph.add_conditional_edges("review", route_review,
        {"passed": END, "retry": "generate", "max_retry": END})
    return graph.compile()
