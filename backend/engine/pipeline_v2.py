# -*- coding: utf-8 -*-
"""v2 对话引擎·Loop1 骨架。

管线（当前仅 S0 Intake最小 + S4 Generate直连；后续 Loop 逐阶段补齐）：
  POST /api/chat (CHAT_ENGINE=v2 时进入)
    → S0: 画像守卫(409) / 存用户消息 / 载入请求上下文 / start帧
    → S4: 强模型直连流式（无策略指令/无检索/无审核——后续Loop接入）
    → done 帧 → AI回复落库
  取消：与 v1 共享 ACTIVE_CANCELS 注册表，/api/chat/stop 原样可用。
隔离：不 import agents.* —— 与旧图零耦合；测试经 _make_llm 接缝注入假模型。
"""
import json
import logging
import queue
import threading

from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "deepseek-v4-flash-vision-exp"

# 极速档字数约束（自旧引擎常量平移，语义不变）
FAST_WORD_MIN, FAST_WORD_MAX, FAST_WORD_HARD = 500, 800, 1000
# 思考/研究档字数约束（对话模式.md 定稿；Loop4.5 仅重建了极速档，此处补齐另两档）
THINK_WORD_MIN, THINK_WORD_MAX, THINK_WORD_HARD = 800, 1200, 1500
RESEARCH_WORD_MIN, RESEARCH_WORD_MAX, RESEARCH_WORD_HARD = 1500, 2000, 3000
# 思考/研究档字数约束（对话模式.md 定稿；Loop4.5 仅重建了极速档，此处补齐另两档）
THINK_WORD_MIN, THINK_WORD_MAX, THINK_WORD_HARD = 800, 1200, 1500
RESEARCH_WORD_MIN, RESEARCH_WORD_MAX, RESEARCH_WORD_HARD = 1500, 2000, 3000

from engine.mindchain import merge_consecutive  # noqa: E402


def engine_mode() -> str:
    """引擎选择开关：环境变量 CHAT_ENGINE=v1 可回退旧引擎；缺省 v2（新引擎为主）。"""
    import os
    return os.environ.get("CHAT_ENGINE", "v2")


# --- 模型接缝（测试在此打补丁注入 FakeLLM） ---

def _make_llm(req, model_override=None):
    from core.base_llm import DeepSeekLLM
    from core.config import config as _cfg
    return DeepSeekLLM(
        api_key=req.api_key or _cfg.DEEPSEEK_API_KEY,
        model=model_override or req.model or DEFAULT_MODEL,
        base_url=req.base_url,
    )


def _make_fast_llm(req):
    """快模型：同通道关思考（现版规则：未配置独立快模型时=主模型关thinking）。"""
    from core.base_llm import DeepSeekLLM
    from core.config import config as _cfg
    return DeepSeekLLM(
        api_key=req.api_key or _cfg.DEEPSEEK_API_KEY,
        model=req.model or DEFAULT_MODEL,
        base_url=req.base_url,
        thinking=False,
    )


def _persist_user_message(req, pid: str, did: str) -> None:
    from core.postgres_client import pg_client
    exist = pg_client.execute("SELECT id FROM dialogues WHERE id=%s", (did,))
    if not exist:
        pg_client.execute(
            "INSERT INTO dialogues(id,project_id,session_id,name) VALUES(%s,%s,%s,%s)",
            (did, pid, req.session_id or "default", "新对话"))
    pg_client.execute(
        "INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",
        (did, "user", req.message))


def _persist_assistant_message(did: str, reply: str) -> None:
    if not reply:
        return
    from core.postgres_client import pg_client
    pg_client.execute(
        "INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)",
        (did, "assistant", reply, "[]"))


