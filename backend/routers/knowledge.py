"""知识库上传、抓取、检索与文件解析路由。"""
import hashlib
import json
import logging
import os

from core.background import submit
from services.web_fetch import is_disallowed_host

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel

logger = logging.getLogger("coagent.knowledge")
router = APIRouter()

# 跨项目向量复用开关（P0-2 根因1）：同 sha256 已在其他项目完整入库时，
# 复制向量跳过解析/embedding（大 PDF 省 4.5 分钟+上千次 API 调用）。
# 根因2（跨项目覆盖）由 doc_id 注入 project_id 修复，见 knowledge_service._make_doc_id。
# 置 KB_CROSS_PROJECT_REUSE=0 重启即退回"每项目全量重跑"，无需改代码。
KB_CROSS_PROJECT_REUSE = os.getenv("KB_CROSS_PROJECT_REUSE", "1") == "1"

_IMG_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
}


def _describe_image_main(image_b64: str, prompt: str, mime: str, api_key: str = "") -> str:
    """用视觉主模型生成图片描述（2026-08-22 移除独立视觉服务，图片理解统一走主模型）。
    非流式一次调用（thinking=False 秒级返回）；失败抛异常由调用方转为错误响应。"""
    from core.config import config as _cfg
    from core.base_llm import DeepSeekLLM
    key = api_key or getattr(_cfg, "DEEPSEEK_API_KEY", "")
    if not key:
        raise RuntimeError("未配置主模型 API Key（请求未携带且 .env 无 DEEPSEEK_API_KEY）")
    llm = DeepSeekLLM(api_key=key, model="deepseek-v4-flash-vision-exp", thinking=False)
    messages = [{"role": "user", "content": [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64," + image_b64}},
    ]}]
    return llm.chat(messages, temperature=0.2)


def _save_resource_text(project_id: str, source: str, text: str) -> None:
    """原文存档到 resources 表（各项目各存一份，id=md5(source+project_id)）。
    全量入库与跨项目复用两条路径共用；失败不阻断入库（原文仅影响文档阅读器）。"""
    try:
        from core.postgres_client import pg_client as _pg0
        _rid = hashlib.md5((source + project_id).encode()).hexdigest()[:16]
        _has = _pg0.execute("SELECT id FROM resources WHERE id=%s", (_rid,))
        # 存全量原文（此前 text[:6000] 截断导致大文档阅读器只能拿到残片）
        if _has:
            _pg0.execute("UPDATE resources SET content=%s WHERE id=%s", (text, _rid))
        else:
            _pg0.execute("INSERT INTO resources (id, name, content, project_id, type) VALUES (%s,%s,%s,%s,'text')", (_rid, source, text, project_id))
    except Exception:
        logger.warning("保存原文到资源表失败", exc_info=True)


