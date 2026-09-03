# -*- coding: utf-8 -*-
"""Step F1：知识库图片上传链路守卫测试（TDD，先红后绿）。

缺陷基线（修复前实测，2026-08-29，打桩探针见 F1 交接文档）：
- 上传 PNG（wait=0/1）→ HTTP 200，body='null'（图片分支走完原 :513-528 后无 return，
  控制流落空隐式返回 None）
- data/uploads/ 无新增文件；知识库无记录；图片向量 0 条；file_hashes 无记录
- /api/knowledge/upload-progress?source=<文件名> → {"status":"none"}（前端按文件名
  轮询，10 分钟超时后报「处理失败或超时」）
- 根因：_process_file_bg / _store_image_vector 的图片逻辑从不可达（唯一调用点
  位于非图片 else 分支内，且被恒假条件守卫）

打桩约定（复现必读）：
1) 视觉 LLM：monkeypatch routers.knowledge._describe_image_main → 固定串「测试图片描述」
   （避免真实费用与联网；HTTP 层仍走真实路由 TestClient）
2) 文本 embedding：monkeypatch core.knowledge_service._embed → 4 维伪向量
3) VL 图片 embedding：monkeypatch core.knowledge_service.embed_vl_images → 8 维伪向量、
   core.knowledge_service._vl_key → 非空（否则 add_image 无 key 时直接跳过不入库）
4) KB 仓储：monkeypatch core.knowledge_service._db 与 core.db.get_kb_repo → _RecRepo 记录桩
5) PDF 解析：monkeypatch core.parse_service.parse_document（宿主 .venv 无 pymupdf4llm，
   与 test_upload_progress 同款约定；容器镜像内为真实解析）
6) 后台执行：monkeypatch routers.knowledge.submit → 捕获 (fn, args, kwargs)，测试内同步执行
7) 落盘目录：monkeypatch core.db.base.DATA_DIR → tmp_path（_store_image_vector 调用时才
   from core.db.base import DATA_DIR，故运行时读到 patch 后的值）
"""
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

import core.db as core_db
import core.db.base
import core.knowledge_service as ks
import core.parse_service as ps
import routers.knowledge as kmod
from core.config import config as _cfg

DESC_STUB = "测试图片描述"
PREFIX = "【图片内容】"


def _make_png(w=8, h=8):
    """程序生成最小合法 PNG（不向仓库提交二进制 fixture）。"""
    import struct
    import zlib

    def chunk(tag, payload):
        return (struct.pack(">I", len(payload)) + tag + payload
                + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))

    raw = b"".join(b"\x00" + (b"\x30\xc0\xf0" * w) for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b""))


class _RecRepo:
    """记录型 KB 仓储桩：录制 upsert 结果供断言（duck-type _process_upload /
    add_document / add_image / list_docs 实际触达的方法面）。"""

    def __init__(self):
        self.text_rows = []    # (project_id, source, chunk_idx, content)
        self.image_rows = []   # (doc_id, project_id, source, description, file_path, mime)
        self.resources = []    # (project_id, name)
        self.file_hashes = []  # (project_id, content_hash, source) —— 与真实仓储同语义

    # ---- add_document / _process_upload 面 ----
    def resolve_active_text_table(self):
        return "kb_vectors"

    def peek_active_text_table(self):
        return "kb_vectors"

    def delete_kb_by_source(self, project_id, source):
        return 0

    def ensure_vector_dim(self, table, dim=None):
        pass

    def upsert_kb_vectors_bulk(self, bulk, table=None):
        for (_uid, pid, src, idx, _sid, _has_ctx, content, _emb) in bulk:
            self.text_rows.append((pid, src, idx, content))

    def upsert_kb_tree(self, project_id, source, tree):
        pass

    def save_file_hash(self, project_id, content_hash, source):
        self.file_hashes.append((project_id, content_hash, source))

    def has_file_hash(self, project_id, content_hash):
        return any(p == project_id and h == content_hash
                   for (p, h, _s) in self.file_hashes)

    def get_file_hash_source(self, project_id, content_hash):
        for (p, h, s) in self.file_hashes:
            if p == project_id and h == content_hash:
                return s
        return ""

    def count_kb_by_source(self, project_id, source):
        return sum(1 for (p, src, _i, _c) in self.text_rows if p == project_id and src == source)

    def find_donor_by_hash(self, content_hash, project_id):
        return None

    # ---- add_image 面 ----
    def upsert_image_vectors_bulk(self, rows):
        for (doc_id, pid, src, desc, fpath, mime, _vec) in rows:
            self.image_rows.append((doc_id, pid, src, desc, fpath, mime))

    def get_image_docs(self, project_id):
        return [{"source": src} for (_d, p, src, _de, _f, _m) in self.image_rows if p == project_id]

    # ---- list_docs 面 ----
    def get_resources(self, project_id):
        return [{"name": name, "type": "text"} for (p, name) in self.resources if p == project_id]

    def get_kb_docs(self, project_id, table=None):
        return [{"doc_id": f"d{i}", "source": src, "content": c}
                for i, (p, src, _idx, c) in enumerate(self.text_rows) if p == project_id]

    def get_kb_tree(self, project_id, source):
        return []