def _v2_worker(req, token_queue, cancel_evt, request_id):
    """S0+S4 最小链路（线程体）。后续 Loop 在此扩展 Plan/Retrieve/Assess/Review。"""
    try:
        import time as _time_mod
        t0 = _time_mod.time()
        pid = req.project_id or "default"
        did = req.dialogue_id or "default"
        raw_settings = dict(req.settings or {})
        traces: list[dict] = []  # 首行初始化：异常路径也要能尽力冲刷已积累Trace
        try:
            _persist_user_message(req, pid, did)
        except Exception:
            logger.exception("[v2] 保存用户消息失败 did=%s", did)

        # 记忆修改分支：[模块名] 引用 → 独立路径短路（不走多Agent流程，v1语义平移）
        try:
            from services.memory_edit import memory_edit as _mem_edit
            _edit = _mem_edit(req.api_key, req.message, pid, req.session_id or "default")
        except Exception:
            _edit = None
            logger.exception("[v2] 记忆修改分析失败")
        if _edit:
            _reply2 = _edit["reply"]
            try:
                _persist_assistant_message(did, _reply2)
            except Exception:
                logger.exception("[v2] 保存记忆修改回复失败 did=%s", did)
            from engine.finalize import five_round_hook
            five_round_hook(pid, did)
            token_queue.put(("done", {"final_reply": _reply2,
                                      "steps": _edit.get("steps") or [],
                                      "mindchain": [], "task_stats": {}}))
            return

        # 自动档设置推断（保留 v1 能力：modelAuto/auto）
        effective_model = req.model
        try:
            if raw_settings.get("modelAuto") or raw_settings.get("auto"):
                from main import _auto_settings
                tpl0 = raw_settings.get("template") or "思考"
                _auto = _auto_settings(req.api_key, req.message, tpl0,
                                       infer_model=bool(raw_settings.get("modelAuto")))
                if _auto:
                    raw_settings.update(_auto)
                    if _auto.get("model"):
                        effective_model = _auto["model"]
        except Exception:
            logger.exception("[v2] 自动设置推断失败，按原设置继续")

        # --- 会话上下文快照：画像缓存 + 历史预算块（复用主模块已验证的预取逻辑） ---
        template = raw_settings.get("template") or "思考"
        try:
            from main import _build_preloaded
            preloaded = _build_preloaded(pid, did, req.message)
        except Exception:
            logger.exception("[v2] 预取会话上下文失败")
            preloaded = {}
        from engine.assess import coerce_score
        profile_cache = preloaded.get("dialogue_profile_cache") or {}
        prev_score = coerce_score(profile_cache.get("level_score"))
        ctx_steps: list = []
        mindchain_entries: list = []

        def _trace(stage: str, input_digest="", output_digest="", **metrics):
            traces.append({
                "stage": stage,
                "input_digest": str(input_digest)[:400],
                "output_digest": str(output_digest)[:400],
                "metrics_json": json.dumps(metrics, ensure_ascii=False),
                "elapsed_ms": max(0, int((_time_mod.time() - t0) * 1000)),
            })
        history_block = preloaded.get("history") or {}

        # 特殊输入解析（消息内URL并行抓取并入文；无URL原样返回）
        try:
            from main import _parse_special_inputs
            working_message = _parse_special_inputs(req.message)
        except Exception:
            logger.exception("[v2] 特殊输入解析失败")
            working_message = req.message

        # --- S1 Plan ---
        from engine.planning import classify_intent, is_rule_simple
        token_queue.put(("step", "学习助手·规划"))
        if is_rule_simple(req.message):
            plan_thinking = ""
            plan = {"complexity": "simple_direct"}
        else:
            try:
                plan_thinking, plan = classify_intent(
                    _make_fast_llm(req), req.message, template)
            except Exception:
                logger.exception("[v2] 意图分类失败，回落 standard")
                plan_thinking, plan = "", {"complexity": "standard"}
        if plan_thinking.strip():
            mindchain_entries.append({"agent": "学习助手·规划",
                                      "content": plan_thinking.strip()[:800]})
        _trace("plan", input_digest=req.message[:200],
               output_digest=json.dumps({"complexity": plan["complexity"]}, ensure_ascii=False))
        ctx_steps.append({"agent": "学习助手·规划", "status": "done", "detail": "意图分类完成"})

        recent_digest = "\n".join(
            f"{m.get('role')}: {str(m.get('content'))[:120]}"
            for m in (history_block.get("recent") or [])[-4:])

        # --- S3 Assess 启动（与 S2 重叠执行；极速档跳过——架构注释中的幽灵节点就此转正） ---
        assess_exec = None
        assess_future = None
        if template != "极速":
            from concurrent.futures import ThreadPoolExecutor
            from engine.assess import assess_and_store
            token_queue.put(("step", "学情与记忆管理"))
            assess_exec = ThreadPoolExecutor(max_workers=1)
            assess_future = assess_exec.submit(
                assess_and_store, _make_fast_llm(req), did, req.message,
                recent_digest, prev_score)

        # --- S2 Retrieve（模式权威：思考/研究必检索，极速不检索；simple_direct 已在上方短路） ---
        search_results: list = []
        # 研究档强制两轮递归（模式契约"必开两轮"，设计稿S2/矩阵）；research_deep 分类同样两轮
        _rounds = 2 if (template == "研究" or plan["complexity"] == "research_deep") else 1
        _search_meta: dict = {}
        if plan["complexity"] != "simple_direct" and template != "极速":
            token_queue.put(("step", "知识库管理"))
            # 🛰 检索观察窗（1.5 复活）：SSE subagent 帧 + subagent_runs 档案双写。
            # 观测任何失败只降级日志，绝不打断主检索链路（与 v1 语义对齐）。
            try:
                from services.subagent_runs import (
                    create_run as _sa_create,
                    emit as _sa_record,
                    finish_run as _sa_finish,
                )
                _sa_rid = _sa_create(project_id=pid, dialogue_id=did, agent="知识库管理",
                                     title="🛰 检索观察窗", input_text=working_message[:300])

                def _sa_emit(type_: str, **payload):
                    try:
                        _sa_record(_sa_rid, type_, **payload)
                    except Exception:
                        pass
                    token_queue.put(("subagent", {"type": type_, "run_id": _sa_rid,
                                                  "agent": "知识库管理", **payload}))

                _sa_emit("start", title="🛰 检索观察窗")
                _sa_emit("input", content=working_message[:200])
                _sa_gate_ok = True
            except Exception:
                logger.exception("[v2] 检索观察窗建档失败（降级为无观测）")
                _sa_emit = None
                _sa_rid = None
                _sa_gate_ok = False
            try:
                from engine.retrieve import retrieve_stage
                _rr = retrieve_stage(_make_fast_llm(req), req.message, template, pid,
                                     rounds=_rounds,
                                     emit=_sa_emit if _sa_gate_ok else None)
                search_results = _rr["search_results"]
                _search_meta = _rr.get("search_meta") or {}
            except Exception:
                logger.exception("[v2] 检索阶段失败，降级无检索生成")
                _sa_gate_ok = False
            if _sa_gate_ok:
                _kept = len(search_results)
                _raw = _search_meta.get("raw_count", _kept)
                _summary = f"候选 {_raw} → 留存 {_kept}"
                _sa_finish(_sa_rid, status="ok", summary=_summary)
                token_queue.put(("subagent", {"type": "end", "run_id": _sa_rid,
                                              "agent": "知识库管理",
                                              "status": "ok", "summary": _summary}))
            else:
                if _sa_rid:
                    try:
                        _sa_finish(_sa_rid, status="error", summary="检索降级或观测中断")
                        token_queue.put(("subagent", {"type": "end", "run_id": _sa_rid,
                                                      "agent": "知识库管理", "status": "error",
                                                      "summary": "检索降级或观测中断"}))
                    except Exception:
                        pass
            ctx_steps.append({"agent": "知识库管理", "status": "done",
                              "detail": f"检索{len(search_results)}条"})
            _trace("retrieve", input_digest=req.message[:200],
                   output_digest=json.dumps(
                       {"kept": len(search_results),
                        "queries": (_search_meta.get("queries") or [])[:8],
                        "raw_count": _search_meta.get("raw_count", len(search_results)),
                        "rounds": _search_meta.get("rounds", 0)},
                       ensure_ascii=False))

        # --- S3 Assess 回收（与 S2 重叠执行完毕） ---
        assess_score = None
        assess_thinking = ""
        assess_evidence = ""
        if assess_future is not None:
            try:
                assess_score, assess_thinking_raw, assess_evidence = \
                    assess_future.result(timeout=15)
                assess_thinking = (assess_thinking_raw or "").strip()
            except Exception:
                logger.exception("[v2] 学情评估失败，回落规则地板")
            finally:
                assess_exec.shutdown(wait=False)
        if assess_thinking:
            mindchain_entries.append({"agent": "学情与记忆管理",
                                      "content": assess_thinking[:800]})
        ctx_steps.append({"agent": "学情与记忆管理", "status": "done",
                          "detail": ("水平评估完成" if assess_score is not None else "规则地板")})
        _trace("assess", input_digest=req.message[:200],
               output_digest=json.dumps(
                   {"level_score": assess_score, "evidence": (assess_evidence or "")[:120]},
                   ensure_ascii=False))

        # --- 输出策略：T 路由 → 指令注入 → 脚注观测（依据数值亮进思维链，缺口③可见性） ---
        from engine import output_strategy as _os
        t_val = _os.compute_t(profile_cache, assess_score)
        strategy_id = _os.route(template, t_val)
        strategy_text = _os.directive(strategy_id, t_val)
        _basis = (f"level={assess_score:.2f}" if assess_score is not None else "规则地板")
        token_queue.put(("token", "输出策略",
                         f"{_os.strategy_name(strategy_id)} T={t_val:.2f}（{_basis}）"))

        # --- S4 Generate × S5 ReviewGate（研究必开/思考可配/极速关） ---
        from engine.review import REVIEW_MAX_RETRY, pick_judge_llm, review_enabled, review_once
        gate_on = review_enabled(template, raw_settings)
        token_queue.put(("step", "学习助手·生成"))
        collected: list[str] = []

        def _on_content(piece):
            collected.append(piece)
            token_queue.put(("answer", piece))

        # 强模型思考流内实时可见（v1 对齐），同时累积供思维链持久化
        gen_reasoning: list[str] = []

        def _on_reasoning(piece):
            if piece:
                gen_reasoning.append(piece)
                token_queue.put(("token", "学习助手·生成", piece))

        llm_gen = _make_llm(req, model_override=effective_model)
        base_system = ("你是学习助手，禁止输出虚假信息。\n【输出策略指令】" + strategy_text)
        if template == "极速":
            # 极速字数约束（自旧引擎平移）：目标区间 + 硬上限
            base_system += (f"\n【输出要求】回答控制在 {FAST_WORD_MIN}-{FAST_WORD_MAX} 字以内"
                            f"（硬上限 {FAST_WORD_HARD} 字），直接给结论要点，不展开长篇。")
        elif template == "研究":
            base_system += (f"\n【输出要求】回答控制在 {RESEARCH_WORD_MIN}-{RESEARCH_WORD_MAX} 字"
                            f"（硬上限 {RESEARCH_WORD_HARD} 字），深入展开但保持结构清晰。")
        else:
            base_system += (f"\n【输出要求】回答控制在 {THINK_WORD_MIN}-{THINK_WORD_MAX} 字"
                            f"（硬上限 {THINK_WORD_HARD} 字）。")
        # 画像/历史上下文注入（v1 对齐）：用户背景、偏好、早期摘要、近期原文
        context_blocks = ""
        if profile_cache.get("用户背景"):
            context_blocks += f"【用户背景】{str(profile_cache['用户背景'])[:500]}\n"
        for k, label in [("偏好提问方式", "偏好提问方式"), ("偏好学习方式", "偏好学习方式"),
                         ("偏好_输出", "偏好输出形式")]:
            v = profile_cache.get(k)
            if v:
                text = "、".join(str(x) for x in v) if isinstance(v, list) else str(v)
                context_blocks += f"【{label}】{text[:200]}\n"
        if history_block.get("summary"):
            context_blocks += f"【早期对话摘要】{history_block['summary'][:800]}\n"
        recent = history_block.get("recent") or []
        if recent:
            context_blocks += "【近期对话】\n" + "\n".join(
                f"{m.get('role')}: {str(m.get('content'))[:200]}" for m in recent[-6:]) + "\n"
        user_content = context_blocks + working_message
        if search_results:
            user_content = ("【检索结果】\n" + json.dumps(search_results, ensure_ascii=False)
                            + "\n\n（优先基于以上检索结果回答；凡取自检索内容的论断，"
                            "须在句末标注来源，格式：[来源: 文档标题]；未覆盖部分用通识作答，"
                            "并注明为模型自有知识。）\n\n" + user_content)
        elif template != "极速" and plan["complexity"] != "simple_direct":
            # 诚实边界（主Agent文档定稿）：知识型问题检索零留存 → 第一句强制申明，通识标注自有
            user_content = ("⚠️ 本轮检索未获得相关内容。你的回答第一句话必须是："
                            "\"⚠️ 未在知识库中检索到相关内容\"；随后以模型通识作答，"
                            "并明确注明哪些内容属于模型自有知识、未经知识库验证。\n\n"
                            + user_content)
        user_msg = {"role": "user", "content": user_content}
        if req.image:
            user_msg = {"role": "user", "content": [
                {"type": "text", "text": working_message},
                {"type": "image_url",
                 "image_url": {"url": "data:image/png;base64," + (req.image or "")}},
            ]}

        attempt_reasons = ""
        attempt = 0
        reviewed_info = None
        while True:
            sys_extra = (f"\n【审核反馈·上一稿未通过】{attempt_reasons}。请据此修正后重新完整输出。"
                         if attempt else "")
            collected.clear()
            llm_gen.chat_stream(
                [{"role": "system", "content": base_system + sys_extra}, user_msg],
                (lambda _c: None),          # 通用通道不消费
                on_reasoning=_on_reasoning,  # 思考 token → thought 帧（流内可见+持久化采集）
                on_content=_on_content,      # 回答 token → answer 帧
                cancel_event=cancel_evt,
            )
            reply = "".join(collected)
            if cancel_evt.is_set():
                break
            if not gate_on:
                break
            verdict = review_once(pick_judge_llm(template, req), reply,
                                  json.dumps(search_results[:3], ensure_ascii=False),
                                  strategy_text)
            # reviewed 形状对齐前端 ReviewResult {passed,score,suggestion}
            reviewed_info = {"passed": verdict["passed"], "score": verdict["score"],
                             "suggestion": verdict["reasons"][:200]}
            if verdict["passed"]:
                break
            token_queue.put(("token", "审核",
                             f"未通过({verdict['reasons'][:60]})，重新生成…"))
            attempt += 1
            if attempt > REVIEW_MAX_RETRY:
                reviewed_info["note"] = "达重试上限，保留当前稿并附审核意见"
                break
            attempt_reasons = verdict["reasons"]

        if cancel_evt.is_set():
            # 手动停止：空reply done 让泵退出（现状语义），不落库
            token_queue.put(("done", {"final_reply": "", "steps": [], "mindchain": [], "task_stats": {}}))
            return

        gen_reasoning_text = "".join(gen_reasoning).strip()
        if gen_reasoning_text:
            mindchain_entries.append({"agent": "学习助手·生成",
                                      "content": gen_reasoning_text[:1500]})
        _trace("generate", input_digest=working_message[:200],
               output_digest=json.dumps({"reply_len": len(reply), "attempts": attempt + 1},
                                        ensure_ascii=False),
               t_value=round(t_val, 4), strategy_id=strategy_id,
               strategy_name=_os.strategy_name(strategy_id))
        ctx_steps.append({"agent": "学习助手·生成", "status": "done", "detail": "生成输出"})
        if reviewed_info:
            ctx_steps.append({"agent": "审核",
                              "status": "done",
                              "detail": ("审核通过" if reviewed_info["passed"]
                                         else "未通过：" + reviewed_info["suggestion"])})
        _trace("review", output_digest=json.dumps(
            {"passed": reviewed_info["passed"] if reviewed_info else None,
             "score": reviewed_info["score"] if reviewed_info else None},
            ensure_ascii=False))
        special_suggestions = []
        if plan["complexity"] != "simple_direct":
            try:
                from services.special_forms import suggest_special_forms
                special_suggestions = suggest_special_forms(req.api_key, reply, req.base_url)
            except Exception:
                logger.exception("[v2] 特殊形式建议失败")

        # --- Trace 批量落库（旁路，失败不影响主流程） ---
        try:
            from core.db.eval_repo import get_eval_repo
            get_eval_repo().insert_traces(request_id, did, pid, template, traces)
        except Exception:
            logger.exception("[v2] Trace 落库失败（不影响主流程）")

        result = {
            "final_reply": reply,
            "steps": ctx_steps,
            "mindchain": merge_consecutive(mindchain_entries),
            "task_stats": {},
            "complexity": plan["complexity"],
            **({"reviewed": reviewed_info} if reviewed_info else {}),
        }
        token_queue.put(("done", result))

        from core.background import submit
        from engine.finalize import finalize_side_effects, schedule_post_turn
        submit(finalize_side_effects, req, pid, did, result, t0)
        schedule_post_turn(req, pid, did, result)
    except Exception as e:
        # 失败轮次也要可回放（评估体系L4"每轮可回放"承诺）：尽力冲刷已积累Trace+error条目
        try:
            traces.append({"stage": "error",
                           "input_digest": "",
                           "output_digest": str(e)[:400],
                           "metrics_json": "{}",
                           "elapsed_ms": max(0, int((_time_mod.time() - t0) * 1000))})
            from core.db.eval_repo import get_eval_repo
            get_eval_repo().insert_traces(request_id, did, pid,
                                          (raw_settings or {}).get("template") or "", traces)
        except Exception:
            logger.exception("[v2] error 路径 Trace 冲刷失败")
        token_queue.put(("error", str(e)))
    finally:
        from engine.cancel import ACTIVE_CANCELS
        ACTIVE_CANCELS.pop(request_id, None)