def _process_upload(project_id, text, source, session_id, api_key, skip_context: bool = False, skip_graph: bool = False, content_hash: str = "", *, pdf_bytes: bytes | None = None) -> int:
    """处理上传：存原文到资源表 + 切块向量化入库，返回入库块数。
    后台线程调用时忽略返回值；同步模式（wait=1）用它拿到块数反馈给前端。
    skip_context：跳过每块 LLM 上下文前缀（大批量内容）。
    content_hash：内容 sha256；命中 file_hashes 去重表时返回 -1（已存在，跳过）。
    F9-S1：pdf_bytes 仅 PDF 文件上传链路传入——三通道大纲提取（书签优先）在此统一收口，
    结果经 add_document(outline_tree=...) 落 kb_tree；提取失败不阻断入库。
    已移除 Neo4j 知识图谱抽取（2026-08-15）。"""
    n = 0
    try:
        from core.db import get_kb_repo
        if content_hash and get_kb_repo().has_file_hash(project_id, content_hash):
            # 幽灵 hash 自愈：hash 在但向量已被删（旧版 delete_doc 不清 file_hashes）→ 重新入库
            _hash_src = get_kb_repo().get_file_hash_source(project_id, content_hash)
            if _hash_src and get_kb_repo().count_kb_by_source(project_id, _hash_src) > 0:
                return -1  # 真重复（向量还在）：跳过
            logger.info("检测到幽灵 hash（向量已删），重新入库 source=%s", _hash_src or source)
    except Exception:
        logger.warning("查询内容去重表失败", exc_info=True)
    # ---- 跨项目复用（P0-2 根因1）：同内容已在其他项目完整入库 → 复制向量，省解析+embedding ----
    # 顺序约束：必须放在同项目去重之后（同项目命中时上段已 return -1）。
    # 复制失败/0 块一律回退全量入库（不比修复前差）；总开关 KB_CROSS_PROJECT_REUSE=0 可整体关闭。
    if content_hash and KB_CROSS_PROJECT_REUSE:
        try:
            from core.db import get_kb_repo
            from core.knowledge_service import copy_document_across_projects
            _repo = get_kb_repo()
            _donor = _repo.find_donor_by_hash(content_hash, project_id)
            if _donor:
                _d_pid, _d_src = _donor
                n = copy_document_across_projects(_d_pid, _d_src, project_id, source,
                                                  session_id=session_id)
                if n > 0:
                    _save_resource_text(project_id, source, text)
                    _repo.save_file_hash(project_id, content_hash, source)
                    logger.info("跨项目复用向量 source=%s donor_project=%s donor_source=%s n=%d",
                                source, _d_pid, _d_src, n)
                    return n
                logger.warning("跨项目复用得到 0 块，回退全量入库 source=%s", source)
        except Exception:
            n = 0
            logger.exception("跨项目复用失败，回退全量入库 source=%s", source)
    _save_resource_text(project_id, source, text)
    # 修复①（F4′）：add_document 失败必须让调用方知道——异常向外传播，不再内吞。
    # 此前这里 catch 后只记日志、照常返回 0，导致：
    #   - 后台文件链路：_process_file_bg 的 except（写 _set_progress_error）永远不触发；
    #   - 同步路径：评委只见 chunks:0，F5 写的「未配置 EMBEDDING_API_KEY」文案一个字看不到。
    # 传播后各调用方的接法：
    #   - 后台文件（:138/:151）→ _process_file_bg 捕获 → _set_progress_error（轮询可见）；
    #   - 后台文本/URL（submit 直投）→ _process_upload_bg 包装捕获 → 同样写错误终态；
    #   - 同步 wait=1（3 处路由）→ 各自 try/except 转结构化错误响应（status:error + 原因）。
    # F9-S1：三通道大纲提取（书签→标题行→LLM 兜底）——上传链唯一收口点；
    # F9-S2：分类标注（正文 vs 小结/习题/附录/实验/总测试；规则主 + LLM 仲裁）写进节点
    # category 字段，供上传完成后的「留存范围选择」UI 展示。各级内部已兜底，此层再兜一道。
    outline_tree = None
    try:
        from core.outline_service import annotate_categories_from_text, extract_outline
        outline_tree = extract_outline(text, pdf_bytes=pdf_bytes, api_key=api_key)
        if outline_tree:
            outline_tree = annotate_categories_from_text(text, outline_tree, api_key=api_key)
    except Exception:
        logger.warning("大纲提取/分类失败（不阻断上传）", exc_info=True)
    from core.knowledge_service import add_document
    n = add_document(project_id, text, source, session_id, api_key,
                     skip_context=skip_context, outline_tree=outline_tree) or 0
    if n > 0 and content_hash:
        try:
            from core.db import get_kb_repo
            get_kb_repo().save_file_hash(project_id, content_hash, source)
        except Exception:
            logger.warning("记录内容去重 hash 失败", exc_info=True)
    return n


def _process_upload_bg(project_id, text, source, session_id, api_key, skip_context: bool = False, skip_graph: bool = False, content_hash: str = "") -> None:
    """后台直投入库包装（submit 路径用）：入库失败写进度错误终态，前端轮询可见。
    文件链路走 _process_file_bg（其 except 已写错误终态），不经这里；
    文本/URL 摄取 wait=0 时 submit 直投 _process_upload，而 background.submit 只把
    异常记进容器日志——修复①（F4′）在此补上用户可见的错误终态（原因含「怎么办」）。"""
    from core.knowledge_service import _set_progress_error
    try:
        _process_upload(project_id, text, source, session_id, api_key,
                        skip_context=skip_context, skip_graph=skip_graph,
                        content_hash=content_hash)
    except Exception as e:
        logger.exception("后台入库失败 source=%s", source)
        _set_progress_error(project_id, source, "入库失败：" + str(e)[:150])


def _parse_for_upload(fname: str, data: bytes, ext: str) -> tuple[str, str]:
    """上传解析统一入口：PDF 走可配置引擎（pymupdf4llm/mineru/mathpix，失败自动降级），其余走 file_parser。
    F8-S2：返回 (text, engine_used)——engine 透传进度/上传响应，用户可见用了哪个解析引擎。"""
    if ext == "pdf":
        from core import parse_service
        text, engine = parse_service.parse_document(fname, data)
        logger.info("PDF 解析 fname=%s engine=%s chars=%s", fname, engine, len(text))
        return text or "", engine
    from core.file_parser import parse_file_with_engine
    text, engine = parse_file_with_engine(fname, data)
    logger.info("文件解析 fname=%s engine=%s chars=%s", fname, engine, len(text))
    return text or "", engine


