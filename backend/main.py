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
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import json
import logging

load_dotenv()

logger = logging.getLogger("coagent")

from routers.settings import router as settings_router, _apply_dynamic_settings
from routers.projects import router as projects_router, _ensure_default_project
from routers.knowledge import router as knowledge_router
from routers.resources import router as resources_router
from routers.memory import router as memory_router
from routers.skills import router as skills_router
from core.helpers import _as_dict


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



# ---------- 记忆修改（AI 分析修改记忆：[模块名] 引用） ----------

GLOBAL_MEM_KEYS = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
PROJECT_MEM_KEYS = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]


def _extract_json_obj(text: str) -> dict:
    """提取文本中的 JSON 对象（容错：裸 JSON 或花括号片段）"""
    try:
        d = json.loads(text)
        return d if isinstance(d, dict) else {}
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            d = json.loads(m.group(0))
            return d if isinstance(d, dict) else {}
        except Exception:
            pass
    return {}


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
        d = _extract_json_obj(raw)
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


def _memory_edit(api_key: str, message: str, project_id: str, session_id: str) -> dict | None:
    """检测 [模块名] 引用 → AI 分析并修改记忆；返回 {"reply":..., "steps":...}，非引用消息返回 None"""
    m = re.search(r"\[([^\[\]]{1,16})\]", message)
    if not m:
        return None
    key = m.group(1).strip()
    rest = message[m.end():].strip()
    is_global = key in GLOBAL_MEM_KEYS
    is_project = key in PROJECT_MEM_KEYS
    if not (is_global or is_project):
        return None
    from core.postgres_client import pg_client as _pg
    from core.config import config as _cfg
    # 读当前内容
    cur = ""
    if is_global:
        rows = _pg.execute("SELECT data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    else:
        rows = _pg.execute("SELECT data FROM project_memories WHERE project_id=%s", (project_id,))
        d = _as_dict(rows[0]["data"]) if rows and rows[0]["data"] else {}
        v = d.get(key, "")
        cur = v if isinstance(v, str) else (", ".join(v) if isinstance(v, list) else str(v))
    # LLM 分析修改
    prompt = (
        f"你是记忆管理 Agent。用户希望对记忆模块「{key}」进行修改。\n"
        f"当前内容：{cur or '（空）'}\n"
        f"用户的修改想法：{rest or '（未说明，请自行判断是否需要修改）'}\n"
        f"请分析并给出修改后的内容（可保留、细化或重写，须符合用户想法且不与已有内容矛盾）。\n"
        f"只输出 JSON：{{\"reason\": \"修改理由（一两句）\", \"content\": \"修改后的内容（支持段落、- 列表、1. 列表）\"}}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {"reply": f"⚠️ 修改失败：LLM 调用错误（{resp.status_code}）", "steps": [{"agent": "记忆管理", "status": "done", "detail": "修改失败"}]}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        data = _extract_json_obj(raw)
        content = str(data.get("content") or "").strip()
        reason = str(data.get("reason") or "").strip()
        if not content:
            return {"reply": "⚠️ 修改失败：AI 未能生成修改内容", "steps": [{"agent": "记忆管理", "status": "done", "detail": "解析失败"}]}
    except Exception as e:
        return {"reply": f"⚠️ 修改失败：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "调用异常"}]}
    # 写回
    try:
        if is_global:
            rows = _pg.execute("SELECT id FROM global_profile LIMIT 1")
            if rows:
                old = _pg.execute("SELECT data FROM global_profile WHERE id=%s", (rows[0]["id"],))
                d2 = _as_dict(old[0]["data"]) if old and old[0]["data"] else {}
                d2[key] = content
                _pg.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s", (json.dumps(d2, ensure_ascii=False), rows[0]["id"]))
            else:
                _pg.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)", (session_id or "default", json.dumps({key: content}, ensure_ascii=False)))
        else:
            newv: object = content
            if key in ["偏好", "知识点", "难点", "薄弱点", "兴趣"]:
                newv = [s.strip() for s in re.split(r"[,，、\n]+", content) if s.strip()]
            rows = _pg.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (project_id,))
            if rows:
                d2 = _as_dict(rows[0]["data"]) if rows[0]["data"] else {}
                d2[key] = newv
                _pg.execute("UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s", (json.dumps(d2, ensure_ascii=False), project_id))
            else:
                _pg.execute("INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)", (session_id or "default", project_id, json.dumps({key: newv}, ensure_ascii=False)))
    except Exception as e:
        return {"reply": f"⚠️ 修改失败（写入）：{str(e)[:120]}", "steps": [{"agent": "记忆管理", "status": "done", "detail": "写入异常"}]}
    return {"reply": f"✅ 已更新记忆模块「{key}」\n\n**修改理由**：{reason}\n\n**新内容**：\n{content}", "steps": [{"agent": "记忆管理", "status": "done", "detail": f"分析并更新「{key}」"}]}


@app.post("/api/memory-chat")
async def memory_chat(req: ChatRequest):
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    import json
    from core.postgres_client import pg_client
    from core.memory_analysis import _as_dict
    from core.config import config as _cfg
    pid = (req.project_id or "").strip()
    if not pid or pid == "global":
        pid = "global"
        rows = pg_client.execute("SELECT id, data FROM global_profile ORDER BY updated_at DESC LIMIT 1")
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = ["身份", "学习目标", "擅长领域", "学习方式", "兴趣方向", "补充信息"]
    else:
        rows = pg_client.execute("SELECT session_id, data FROM project_memories WHERE project_id=%s", (pid,))
        mem = _as_dict(rows[0]["data"]) if rows and rows[0].get("data") else {}
        ALLOW = ["抽象目的", "抽象项目情况", "起点", "当前水平", "目标", "偏好", "知识点", "难点", "薄弱点", "兴趣"]
    prompt = (
        "你是记忆更新助手。以下是当前记忆字段，以及用户想要修改的内容。"
        "请只输出 JSON：{\"update\": {字段名: 新值}, \"reply\": \"一句话确认（说明更新了哪些字段；若无变更则说明原因）\"}\n"
        "规则：字段名只能是：" + "、".join(ALLOW) + "。数组字段（偏好/知识点/难点/薄弱点/兴趣）给字符串数组，其余给字符串。"
        "用户没有提到的字段不要出现在 update 中；若用户只是询问，update 可为空对象。\n"
        f"当前记忆：{json.dumps(mem, ensure_ascii=False)}\n"
        f"用户输入：{req.message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (req.api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        from starlette.concurrency import run_in_threadpool

        def _llm_call():
            return _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                             json={"model": "deepseek-v4-flash", "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                             headers=h, timeout=90)
        resp = await run_in_threadpool(_llm_call)
        if resp.status_code != 200:
            return {"reply": "⚠️ 记忆更新失败：模型调用出错（检查 API Key 是否有效）。"}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = _extract_json_obj(raw)
        if not d:
            return {"reply": "⚠️ 没有理解你的输入，请换一种说法，例如：「学习目标改为掌握 RAG 原理」。"}
        update = d.get("update") if isinstance(d.get("update"), dict) else {}
        reply = str(d.get("reply") or "已处理。")
        changed = []
        if update:
            merged = dict(mem)
            for k, v in update.items():
                if k in ALLOW and v not in (None, ""):
                    merged[k] = v
                    changed.append(k)
            if changed:
                if pid == "global":
                    rows = pg_client.execute("SELECT id FROM global_profile LIMIT 1")
                    if rows:
                        pg_client.execute("UPDATE global_profile SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
                                          (json.dumps(merged, ensure_ascii=False), rows[0]["id"]))
                    else:
                        pg_client.execute("INSERT INTO global_profile (session_id, data) VALUES (%s,%s)",
                                          ("default", json.dumps(merged, ensure_ascii=False)))
                else:
                    _rows = pg_client.execute("SELECT session_id FROM project_memories WHERE project_id=%s", (pid,))
                    if _rows:
                        pg_client.execute(
                            "UPDATE project_memories SET data=%s, updated_at=CURRENT_TIMESTAMP WHERE project_id=%s",
                            (json.dumps(merged, ensure_ascii=False), pid))
                    else:
                        pg_client.execute(
                            "INSERT INTO project_memories (session_id, project_id, data) VALUES (%s,%s,%s)",
                            ("project", pid, json.dumps(merged, ensure_ascii=False)))
        if not changed and not reply.strip():
            reply = "⚠️ 没有需要更新的字段。"
        return {"reply": reply, "changed": changed}
    except Exception as e:
        return {"reply": f"⚠️ 记忆更新失败：{str(e)[:120]}"}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    async def stream():
        try:
            from agents.graph import create_workflow
            import queue, threading, asyncio
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
                        _edit = _memory_edit(req.api_key, req.message, pid, req.session_id or "default")
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
                        token_queue.put(("done", {"final_reply": _reply2, "steps": _edit["steps"], "mindchain": [], "task_stats": {}}))
                        return
                    import time as _time
                    _t0 = _time.time()
                    result = wf.invoke({"user_input": req.message, "project_id": pid, "dialogue_id": _did, "session_id": req.session_id or "default", "mode": req.mode or "kb", "image": req.image or "", "steps": [], "mindchain": []})
                    # 用户手动停止：不落库、不执行记忆/追问等后处理（前端已保留流式显示内容；避免旧线程与新消息乱序/竞态）
                    # 必须发一个带空 reply 的 done 让 SSE 主循环 break，否则主循环无限心跳、前端永久卡"正在输出回答…"
                    if cancel_evt.is_set():
                        token_queue.put(("done", {"final_reply": "", "steps": [], "mindchain": [], "task_stats": {}}))
                        return
                    # 特殊形式输出建议（M10 触发条件-模型判断）：normal 未取消时 flash 判断回答适合哪些形式；simple/失败返回 []
                    if result.get("complexity") != "simple":
                        result["special_suggestions"] = _suggest_special_forms(req.api_key, result.get("final_reply", ""), req.base_url)
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
                                _nm = "对话生成·" + _fr.strip()[:14]
                                _rid = _hl.md5((_nm + pid).encode()).hexdigest()[:16]
                                _has = _pg3.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
                                if _has:
                                    _pg3.execute("UPDATE resources SET content=%s WHERE id=%s", (_fr[:6000], _rid))
                                else:
                                    _pg3.execute("INSERT INTO resources (id, name, content, project_id) VALUES (%s,%s,%s,%s)", (_rid, _nm, _fr[:6000], pid))
                            except Exception as _e:
                                logger.exception("自动保存生成物失败 did=%s", _did)
                    threading.Thread(target=_persist, daemon=True).start()
                    # 后台异步分析记忆 + 生成追问（开关可配）
                    try:
                        reply = result.get("final_reply", "")
                        if reply:
                            from core.memory_analysis import update_memories
                            from core.compress import compress_dialogue
                            from core.postgres_client import pg_client
                            import threading
                            threading.Thread(target=update_memories, args=(req.api_key, pid, _did, pg_client, req.session_id or "default"), daemon=True).start()
                            # 上下文自动压缩：每满 30 条压缩最早 30%（后台，用户无感知；未满 30 条直接返回）
                            threading.Thread(target=compress_dialogue, args=(req.api_key, _did, pg_client), daemon=True).start()
                            if not (req.settings and req.settings.get('autoFollowups') is False):
                                from core.followups import generate_followups
                                threading.Thread(target=generate_followups, args=(req.api_key, pid, _did, pg_client, req.followup_focus or "purpose"), daemon=True).start()
                            # 主对话完成后同步为第二对话生成横向拓展/闲聊追问（第二对话发送时不会带 extra 字段，互不影响）
                            if req.extra_followup_did:
                                try:
                                    threading.Thread(target=generate_followups, args=(req.api_key, pid, req.extra_followup_did, pg_client, req.extra_followup_focus or "expand"), daemon=True).start()
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
                    yield f"data: {json.dumps({'type': 'done', 'reply': result.get('final_reply', '处理完成'), 'steps': result.get('steps', []), 'mindchain': result.get('mindchain', []), 'task_stats': result.get('task_stats', {}), 'special_suggestions': result.get('special_suggestions', []), 'retrieved_images': retrieved_images})}\n\n"
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


# ---------- 特殊形式输出建议（M10 触发条件：模型判断） ----------

_SPECIAL_FORM_KEYS = {"report": "报告", "flow": "流程图", "tree": "树状图", "table": "表格", "chart": "统计图", "audio": "音频", "quiz": "测试题"}

_SPECIAL_SUGGEST_PROMPT = """你是内容形式分析师。分析下面的学习内容，判断它适合转换/补充为哪些特殊输出形式（可多选，最多 3 个，选最合适的）：
- report=报告（汇总讲解内容）
- flow=流程图（内容含步骤/流程/时序）
- tree=树状图（内容有层级/分类结构）
- table=表格（内容含多对象对比/数据维度）
- chart=统计图（内容含数据/趋势）
- audio=音频（播客/朗读，讲解类内容均可）
- quiz=测试题（适合检验理解的知识点）

按 JSON Schema 输出 {"keys": ["形式key数组"]}；没有合适的输出 {"keys": []}。"""


def _suggest_special_forms(api_key, content, base_url=None):
    """模型判断回答适合哪些特殊输出形式（flash 一次调用；失败返回 []）"""
    try:
        from core.base_llm import DeepSeekLLM
        llm = DeepSeekLLM(api_key=api_key, model="deepseek-v4-flash", base_url=base_url, thinking=False)
        res = llm.chat_with_json(
            [{"role": "user", "content": _SPECIAL_SUGGEST_PROMPT + "\n\n内容：\n" + (content or "")[:2500]}],
            {"keys": ["string"]},
        )
        arr = (res or {}).get("keys") or []
        return [k for k in arr if k in _SPECIAL_FORM_KEYS][:3]
    except Exception as e:
        print("[special-suggest]", e)
        return []
