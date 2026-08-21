"""
CoAgent-Learn 纯 API 后端
FastAPI + LangGraph 多智能体协同 + RAG 向量检索
"""
import sys, os
import re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import json
import logging

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger("coagent")

from routers.settings import router as settings_router, _apply_dynamic_settings
from routers.projects import router as projects_router, _ensure_default_project
from routers.knowledge import router as knowledge_router
from routers.resources import router as resources_router
from routers.memory import router as memory_router
from routers.skills import router as skills_router
from core.helpers import _as_dict, extract_json_obj
from services.special_forms import suggest_special_forms
from services.memory_edit import memory_edit, memory_chat as _memory_chat_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os, warnings
    required = ["DEEPSEEK_API_KEY"]
    missing = [v for v in required if not os.getenv(v)]
    if missing:
        warnings.warn(f"缺少环境变量: {', '.join(missing)}。Agent 功能不可用。")
    try:
        _apply_dynamic_settings()
    except Exception:
        logger.exception("启动时应用动态设置失败")
    try:
        _ensure_default_project()
    except Exception:
        logger.exception("启动时确保默认项目失败")
    yield


app = FastAPI(
    title="CoAgent-Learn API",
    description="领域知识个性化生成与多智能体协同决策系统",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request, exc):
    """全局兜底：任何未捕获异常都记录完整堆栈并返回统一 500，避免静默失败。"""
    logger.exception("未处理异常: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "服务器内部错误"})


# 图片等上传文件静态回显（跨模态检索命中图片后前端可直接取图）
_UPLOADS_DIR = "/app/data/uploads"
try:
    os.makedirs(_UPLOADS_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=_UPLOADS_DIR), name="uploads")
except Exception:
    logger.exception("挂载上传目录失败")

app.include_router(settings_router)
app.include_router(projects_router)
app.include_router(knowledge_router)
app.include_router(resources_router)
app.include_router(memory_router)
app.include_router(skills_router)


def _mindchain_display_name(name):
    """思维链显示名：去掉 ·规划/·生成 阶段后缀；历史旧名/极速档伪标题统一为学习助手（与前端 displayAgent 一致）"""
    import re as _re
    if not name or not isinstance(name, str):
        return name
    m = _re.match(r"^(.*?)·(规划|生成)$", name)
    base = m.group(1) if m else name
    if base in ("主 Agent", "主Agent", "综合概述性记忆"):
        return "学习助手"
    return base


def _merge_mindchain(mc):
    """合并同名 agent 的连续思维链条目（同一 agent 规划→生成只显示一个标题），并过滤空内容条目"""
    if not mc:
        return []
    out = []
    for it in mc:
        if not isinstance(it, dict):
            continue
        name = it.get("agent", "")
        content = it.get("content", "") or ""
        if not content.strip():
            continue  # 空内容（无实际产出）条目不展示
        dn = _mindchain_display_name(name)
        if out and _mindchain_display_name(out[-1].get("agent", "")) == dn and dn:
            # 连续同名：内容拼接进上一条
            if content:
                out[-1]["content"] = (out[-1].get("content", "") + "\n" + content).strip()
        else:
            out.append({"agent": name, "content": content})
    return out


# 手动停止注册表：request_id -> cancel_event（POST /api/chat/stop 置位，run_workflow 检查后中断生成）
_active_cancels: dict = {}
# ---------- API 接口 ----------

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    dialogue_id: str | None = None
    project_id: str | None = None
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    settings: dict | None = None
    mode: str | None = None
    image: str | None = None
    agents: list = []
    followup_focus: str | None = None  # 追问风格：purpose=目的推进（默认）/ expand=横向拓展闲聊
    extra_followup_did: str | None = None  # 额外生成追问的目标对话（主对话完成后同步给第二对话）
    extra_followup_focus: str | None = None  # 额外追问风格（默认 expand）
class StopRequest(BaseModel):
    request_id: str  # /api/chat 的 start 事件返回的生成请求 id（用户手动停止时置位取消）

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None