def _unparsable_msg(ext: str) -> str:
    """F8-S4：解析不出内容的结构化报错——PDF 场景附加扫描件出路指引
    （原因/后果/怎么办，CONVENTIONS §6）；已配 MinerU token 时指引为空不掺噪声。"""
    base = "无法解析该文件内容（可能为空或格式不支持）"
    if ext != "pdf":
        return base
    from core import parse_service
    guide = parse_service.scanned_pdf_guidance()
    return base + "。" + guide if guide else base


def _process_file_bg(project_id: str, fname: str, data: bytes, source: str,
                     session_id: str, api_key: str, content_hash: str, ext: str, desc: str = ""):
    """后台文件处理全链（上传提速·单步2）：解析 → _process_upload（去重/原文存档/入库/记录hash）→ 图片向量。
    解析从 HTTP 请求内移出（wait=false 时 HTTP 立即返回）；失败写进度错误终态（前端轮询可见）。"""
    from core.knowledge_service import _set_progress, _set_progress_error, set_progress_engine
    try:
        _set_progress(project_id, source, done=0, total=1, stage="parsing")
        # 修复④（F4′）：图片分支判定改引用 _IMG_EXTS（F3 漏归一的第四份手写字面量，
        # 且上游 VL 服务拒收 bmp——E-31，owner 拍板剔除不转码）。
        if ext in _IMG_EXTS:
            n = _process_upload(project_id, desc, source, session_id, api_key, False, False, content_hash)
            if n == -1:
                # F1: 内容重复（hash 去重命中）——无新增入库。写完成终态避免前端按文件名
                # 轮询悬挂 10 分钟误报失败；并跳过图片向量（与同步路径 duplicate 语义对齐，
                # 免一次多余 VL 调用）。T16/E2E 实测发现（进度卡 parsing）。
                _set_progress(project_id, source, done=1, total=1, stage="enhancing")
                return
            _store_image_vector(project_id, source, data, desc, ext)
            return
        text, engine = _parse_for_upload(fname, data, ext)
        # F8-S2：引擎旁路记录——轮询全程（含完成终态）可见 parse_engine
        set_progress_engine(project_id, source, engine)
        if not text.strip():
            _set_progress_error(project_id, source, _unparsable_msg(ext))
            return
        n = _process_upload(project_id, text, source, session_id, api_key, False, False, content_hash,
                            pdf_bytes=(data if ext == "pdf" else None))
        if n == -1:
            # F2：与图片分支对齐——去重命中（hash 已存在且向量仍在）无新增入库，写完成终态，
            # 否则前端按文件名轮询会悬挂 10 分钟后误报失败（F1 只修了图片分支，本步补齐非图片）。
            _set_progress(project_id, source, done=1, total=1, stage="enhancing")
            return
        logger.info("后台入库完成 fname=%s chunks=%s", fname, n)
    except Exception as e:
        logger.exception("后台文件处理失败 fname=%s", fname)
        _set_progress_error(project_id, source, "后台处理失败：" + str(e)[:150])


def _store_image_vector(project_id: str, source: str, data: bytes, desc: str, ext: str):
    """把图片落盘到 data/uploads，并生成 Qwen3-VL-Embedding 图片向量入库（失败不阻塞文字入库）。"""
    try:
        import base64 as _b64
        import hashlib as _hl
        import os as _os
        from core.knowledge_service import add_image
        mime = _IMG_MIME.get(ext, "image/png")
        doc_id = _hl.md5((source + project_id).encode("utf-8")).hexdigest()[:24]
        from core.db.base import DATA_DIR as _data_dir
        up_dir = _os.path.join(_data_dir, "uploads")
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


def _rescope_bg(project_id: str, source: str, scoped_text: str, full_tree: list, api_key: str):
    """F9-S2 留存范围重入库（后台）：按勾选范围切分原文 → 清旧块重灌向量；
    大纲树整棵回写（被排除节仍可见），原文 resources / file_hashes 原样保留。
    清旧依赖 add_document 既有同源清理（:delete_kb_by_source 内部路径），不新增删除面。"""
    from core.knowledge_service import _set_progress, _set_progress_error, add_document
    try:
        _set_progress(project_id, source, done=0, total=1, stage="parsing")
        n = add_document(project_id, scoped_text, source, session_id="project-rescope",
                         api_key=api_key, outline_tree=full_tree) or 0
        logger.info("留存范围重入库完成 source=%s chunks=%d", source, n)
    except Exception as e:
        logger.exception("留存范围重入库失败 source=%s", source)
        _set_progress_error(project_id, source, "按范围重入库失败：" + str(e)[:150])


class KbScopeRequest(BaseModel):
    project_id: str = "default"
    source: str = ""
    include: list[str] = []   # 勾选保留的章节路径（"/" 连接，子树语义）
    api_key: str = ""


