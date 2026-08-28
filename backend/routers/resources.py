"""资源、生成物与新建领域路由。"""
import logging
import os

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("coagent.resources")
router = APIRouter()


class ResourceSave(BaseModel):
    name: str
    content: str = ""
    project_id: str = "default"
    type: str = ""
    append: bool = False


class GenerateDomainReq(BaseModel):
    domain: str
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-v4-flash"


class ResourceGenReq(BaseModel):
    key: str
    content: str = ""
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = "deepseek-v4-flash"


def _generate_domain_sync(req) -> dict:
    """新建领域：AI 生成该领域的系统学习教程 + 百科词条（同步实现，线程池调用，避免阻塞事件循环）"""
    import requests as _req
    from core.memory_analysis import _extract_json
    name = (req.domain or "").strip()
    if not name:
        return {"status": "error", "msg": "领域名称不能为空"}
    prompt = (
        "请为领域「" + name + "」生成学习资源内容，严格输出 JSON（不要 markdown 代码块，不要额外文字）：\n"
        "{\n"
        "  \"tutorials\": [\n"
        "    {\"title\": \"教程名称\", \"category\": \"系统学习 或 技术工具\", \"desc\": \"一句话简介\", \"url\": \"\"}\n"
        "  ],\n"
        "  \"wiki\": [\n"
        "    {\"name\": \"词条名称\", \"theme\": \"主题分组\", \"intro\": \"一句话简介\", \"detail\": \"详细介绍（100字左右）\"}\n"
        "  ]\n"
        "}\n"
        "要求：tutorials 生成 3-4 篇（覆盖系统学习和技术工具两类）；wiki 生成 5-8 个该领域核心词条。"
    )
    try:
        h = {"Authorization": "Bearer " + (req.api_key or ""), "Content-Type": "application/json"}
        resp = _req.post(
            req.base_url.rstrip("/") + "/chat/completions",
            json={"model": req.model, "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
            headers=h, timeout=90,
        )
        if resp.status_code != 200:
            return {"status": "error", "msg": "模型调用失败（HTTP " + str(resp.status_code) + "），请检查 API Key"}
        content = resp.json()["choices"][0]["message"]["content"] or ""
        data = _extract_json(content)
        if not data:
            return {"status": "error", "msg": "AI 返回内容无法解析"}
        return {"status": "ok", "tutorials": data.get("tutorials") or [], "wiki": data.get("wiki") or []}
    except Exception as e:
        return {"status": "error", "msg": str(e)[:200]}


@router.post("/api/generate-domain")
async def generate_domain(req: GenerateDomainReq):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(_generate_domain_sync, req)


@router.get("/api/resources/capabilities")
def list_capabilities():
    """资源生成能力注册表：返回当前支持的资源形式（单一事实来源）。"""
    from services.resource_gen import list_capabilities as _list
    return {"capabilities": _list()}


@router.post("/api/resources/generate")
async def generate_resource(req: ResourceGenReq):
    """按能力 key 生成资源内容（同步实现放线程池，避免阻塞事件循环）。"""
    from starlette.concurrency import run_in_threadpool
    from services.resource_gen import generate_resource as _gen
    return await run_in_threadpool(_gen, req.api_key, req.key, req.content, req.base_url, req.model)


@router.get("/api/resources")
def list_resources(project_id: str = "default"):
    from core.postgres_client import pg_client
    rows = pg_client.execute("SELECT id, name, content, type, file_ext, file_size, created_at FROM resources WHERE project_id=%s ORDER BY created_at DESC", (project_id,))
    return {"resources": rows}


@router.get("/api/resources/all")
def list_resources_all():
    """我的上传：聚合所有项目的资源（带项目名）"""
    from core.postgres_client import pg_client
    proj_names = {r["id"]: r["name"] for r in pg_client.execute("SELECT id, name FROM projects")}
    rows = pg_client.execute("SELECT id, name, content, type, file_ext, file_size, project_id, created_at FROM resources ORDER BY created_at DESC")
    for r in rows:
        r["project_name"] = proj_names.get(r.get("project_id", ""), r.get("project_id", ""))
    return {"resources": rows}


@router.post("/api/resources")
def save_resource(req: ResourceSave):
    import time, hashlib
    from core.postgres_client import pg_client
    if req.append:
        # 追加模式：每次生成都存一条新记录（资源生成历史），不复用同名 id
        rid = hashlib.md5((req.name + req.project_id + str(time.time())).encode()).hexdigest()[:16]
        pg_client.execute(
            "INSERT INTO resources (id, name, content, type, project_id) VALUES (%s,%s,%s,%s,%s)",
            (rid, req.name, req.content, req.type, req.project_id),
        )
        return {"status": "ok", "id": rid}
    rid = hashlib.md5((req.name + req.project_id).encode()).hexdigest()[:16]
    has = pg_client.execute("SELECT id FROM resources WHERE id=%s", (rid,))
    if has:
        pg_client.execute("UPDATE resources SET content=%s, type=%s WHERE id=%s", (req.content, req.type, rid))
    else:
        pg_client.execute(
            "INSERT INTO resources (id, name, content, type, project_id) VALUES (%s,%s,%s,%s,%s)",
            (rid, req.name, req.content, req.type, req.project_id),
        )
    return {"status": "ok", "id": rid}


@router.post("/api/resources/upload")
async def upload_resource(
    project_id: str = Form("default"),
    file: UploadFile = File(...),
):
    """我的上传：上传文件存资源表（解析文本存 content，文件本体存 data/uploads）"""
    from core.postgres_client import pg_client
    from core.file_parser import parse_file
    data = await file.read()
    name = file.filename or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    from starlette.concurrency import run_in_threadpool

    def _ingest() -> tuple[str, str, str]:
        """解析+落盘+入库（同步阻塞），线程池执行——解析器与 SQLite 都不得占用事件循环。"""
        import time as _t
        import hashlib as _h
        text = parse_file(name, data)
        rid = _h.md5((name + project_id + str(_t.time())).encode()).hexdigest()[:16]
        up_dir = "/app/data/uploads"
        os.makedirs(up_dir, exist_ok=True)
        fname = rid + (("." + ext) if ext else "")
        fpath = os.path.join(up_dir, fname)
        try:
            with open(fpath, "wb") as f:
                f.write(data)
        except Exception:
            fpath = ""
        pg_client.execute(
            "INSERT INTO resources (id, name, content, project_id, type, file_ext, file_size, file_path) VALUES (%s,%s,%s,%s,'file',%s,%s,%s)",
            (rid, name, text, project_id, ext, len(data), fpath),
        )
        return rid, name, text[:80]

    rid, name, preview = await run_in_threadpool(_ingest)
    return {"status": "ok", "id": rid, "name": name, "preview": preview}


@router.delete("/api/resources/{rid}")
def delete_resource(rid: str):
    from core.postgres_client import pg_client
    pg_client.execute("DELETE FROM resources WHERE id=%s", (rid,))
    return {"status": "ok"}