def _auto_settings(api_key: str, message: str, template: str = "思考", infer_model: bool = False) -> dict:
    """Auto 模式：让 AI 读取用户输入，基于用户所选模板自动推断其余设置；infer_model=True 时同时推断模型；失败时返回空 dict（保持默认）"""
    from core.config import config as _cfg
    _model_field = "\"model\": \"deepseek-v4-pro|deepseek-v4-flash|glm-4-plus|glm-4-flash\", " if infer_model else ""
    prompt = (
        "你是对话设置分析器。模板已由用户选定，请根据用户的输入内容，推断其余最适合的对话设置，只输出 JSON：\n"
        "{" + _model_field + "\"outputFormat\": \"低结构化|高结构化\", "
        "\"outputStyle\": \"MD文档|对话形式\", \"thinking\": \"开|关\", "
        "\"outputVolume\": \"精简|适中|拓展\", \"depth\": \"浅|中|深\"}\n"
        f"已选档位：{template}（极速=快模型最短响应、思考=完整流程+轻量单审、研究=完整流程+严格检测，推断时可参考）\n"
        "推断规则：涉及学习/讲解/推导用较深深度与适中输出；复杂主题适当加重输出量；简单问答用精简。\n"
        "模型推断规则（仅在要求推断模型时）：复杂/长篇任务用 deepseek-v4-pro 或 glm-4-plus；简单问答用 deepseek-v4-flash 或 glm-4-flash。\n"
        f"用户输入：{message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = extract_json_obj(raw)
        if not d:
            return {}
        # 只接受合法取值，非法字段丢弃（template 由用户选择，不参与推断）
        ok = {
            "outputFormat": ["低结构化", "高结构化"],
            "outputStyle": ["MD文档", "对话形式"],
            "thinking": ["开", "关"],
            "outputVolume": ["精简", "适中", "拓展"],
            "depth": ["浅", "中", "深"],
        }
        if infer_model:
            ok["model"] = ["deepseek-v4-pro", "deepseek-v4-flash", "glm-4-plus", "glm-4-flash"]
        out = {}
        for k, vals in ok.items():
            v = str(d.get(k, "")).strip()
            if v in vals:
                out[k] = v
        return out
    except Exception:
        return {}


def _apply_template(agents, tpl: str):
    """按档位调整 agents 配置：
    极速=学习助手生成用快模型；思考/研究=默认编排（研究档的多轮搜索与独立检测为后续增强）。"""
    if not agents:
        return agents
    out = list(agents)
    if tpl == "极速":
        out = [dict(a, model="fast") if (isinstance(a, dict) and a.get("id") == "main") else a for a in out]
    return out


@app.post("/api/memory-chat")
async def memory_chat(req: ChatRequest):
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(_memory_chat_service, req.api_key, req.message, req.project_id)


def _build_preloaded(pid: str, did: str, user_input: str) -> dict:
    """生成节点上下文预查（main.py 预取 → 塞 state["preloaded"]，generate_node 不再直接查库）。
    各段独立容错：单段失败不影响其他段，生成节点按 preloaded 有无决定注入。"""
    import json as _json
    out = {"dialogue_profile_cache": None, "history": None, "kb_overview": None}
    # 对话学情画像（1.5 合成缓存）：对话全程用合成画像，不再注入个人/课程记忆
    try:
        from core.sqlite_client import get_db
        _drow = get_db().execute("SELECT profile FROM dialogues WHERE id=%s", (did,))
        if _drow and _drow[0].get("profile"):
            _p = _json.loads(_drow[0]["profile"])
            if isinstance(_p, dict):
                out["dialogue_profile_cache"] = _p
    except Exception:
        logger.exception("预查对话画像失败")
    try:
        from core.sqlite_client import get_db
        from core.helpers import estimate_tokens
        from core.compress import HISTORY_TOKEN_BUDGET
        _dbx = get_db()
        _drow = _dbx.execute("SELECT summary, compressed_upto FROM dialogues WHERE id=%s", (did,))
        _hist = {
            "summary": (_drow[0].get("summary") or "") if _drow else "",
            "compressed_upto": int((_drow[0].get("compressed_upto") or 0) if _drow else 0),
            "recent": [], "vector_hits": [],
        }
        _rows = _dbx.execute(
            "SELECT role, content FROM messages WHERE dialogue_id=%s AND id > %s ORDER BY created_at DESC LIMIT 200",
            (did, _hist["compressed_upto"]))
        # 从最新往回累加，保留到预算为止（与 generate_node 原逻辑一致）
        _recent = []
        _used = 0
        for _r in _rows:
            _c = str(_r.get("content") or "")
            if not _c or _c == "（系统未生成内容）":
                continue
            _t = estimate_tokens(_c)
            if _recent and _used + _t > HISTORY_TOKEN_BUDGET:
                break
            _recent.append({"role": _r.get("role"), "content": _c})
            _used += _t
        _recent.reverse()
        _hist["recent"] = _recent
        # 历史向量召回已移除（2026-08-21）：message_vectors 死表删除，压缩历史以 summary 文本承载
        out["history"] = _hist
    except Exception:
        logger.exception("预查历史失败")
    try:
        from core.knowledge_service import list_docs
        _docs = list_docs(pid)
        if _docs:
            out["kb_overview"] = "；".join(f"{d.get('source', '')}({d.get('chunks', 0)}块)" for d in _docs[:20])
    except Exception:
        logger.exception("预查知识库概述失败")
    return out


def _parse_special_inputs(message: str) -> str:
    """特殊格式并行解析：检出消息中的 URL（最多 5 个）并行抓取正文并合并进消息（20s 超时降级，不阻塞主流程）。
    附件（doc/docx/pdf/md）由前端解析为文本内联进消息（【用户上传文件: xx】+内容），此处不再处理；
    若标记后无内容（解析失败未内联），保持原文不动，由模型按原样处理。"""
    import re as _re
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout
    urls = _re.findall(r"https?://[^\s\u4e00-\u9fff()（）\[\]【】，。！？、；：\"'”’]+", message or "")
    urls = [u.rstrip(".,;:)") for u in urls][:5]
    if not urls:
        return message or ""
    from skills.registry import registry
    def _fetch(u):
        try:
            r = registry.execute("fetch_web", url=u, max_chars=3000)
            if r.get("results"):
                return "【网页内容: " + u + "】\n" + str(r["results"][0].get("content") or "")[:3000]
        except Exception:
            pass
        raise RuntimeError("fetch failed: " + u)
    parts = []
    logger.info("特殊格式并行解析启动：%d 个 URL", len(urls))
    with ThreadPoolExecutor(max_workers=len(urls)) as _ex:
        _futs = {_ex.submit(_fetch, u): u for u in urls}
        for _f, _u in _futs.items():
            try:
                _txt = _f.result(timeout=20)
                if _txt:
                    parts.append(_txt)
            except _FTimeout:
                logger.warning("URL 解析超时（>20s）：%s", _u)
                parts.append("（链接 " + _u + " 解析超时，未获取内容）")
            except Exception:
                logger.warning("URL 解析失败：%s", _u)
                parts.append("（链接 " + _u + " 解析失败，未获取内容）")
    return (message or "") + "\n\n" + "\n\n".join(parts)


def _five_round_hook(pid: str, did: str):
    """单窗口每五轮对话 → 课程记忆 + 进度条（4.2）：轮数按 messages 表 COUNT(role='user') 计（不加列），
    %5==0 时调 transfer_dialogue_to_project（内含概要入课程记忆 + update_progress + 变更计数）。
    幂等：transfer 内部按 last_transferred 游标判定（COUNT 未超过游标直接跳过），钩子重复调用安全。"""
    try:
        from core.postgres_client import pg_client as _pg5
        _n = _pg5.execute("SELECT COUNT(*) AS n FROM messages WHERE dialogue_id=%s AND role='user'", (did,))
        _cnt = int(_n[0]["n"]) if _n else 0
        if _cnt > 0 and _cnt % 5 == 0:
            from core.memory_service import transfer_dialogue_to_project
            transfer_dialogue_to_project(pid, did)
            logger.info("五轮对话传递：did=%s 第%d轮 → 课程记忆+进度条", did, _cnt)
    except Exception:
        logger.exception("五轮对话传递失败 did=%s", did)


@app.post("/api/chat")
async def chat(req: ChatRequest):
    # 画像守卫：新对话画像未合成完成时禁发（前端同步禁用发送按钮）——必须在 SSE 流开始前检查
    if req.dialogue_id:
        from core.db.project_repo import get_project_repo
        _pst = get_project_repo().get_dialogue_status(req.dialogue_id)
        if _pst == "pending":
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="profile_pending")
    async def stream():
        try:
            from agents.graph import create_workflow
            import queue, threading, asyncio
            from core.background import submit
            token_queue = queue.Queue()
            # 生成请求 id + 取消事件：前端点"停止"时 POST /api/chat/stop 置位，run_workflow 各 LLM 调用尽早中断
            import uuid as _uuid
            request_id = _uuid.uuid4().hex[:16]
            cancel_evt = threading.Event()
            _active_cancels[request_id] = cancel_evt

            _seen_agents = set()

            def on_token(agent_name: str, chunk: str):
                if agent_name not in _seen_agents:
                    _seen_agents.add(agent_name)
                    token_queue.put(("step", agent_name))
                # 拆字推送：chunk 拆成单字（含空白）逐字入队——前端"到达即显示"，逐字且速度=模型速度，无积压
                for _c in chunk:
                    token_queue.put(("token", agent_name, _c))

            def run_workflow():
                try:
                    # Auto / 模型 Auto：AI 读取输入自动推断设置（模型 Auto 同时推断模型）
                    _settings = dict(req.settings or {})
                    _model = req.model
                    _tpl0 = _settings.get("template") or "思考"
                    if _settings.get("modelAuto") or _settings.get("auto"):
                        # run_workflow 在独立线程执行：同步 LLM 调用不阻塞事件循环，无需 run_in_threadpool
                        _auto = _auto_settings(req.api_key, req.message, _tpl0, infer_model=bool(_settings.get("modelAuto")))
                        if _auto:
                            _settings.update(_auto)
                            if _auto.get("model"):
                                _model = _auto["model"]
                    # 模板模式：按所选模板调整 agents（基础 = 不调整）
                    _tpl = _settings.get("template") or "思考"
                    _agents = _apply_template(req.agents, _tpl)
                    wf = create_workflow(req.api_key, _settings, on_token, model=_model, base_url=req.base_url, agents=_agents,
                                         on_answer=lambda piece: [token_queue.put(("answer", _c)) for _c in piece], cancel_event=cancel_evt)
                    pid = req.project_id or "default"
                    _did = req.dialogue_id or "default"
                    # 先存用户消息（invoke 时 generate_node 才能读到）
                    try:
                        from core.postgres_client import pg_client as _pg
                        _exist=_pg.execute("SELECT id FROM dialogues WHERE id=%s",(_did,))
                        if not _exist:
                            _pg.execute("INSERT INTO dialogues(id,project_id,session_id,name) VALUES(%s,%s,%s,%s)",(_did,pid,req.session_id or "default","新对话"))
                        _pg.execute("INSERT INTO messages(dialogue_id,role,content) VALUES(%s,%s,%s)",(_did,"user",req.message))
                    except Exception:
                        logger.exception("保存用户消息失败 did=%s", _did)
                    # 记忆修改分支：[模块名] 引用 → 由 AI 分析修改记忆，不走多 Agent 流程
                    try:
                        _edit = memory_edit(req.api_key, req.message, pid, req.session_id or "default")
                    except Exception:
                        _edit = None
                        logger.exception("记忆修改分析失败")
                    if _edit:
                        _reply2 = _edit["reply"]
                        try:
                            from core.postgres_client import pg_client as _pg2
                            _pg2.execute("INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)", (_did, "assistant", _reply2, ""))
                        except Exception:
                            logger.exception("保存记忆修改回复失败 did=%s", _did)
                        _five_round_hook(pid, _did)
                        token_queue.put(("done", {"final_reply": _reply2, "steps": _edit["steps"], "mindchain": [], "task_stats": {}}))
                        return
                    import time as _time
                    _t0 = _time.time()
                    _msg = _parse_special_inputs(req.message)
                    _pre = _build_preloaded(pid, _did, _msg)
                    result = wf.invoke({"user_input": _msg, "project_id": pid, "dialogue_id": _did, "session_id": req.session_id or "default", "mode": req.mode or "kb", "image": req.image or "", "steps": [], "mindchain": [], "preloaded": _pre})
                    # 用户手动停止：不落库、不执行记忆/追问等后处理（前端已保留流式显示内容；避免旧线程与新消息乱序/竞态）
                    # 必须发一个带空 reply 的 done 让 SSE 主循环 break，否则主循环无限心跳、前端永久卡"正在输出回答…"
                    if cancel_evt.is_set():
                        token_queue.put(("done", {"final_reply": "", "steps": [], "mindchain": [], "task_stats": {}}))
                        return
                    # 资源生成建议（M10 触发条件-模型判断）：normal 未取消时 flash 判断回答适合哪些形式；simple/失败返回 []
                    if result.get("complexity") != "simple":
                        result["special_suggestions"] = suggest_special_forms(req.api_key, result.get("final_reply", ""), req.base_url)
                    else:
                        result["special_suggestions"] = []
                    # 思维链处理：合并同名 agent 的连续条目（同一 agent 规划→生成只显示一个标题）；
                    # 简单问题在 plan_node 已不产出思维链（mindchain 为空），此处合并后仍为空，前端不展示
                    result["mindchain"] = _merge_mindchain(result.get("mindchain") or [])
                    # 立即发 done（回复已完整）：stats/focus_log/task_stats/落库等写入移到后台线程，
                    # 避免 Windows 挂载卷上 SQLite 瞬时锁阻塞 done → 前端状态卡"正在输出回答"、发送键不复位
                    # （task_stats/messages 落库 + autoSaveResource 已由下方后台 _persist() 线程承担）
                    token_queue.put(("done", result))
                    def _persist():
                        import time as _time2
                        # 五轮对话→课程记忆钩子（4.2）：COUNT 用户消息 %5==0 触发传递+进度条（进度条唯一更新逻辑）
                        try:
                            _five_round_hook(pid, _did)
                        except Exception:
                            logger.exception("五轮对话传递钩子异常 did=%s", _did)
                        # 专注时长：本次任务完成，累加进项目 stats（可视化反馈：专注时长 + token 用量）
                        try:
                            from core.postgres_client import pg_client as _pg4
                            _dur = max(0, int(_time2.time() - _t0))
                            _srow = _pg4.execute("SELECT id, duration_seconds FROM stats WHERE project_id=%s ORDER BY updated_at DESC LIMIT 1", (pid,))
                            if _srow:
                                _pg4.execute("UPDATE stats SET duration_seconds=%s, updated_at=datetime('now') WHERE id=%s",
                                             ((_srow[0]["duration_seconds"] or 0) + _dur, _srow[0]["id"]))
                            else:
                                _pg4.execute("INSERT INTO stats(project_id, duration_seconds) VALUES(%s,%s)", (pid, _dur))
                            # 按天落库：主页趋势图（专注时长·最近30天）数据源
                            if _dur > 0:
                                _pg4.execute("INSERT INTO focus_log(project_id, dialogue_id, duration_seconds) VALUES(%s,%s,%s)", (pid, _did, _dur))
                        except Exception as _e:
                            logger.exception("累计专注时长失败 did=%s", _did)
                        # 记录本次任务的运行统计（Agent 界面·运行监控）
                        try:
                            import json as _json2
                            from core.postgres_client import pg_client as _pg2
                            _ts = result.get("task_stats") or {}
                            if _ts:
                                _pg2.execute("INSERT INTO task_stats(project_id,dialogue_id,data) VALUES(%s,%s,%s)",
                                             (pid, _did, _json2.dumps(_ts, ensure_ascii=False)))
                        except Exception as _e:
                            logger.exception("保存运行统计失败 did=%s", _did)
                        # invoke 后存 AI 回复（含思维链 mindchain 落库，刷新后保留）
                        try:
                            import json as _json3
                            from core.postgres_client import pg_client as _pg
                            _reply=result.get("final_reply","")
                            if _reply:
                                _think = _json3.dumps(result.get("mindchain") or [], ensure_ascii=False)
                                _pg.execute("INSERT INTO messages(dialogue_id,role,content,think) VALUES(%s,%s,%s,%s)",(_did,"assistant",_reply,_think))
                        except Exception as _e:
                            logger.exception("保存 AI 回复失败 did=%s", _did)
                        # 自动保存生成物到"我的上传"（设置开关 autoSaveResource）
                        if req.settings and req.settings.get('autoSaveResource') and result.get("final_reply"):
                            try:
                                import hashlib as _hl
                                from core.postgres_client import pg_client as _pg3
                                _fr = result.get("final_reply","")
                                # 垃圾过滤：报错/系统提示/太短的寒暄不入资源表
                                _head = _fr.strip()[:40]
                                _junk = (
                                    "生成内容时出现错误" in _head
                                    or _head.startswith("⚠️")
                                    or _head.startswith("（系统未生成内容）")
                                    or len(_fr.strip()) < 120
                                )
                                if not _junk:
                                    _nm = "对话生成·" + _fr.strip()[:14]
                                    _rid = _hl.md5((_nm + pid).encode()).hexdigest()[:16]
                                    _has = _pg3.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
                                    if _has:
                                        _pg3.execute("UPDATE resources SET content=%s WHERE id=%s", (_fr, _rid))
                                    else:
                                        _pg3.execute("INSERT INTO resources (id, name, content, project_id) VALUES (%s,%s,%s,%s)", (_rid, _nm, _fr, pid))
                            except Exception as _e:
                                logger.exception("自动保存生成物失败 did=%s", _did)
                    submit(_persist)