@router.post("/api/kb/{project_id}/apply-scope")
async def kb_apply_scope(project_id: str, req: KbScopeRequest):
    """F9-S2 留存范围选择：按勾选范围重入库（建议可改；原文/大纲/去重 hash 不动）。
    后台执行（向量重算分钟级），进度复用 /upload-progress 轮询通道。"""
    from core.db import get_kb_repo
    from core.outline_service import scoped_text
    repo = get_kb_repo()
    source = (req.source or "").strip()
    if not source:
        return {"status": "error", "msg": "缺少文档来源，无法应用留存范围"}
    if not req.include:
        return {"status": "error", "msg": "至少保留一个章节（可点「全选」恢复全部内容入库）"}
    import asyncio
    original = await asyncio.to_thread(repo.get_resource_content, project_id, source) or ""
    if not original.strip():
        return {"status": "error", "msg": "未找到该文档原文，无法按范围重入库；请删除该资源后重新上传"}
    scoped = scoped_text(original, req.include)
    if not scoped.strip():
        return {"status": "error", "msg": "所选章节内无可入库内容，请调整勾选范围"}
    full_tree = repo.get_kb_tree(project_id, source) or []
    submit(_rescope_bg, project_id, source, scoped, full_tree, req.api_key)
    return {"status": "processing", "msg": "正在按所选范围重新入库，稍后查看"}


class KnowledgeUpload(BaseModel):
    project_id: str = "default"
    text: str = ""
    source: str = "未命名"
    session_id: str = "default"
    api_key: str = ""


@router.get("/api/kb/{project_id}/content")
def kb_node_content(project_id: str, source: str, path: str):
    """章节节点正文：path 为节点标题路径（/ 分隔，从根到节点），返回节点正文预览 + 起始 chunk 序号。
    节点无 content（旧数据）时按 source+标题在 kb_vectors 兜底取首块（见 2.3）。"""
    from core.db import get_kb_repo
    repo = get_kb_repo()
    node = None
    parts = [p.strip() for p in (path or "").split("/") if p.strip()]
    if parts:
        trees = [t for t in repo.get_all_kb_trees(project_id) if t.get("source") == source]
        if trees:
            cur = None
            for p in parts:
                cur = next((n for n in (cur.get("children") or []) if n.get("name") == p), None) if cur is not None else \
                      next((n for n in trees[0]["tree"] if n.get("name") == p), None)
                if cur is None:
                    break
            node = cur
    if node is None:
        return {"status": "not_found", "source": source, "path": path}
    content = node.get("content", "") or ""
    first_line = ""
    for line in content.splitlines():
        if line.strip():
            first_line = line.strip()
            break
    # 起始 chunk：候选依次匹配（标题最稳；正文首行可能被硬切跨块，先用短前缀再整行）
    chunk_index = None
    cands = [node.get("name", ""), first_line[:10], first_line]
    for c in cands:
        if not c:
            continue
        chunk_index = repo.find_chunk_index(project_id, source, c)
        if chunk_index is not None:
            break
    # 旧数据兜底：节点无 content（升级前上传）时按标题在 kb_vectors 找首块，用该块原文作正文
    if not content and chunk_index is not None:
        content = repo.get_kb_chunk(project_id, source, chunk_index) or ""
    return {"status": "ok", "source": source, "path": path, "name": node.get("name", ""),
            "content": content, "chunk_index": chunk_index}


def _strip_overlap(prev: str, cur: str, max_overlap: int = 60) -> str:
    """相邻向量块拼接时剥除重叠尾巴：取 prev 的最长后缀（≤60 字符）且为 cur 的前缀，
    从 cur 头部剥除后返回。无重叠时原样返回。"""
    if not prev or not cur:
        return cur
    m = min(len(prev), len(cur), max_overlap)
    for n in range(m, 0, -1):
        if prev[-n:] == cur[:n]:
            return cur[n:]
    return cur


@router.get("/api/kb/{project_id}/doc")
def kb_doc(project_id: str, source: str):
    """文档全文。优先级：
    1) resources 表原始全文（markdown 换行完好，origin="original"）——2026-08-21 起上传不再截断；
    2) 无原文或原文疑似残片（旧数据 6000 字符截断版，长度远小于重组版）时回退 kb_vectors
       按 chunk 序重组（origin="reassembled"），重组文本换行被切块器折叠，前端走清洗+折叠面板兜底；
    3) 两者皆无返回 not_found。"""
    import re as _re
    from core.db import get_kb_repo
    repo = get_kb_repo()
    rows = repo.get_kb_chunks(project_id, source)
    # 权威标题树：上传时从原文提取存于 kb_trees 表（重组内容换行被切块器折叠，不能按行提取）
    tree = repo.get_kb_tree(project_id, source) or []

    def _reassemble() -> str:
        parts = []
        prev = ""
        for r in rows:
            cur = r.get("content") or ""
            if prev:
                stripped = _strip_overlap(prev, cur)
                # 无重叠（如超长句截断边界）时以空格衔接，避免词语粘连
                parts.append(stripped if stripped != cur else " " + cur)
            else:
                parts.append(cur)
            prev = r.get("content") or ""
        joined = "".join(parts)
        # 换行恢复：切块器按句子折叠了换行，在 markdown 标题标记前补 \n，
        # 让渲染器产出正确 h1-h6 层级（阅读器左树点击定位依赖 DOM 标题元素）
        return _re.sub(r"(?<!\n)(#{1,6}\s)", r"\n\1", joined)

    reassembled = _reassemble() if rows else ""
    original = repo.get_resource_content(project_id, source) or ""
    # 原文优先：非空且不是明显残片（旧截断版长度远小于重组版）→ 直接返回原文
    if original and (not reassembled or len(original) * 10 >= len(reassembled)):
        return {"status": "ok", "source": source, "content": original, "tree": tree, "origin": "original"}
    if reassembled:
        return {"status": "ok", "source": source, "content": reassembled, "tree": tree, "origin": "reassembled"}
    return {"status": "not_found", "source": source}


