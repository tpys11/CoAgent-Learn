"""知识库上传、抓取、检索与文件解析路由。"""
import hashlib
import logging

from core.background import submit
from services.web_fetch import is_disallowed_host, fetch_site_text, MAX_LINK_CHARS

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("coagent.knowledge")
router = APIRouter()

_IMG_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
}


def _process_upload(project_id, text, source, session_id, api_key, skip_context: bool = False, skip_graph: bool = False, content_hash: str = "") -> int:
    """处理上传：存原文到资源表 + 切块向量化入库，返回入库块数。
    后台线程调用时忽略返回值；同步模式（wait=1）用它拿到块数反馈给前端。
    skip_context：跳过每块 LLM 上下文前缀（大批量内容）。
    content_hash：内容 sha256；命中 file_hashes 去重表时返回 -1（已存在，跳过）。
    已移除 Neo4j 知识图谱抽取（2026-08-15）。"""
    n = 0
    try:
        from core.db import get_kb_repo
        if content_hash and get_kb_repo().has_file_hash(project_id, content_hash):
            return -1
    except Exception:
        logger.warning("查询内容去重表失败", exc_info=True)
    try:
        from core.postgres_client import pg_client as _pg0
        _rid = hashlib.md5((source + project_id).encode()).hexdigest()[:16]
        _has = _pg0.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
        if _has:
            _pg0.execute("UPDATE resources SET content=%s WHERE id=%s", (text[:6000], _rid))
        else:
            _pg0.execute("INSERT INTO resources (id, name, content, project_id, type) VALUES (%s,%s,%s,%s,'text')", (_rid, source, text[:6000], project_id))
    except Exception:
        logger.warning("保存原文到资源表失败", exc_info=True)
    try:
        from core.knowledge_service import add_document
        n = add_document(project_id, text, source, session_id, api_key, skip_context=skip_context) or 0
    except Exception:
        logger.exception("知识库入库失败 source=%s", source)
    if n > 0 and content_hash:
        try:
            from core.db import get_kb_repo
            get_kb_repo().save_file_hash(project_id, content_hash, source)
        except Exception:
            logger.warning("记录内容去重 hash 失败", exc_info=True)
    return n


def _store_image_vector(project_id: str, source: str, data: bytes, desc: str, ext: str):
    """把图片落盘到 data/uploads，并生成 Qwen3-VL-Embedding 图片向量入库（失败不阻塞文字入库）。"""
    try:
        import base64 as _b64
        import hashlib as _hl
        import os as _os
        from core.knowledge_service import add_image
        mime = _IMG_MIME.get(ext, "image/png")
        doc_id = _hl.md5((source + project_id).encode("utf-8")).hexdigest()[:24]
        up_dir = "/app/data/uploads"
        _os.makedirs(up_dir, exist_ok=True)
        fname = doc_id + (("." + ext) if ext else "")
        fpath = _os.path.join(up_dir, fname)
        try:
            with open(fpath, "wb") as f:
                f.write(data)
        except Exception:
            logger.warning("图片落盘失败 source=%s", source, exc_info=True)
            fpath = ""
        data_uri = "data:" + mime + ";base64," + _b64.b64encode(data).decode()
        # 存公开回显路径（/uploads 静态挂载），前端可直接 <img src=...> 展示
        public_path = ("/uploads/" + fname) if fpath else ""
        add_image(project_id, source, data_uri, desc, file_path=public_path, mime=mime)
    except Exception:
        logger.exception("图片向量处理失败 source=%s", source)


class KnowledgeUpload(BaseModel):
    project_id: str = "default"
    text: str = ""
    source: str = "未命名"
    session_id: str = "default"
    api_key: str = ""


@router.post("/api/knowledge/upload")
async def knowledge_upload(req: KnowledgeUpload, wait: bool = False):
    _ch = hashlib.sha256((req.text or "").encode("utf-8")).hexdigest()
    if wait:
        from starlette.concurrency import run_in_threadpool
        chunks = await run_in_threadpool(_process_upload, req.project_id, req.text, req.source, req.session_id, req.api_key, False, False, _ch)
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": req.source, "msg": "内容已存在，已跳过重复入库"}
        return {"status": "ok", "chunks": chunks, "source": req.source}
    submit(_process_upload, req.project_id, req.text, req.source, req.session_id, req.api_key, False, False, _ch)
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


class KnowledgeUrlUpload(BaseModel):
    project_id: str = "default"
    url: str = ""
    source: str = ""
    session_id: str = "default"
    api_key: str = ""