@pytest.fixture()
def f1(tmp_path, monkeypatch):
    rec = _RecRepo()
    monkeypatch.setattr(kmod, "_describe_image_main",
                        lambda b64, prompt, mime, api_key="": DESC_STUB)
    monkeypatch.setattr(core_db, "get_kb_repo", lambda: rec)
    monkeypatch.setattr(ks, "_db", rec)
    monkeypatch.setattr(ks, "_embed", lambda chunks: [[0.0] * 4 for _ in chunks])
    monkeypatch.setattr(ks, "_invalidate_bm25", lambda pid: None)
    monkeypatch.setattr(ks, "_vl_key", lambda: "stub-vl-key")
    monkeypatch.setattr(ks, "embed_vl_images", lambda uris: [[0.0] * 8 for _ in uris])
    monkeypatch.setattr(ps, "parse_document",
                        lambda fname, data: ("F1 PDF 控制组内容。" + "控制组文本" * 40, "stub"))
    monkeypatch.setattr(kmod, "_save_resource_text",
                        lambda pid, src, text: rec.resources.append((pid, src)))
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    monkeypatch.setattr(_cfg, "KB_KG_EDGES", 0)
    monkeypatch.setattr(_cfg, "KB_MODE", "full")
    monkeypatch.setattr(core.db.base, "DATA_DIR", str(tmp_path))
    subs = []
    monkeypatch.setattr(kmod, "submit", lambda fn, *a, **k: subs.append((fn, a, k)))

    app = FastAPI()
    app.include_router(kmod.router)
    client = TestClient(app)
    return SimpleNamespace(client=client, rec=rec, subs=subs, tmp=tmp_path)


def _upload(env, name, data, mime, wait="0", pid="f1p"):
    return env.client.post(
        "/api/knowledge/upload-file",
        data={"project_id": pid, "session_id": "s", "api_key": "", "wait": wait},
        files={"file": (name, data, mime)})


def _run_bg(env):
    """同步执行捕获到的后台任务（真实 _process_file_bg 全链）。"""
    assert env.subs, "后台模式必须提交后台任务"
    assert len(env.subs) == 1, f"后台任务应恰好提交 1 个，实际 {len(env.subs)}"
    fn, args, kwargs = env.subs[0]
    assert fn is kmod._process_file_bg
    fn(*args, **kwargs)


# ── 1. 响应是 JSON 对象且含 status（缺陷：隐式 return None → body 'null'）──
def test_upload_png_returns_json_object_with_status(f1):
    r = _upload(f1, "photo.png", _make_png(), "image/png", wait="0")
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d, dict), f"响应必须是 JSON 对象，实际: {d!r}"
    assert "status" in d


# ── 2. 后台模式：status=processing 且确实提交后台任务（缺陷：图片分支无 submit）──
def test_bg_mode_returns_processing_and_submits_task(f1):
    r = _upload(f1, "photo.png", _make_png(), "image/png", wait="0")
    d = r.json()
    assert d["status"] == "processing"
    assert len(f1.subs) == 1 and f1.subs[0][0] is kmod._process_file_bg


# ── 3. 后台任务执行后：知识库有该条记录（文本索引）──
def test_bg_task_ingests_text_index(f1):
    _upload(f1, "photo.png", _make_png(), "image/png", wait="0")
    _run_bg(f1)
    docs = ks.list_docs("f1p")
    hit = [d for d in docs if d["source"] == "photo.png"]
    assert hit and hit[0]["chunks"] >= 1, f"知识库列表应出现 photo.png: {docs}"
    assert any(pid == "f1p" and src == "photo.png" and content == PREFIX + DESC_STUB
               for (pid, src, _idx, content) in f1.rec.text_rows)