@router.get("/api/kb/{project_id}/chunk-node")
def kb_chunk_node(project_id: str, source: str, chunk: int):
    """审核引用跳转（5.2）：chunk 序号 → 所属章节节点 path。
    标题级起始 chunk ≤ N 且为最大的节点即含 chunk N；无命中取首个有正文节点兜底。"""
    from core.db import get_kb_repo
    repo = get_kb_repo()
    trees = [t for t in repo.get_all_kb_trees(project_id) if t.get("source") == source]
    if not trees:
        return {"status": "not_found", "source": source}
    nodes: list = []

    def _name(n: dict) -> str:
        return str(n.get("name") or n.get("title") or "").strip()

    def walk(children, prefix):
        for n in children or []:
            nm = _name(n)
            if not nm:
                continue
            path = (prefix + "/" + nm).strip("/")
            nodes.append((path, n))
            walk(n.get("children") or [], path)

    walk(trees[0].get("tree") or [], "")
    if not nodes:
        return {"status": "not_found", "source": source}
    best_start = None
    best_path = None
    for path, n in nodes:
        try:
            ci = repo.find_chunk_index(project_id, source, _name(n))
        except Exception:
            ci = None
        if ci is not None and (best_start is None or ci > best_start):
            best_start = ci
            best_path = path
    target = best_path if best_start is not None and best_start <= chunk else None
    if target is None:
        for path, n in nodes:
            if n.get("content"):
                target = path
                break
    if target is None:
        target = nodes[0][0]
    return {"status": "ok", "source": source, "chunk": chunk, "path": target}


@router.post("/api/knowledge/upload")
async def knowledge_upload(req: KnowledgeUpload, wait: bool = False):
    _ch = hashlib.sha256((req.text or "").encode("utf-8")).hexdigest()
    if wait:
        from starlette.concurrency import run_in_threadpool
        # 修复①（F4′）：同步路径入库失败转结构化错误响应（含原因与「怎么办」），
        # 不再 chunks:0，也不靠全局 500 兜底（那里的 detail 是通用文案，原因丢失）。
        try:
            chunks = await run_in_threadpool(_process_upload, req.project_id, req.text, req.source, req.session_id, req.api_key, False, False, _ch)
        except Exception as e:
            logger.exception("同步入库失败 source=%s", req.source)
            return {"status": "error", "msg": "知识库入库失败：" + str(e)[:180], "source": req.source}
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": req.source, "msg": "内容已存在，已跳过重复入库"}
        return {"status": "ok", "chunks": chunks, "source": req.source}
    submit(_process_upload_bg, req.project_id, req.text, req.source, req.session_id, req.api_key, False, False, _ch)
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


class KnowledgeUrlUpload(BaseModel):
    project_id: str = "default"
    url: str = ""
    source: str = ""
    session_id: str = "default"
    api_key: str = ""
    # 上传范围控制（来自 /upload-url/probe 的结构预览勾选）
    include_groups: list[str] = []   # 目录/语言前缀白名单（空=不限制；无语言段内容不受影响）
    exclude_groups: list[str] = []   # 目录/语言前缀黑名单
    max_files: int | None = None     # 覆盖默认页数/文件数上限


class UrlProbe(BaseModel):
    url: str = ""


