# -*- coding: utf-8 -*-
"""资源会话分支（架构整理：机械搬移自 engine/pipeline_v2.py，零逻辑改动）：
- stream_resource_edit：闭环六——资源编辑会话（全文重生成，kind='resource' 隔离）
- stream_resource_gen：闭环七——资源生成管线（学情∥检索 fan-out + KB 蒸馏 + 断言审核 + difficulty 自标）
接缝约定：_make_llm / _make_fast_llm / _persist_assistant_message 经 _pv.<name> 属性查找调用——
monkeypatch engine.pipeline_v2.<name> 仍然生效，测试接缝零破坏。"""
import json
import logging
import queue
import threading
import time

from fastapi.responses import StreamingResponse

logger = logging.getLogger("engine.resource_branches")


async def stream_resource_edit(req):
    """闭环六：资源编辑会话独立分支（D-新5：结构性隔离，不进主管线五阶段）。
    全文重生成语义（拍板①）：注入资源全文+修改指令 → 主模型流式输出修订后全文 →
    done 时落 assistant 消息并写回 resources 新行（append 语义=天然版本历史）。
    会话隔离（拍板②）：dialogues.kind='resource'，不进对话列表/无学情/无画像/无记忆。
    非实时（拍板③）：流式仅进对话流，预览由前端 done 后刷新。"""
    from engine import pipeline_v2 as _pv   # 接缝经属性查找：monkeypatch pipeline_v2.<name> 仍生效
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
                    llm = _pv._make_llm(req)
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
                        _pv._persist_assistant_message(did, reply)
                        # 写回新行（append 语义=新版本；同名同 type，列表按时间排序即版本序列）
                        pg_client.execute(
                            "INSERT INTO resources(id, name, content, project_id, type) VALUES (%s,%s,%s,%s,%s)",
                            (__import__("hashlib").md5((str(res["name"]) + str(request_id)).encode()).hexdigest()[:16],
                             res["name"], reply, res["project_id"], "gen:" + str(res["type"] or "").removeprefix("gen:")))
                    elif reply:
                        _pv._persist_assistant_message(did, reply)   # 💬 问答轮：只留消息，不产版本
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


async def stream_resource_gen(req):
    """闭环七：资源生成管线分支——主管线阶段的研究档变体。
    plan(无LLM,校验能力key) → fan-out(学情∥检索,rounds=2 走B2-lite) → KB蒸馏(5-10条)
    → CAPABILITIES技能生成(合成content注入materials) → review_claims断言审核(重试≤2)
    → resources落库(difficulty自标,失败NULL不阻断) → eval_traces全阶段(旁路)。
    会话 kind='resource' 隔离（重开可续聊，后续轮带 edit_resource_id 自动转编辑分支）。
    SSE 全帧（step/thought/answer/done）；前端生成页 v1 仅消费 answer/done，其余帧忽略。
    done 携 resource_id/name/difficulty/review。技能生成为同步调用，正文在审核定稿后
    分批注入 answer 帧（伪流式——真流式列资源生成赛后优化）。"""
    from engine import pipeline_v2 as _pv   # 接缝经属性查找：monkeypatch pipeline_v2.<name> 仍生效
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
                        return assess_and_store(_pv._make_fast_llm(req), did, user_text, "", None)

                    def _do_retrieve():
                        from engine.retrieve import retrieve_stage
                        return retrieve_stage(_pv._make_fast_llm(req), user_text, "研究", pid, rounds=2)

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
                            d_raw = _pv._make_fast_llm(req).chat(
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
                    _pv._persist_assistant_message(did, content)
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