# 后台异步分析记忆 + 生成追问（开关可配）
                    try:
                        reply = result.get("final_reply", "")
                        if reply:
                            from core.memory_service import compress_dialogue, distill_memory, generate_followups
                            from core.postgres_client import pg_client
                            submit(distill_memory, req.api_key, pid, _did, pg_client, req.session_id or "default")
                            # 上下文自动压缩：token 预算制（后台，用户无感知）
                            submit(compress_dialogue, req.api_key, _did, pg_client)
                            if not (req.settings and req.settings.get('autoFollowups') is False):
                                submit(generate_followups, req.api_key, pid, _did, pg_client, req.followup_focus or "purpose")
                            # 主对话完成后同步为第二对话生成横向拓展/闲聊追问（第二对话发送时不会带 extra 字段，互不影响）
                            if req.extra_followup_did:
                                try:
                                    submit(generate_followups, req.api_key, pid, req.extra_followup_did, pg_client, req.extra_followup_focus or "expand")
                                except Exception:
                                    logger.exception("启动第二对话追问失败 did=%s", req.extra_followup_did)
                    except Exception:
                        logger.exception("启动后台记忆/压缩/追问任务失败 did=%s", _did)
                except Exception as e:
                    token_queue.put(("error", str(e)))
                finally:
                    _active_cancels.pop(request_id, None)

            threading.Thread(target=run_workflow, daemon=True).start()
            yield f"data: {json.dumps({'type': 'start', 'request_id': request_id})}\n\n"
            while True:
                try:
                    msg = token_queue.get(timeout=0.05)
                except queue.Empty:
                    # 心跳：空闲期保持连接活跃（前端按首字节/空闲超时判定，避免被误判为无响应）
                    await asyncio.sleep(0.05)
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    continue
                if msg[0] == "step":
                    yield f"data: {json.dumps({'type': 'step', 'agent': msg[1]})}\n\n"
                elif msg[0] == "token":
                    _, agent, chunk = msg
                    yield f"data: {json.dumps({'type': 'thought_token', 'agent': agent, 'chunk': chunk})}\n\n"
                elif msg[0] == "answer":
                    yield f"data: {json.dumps({'type': 'answer_token', 'chunk': msg[1]})}\n\n"
                elif msg[0] == "done":
                    result = msg[1]
                    # 跨模态检索命中的图片：随 done 回传前端渲染（图片本体已落盘 /uploads 静态目录）
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
                    yield f"data: {json.dumps({'type': 'done', 'reply': result.get('final_reply', '处理完成'), 'steps': result.get('steps', []), 'mindchain': result.get('mindchain', []), 'task_stats': result.get('task_stats', {}), 'special_suggestions': result.get('special_suggestions', []), 'retrieved_images': retrieved_images, 'review': result.get('reviewed')})}\n\n"
                    break
                elif msg[0] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': msg[1]})}\n\n"
                    break
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream")


@app.post("/api/chat/stop")
async def chat_stop(req: StopRequest):
    """用户手动停止：置位该请求的 cancel_event（幂等；未知/已结束请求直接返回 ok）。
    与断线（不做任何事，服务端继续跑完、落库，客户端重连可取结果）语义区分：
    只有收到明确的 stop 请求才取消生成，保证"非用户意愿断开继续跑完"。"""
    evt = _active_cancels.get(req.request_id)
    if evt:
        evt.set()
    return {"status": "ok"}