# ── 4. 后台任务执行后：data/uploads 有该文件 + 图片向量已入库（仅一次）──
def test_bg_task_writes_file_and_image_vector_once(f1):
    _upload(f1, "photo.png", _make_png(), "image/png", wait="0")
    _run_bg(f1)
    updir = f1.tmp / "uploads"
    files = [p for p in updir.iterdir() if p.is_file()]
    assert len(files) == 1 and files[0].suffix == ".png", f"uploads 应恰好落盘 1 张: {files}"
    assert len(f1.rec.image_rows) == 1, f"图片向量应恰好入库 1 条: {f1.rec.image_rows}"
    (doc_id, pid, src, desc, fpath, mime) = f1.rec.image_rows[0]
    assert pid == "f1p" and src == "photo.png" and mime == "image/png"
    assert files[0].stem == doc_id, "落盘文件名应与向量 doc_id 一致（/uploads 回显依赖）"
    assert fpath == "/uploads/" + files[0].name


# ── 5. source 等于上传时的文件名（前端轮询键一致，否则进度条永远走不完）──
def test_source_equals_uploaded_filename(f1):
    name = "我的图片.png"
    r = _upload(f1, name, _make_png(), "image/png", wait="0")
    assert r.json()["status"] == "processing"
    fn, args, _kw = f1.subs[0]
    # _process_file_bg(project_id, fname, data, source, ...) → 第 4 位是 source
    assert args[3] == name, f"submit 的 source 应等于上传文件名: {args[3]!r}"
    fn(*args)
    prog = ks.get_progress("f1p", name)
    assert prog["status"] == "ok", f"按文件名轮询进度应命中: {prog}"


# ── 6. 同步模式 wait=1：status 为 ok/duplicate，chunks 为整数，且不走后台 ──
def test_sync_wait1_returns_ok_with_chunks(f1):
    r = _upload(f1, "photo.png", _make_png(), "image/png", wait="1")
    d = r.json()
    assert isinstance(d, dict), f"同步模式响应必须是 JSON 对象: {d!r}"
    assert d["status"] in ("ok", "duplicate")
    assert isinstance(d["chunks"], int)
    assert d["source"] == "photo.png"
    assert f1.subs == [], "同步模式不得提交后台任务"
    assert len(f1.rec.image_rows) == 1, "同步模式图片向量应恰好入库 1 条"


# ── 7. 前后台入库文本一致（统一为【图片内容】+desc）──
def test_text_consistent_between_bg_and_sync(f1):
    _upload(f1, "a_bg.png", _make_png(w=8), "image/png", wait="0")
    _run_bg(f1)
    _upload(f1, "b_sync.png", _make_png(w=9), "image/png", wait="1")   # 不同字节，避开内容去重
    texts = {(src): content for (_p, src, _i, content) in f1.rec.text_rows}
    assert texts["a_bg.png"] == PREFIX + DESC_STUB
    assert texts["b_sync.png"] == PREFIX + DESC_STUB
    descs = {src: desc for (_d, _p, src, desc, _f, _m) in f1.rec.image_rows}
    assert descs["a_bg.png"] == descs["b_sync.png"] == PREFIX + DESC_STUB


# ── 8. 对照组：PDF 行为不变（本条预期修复前即为绿——回归控制，不参与先红后绿）──
def test_pdf_control_unchanged(f1):
    r1 = _upload(f1, "ctrl1.pdf", b"%PDF-1.4 stub-one", "application/pdf", wait="1")
    d1 = r1.json()
    assert d1["status"] == "ok" and isinstance(d1["chunks"], int) and d1["chunks"] >= 1
    assert d1["source"] == "ctrl1.pdf"
    r2 = _upload(f1, "ctrl2.pdf", b"%PDF-1.4 stub-two", "application/pdf", wait="0")  # 不同字节
    assert r2.json()["status"] == "processing"
    _run_bg(f1)
    docs = {d["source"]: d["chunks"] for d in ks.list_docs("f1p")}
    assert docs.get("ctrl1.pdf", 0) >= 1 and docs.get("ctrl2.pdf", 0) >= 1
    assert f1.rec.image_rows == [], "PDF 不得触发图片向量链路"


# ── 9. 后台模式重复上传同内容：进度必须落到完成终态（T16/E2E 实测发现的悬挂缺陷），
#      且不再重复入图片向量（与同步路径 duplicate 语义对齐）──
def test_bg_duplicate_upload_reaches_terminal_progress(f1):
    png = _make_png()
    _upload(f1, "dup.png", png, "image/png", wait="0")
    fn, args, kw = f1.subs.pop(0)
    fn(*args, **kw)                                  # 首次入库
    first_rows = list(f1.rec.image_rows)
    _upload(f1, "dup2.png", png, "image/png", wait="0")   # 同字节 → 同 sha256 → 去重
    fn, args, kw = f1.subs.pop(0)
    fn(*args, **kw)                                  # 重复内容
    prog = ks.get_progress("f1p", "dup2.png")
    assert prog["status"] == "ok" and prog["stage"] == "enhancing", \
        f"重复上传后进度必须到达完成终态（否则前端轮询悬挂 10 分钟）: {prog}"
    assert len(f1.rec.image_rows) == len(first_rows), "重复内容不得再次入图片向量"