# ── 链接摄取端点（保留 · 前端入口已下线 2026-08-24，见 resource/linkIngest/README）──
@router.post("/api/knowledge/upload-url/probe")
async def knowledge_upload_url_probe(req: UrlProbe):
    """上传前轻量预扫描：只拉结构清单（GitHub 树 / sitemap），返回目录与语言分组
    及默认勾选建议，供前端展示「将摄取什么」并让用户裁剪范围。"""
    from urllib.parse import urlparse
    url = (req.url or "").strip().split("#")[0]
    if not url.startswith(("http://", "https://")):
        return {"status": "error", "msg": "链接格式不正确（需以 http:// 或 https:// 开头）"}
    host = (urlparse(url).hostname or "").strip()
    if not host or is_disallowed_host(host):
        return {"status": "error", "msg": "链接主机不可访问（私网/回环地址）"}
    import asyncio
    from services.web_fetch import probe_url

    try:
        return await asyncio.to_thread(probe_url, url)
    except Exception as e:
        logger.warning("链接预扫描失败 %s: %s", url, e)
        return {"status": "error",
                "msg": "无法识别该链接结构（站点不可访问或 GitHub 仓库不存在/私有）"}


@router.post("/api/knowledge/upload-url")
async def knowledge_upload_url(req: KnowledgeUrlUpload, wait: bool = False):
    """URL 结构化摄取：来源分类（GitHub 仓库 / 文档站·sitemap / 单页兜底）→
    多页结构化抓取 → 「站点(H1) → 页面(H2) → 页内标题」层级组装 → 现有入库管线。"""
    url = (req.url or "").strip().split("#")[0]
    if not url.startswith(("http://", "https://")):
        return {"status": "error", "msg": "链接格式不正确（需以 http:// 或 https:// 开头）"}
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").strip()
    if not host or is_disallowed_host(host):
        return {"status": "error", "msg": "链接主机不可访问（私网/回环地址）"}
    source = (req.source or "").strip() or url

    text = ""
    # 缓存键须包含范围选项指纹：同一 URL 不同勾选（如只要中文/只要某目录）是不同内容
    # v3：大纲去重修复后旧组装文本作废，强制重新抓取
    _opts_fp = json.dumps(
        {"i": sorted(set(req.include_groups)), "e": sorted(set(req.exclude_groups)),
         "m": req.max_files}, ensure_ascii=False, sort_keys=True)
    _cache_key = "v3|" + hashlib.sha1(_opts_fp.encode("utf-8")).hexdigest()[:10] + "|" + url
    try:
        import asyncio
        from core.db import get_kb_repo
        # 同步 SQLite 读必须离环，否则撞上写锁时整个事件循环停摆（busy_timeout 5s）
        _cached = await asyncio.to_thread(get_kb_repo().get_preset_doc, _cache_key)
        if _cached and (_cached.get("content") or "").strip():
            text = _cached["content"]
    except Exception:
        logger.debug("URL 摄取缓存读取失败（走重新抓取）", exc_info=True)

    page_count = 0
    if not text:
        import asyncio
        from services.web_fetch import (
            assemble_hierarchical,
            classify_url,
            derive_site_title,
            fetch_github_repo_pages,
            fetch_site_pages,
            parse_github_url,
        )

        def _build() -> tuple[str, int]:
            """阻塞 IO（多页并发抓取），线程池执行；返回 (组装后的层级 Markdown, 页数)。"""
            kind = classify_url(url)
            if kind == "github":
                owner, repo, _ref = parse_github_url(url)
                pages = fetch_github_repo_pages(
                    url, max_files=req.max_files,
                    include_groups=req.include_groups, exclude_groups=req.exclude_groups)
                site_title = f"{owner}/{repo}"
            else:
                pages = fetch_site_pages(
                    url, max_pages=req.max_files,
                    include_groups=req.include_groups, exclude_groups=req.exclude_groups)
                site_title = derive_site_title(url)
            return assemble_hierarchical(site_title, pages), len(pages)

        try:
            text, page_count = await asyncio.to_thread(_build)
            if len(text.strip()) >= 20:
                try:
                    from core.db import get_kb_repo as _g
                    _g().save_preset_doc(_cache_key, source, text)  # 全量缓存，不再截断
                except Exception:
                    logger.debug("URL 摄取缓存写入失败（不影响本次结果）", exc_info=True)
        except Exception as e:
            logger.warning("链接结构化摄取失败 %s: %s", url, e)
            return {"status": "error", "msg": "抓取链接失败（链接不可访问、站点需登录，或 GitHub 私有仓库不支持）"}
    if len(text.strip()) < 20:
        return {"status": "error", "msg": "链接内容过短或无法解析为文本"}
    logger.info("URL 摄取完成 url=%s pages=%s chars=%s", url, page_count or "缓存", len(text))
    if wait:
        from starlette.concurrency import run_in_threadpool
        _ch = hashlib.sha256(text.encode("utf-8")).hexdigest()
        try:
            chunks = await run_in_threadpool(
                _process_upload, req.project_id, text, source, req.session_id, req.api_key, True, True, _ch)
        except Exception as e:
            logger.exception("同步入库失败 source=%s", source)
            return {"status": "error", "msg": "知识库入库失败：" + str(e)[:180], "source": source}
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": source, "msg": "内容已存在，已跳过重复入库"}
        return {"status": "ok", "chunks": chunks, "source": source}
    _ch2 = hashlib.sha256(text.encode("utf-8")).hexdigest()
    submit(_process_upload_bg, req.project_id, text, source, req.session_id, req.api_key, True, True, _ch2)
    return {"status": "processing", "msg": f"正在处理（{page_count} 页），稍后刷新查看" if page_count else "正在处理，稍后刷新查看"}


