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
from core.db.base import DATA_DIR as _APP_DATA_DIR
_UPLOADS_DIR = os.path.join(_APP_DATA_DIR, "uploads")
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


from engine.cancel import ACTIVE_CANCELS as _active_cancels  # noqa: E402
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


async def memory_chat(req: ChatRequest):
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(_memory_chat_service, req.api_key, req.message, req.project_id, req.session_id or "")


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


@app.post("/api/chat")
async def chat(req: ChatRequest):
    # 画像守卫：新对话画像未合成完成时禁发（前端同步禁用发送按钮）——必须在 SSE 流开始前检查
    if req.dialogue_id:
        from core.db.project_repo import get_project_repo
        _pst = get_project_repo().get_dialogue_status(req.dialogue_id)
        if _pst == "pending":
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="profile_pending")
    from engine.pipeline_v2 import stream_response as _v2_stream_response
    return await _v2_stream_response(req)


@app.post("/api/chat/stop")
async def chat_stop(req: StopRequest):
    """用户手动停止：置位该请求的 cancel_event（幂等；未知/已结束请求直接返回 ok）。
    与断线（不做任何事，服务端继续跑完、落库，客户端重连可取结果）语义区分：
    只有收到明确的 stop 请求才取消生成，保证"非用户意愿断开继续跑完"。"""
    evt = _active_cancels.get(req.request_id)
    if evt:
        evt.set()
    return {"status": "ok"}


@app.get("/api/chat/subagent/{run_id}")
async def chat_subagent_get(run_id: str):
    """子agent运行档案事后拉档（条目4·回看通道）：SSE 实时事件之外按 run_id 读完整档案
    （input 主发给子的指令 / events 过程事件序列 / output 最终报告）。不存在返回 404。"""
    from fastapi import HTTPException
    from services.subagent_runs import get_run
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run_not_found")
    return {"run": run}