# ══════════════ Step F2：非图片上传解析回归 + 重复上传进度终态（TDD，先红后绿）══════════════
# F2 打桩约定：在 routers.knowledge 命名空间给 _parse_for_upload 套计数 spy——
# knowledge_upload_file 的 run_in_threadpool(_parse_for_upload, ...) 与
# _process_file_bg 内的裸调用都在执行时查模块全局名，故 monkeypatch 能同时计数到
# 「请求内解析」与「后台解析」。parse_document 已由 f1 fixture 打桩（瞬间返回），
# spy 包装的 _parse_for_upload 不引入真实耗时。F2-3/F2-4 是回归控制断言
# （同 F1 第 8 条定位：预期修复前即为绿，不参与先红后绿）。


def _spy_parse(monkeypatch):
    """给 kmod._parse_for_upload 套计数 spy，返回调用记录列表（收 fname）。"""
    real = kmod._parse_for_upload
    calls: list = []

    def _spy(fname, data, ext):
        calls.append(fname)
        return real(fname, data, ext)

    monkeypatch.setattr(kmod, "_parse_for_upload", _spy)
    return calls


# ── F2-1【核心·先红】非图片 wait=0：HTTP 响应内不得解析（F1 重构引入的阻塞回归）──
def test_f2_nonimage_bg_no_parse_in_request(f1, monkeypatch):
    calls = _spy_parse(monkeypatch)
    r = _upload(f1, "f2_bg.pdf", b"%PDF-1.4 f2-bg", "application/pdf", wait="0")
    assert r.status_code == 200
    assert r.json()["status"] == "processing"
    assert calls == [], (
        f"wait=0 后台模式下 HTTP 响应内不得调用 _parse_for_upload（解析必须移出请求）: {calls}"
    )


# ── F2-2【核心·先红】非图片 wait=0：后台恰好解析 1 次（F1 重构引入的双解析回归）──
def test_f2_nonimage_bg_parses_exactly_once(f1, monkeypatch):
    calls = _spy_parse(monkeypatch)
    r = _upload(f1, "f2_once.pdf", b"%PDF-1.4 f2-once", "application/pdf", wait="0")
    assert r.json()["status"] == "processing"
    _run_bg(f1)
    assert calls == ["f2_once.pdf"], (
        f"整个上传链路（请求内+后台）应恰好解析 1 次，实际 {len(calls)} 次: {calls}"
    )


# ── F2-3【回归控制·预期两段皆绿】非图片 wait=1：同步路径在请求内恰好解析 1 次 ──
def test_f2_nonimage_sync_parses_once(f1, monkeypatch):
    calls = _spy_parse(monkeypatch)
    r = _upload(f1, "f2_sync.pdf", b"%PDF-1.4 f2-sync", "application/pdf", wait="1")
    d = r.json()
    assert d["status"] == "ok" and isinstance(d["chunks"], int) and d["chunks"] >= 1
    assert calls == ["f2_sync.pdf"], f"同步模式应恰好解析 1 次: {calls}"


# ── F2-4【回归控制·预期两段皆绿】图片任意 wait 模式从不调用文本解析（防误伤）──
def test_f2_image_never_calls_text_parse(f1, monkeypatch):
    calls = _spy_parse(monkeypatch)
    _upload(f1, "f2a.png", _make_png(), "image/png", wait="0")
    _run_bg(f1)
    _upload(f1, "f2b.png", _make_png(w=9), "image/png", wait="1")
    assert calls == [], f"图片路径不得调用文本解析: {calls}"


# ── F2-5【核心·先红】非图片重复上传（同内容不同文件名）：后台去重命中后进度落完成终态，
#      镜像 F1 对图片分支的修复（缺陷②）──
def test_f2_nonimage_duplicate_reaches_terminal_progress(f1):
    pdf = b"%PDF-1.4 f2-dup-content"
    _upload(f1, "f2d1.pdf", pdf, "application/pdf", wait="0")
    fn, args, kw = f1.subs.pop(0)
    fn(*args, **kw)                                    # 首次入库
    _upload(f1, "f2d2.pdf", pdf, "application/pdf", wait="0")   # 同字节 → 同 sha256 → 去重
    fn, args, kw = f1.subs.pop(0)
    fn(*args, **kw)
    prog = ks.get_progress("f1p", "f2d2.pdf")
    assert prog["status"] == "ok" and prog["stage"] == "enhancing", (
        f"非图片重复上传后进度必须到达完成终态（否则前端按文件名轮询悬挂 10 分钟）: {prog}"
    )
