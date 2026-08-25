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


def engine_mode() -> str:
    """引擎选择开关：环境变量 CHAT_ENGINE=v2 启用新引擎，默认 v1。"""
    import os
    return os.environ.get("CHAT_ENGINE", "v1")


# --- 模型接缝（测试在此打补丁注入 FakeLLM） ---

def _make_llm(req):
    from core.base_llm import DeepSeekLLM
    from core.config import config as _cfg
    return DeepSeekLLM(
        api_key=req.api_key or _cfg.DEEPSEEK_API_KEY,
        model=req.model or DEFAULT_MODEL,
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
        pid = req.project_id or "default"
        did = req.dialogue_id or "default"
        try:
            _persist_user_message(req, pid, did)
        except Exception:
            logger.exception("[v2] 保存用户消息失败 did=%s", did)

        # --- 模板与画像快照（S3 Assess 预备） ---
        template = (req.settings or {}).get("template") or "思考"
        from engine.assess import coerce_score, load_profile_cache
        profile_cache = load_profile_cache(did)
        prev_score = coerce_score(profile_cache.get("level_score"))

        # --- S1 Plan ---
        from engine.planning import classify_intent, is_rule_simple
        token_queue.put(("step", "学习助手·规划"))
        if is_rule_simple(req.message):
            plan = {"complexity": "simple_direct", "need_kb": False}
        else:
            try:
                plan = classify_intent(_make_fast_llm(req), req.message, template)
            except Exception:
                logger.exception("[v2] 意图分类失败，回落 standard")
                plan = {"complexity": "standard", "need_kb": template != "极速"}
        if plan["complexity"] == "research_deep":
            plan["need_kb"] = True

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
                "", prev_score)

        # --- S2 Retrieve（模式权威：思考/研究必检索，极速不检索；simple_direct 已在上方短路） ---
        search_results: list = []
        if plan["complexity"] != "simple_direct" and template != "极速":
            token_queue.put(("step", "知识库管理"))
            try:
                from engine.retrieve import retrieve_stage
                _rr = retrieve_stage(_make_fast_llm(req), req.message, template, pid)
                search_results = _rr["search_results"]
            except Exception:
                logger.exception("[v2] 检索阶段失败，降级无检索生成")

        # --- S3 Assess 回收（与 S2 重叠执行完毕） ---
        assess_score = None
        if assess_future is not None:
            try:
                assess_score = assess_future.result(timeout=15)
            except Exception:
                logger.exception("[v2] 学情评估失败，回落规则地板")
            finally:
                assess_exec.shutdown(wait=False)

        # --- 输出策略：T 路由 → 指令注入 → 脚注观测 ---
        from engine import output_strategy as _os
        t_val = _os.compute_t(profile_cache, assess_score)
        strategy_id = _os.route(template, t_val)
        strategy_text = _os.directive(strategy_id, t_val)
        token_queue.put(("token", "输出策略",
                         f"{_os.strategy_name(strategy_id)} T={t_val:.2f}"))

        # --- S4 Generate 直连 ---
        token_queue.put(("step", "学习助手·生成"))
        collected: list[str] = []

        def _on_content(piece):
            collected.append(piece)
            token_queue.put(("answer", piece))

        llm = _make_llm(req)
        system_prompt = ("你是学习助手，禁止输出虚假信息。\n【输出策略指令】" + strategy_text)
        user_content = req.message
        if search_results:
            user_content = ("【检索结果】\n" + json.dumps(search_results, ensure_ascii=False)
                            + "\n\n（优先基于以上检索结果回答；未覆盖部分用通识并注明。）\n\n"
                            + user_content)
        user_msg = {"role": "user", "content": user_content}
        if req.image:
            user_msg = {"role": "user", "content": [
                {"type": "text", "text": req.message},
                {"type": "image_url",
                 "image_url": {"url": "data:image/png;base64," + (req.image or "")}},
            ]}
        llm.chat_stream(
            [{"role": "system", "content": system_prompt}, user_msg],
            (lambda _c: None),          # 通用通道不消费（无思维链阶段）
            on_content=_on_content,     # 回答 token → answer 帧
            cancel_event=cancel_evt,
        )
        reply = "".join(collected)

        if cancel_evt.is_set():
            # 手动停止：空reply done 让泵退出（现状语义），不落库
            token_queue.put(("done", {"final_reply": "", "steps": [], "mindchain": [], "task_stats": {}}))
            return

        result = {
            "final_reply": reply,
            "steps": [{"agent": "学习助手·生成", "status": "done", "detail": "直接生成"}],
            "mindchain": [],
            "task_stats": {},
            "complexity": "simple",
        }
        token_queue.put(("done", result))
        try:
            _persist_assistant_message(did, reply)
        except Exception:
            logger.exception("[v2] 保存 AI 回复失败 did=%s", did)
    except Exception as e:
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