async def stream_response(req):
    """v2 引擎入口：返回与 v1 同构的 StreamingResponse。"""
    async def stream():
        import asyncio as _asyncio
        request_id = __import__("uuid").uuid4().hex[:16]
        cancel_evt = threading.Event()
        from engine.cancel import ACTIVE_CANCELS
        ACTIVE_CANCELS[request_id] = cancel_evt

        token_queue: queue.Queue = queue.Queue()
        threading.Thread(target=_v2_worker,
                         args=(req, token_queue, cancel_evt, request_id),
                         daemon=True).start()
        yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
        while True:
            try:
                msg = token_queue.get(timeout=0.05)
            except queue.Empty:
                await _asyncio.sleep(0.05)
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                continue
            text, stop = _frame(msg)
            if text:
                yield text
            if stop:
                break
    return StreamingResponse(stream(), media_type="text/event-stream")


# --- 帧泵映射（与 main._queue_msg_to_sse 同构；切换期后统一收编到 engine） ---

def _frame(msg) -> tuple[str, bool]:
    kind = msg[0]
    if kind == "step":
        return f"data: {json.dumps({'type': 'step', 'agent': msg[1]})}\n\n", False
    if kind == "token":
        _, agent, chunk = msg
        return f"data: {json.dumps({'type': 'thought_token', 'agent': agent, 'chunk': chunk})}\n\n", False
    if kind == "answer":
        return f"data: {json.dumps({'type': 'answer_token', 'chunk': msg[1]})}\n\n", False
    if kind == "subagent":
        _sp = dict(msg[1] or {})
        _sp["event"] = _sp.pop("type", "")
        return f"data: {json.dumps({'type': 'subagent', **_sp})}\n\n", False
    if kind == "done":
        result = msg[1]
        retrieved_images = []
        for _k in (result.get("knowledge") or []):
            if isinstance(_k, dict) and _k.get("kind") == "image":
                _meta = _k.get("metadata") or {}
                retrieved_images.append({
                    "source": _meta.get("source", ""),
                    "content": (_k.get("content") or "")[:240],
                    "file_path": _meta.get("file_path", ""),
                    "mime": _meta.get("mime", ""),
                })
        frame = {
            "type": "done", "reply": result.get("final_reply", "处理完成"),
            "steps": result.get("steps", []), "mindchain": result.get("mindchain", []),
            "task_stats": result.get("task_stats", {}),
            "special_suggestions": result.get("special_suggestions", []),
            "retrieved_images": retrieved_images, "review": result.get("reviewed"),
        }
        return f"data: {json.dumps(frame)}\n\n", True
    if kind == "error":
        return f"data: {json.dumps({'type': 'error', 'message': msg[1]})}\n\n", True
    return "", False
