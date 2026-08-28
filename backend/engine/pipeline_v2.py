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
import time

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


async def _stream_resource_edit(req):
    """闭环六：资源编辑会话独立分支（D-新5：结构性隔离，不进主管线五阶段）。
    全文重生成语义（拍板①）：注入资源全文+修改指令 → 主模型流式输出修订后全文 →
    done 时落 assistant 消息并写回 resources 新行（append 语义=天然版本历史）。
    会话隔离（拍板②）：dialogues.kind='resource'，不进对话列表/无学情/无画像/无记忆。
    非实时（拍板③）：流式仅进对话流，预览由前端 done 后刷新。"""
    import asyncio as _asyncio
    from core.postgres_client import pg_client

    async def stream():
        request_id = __import__("uuid").uuid4().hex[:16]
        rid = (req.edit_resource_id or "").strip()
        yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
        try:
            rows = pg_client.execute(
                "SELECT id, name, content, project_id, type FROM resources WHERE id=%s", (rid,))
            if not rows:
                yield f"data: {json.dumps({'type': 'error', 'message': '资源不存在或已删除'})}\n\n"
                return
            res = rows[0]
            pid = req.project_id or res["project_id"] or "default"
            did = req.dialogue_id or ("red-" + request_id)

            # 幂等建行（kind='resource' 隔离标记；重开窗口续聊同一 dialogue）
            exist = pg_client.execute("SELECT id FROM dialogues WHERE id=%s", (did,))
            if not exist:
                pg_client.execute(
                    "INSERT INTO dialogues(id,project_id,session_id,name,kind) VALUES(%s,%s,%s,%s,'resource')",
                    (did, pid, req.session_id or "default", "编辑·" + (res["name"] or "资源")))

            # 上下文①：加载最新版本（历轮修改写回的是同名同 type 新行，按 id 读到的永远是
            # 原始行——本轮编辑必须基于最新版，否则 AI"看不见"上轮修改，表现即答非所问）
            latest = pg_client.execute(
                "SELECT content FROM resources WHERE project_id=%s AND name=%s AND type=%s "
                "ORDER BY rowid DESC LIMIT 1",
                (res["project_id"], res["name"], res["type"]))
            full = str((latest[0] if latest else res)["content"] or "")

            # 上下文②：对话历史（当前消息落库前取，天然不含本轮；末 6 轮逐条 cap 1500）
            history = list(reversed(pg_client.execute(
                "SELECT role, content FROM messages WHERE dialogue_id=%s ORDER BY rowid DESC LIMIT 6",
                (did,)) or []))

            user_text = (req.message or "").strip() or "请修订这份资料"
            pg_client.execute(
                "INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",
                (did, "user", user_text))

            if len(full) > 12000:
                full = full[:12000] + "\n\n（原文超长，以上为截断版——修订时保持既有结构）"
            system = (
                "你是「资源修订助手」。用户给你一份 markdown 资料和修改要求，你直接执行修订。\n"
                "两种工作模式：\n"
                "A. 修改类请求（改写/精简/扩写/换风格…）→ 直接输出修订后的完整 markdown 全文，"
                "第一个字就是正文标题，禁止输出「我们/我会/好的」等任何过程性文字。"
                "你的输出会被系统自动保存为新版本。\n"
                "B. 提问/讨论类请求（这是什么/建议怎么改）→ 第一行以 💬 开头，简短回答即可。\n"
                "示例——\n"
                "用户：把第一段改短\n"
                "助手：# 标题\n\n（直接给改后的全文，没有任何说明文字）\n"
                "用户：这份资料讲了什么？\n"
                "助手：💬 这份资料讲了…\n"
                "修改是累积的：对话记录为历轮修订，本轮基于其中最新版本继续。"
            )
            user_prompt = (
                f"【修改要求】\n{user_text}\n\n"
                f"【当前资源全文（在此版本上修订）】\n{full}\n\n"
                "【你的输出】按规则 A 或 B 直接作答，现在开始："
            )

            # 组装消息序列：system + 历史轮次 + 本轮（助手历史条目截断，防历轮全文撑爆上下文）
            msgs = [{"role": "system", "content": system}]
            for m in history:
                role = "user" if m["role"] == "user" else "assistant"
                msgs.append({"role": role, "content": str(m["content"] or "")[:1500]})
            msgs.append({"role": "user", "content": user_prompt})

            # 真流式 + flush 节流（照 opencode/主流产品批量 flush 思想）：逐字符帧会把 SSE
            # 打成字符级 HTTP 帧雨（帧开销 50+ 字节运 1 字节货）+ 前端逐帧 setState 重渲染风暴。
            # worker 攒 buf，≥24 字符或 ≥80ms 才投递一帧——帧量降一个数量级，观感仍是逐句流出。
            # 仍走 on_content 通道（纯正文）——thinking 默认开启，on_token 会混入
            # reasoning_content 思考流（"我们需要理解用户请求…"），把草稿当答案直播即此前症状。
            token_queue: queue.Queue = queue.Queue()
            collected: list = []
            FLUSH_CHARS, FLUSH_SECS = 24, 0.08

            def _worker():
                try:
                    llm = _make_llm(req)
                    buf: list = []
                    last_flush = time.monotonic()

                    def _on_content(ch: str):
                        nonlocal last_flush
                        collected.append(ch)
                        buf.append(ch)
                        now = time.monotonic()
                        if len(buf) >= FLUSH_CHARS or (now - last_flush) >= FLUSH_SECS:
                            token_queue.put(("answer", "".join(buf)))
                            buf.clear()
                            last_flush = now

                    llm.chat_stream(
                        msgs,
                        lambda _ch: None,                      # 思考流丢弃（主对话进思维链，本分支无思维链面板）
                        on_content=_on_content)
                    if buf:                                    # 尾flush：余量必须出清
                        token_queue.put(("answer", "".join(buf)))
                        buf.clear()
                    reply = "".join(collected).strip()
                    if reply and not reply.startswith("💬"):
                        _persist_assistant_message(did, reply)
                        # 写回新行（append 语义=新版本；同名同 type，列表按时间排序即版本序列）
                        pg_client.execute(
                            "INSERT INTO resources(id, name, content, project_id, type) VALUES (%s,%s,%s,%s,%s)",
                            (__import__("hashlib").md5((str(res["name"]) + str(request_id)).encode()).hexdigest()[:16],
                             res["name"], reply, res["project_id"], "gen:" + str(res["type"] or "").removeprefix("gen:")))
                    elif reply:
                        _persist_assistant_message(did, reply)   # 💬 问答轮：只留消息，不产版本
                    token_queue.put(("done", reply))
                except Exception as e:
                    logger.exception("[v2] 资源编辑分支失败 rid=%s", rid)
                    token_queue.put(("error", str(e)[:200]))

            threading.Thread(target=_worker, daemon=True).start()

            while True:
                try:
                    kind, payload = token_queue.get(timeout=0.05)
                except queue.Empty:
                    await _asyncio.sleep(0.05)
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    continue
                if kind == "answer":
                    yield f"data: {json.dumps({'type': 'answer_token', 'chunk': payload})}\n\n"
                elif kind == "done":
                    yield f"data: {json.dumps({'type': 'done', 'reply': payload, 'resource_id': rid, 'dialogue_id': did})}\n\n"
                    break
                else:  # error
                    yield f"data: {json.dumps({'type': 'error', 'message': payload})}\n\n"
                    break
        finally:
            from engine.cancel import ACTIVE_CANCELS
            ACTIVE_CANCELS.pop(request_id, None)
    return StreamingResponse(stream(), media_type="text/event-stream")


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
                                      "content": plan_thinking.strip()})
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
        # 研究档进 B2-lite 分解链（契约替代 D-新1：旧"强制两轮 angle 递归"已退役，见 retrieve.py）；
        # rounds≥2 即研究链，research_deep 分类同享
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
                        logger.debug("观察窗档案写入失败（SSE 通道不受扰）", exc_info=True)
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
                        logger.debug("error 路径观察窗收尾失败", exc_info=True)
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
                                      "content": assess_thinking})
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
        from engine.review import (REVIEW_MAX_RETRY, pick_judge_llm, review_claims,
                                   review_enabled, review_once)
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
            # A1 父子块：兄弟聚合出的章节全文单独成块（引用粒度仍指子块）
            sections = []
            seen_sec: set = set()
            for r in search_results:
                pc = (r or {}).get("parent_context") or {}
                p = pc.get("path")
                if p and p not in seen_sec and pc.get("text"):
                    seen_sec.add(p)
                    sections.append((p, pc["text"]))
                if len(sections) >= 2:
                    break
            blocks = "【检索结果】\n" + json.dumps(search_results, ensure_ascii=False) \
                     + "\n\n（优先基于以上检索结果回答；凡取自检索内容的论断，" \
                       "须在句末标注来源，格式：[来源: 文档标题]；未覆盖部分用通识作答，" \
                       "并注明为模型自有知识。）"
            if sections:
                sec_text = "\n\n".join(f"◇ {p}\n{t}" for p, t in sections)
                blocks += "\n\n【相关章节全文】\n" + sec_text \
                          + "\n（上列为命中片段所在章节的完整上下文，供你通读定位，不必逐条引用。）"
            user_content = blocks + "\n\n" + user_content
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
            # 研究档走断言级忠实度审核（参照系=全量留存块，非 top3）；
            # 思考档保持整体两维度评审（review_once 原样）
            verdict = (review_claims if template == "研究" else review_once)(
                pick_judge_llm(template, req), reply,
                search_results if template == "研究"
                else json.dumps(search_results[:3], ensure_ascii=False),
                strategy_text)
            # reviewed 形状对齐前端 ReviewResult {passed,score,suggestion}；
            # 研究档附加 issues（unsupported 断言映射，前端既有样式直接渲染）、
            # claims 全表（幻觉率统计源）、skipped（fail-open 可见性）
            reviewed_info = {"passed": verdict["passed"], "score": verdict["score"],
                             "suggestion": verdict["reasons"][:200]}
            if template == "研究":
                reviewed_info.update(issues=verdict.get("issues") or [],
                                     claims=verdict.get("claims") or [],
                                     skipped=bool(verdict.get("skipped")))
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
                                      "content": gen_reasoning_text})
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
        _review_digest = {"passed": reviewed_info["passed"] if reviewed_info else None,
                          "score": reviewed_info["score"] if reviewed_info else None}
        if template == "研究" and reviewed_info:
            _by_diag = {"hallucination": 0, "retrieval_gap": 0, "no_evidence": 0}
            for _c in reviewed_info["claims"]:
                if _c.get("diag") in _by_diag:
                    _by_diag[_c["diag"]] += 1
            _review_digest.update(claims_total=len(reviewed_info["claims"]),
                                  unsupported=len(reviewed_info["issues"]),
                                  by_diag=_by_diag, skipped=reviewed_info["skipped"])
        _trace("review", output_digest=json.dumps(_review_digest, ensure_ascii=False))
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