# F3（N2-2）：图片扩展名唯一事实源 = _IMG_EXTS（图片分支判定集合，原先局部定义在
# knowledge_upload_file 内）。文档类扩展名单列一份，extensions / accept 均由两集合
# 派生——禁止手写第二份。N2-2 事故成因即清单漂移：处理链路支持图片，约束清单
# 却一张不收，前端 accept 动态取自约束端点 → 「点上传→选图片」被文件选择器拒收。
# 守卫：tests/test_f3_upload_constraints.py 断言 extensions/accept ⊇ _IMG_EXTS 且同步。
# 修复④（F4′，owner 拍板）：bmp 剔除不转码——上游 VL 服务只收 webp/png/jpeg/gif，
# 拒收 bmp（E-31）；F6 已挡聊天路径，此处同步剔除。注意 _process_file_bg 的图片分支
# 判定也已改为引用本集合（原第四份手写字面量，F3 漏归一）。
_DOC_EXTS = [".txt", ".md", ".markdown", ".py", ".js", ".ts", ".json", ".csv",
             ".html", ".css", ".log", ".yaml", ".yml",
             ".pdf", ".docx", ".pptx", ".xlsx", ".epub"]
_IMG_EXTS = {"png", "jpg", "jpeg", "gif", "webp"}
_UPLOAD_ALL_EXTS = _DOC_EXTS + ["." + e for e in sorted(_IMG_EXTS)]
# 支持格式单一事实源（对齐 DeepTutor SupportedFileTypesInfo）：前端 accept 与后端校验共用
UPLOAD_CONSTRAINTS = {
    "extensions": _UPLOAD_ALL_EXTS,
    "accept": ",".join(_UPLOAD_ALL_EXTS),
    "max_file_size_bytes": 50 * 1024 * 1024,
}


@router.get("/api/knowledge/upload-constraints")
def knowledge_upload_constraints():
    """上传约束（支持扩展名 / accept 串 / 大小上限），前端据此渲染 accept 与预校验。"""
    return UPLOAD_CONSTRAINTS


@router.get("/api/knowledge/upload-progress")
def knowledge_upload_progress(project_id: str, source: str):
    """后台摄取进度（done/total 内容块），供前端轮询展示。"""
    from core.knowledge_service import get_progress
    return get_progress(project_id, source)