@router.post("/api/knowledge/upload-url")
def knowledge_upload_url(req: KnowledgeUrlUpload, wait: bool = False):
    url = (req.url or "").strip().split("#")[0]
    if not url.startswith(("http://", "https://")):
        return {"status": "error", "msg": "链接格式不正确（需以 http:// 或 https:// 开头）"}
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").strip()
    if not host or is_disallowed_host(host):
        return {"status": "error", "msg": "链接主机不可访问（私网/回环地址）"}
    source = (req.source or "").strip() or url
    text = ""
    try:
        from core.db import get_kb_repo
        _cached = get_kb_repo().get_preset_doc(url)
        if _cached and (_cached.get("content") or "").strip():
            text = _cached["content"]
    except Exception:
        pass
    if not text:
        try:
            text = fetch_site_text(url)
            if len(text.strip()) >= 20:
                try:
                    get_kb_repo().save_preset_doc(url, source, text[:MAX_LINK_CHARS])
                except Exception:
                    pass
        except Exception as e:
            logger.warning("链接抓取失败 %s: %s", url, e)
            return {"status": "error", "msg": "抓取链接失败（链接不可访问或内容无法解析）"}
    if len(text.strip()) < 20:
        return {"status": "error", "msg": "链接内容过短或无法解析为文本"}
    if wait:
        _ch = hashlib.sha256(text.encode("utf-8")).hexdigest()
        chunks = _process_upload(req.project_id, text, source, req.session_id, req.api_key, True, True, _ch)
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": source, "msg": "内容已存在，已跳过重复入库"}
        return {"status": "ok", "chunks": chunks, "source": source}
    _ch2 = hashlib.sha256(text.encode("utf-8")).hexdigest()
    submit(_process_upload, req.project_id, text, source, req.session_id, req.api_key, True, True, _ch2)
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


@router.post("/api/knowledge/upload-file")
async def knowledge_upload_file(
    project_id: str = Form("default"),
    session_id: str = Form("default"),
    api_key: str = Form(""),
    wait: bool = Form(False),
    file: UploadFile = File(...),
):
    from core.file_parser import parse_file
    data = await file.read()
    fname = file.filename or "file"
    _IMG_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}
    _ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if _ext in _IMG_EXTS:
        import base64 as _b64
        from core.vision_service import describe_image
        _b64str = _b64.b64encode(data).decode()
        desc = describe_image(_b64str, "请详细描述这张图片的内容，包括文字、图表、概念，用于知识库检索。")
        if desc.startswith("[视觉服务]"):
            return {"status": "error", "msg": desc}
        text = "【图片内容】" + desc
    else:
        text = parse_file(fname, data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容（可能为空或格式不支持）"}
    source = fname
    _ch = hashlib.sha256(data).hexdigest()
    if wait:
        from starlette.concurrency import run_in_threadpool
        chunks = await run_in_threadpool(_process_upload, project_id, text, source, session_id, api_key, False, False, _ch)
        if _ext in _IMG_EXTS:
            await run_in_threadpool(_store_image_vector, project_id, source, data, desc, _ext)
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": source, "msg": "内容已存在，已跳过重复入库"}
        return {"status": "ok", "chunks": chunks, "source": source}
    submit(_process_upload, project_id, text, source, session_id, api_key, False, False, _ch)
    if _ext in _IMG_EXTS:
        submit(_store_image_vector, project_id, source, data, desc, _ext)
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


@router.get("/api/knowledge/list")
async def knowledge_list(project_id: str = "default"):
    from core.knowledge_service import list_docs
    return {"docs": list_docs(project_id)}


@router.get("/api/knowledge/list-all")
async def knowledge_list_all():
    from core.knowledge_service import list_docs
    from core.postgres_client import pg_client
    from core.db import get_kb_repo
    proj_names = {r["id"]: r["name"] for r in pg_client.execute("SELECT id, name FROM projects")}
    pids = [{"project_id": p} for p in get_kb_repo().list_project_ids()]
    all_docs = []
    for p in pids:
        pid = p["project_id"]
        for d in list_docs(pid):
            all_docs.append({**d, "project_id": pid, "project_name": proj_names.get(pid, pid)})
    return {"docs": all_docs}


@router.get("/api/kb/{project_id}")
async def kb_list(project_id: str):
    from core.knowledge_service import list_docs
    return list_docs(project_id)


@router.delete("/api/knowledge/delete")
async def knowledge_delete(project_id: str = "default", source: str = ""):
    from core.knowledge_service import delete_doc
    n = delete_doc(project_id, source)
    return {"status": "ok", "deleted": n, "graph_relations": 0}


@router.post("/api/vision")
async def vision_understand(req: dict):
    from core.vision_service import describe_image
    image = req.get("image", "")
    prompt = req.get("prompt", "请描述这张图片的内容")
    desc = describe_image(image, prompt)
    return {"status": "ok", "description": desc}


@router.post("/api/file-to-text")
async def file_to_text(file: UploadFile = File(...)):
    from core.file_parser import parse_file
    data = await file.read()
    text = parse_file(file.filename or "file", data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容"}
    return {"status": "ok", "text": text[:50000], "chars": len(text)}


@router.get("/api/knowledge/query")
async def knowledge_query(project_id: str = "default", q: str = "", top_k: int = 3):
    from starlette.concurrency import run_in_threadpool
    from core.knowledge_service import search
    return {"results": await run_in_threadpool(search, project_id, q, top_k)}