async def _stream_resource_gen(req):
    """闭环七：资源生成管线分支——主管线阶段的研究档变体。
    plan(无LLM,校验能力key) → fan-out(学情∥检索,rounds=2 走B2-lite) → KB蒸馏(5-10条)
    → CAPABILITIES技能生成(合成content注入materials) → review_claims断言审核(重试≤2)
    → resources落库(difficulty自标,失败NULL不阻断) → eval_traces全阶段(旁路)。
    会话 kind='resource' 隔离（重开可续聊，后续轮带 edit_resource_id 自动转编辑分支）。
    SSE 全帧（step/thought/answer/done）；前端生成页 v1 仅消费 answer/done，其余帧忽略。
    done 携 resource_id/name/difficulty/review。技能生成为同步调用，正文在审核定稿后
    分批注入 answer 帧（伪流式——真流式列资源生成赛后优化）。"""
    import asyncio as _asyncio
    import hashlib as _hashlib
    import re as _re
    from concurrent.futures import ThreadPoolExecutor
    from core.postgres_client import pg_client

    async def stream():
        request_id = __import__("uuid").uuid4().hex[:16]
        did = (req.dialogue_id or "").strip() or ("gen-" + request_id)
        yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
        token_queue: queue.Queue = queue.Queue()
        try:
            pid = req.project_id or "default"
            key = (req.gen_resource or "").strip()
            user_text = (req.message or "").strip() or "请生成本领域学习资源"
            # 能力 key 前置校验：非法请求零写库软着陆
            from services.resource_gen import CAPABILITIES
            if key not in CAPABILITIES:
                yield f"data: {json.dumps({'type': 'error', 'message': '未知能力: ' + key})}\n\n"
                return
            # 会话：kind='resource' 隔离（不进对话列表/学情管线）
            exist = pg_client.execute("SELECT id FROM dialogues WHERE id=%s", (did,))
            if not exist:
                pg_client.execute(
                    "INSERT INTO dialogues(id,project_id,session_id,name,kind) "
                    "VALUES(%s,%s,%s,%s,'resource')",
                    (did, pid, req.session_id or "default", "生成·" + user_text[:12]))
            pg_client.execute(
                "INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",
                (did, "user", user_text))

            traces: list[dict] = []
            t0 = time.time()

            def _trace(stage, input_digest="", output_digest="", **metrics):
                traces.append({"stage": stage,
                               "input_digest": str(input_digest)[:400],
                               "output_digest": str(output_digest)[:400],
                               "metrics_json": json.dumps(metrics, ensure_ascii=False),
                               "elapsed_ms": max(0, int((time.time() - t0) * 1000))})

            def _worker():
                try:
                    from services.resource_gen import generate_resource
                    from engine.review import (REVIEW_MAX_RETRY, pick_judge_llm,
                                               review_claims)
                    from engine import output_strategy as _os

                    # S1 plan：分支本身即意图决策——仅校验与留痕，不花 LLM
                    cap = CAPABILITIES.get(key)
                    token_queue.put(("step", "学习助手·规划"))
                    _trace("plan", input_digest=user_text[:200],
                           output_digest=json.dumps({"capability": key, "label": cap["label"]},
                                                    ensure_ascii=False))

                    # S2×S3 fan-out：学情 ∥ 检索（研究档级，rounds=2 走 B2-lite 分解链）
                    token_queue.put(("step", "学情与记忆管理"))
                    token_queue.put(("step", "知识库管理"))

                    def _do_assess():
                        from engine.assess import assess_and_store
                        return assess_and_store(_make_fast_llm(req), did, user_text, "", None)

                    def _do_retrieve():
                        from engine.retrieve import retrieve_stage
                        return retrieve_stage(_make_fast_llm(req), user_text, "研究", pid, rounds=2)

                    assess_score, assess_evidence = None, ""
                    search_results: list = []
                    with ThreadPoolExecutor(max_workers=2) as ex:
                        fa = ex.submit(_do_assess)
                        fr = ex.submit(_do_retrieve)
                        try:
                            assess_score, _t, assess_evidence = fa.result(timeout=60)
                        except Exception:
                            logger.exception("[gen] 学情评估失败，回落规则地板")
                        try:
                            search_results = (fr.result(timeout=120) or {}).get("search_results") or []
                        except Exception:
                            logger.exception("[gen] 检索失败，降级无检索生成")
                    _trace("assess", input_digest=user_text[:200],
                           output_digest=json.dumps(
                               {"level_score": assess_score,
                                "evidence": (assess_evidence or "")[:120]},
                               ensure_ascii=False))
                    _trace("retrieve", input_digest=user_text[:200],
                           output_digest=json.dumps({"kept": len(search_results)},
                                                    ensure_ascii=False))

                    # KB 蒸馏：按需求提炼 5-10 条要点（技能侧 content 截 4000，防需求/画像被挤掉）
                    kb_points = ""
                    if search_results:
                        try:
                            chunks_text = "\n".join(
                                f"[{i + 1}] {str((c or {}).get('title') or '')}："
                                f"{str((c or {}).get('content') or '')[:300]}"
                                for i, c in enumerate(search_results[:12]))
                            d_raw = _make_fast_llm(req).chat(
                                [{"role": "user", "content":
                                    "从以下检索块中，围绕【用户需求】提炼最重要的信息要点：合并相似项，"
                                    "输出 5-10 条，每条一行以 - 开头，只保留与需求相关且检索块可支撑的内容。\n"
                                    f"【用户需求】{user_text[:500]}\n【检索块】\n{chunks_text}"}],
                                temperature=0.2)
                            kb_points = (d_raw or "").strip()[:3000]
                        except Exception:
                            logger.exception("[gen] 知识库蒸馏失败，降级拼接原始要点为空")
                            kb_points = ""
                    token_queue.put(("token", "知识库管理",
                                     f"检索留存 {len(search_results)} 条"
                                     + ("，已蒸馏要点" if kb_points else "")))

                    # 生成 content 合成（需求 + 画像学情 + KB 要点 + 难度自标注释要求）
                    profile_line = (f"学习者当前水平评分 {assess_score:.2f}（0-1），资源难度应贴合该水平。"
                                    if assess_score is not None
                                    else "学习者水平未知，按入门到进阶之间组织。")
                    evidence_line = f"学情证据：{str(assess_evidence)[:150]}。" if assess_evidence else ""
                    kb_line = (f"【知识库要点】\n{kb_points}" if kb_points
                               else "【知识库要点】（未命中——用通识生成，正文注明哪些内容未经知识库验证）")
                    gen_content = (
                        f"【用户需求】\n{user_text}\n\n"
                        f"【画像学情】{profile_line}{evidence_line}\n"
                        f"{kb_line}\n\n"
                        "【附加要求】正文最后一行单独输出注释 <!--difficulty:0.85--> 格式"
                        "（0-1 小数，估计本资源面向的学习者水平，应与画像学情贴合）。")

                    # 生成 × 断言审核重试环（fail-open 内置于 review_claims）
                    token_queue.put(("step", "学习助手·生成"))
                    attempt = 0
                    content, difficulty = "", None
                    review_payload: dict = {}
                    while True:
                        r = generate_resource(req.api_key or "", key, gen_content,
                                              req.base_url, req.model)
                        if r.get("status") != "ok":
                            token_queue.put(("error", r.get("msg") or "生成失败"))
                            return
                        content = r.get("content") or ""
                        m = _re.search(r"<!--\s*difficulty:\s*([0-9.]+)\s*-->", content)
                        if m:
                            try:
                                difficulty = max(0.0, min(1.0, float(m.group(1))))
                            except ValueError:
                                difficulty = None
                            content = _re.sub(r"\s*<!--\s*difficulty:\s*[0-9.]+\s*-->\s*",
                                              "", content).rstrip()
                        _trace("generate", input_digest=gen_content[:200],
                               output_digest=json.dumps(
                                   {"content_len": len(content), "attempt": attempt + 1,
                                    "difficulty": difficulty}, ensure_ascii=False))
                        t_val = _os.compute_t({}, assess_score)
                        strategy_text = _os.directive(_os.route("研究", t_val), t_val)
                        verdict = review_claims(pick_judge_llm("研究", req), content,
                                                search_results, strategy_text)
                        review_payload = {"passed": verdict["passed"], "score": verdict["score"],
                                          "issues": verdict.get("issues") or [],
                                          "claims": verdict.get("claims") or [],
                                          "skipped": bool(verdict.get("skipped"))}
                        _trace("review", output_digest=json.dumps(
                            {"passed": verdict["passed"], "score": verdict["score"],
                             "claims_total": len(review_payload["claims"]),
                             "unsupported": len(review_payload["issues"]),
                             "skipped": review_payload["skipped"]}, ensure_ascii=False))
                        if verdict["passed"] or attempt >= REVIEW_MAX_RETRY:
                            if not verdict["passed"]:
                                review_payload["note"] = "达重试上限，保留当前稿并附审核意见"
                            break
                        token_queue.put(("token", "审核",
                                         f"未通过({verdict['reasons'][:60]})，重新生成…"))
                        attempt += 1
                        gen_content += (f"\n\n【审核反馈·上一稿未通过】{verdict['reasons'][:400]}。"
                                        "请据此修正后按全部要求重新输出。")

                    # 落库：append 语义=版本历史；difficulty 自标值随行（NULL=未自标）
                    name = (user_text.splitlines()[0] if user_text else "").strip()[:24] \
                        or (cap["label"] + "资源")
                    rid = _hashlib.md5((name + pid + request_id).encode()).hexdigest()[:16]
                    pg_client.execute(
                        "INSERT INTO resources(id,name,content,project_id,type,difficulty) "
                        "VALUES (%s,%s,%s,%s,%s,%s)",
                        (rid, name, content, pid, "gen:" + key, difficulty))
                    _trace("resource_gen", output_digest=json.dumps(
                        {"key": key, "resource_id": rid, "name": name, "difficulty": difficulty},
                        ensure_ascii=False))
                    _persist_assistant_message(did, content)
                    # 伪流式：正文分批注入 answer 帧（真流式=赛后优化项）
                    for i in range(0, len(content), 48):
                        token_queue.put(("answer", content[i:i + 48]))
                    token_queue.put(("done", {"reply": content, "resource_id": rid,
                                              "name": name, "difficulty": difficulty,
                                              "review": review_payload}))
                except Exception as e:
                    logger.exception("[gen] 资源生成分支失败")
                    try:
                        _trace("error", output_digest=str(e)[:400])
                        from core.db.eval_repo import get_eval_repo
                        get_eval_repo().insert_traces(request_id, did, pid, "研究", traces)
                    except Exception:
                        logger.exception("[gen] error 路径 Trace 冲刷失败")
                    token_queue.put(("error", str(e)[:200]))

            threading.Thread(target=_worker, daemon=True).start()

            # SSE 泵（照闭环六：0.05s 轮询 + heartbeat）
            while True:
                try:
                    msg = token_queue.get(timeout=0.05)
                except queue.Empty:
                    await _asyncio.sleep(0.05)
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    continue
                kind = msg[0]
                if kind == "step":
                    yield f"data: {json.dumps({'type': 'step', 'agent': msg[1]})}\n\n"
                elif kind == "token":
                    yield f"data: {json.dumps({'type': 'thought_token', 'agent': msg[1], 'chunk': msg[2]})}\n\n"
                elif kind == "answer":
                    yield f"data: {json.dumps({'type': 'answer_token', 'chunk': msg[1]})}\n\n"
                elif kind == "done":
                    yield f"data: {json.dumps({'type': 'done', **msg[1]}, ensure_ascii=False)}\n\n"
                    break
                else:  # error
                    yield f"data: {json.dumps({'type': 'error', 'message': msg[1]})}\n\n"
                    break
        finally:
            from engine.cancel import ACTIVE_CANCELS
            ACTIVE_CANCELS.pop(request_id, None)
    return StreamingResponse(stream(), media_type="text/event-stream")


async def stream_response(req):
    """v2 引擎入口：返回与 v1 同构的 StreamingResponse。
    闭环七：gen_resource 在场 → 资源生成管线分支；闭环六：edit_resource_id 在场
    → 资源编辑独立分支（结构性隔离，不进主管线）。两者同在时编辑优先。"""
    if getattr(req, "gen_resource", None):
        return await _stream_resource_gen(req)
    if getattr(req, "edit_resource_id", None):
        return await _stream_resource_edit(req)

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