@router.post("/api/knowledge/upload-file")
async def knowledge_upload_file(
    project_id: str = Form("default"),
    session_id: str = Form("default"),
    api_key: str = Form(""),
    wait: bool = Form(False),
    file: UploadFile = File(...),
):
    from starlette.concurrency import run_in_threadpool
    data = await file.read()
    # F3（N2-2）：入口白名单由 UPLOAD_CONSTRAINTS 派生——原先这里手写第三份扩展名清单
    # （文档 18 种 + 图片 6 种），与约束清单属同类漂移隐患，一并收编进单一事实源。
    _ALLOWED_EXTS = {x.lstrip(".") for x in UPLOAD_CONSTRAINTS["extensions"]}
    if len(data) > UPLOAD_CONSTRAINTS["max_file_size_bytes"]:
        return {"status": "error", "msg": "文件超过大小上限（50MB）"}
    _fname0 = file.filename or "file"
    _ext0 = _fname0.rsplit(".", 1)[-1].lower() if "." in _fname0 else ""
    if _ext0 and _ext0 not in _ALLOWED_EXTS:
        return {"status": "error",
                "msg": f"不支持的文件格式 .{_ext0}（支持：txt/md/pdf/docx/pptx/xlsx/epub 及常见文本、代码、图片文件）"}
    fname = file.filename or "file"
    # _IMG_EXTS 已上移模块级（F3）：此处局部定义是 N2-2 漂移事故的另一份手写清单，删除。
    _ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    # F1 修复：source 与内容 hash 提到分支外（两个分支共用）。
    # source 必须等于文件名——前端 UploadPanel 以文件名作为进度轮询键（pollProgress(it.name)）。
    source = fname
    _ch = hashlib.sha256(data).hexdigest()
    text = None  # 非图片后台模式保持 None：解析全部移交 _process_file_bg（F2）
    engine = ""  # F8-S2：解析引擎标注（仅同步路径在请求内解析时产生）
    if _ext in _IMG_EXTS:
        import base64 as _b64
        _b64str = _b64.b64encode(data).decode()
        try:
            # 视觉 LLM 是同步 HTTP 调用，必须离环执行（参照 DeepTutor #777 纪律）
            desc = await run_in_threadpool(
                _describe_image_main,
                _b64str,
                "请详细描述这张图片的内容，包括文字、图表、概念，用于知识库检索。",
                _IMG_MIME.get(_ext, "image/png"),
                api_key,
            )
        except Exception as e:
            logger.warning("图片描述失败 fname=%s", fname, exc_info=True)
            return {"status": "error", "msg": "图片描述失败：" + str(e)[:150]}
        # 入库文本统一为【图片内容】+desc（语义前缀利于检索；与 _process_file_bg 收到的
        # desc 实参同源，保证同步/后台两条路径入库文本逐字节一致）
        text = "【图片内容】" + desc
    elif wait:
        # F2 修复：仅同步路径（wait=1）在请求内解析；后台模式（wait=0，前端默认路径）把解析
        # 交还给 _process_file_bg——保证 HTTP 立即返回（对齐其 docstring）且全链只解析 1 次。
        # F1 重构曾把解析提到 wait 判定之外，导致 wait=0 阻塞响应 + 第一遍解析结果被丢弃。
        text, engine = await run_in_threadpool(_parse_for_upload, fname, data, _ext)
        if not text.strip():
            return {"status": "error", "msg": _unparsable_msg(_ext)}
    # F1 修复：统一尾部。此前图片分支走到这里即函数结束→隐式 return None（HTTP body 'null'），
    # 且 _process_file_bg/_store_image_vector 的图片逻辑全部不可达。
    if wait:
        # 修复①（F4′）：同步路径入库失败转结构化错误响应（含原因），不再 chunks:0 / 裸 500
        try:
            # F9-S1：同步文件路径同样传 PDF 原始字节（书签通道生效）；pdf_bytes 关键字传参
            # （keyword-only 形参——测试桩以 **kw 兼容，9 个位置实参会破坏既有 8 参桩）。
            chunks = await run_in_threadpool(
                _process_upload, project_id, text, source, session_id, api_key, False, False, _ch,
                pdf_bytes=(data if _ext == "pdf" else None))
        except Exception as e:
            logger.exception("同步入库失败 source=%s", source)
            return {"status": "error", "msg": "知识库入库失败：" + str(e)[:180], "source": source}
        if chunks == -1:
            return {"status": "ok", "chunks": 0, "duplicate": True, "source": source, "msg": "内容已存在，已跳过重复入库"}
        if _ext in _IMG_EXTS:
            # 同步路径图片向量只在这里入一次；重复上传（duplicate）已在上方提前返回，不重复入向量
            await run_in_threadpool(_store_image_vector, project_id, source, data, text, _ext)
        # F8-S2：上传响应带解析引擎（前端完成提示展示；非 PDF 为 markitdown/legacy）
        resp = {"status": "ok", "chunks": chunks, "source": source}
        if engine:
            resp["parse_engine"] = engine
        return resp
    # 后台模式（上传提速·单步2）：解析+入库全链进后台——HTTP 立即返回，进度走 /upload-progress。
    # 图片把【图片内容】+desc 作为 desc 实参传入，_process_file_bg 图片分支内部会调
    # _store_image_vector 恰好一次（此处不再单独 submit，避免重复入库/重复 VL 调用）。
    submit(_process_file_bg, project_id, fname, data, source, session_id, api_key, _ch, _ext,
           text if _ext in _IMG_EXTS else "")
    return {"status": "processing", "msg": "正在处理，稍后刷新查看"}


@router.get("/api/knowledge/list")
def knowledge_list(project_id: str = "default"):
    from core.knowledge_service import list_docs
    return {"docs": list_docs(project_id)}


@router.get("/api/knowledge/list-all")
def knowledge_list_all():
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
def kb_list(project_id: str):
    from core.knowledge_service import list_docs
    return list_docs(project_id)


@router.delete("/api/knowledge/delete")
def knowledge_delete(project_id: str = "default", source: str = ""):
    from core.knowledge_service import delete_doc
    n = delete_doc(project_id, source)
    return {"status": "ok", "deleted": n, "graph_relations": 0}


@router.post("/api/file-to-text")
async def file_to_text(file: UploadFile = File(...)):
    from core.file_parser import parse_file
    from starlette.concurrency import run_in_threadpool
    data = await file.read()
    text = await run_in_threadpool(parse_file, file.filename or "file", data)
    if not text.strip():
        return {"status": "error", "msg": "无法解析该文件内容"}
    return {"status": "ok", "text": text[:50000], "chars": len(text)}


@router.get("/api/knowledge/query")
async def knowledge_query(project_id: str = "default", q: str = "", top_k: int = 3):
    from starlette.concurrency import run_in_threadpool
    from core.knowledge_service import search
    return {"results": await run_in_threadpool(search, project_id, q, top_k)}
