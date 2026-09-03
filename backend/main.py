"""
CoAgent-Learn 纯 API 后端
FastAPI + 自研多阶段管线（规划/检索/学情评估/生成/审核）+ RAG 向量检索
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
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
from routers.preset_library import router as preset_library_router
from core.helpers import extract_json_obj
# D1：三函数已原样迁至 services/chat_context——re-export 保持 main._auto_settings 等可解析
from services.chat_context import _auto_settings, _build_preloaded, _parse_special_inputs
from services.memory_edit import memory_chat as _memory_chat_service


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
    # F8-S1 引擎健康检查：启动即对「选了云引擎但没配 token/key」给出可见 WARNING
    # （优雅降级语义不变，解析时仍会自动降级 pymupdf4llm）。
    try:
        from core import parse_service
        parse_service.check_engine_health("startup")
    except Exception:
        logger.exception("启动时引擎健康检查失败")
    try:
        _ensure_default_project()
    except Exception:
        logger.exception("启动时确保默认项目失败")
    # F13-S1 预设库启动扫描：建三级索引并为缓存缺失的 PDF 补算页数（pypdf 只读 xref，
    # 全库首扫秒级；失败仅降级页数留空，不阻断启动——列表接口每次调用会重扫兜底）
    try:
        import asyncio
        from services.preset_library import scan_preset_library
        await asyncio.to_thread(scan_preset_library)
    except Exception:
        logger.exception("启动扫描预设资源库失败")
    yield


app = FastAPI(
    title="CoAgent-Learn API",
    description="领域知识个性化生成与多智能体协同决策系统",
    version="0.3.0",
    lifespan=lifespan,
)

from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1024)

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

# F13-S1 预设资源库原始文件回源（md/pdf 直读；只读语义靠前端用途约束，与 /uploads 同模式）
_PRESET_DIR = os.path.join(_APP_DATA_DIR, "preset_library")
try:
    os.makedirs(_PRESET_DIR, exist_ok=True)
    app.mount("/preset-library", StaticFiles(directory=_PRESET_DIR), name="preset-library")
except Exception:
    logger.exception("挂载预设库目录失败")

app.include_router(settings_router)
app.include_router(projects_router)
app.include_router(knowledge_router)
app.include_router(resources_router)
app.include_router(memory_router)
app.include_router(skills_router)
app.include_router(preset_library_router)


from engine.cancel import ACTIVE_CANCELS as _active_cancels  # noqa: E402
# ---------- API 接口 ----------


@app.get("/healthz")
def healthz():
    """纯 liveness 探针（Step C4）：不查库/不查向量/不调 LLM/不读文件，进程活着即 200。
    仅供 Docker healthcheck（容器内 127.0.0.1:8000 直连）与人肉 curl 使用；
    不要在这里加鉴权、依赖检查或日志——每 30s 探测一次，会刷屏/制造假故障。"""
    return {"status": "ok"}

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
    edit_resource_id: str | None = None  # 闭环六：在场 → 资源编辑独立会话分支（全文重生成，kind='resource' 隔离）
    gen_resource: str | None = None  # 闭环七：在场（能力 key）→ 资源生成管线分支（研究档级，kind='resource' 隔离）
    extra_followup_did: str | None = None  # 额外生成追问的目标对话（主对话完成后同步给第二对话）
    extra_followup_focus: str | None = None  # 额外追问风格（默认 expand）
    debug: bool = False  # 评测用：为 True 时 done 事件附带回 internals（画像/检索/审核中间数据）
    client_msg_id: str = ""  # D4 重试幂等：前端每次「按发送」生成、重试复用；空=旧客户端，不入去重
class StopRequest(BaseModel):
    request_id: str  # /api/chat 的 start 事件返回的生成请求 id（用户手动停止时置位取消）

class QuizAnswerIn(BaseModel):
    question_id: str
    kp_tag: str = ""      # 关联知识点（kb_tree 标题 / gen_quiz explanation 主题）
    correct: bool

class QuizSubmitReq(BaseModel):
    dialogue_id: str
    project_id: str = "default"
    answers: list[QuizAnswerIn]

class ChatStep(BaseModel):
    agent: str
    status: str
    detail: str | None = None


async def memory_chat(req: ChatRequest):
    """记忆对话：根据用户输入直接更新记忆（只更新明确提到的字段），返回一句话确认。
    project_id 为 'global'（或空）时操作个人全局性记忆，否则操作课程记忆。"""
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(_memory_chat_service, req.api_key, req.message, req.project_id, req.session_id or "")


@app.get("/api/eval/traces/{request_id}")
async def get_eval_traces(request_id: str):
    """按 request_id 查询单轮对话的全量评估Trace（协作者接口）。"""
    from core.db.eval_repo import get_eval_repo
    rows = get_eval_repo().by_request(request_id)
    return {"request_id": request_id, "traces": rows}


@app.get("/api/eval/export")
async def export_eval_traces():
    """导出全部评估Trace（提交材料/离线分析用）。"""
    from core.db.eval_repo import get_eval_repo
    repo = get_eval_repo()
    all_rows = repo._db.execute(
        "SELECT * FROM eval_traces ORDER BY request_id, id")
    return {"count": len(all_rows), "traces": all_rows}


@app.post("/api/quiz/submit")
async def quiz_submit(req: QuizSubmitReq):
    """分阶题作答上报（L5 反馈回路）：落库 → 近窗正确率 → 合流更新 level_score。
    下一轮生成的输出策略指令将随新 level_score 可见地变化（官方"动态决策更新"）。"""
    from starlette.concurrency import run_in_threadpool
    from engine.assess import apply_quiz_feedback
    return await run_in_threadpool(
        apply_quiz_feedback, req.dialogue_id, req.project_id,
        [a.model_dump() for a in req.answers])


@app.get("/api/report/match")
async def match_report(project_id: str, dialogue_id: str = ""):
    """学情匹配度报告聚合（评估体系 §五 v1）：盲区定位+level曲线+kp正确率+路径树着色。"""
    from starlette.concurrency import run_in_threadpool
    from services.match_report import build_match_report
    return await run_in_threadpool(
        build_match_report, project_id, dialogue_id or None)


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


@app.get("/api/chat/{dialogue_id}/trace-export")
def chat_trace_export(dialogue_id: str):
    """F11-S5 协同决策中间数据导出（赛题测试数据包取用）：输入 dialogue_id，输出可下载
    JSON——五类数据（对话消息 / agent 步骤事件 eval_traces / 检索 query 与命中 / 审核过程
    与结论 / subagent_runs 运行记录 + project 级资源清单）。**纯只读聚合**：零 schema 变更，
    只走 SELECT，T50 领地不碰写路径；检索命中预览与审核结论全文取自消息 think（S1/S2
    持久化），queries 与审核 digest 取自 eval_traces。结构化错误走 {"status":"error"} 约定。"""
    import json as _json

    from core.postgres_client import pg_client
    from fastapi.responses import Response

    def _rows(sql: str, args=()) -> list:
        return [dict(r) for r in pg_client.execute(sql, args)]

    dlg = _rows("SELECT id, name, project_id, session_id, created_at, archived "
                "FROM dialogues WHERE id=%s", (dialogue_id,))
    if not dlg:
        return JSONResponse(status_code=404,
                            content={"status": "error",
                                     "msg": "对话不存在：无法导出不存在的 dialogue_id"})

    messages = _rows("SELECT role, content, think, created_at FROM messages "
                     "WHERE dialogue_id=%s ORDER BY id", (dialogue_id,))
    traces = _rows("SELECT request_id, stage, input_digest, output_digest, metrics_json, "
                   "elapsed_ms, created_at FROM eval_traces WHERE dialogue_id=%s ORDER BY id",
                   (dialogue_id,))
    runs = _rows("SELECT id, agent, title, input, status, output, events, created_at, "
                 "finished_at FROM subagent_runs WHERE dialogue_id=%s ORDER BY created_at",
                 (dialogue_id,))
    pid = dlg[0]["project_id"]
    resources = _rows("SELECT id, name, type, file_ext, created_at FROM resources "
                      "WHERE project_id=%s ORDER BY created_at", (pid,))

    for m in messages:
        try:
            m["think"] = _json.loads(m.get("think") or "null")
        except Exception:
            m["think"] = None
    for r in runs:
        try:
            r["events"] = _json.loads(r.get("events") or "[]")
        except Exception:
            r["events"] = []

    agent_traces, retrieval, review = [], [], []
    for t in traces:
        try:
            od = _json.loads(t.get("output_digest") or "{}")
        except Exception:
            od = {}
        try:
            mj = _json.loads(t.get("metrics_json") or "{}")
        except Exception:
            mj = {}
        agent_traces.append({"request_id": t["request_id"], "stage": t["stage"],
                             "input_digest": t["input_digest"], "output_digest": od,
                             "metrics": mj, "elapsed_ms": t["elapsed_ms"],
                             "created_at": t["created_at"]})
        if t["stage"] == "retrieve":
            retrieval.append({"request_id": t["request_id"],
                              "queries": od.get("queries") or [],
                              "kept": od.get("kept"), "raw_count": od.get("raw_count"),
                              "rounds": od.get("rounds")})
        elif t["stage"] == "review":
            review.append({"request_id": t["request_id"], **mj})

    # 命中预览与审核结论全文：消息 think 的持久化条目（S1/S2 落库的权威展示层）
    retrieval_hit_previews, review_conclusions = [], []
    for m in messages:
        for it in (m.get("think") or []) if isinstance(m.get("think"), list) else []:
            if not isinstance(it, dict) or not it.get("content"):
                continue
            if it.get("agent") == "知识库管理":
                retrieval_hit_previews.append(it["content"])
            elif it.get("agent") == "审核":
                review_conclusions.append(it["content"])

    payload = {
        "schema": "coagent-trace-export/1",
        "exported_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        "dialogue": dlg[0],
        # ① 对话消息（think 已解析：内含规划要点/检索命中预览/审核结论全文）
        "messages": messages,
        # ② agent 步骤事件（eval_traces 全量 stage trace）
        "agent_traces": agent_traces,
        # ③ 检索 query（trace digest 解析）+ 命中预览全文（消息 think 提取）
        "retrieval": retrieval,
        "retrieval_hit_previews": retrieval_hit_previews,
        # ④ 审核过程 digest（trace metrics）+ 结论全文（消息 think 提取）
        "review": review,
        "review_conclusions": review_conclusions,
        # ⑤ subagent_runs 运行记录 + 最终生成资源（resources 为 project 级关联——
        #    资源表无 dialogue 列，口径在此注明）
        "subagent_runs": runs,
        "resources": resources,
    }
    body = _json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    safe_did = "".join(c for c in dialogue_id if c.isalnum() or c in "-_")[:40] or "dialogue"
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition":
                             f'attachment; filename="trace-{safe_did}.json"'})


