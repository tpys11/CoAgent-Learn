# -*- coding: utf-8 -*-
"""F13-S1 系统预设资源库：目录扫描 → 领域→资源→文件三级索引 + 元数据（服务层，无 FastAPI 依赖）。

目录约定：data/preset_library/<领域>/<资源>/(<资源文件夹>/)*文件
- 领域根下的散文件：每文件一资源，资源名 = 文件名去扩展；
- 领域下的子目录：目录即资源文件夹（一个完整资源），内含文件各自可独立摄取；
- owner 未来更深的嵌套按「直接含文件的目录」继续切分资源，路径一律归一为 posix
  相对路径（rel_path），Windows 反斜杠不入库不入索引。

元数据落 preset_meta 旁表（rel_path 主键）：页数 pypdf 扫描时补算缓存（只读 xref，
大文件秒级）；出版社/初版时间/封面图 = owner 明示的可编辑占位字段。
"""
import logging
import os
from urllib.parse import quote

from core.db.base import DATA_DIR, get_db

logger = logging.getLogger("coagent.preset")

PRESET_DIR = os.path.join(DATA_DIR, "preset_library")


def _pdf_pages(path: str):
    """pypdf 页数；解析失败 = 质量降级（页数留空）而非主流程故障，警告可见后返回 None。"""
    try:
        from pypdf import PdfReader  # 惰性导入：扫描不触发时零开销
        return len(PdfReader(path).pages)
    except Exception:
        logger.warning("预设 PDF 页数解析失败（列表不受影响）: %s", path, exc_info=True)
        return None


def _load_meta(db) -> dict:
    """rel_path → 元数据行（pages/publisher/pub_year/cover）。"""
    rows = db.execute("SELECT rel_path, pages, publisher, pub_year, cover FROM preset_meta")
    return {r["rel_path"]: r for r in rows}


def _abs_path(rel_path: str) -> str:
    return os.path.join(PRESET_DIR, *rel_path.split("/"))


def _mk_file(rel_path: str, meta: dict) -> dict:
    name = rel_path.rsplit("/", 1)[-1]
    ext = os.path.splitext(name)[1].lstrip(".").lower()
    try:
        size = os.path.getsize(_abs_path(rel_path))
    except OSError:
        size = 0
    m = meta.get(rel_path) or {}
    return {
        "name": name,
        "rel_path": rel_path,
        "ext": ext,
        "size": size,
        "pages": m.get("pages"),
        # 原始文件 URL：/preset-library 静态挂载（main.py 与 /uploads 同模式）
        "url": "/preset-library/" + quote(rel_path),
    }


def _mk_resource(domain: str, rel_key: str, files: list, name: str, meta: dict) -> dict:
    prefix = domain + "/" + rel_key + "/" if rel_key else domain + "/"
    fouts = [_mk_file(prefix + f, meta) for f in files]
    # 可编辑占位字段挂在资源级：取该资源首个文件的元数据行（多文件资源共享一套占位）
    head = meta.get(fouts[0]["rel_path"]) or {} if fouts else {}
    # 资源 id：文件夹资源 = 领域/资源文件夹；散文件资源 = 文件 rel_path（均稳定唯一）
    return {
        "id": (domain + "/" + rel_key) if rel_key else (fouts[0]["rel_path"] if fouts else domain),
        "name": name,
        "files": fouts,
        "publisher": head.get("publisher") or "",
        "pub_year": head.get("pub_year") or "",
        "cover": head.get("cover") or "",
    }


def _scan_domain(domain: str, dpath: str, meta: dict) -> dict:
    """单领域扫描：按「直接含文件的目录」切资源；领域根散文件每文件一资源。"""
    groups: dict = {}
    for root, dirs, files in os.walk(dpath):
        dirs.sort()  # 稳定顺序（嵌入排序保证清单确定性）
        rel = os.path.relpath(root, dpath).replace("\\", "/")
        rel_key = "" if rel == "." else rel
        for f in sorted(files):
            groups.setdefault(rel_key, []).append(f)
    resources = []
    for rel_key in sorted(groups):
        files = groups[rel_key]
        if rel_key == "":
            for f in files:
                resources.append(_mk_resource(
                    domain, "", [f], os.path.splitext(f)[0], meta))
        else:
            resources.append(_mk_resource(
                domain, rel_key, files, rel_key.rsplit("/", 1)[-1], meta))
    return {"name": domain, "resources": resources}


def _iter_files(domains: list):
    for d in domains:
        for r in d["resources"]:
            for f in r["files"]:
                yield f


def _ensure_pages(db, meta: dict, domains: list):
    """页数补算：只算缓存缺失的 PDF（新增文件落卷后首次扫描补齐，之后走表缓存）。"""
    for f in _iter_files(domains):
        if f["ext"] != "pdf" or f["pages"] is not None:
            continue
        pages = _pdf_pages(_abs_path(f["rel_path"]))
        db.execute(
            "INSERT INTO preset_meta(rel_path, pages) VALUES (?,?) "
            "ON CONFLICT(rel_path) DO UPDATE SET pages=excluded.pages, updated_at=datetime('now')",
            (f["rel_path"], pages))
        meta[f["rel_path"]] = {"pages": pages, "publisher": "", "pub_year": "", "cover": ""}
        f["pages"] = pages  # 回填本次响应：否则首扫（表缓存尚未建立）页数恒空一次


def scan_preset_library() -> dict:
    """扫描预设库目录 → 三级索引。目录缺失/为空 = 优雅降级返回空清单（fresh clone 有 3 文件，
    临时栈全量卷均可）；DB 不可用时不阻断列表（页数留空）。"""
    try:
        db = get_db()
        meta = _load_meta(db)
    except Exception:
        logger.warning("预设库元数据表不可用（页数/占位字段留空）", exc_info=True)
        db, meta = None, {}
    domains = []
    if os.path.isdir(PRESET_DIR):
        for name in sorted(os.listdir(PRESET_DIR)):
            dpath = os.path.join(PRESET_DIR, name)
            if os.path.isdir(dpath):
                domains.append(_scan_domain(name, dpath, meta))
    if db is not None:
        _ensure_pages(db, meta, domains)
    return {"status": "ok", "domains": domains}


def update_meta(rel_path: str, publisher: str, pub_year: str, cover: str) -> dict:
    """占位元数据编辑（出版社/初版时间/封面）。结构化错误：原因/后果/怎么办。"""
    rel_path = (rel_path or "").replace("\\", "/").strip()
    if not rel_path:
        return {"status": "error",
                "msg": "缺少 rel_path（原因：请求未带资源标识）。后果：元数据未保存。怎么办：刷新页面后重试。"}
    # 边界校验：只允许编辑当前扫描可见的文件，防止向旁表写任意键
    scan = scan_preset_library()
    known = {f["rel_path"] for d in scan.get("domains", [])
             for r in d.get("resources", []) for f in r.get("files", [])}
    if rel_path not in known:
        return {"status": "error",
                "msg": f"资源不存在：{rel_path}（原因：预设库当前扫描无此文件）。"
                       "后果：元数据未保存。怎么办：确认文件在 data/preset_library 下后重试。"}
    get_db().execute(
        "INSERT INTO preset_meta(rel_path, publisher, pub_year, cover) VALUES (?,?,?,?) "
        "ON CONFLICT(rel_path) DO UPDATE SET publisher=excluded.publisher, pub_year=excluded.pub_year, "
        "cover=excluded.cover, updated_at=datetime('now')",
        (rel_path, publisher or "", pub_year or "", cover or ""))
    return {"status": "ok"}
