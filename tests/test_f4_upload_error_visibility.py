# -*- coding: utf-8 -*-
"""Step F4′ 守卫：入库异常必须对用户可见（同步 + 后台两条路径）。

背景：knowledge.py `_process_upload` 曾在内部 catch add_document 异常、只写容器日志、
照常返回 0——外层 _process_file_bg 的 _set_progress_error 形同虚设，同步路径则返回
chunks:0。评委无 EMBEDDING_API_KEY 时完全看不到「去配 Key」的指引（A1 意图被抵消）。

本守卫（决策 18 范式：存在性守卫硬失败 + 属性守卫 skip 兜底，读盘一律 utf-8-sig）：
1. 行为断言：add_document 抛错时——
   - _process_upload 必须向外传播异常（后台文件链路依赖此传播）；
   - 同步 wait=1 三端点返回结构化错误（status:error + 原因含「怎么办」），不是 chunks:0；
   - 后台链路经 _process_file_bg / _process_upload_bg 落 _set_progress_error（轮询可见）。
2. 存在性断言：内吞模式（except 后只 logger.exception("知识库入库失败")）不得回归；
   submit 直投必须经 _process_upload_bg 包装。

打桩约定（同 test_f1_image_upload）：monkeypatch core.knowledge_service.add_document
（_process_upload 在调用时 `from core.knowledge_service import add_document`，
运行时解析模块属性，故 patch 生效）；core.db.get_kb_repo 换最小记录桩；
_save_resource_text 打桩避免触碰真实资源表。
"""
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

import core.db as core_db
import core.knowledge_service as ks
import routers.knowledge as kmod
from core.config import config as _cfg

PROJECT_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_PY = PROJECT_ROOT / "backend" / "routers" / "knowledge.py"

# 与 embeddings.py F5 硬失败文案保持一致（原因 / 后果 / 怎么办 三点）
NO_KEY_MSG = ("未配置 EMBEDDING_API_KEY，无法向量化，知识库检索不可用。"
              "请在设置界面填入硅基流动 Key（https://api.siliconflow.cn/v1），"
              "或在 .env 中设置 EMBEDDING_API_KEY=sk-... 后重试。")
PID = "f4e"


class _DedupRepo:
    """去重前置查询桩：_process_upload 在 add_document 之前会查 file_hashes /
    跨项目 donor，本桩一律返回「无重复、无 donor」，让流程走到 add_document 抛错。"""

    def __init__(self):
        self.hashes = []  # (project_id, content_hash, source)——断言失败路径不写 hash

    def has_file_hash(self, project_id, content_hash):
        return False

    def find_donor_by_hash(self, content_hash, project_id):
        return None

    def save_file_hash(self, project_id, content_hash, source):
        self.hashes.append((project_id, content_hash, source))


@pytest.fixture()
def f4e(monkeypatch):
    """入库必抛错环境：add_document → RuntimeError(F5 文案)；
    submit 捕获（同步执行），其余桩保证流程能走到 add_document。"""
    repo = _DedupRepo()
    monkeypatch.setattr(core_db, "get_kb_repo", lambda: repo)
    monkeypatch.setattr(kmod, "_save_resource_text", lambda pid, src, text: None)

    calls = {"n": 0}

    def _raise(*a, **k):
        calls["n"] += 1
        raise RuntimeError(NO_KEY_MSG)

    monkeypatch.setattr(ks, "add_document", _raise)

    subs = []
    monkeypatch.setattr(kmod, "submit", lambda fn, *a, **k: subs.append((fn, a, k)))

    app = FastAPI()
    app.include_router(kmod.router)
    client = TestClient(app)
    return SimpleNamespace(client=client, repo=repo, subs=subs, calls=calls)


# ══════════════ 1. 行为守卫：传播与可见性 ══════════════

def test_process_upload_must_propagate_ingest_failure(f4e):
    """【核心反退化】add_document 抛错时 _process_upload 必须外抛——
    后台文件链路（_process_file_bg 的 except → _set_progress_error）依赖此传播。
    若此处再次内吞返回 0，本条即红（修复①的核心回归点）。"""
    with pytest.raises(RuntimeError) as ei:
        kmod._process_upload(PID, "全文", "f4.txt", "s1", "", False, False, "")
    assert "EMBEDDING_API_KEY" in str(ei.value)
    assert f4e.calls["n"] == 1
    assert f4e.repo.hashes == [], "入库失败不得记录内容去重 hash（否则重传被误判重复）"


def test_sync_text_upload_returns_structured_error(f4e):
    """同步 wait=1 文本上传：失败必须返回结构化错误（含原因与「怎么办」），
    不是 chunks:0，也不是靠全局 500 兜底（那里 detail 是通用文案）。"""
    r = f4e.client.post("/api/knowledge/upload?wait=true",
                        json={"project_id": PID, "text": "F4 同步可见性验证文本",
                              "source": "f4sync.txt", "session_id": "s", "api_key": ""})
    assert r.status_code == 200, f"应按本路由错误约定返回 HTTP 200 + status:error，实际 {r.status_code}"
    d = r.json()
    assert d["status"] == "error", f"必须是结构化错误响应: {d!r}"
    assert "chunks" not in d, f"错误响应不得再伪装成 chunks 计数: {d!r}"
    assert "EMBEDDING_API_KEY" in d["msg"], f"错误须说明原因: {d.get('msg')!r}"
    assert "siliconflow.cn" in d["msg"], f"错误须给出「怎么办」: {d.get('msg')!r}"


def test_sync_file_upload_returns_structured_error(f4e):
    """同步 wait=1 文件上传（.txt 走真实轻量解析）：同上一条的可见性契约。"""
    r = f4e.client.post(
        "/api/knowledge/upload-file",
        data={"project_id": PID, "session_id": "s", "api_key": "", "wait": "1"},
        files={"file": ("f4file.txt", ("F4 文件路径可见性验证。" * 30).encode("utf-8"),
                        "text/plain")})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "error", f"必须是结构化错误响应: {d!r}"
    assert "EMBEDDING_API_KEY" in d["msg"] and "siliconflow.cn" in d["msg"], d.get("msg")
    assert d["source"] == "f4file.txt"


def test_bg_file_upload_progress_error_visible(f4e):
    """后台 wait=0 文件上传：_process_file_bg 捕获传播上来的异常后必须写
    _set_progress_error——前端按文件名轮询能拿到失败原因（验收项 2）。"""
    r = f4e.client.post(
        "/api/knowledge/upload-file",
        data={"project_id": PID, "session_id": "s", "api_key": "", "wait": "0"},
        files={"file": ("f4bg.txt", ("F4 后台可见性验证。" * 30).encode("utf-8"),
                        "text/plain")})
    assert r.json()["status"] == "processing"
    assert len(f4e.subs) == 1 and f4e.subs[0][0] is kmod._process_file_bg
    fn, args, kwargs = f4e.subs[0]
    fn(*args, **kwargs)
    prog = ks.get_progress(PID, "f4bg.txt")
    assert prog["status"] == "error", f"后台失败必须落错误终态: {prog}"
    assert "EMBEDDING_API_KEY" in prog["msg"], f"进度错误须含原因: {prog['msg']!r}"
    assert "siliconflow.cn" in prog["msg"], f"进度错误须含「怎么办」: {prog['msg']!r}"
    # 轮询端点（前端真正打的一个）同样能看到
    rp = f4e.client.get(f"/api/knowledge/upload-progress?project_id={PID}&source=f4bg.txt")
    assert rp.json()["status"] == "error" and "EMBEDDING_API_KEY" in rp.json()["msg"]


def test_bg_text_upload_progress_error_visible(f4e):
    """后台文本上传（submit 直投路径）：必须经 _process_upload_bg 包装——
    background.submit 只把异常记日志，若无包装则轮询端永远 status:none。"""
    r = f4e.client.post("/api/knowledge/upload",
                        json={"project_id": PID, "text": "F4 后台文本可见性验证",
                              "source": "f4bgtxt.txt", "session_id": "s", "api_key": ""})
    assert r.json()["status"] == "processing"
    assert len(f4e.subs) == 1, "wait=0 必须提交后台任务"
    fn, args, kwargs = f4e.subs[0]
    assert fn is kmod._process_upload_bg, (
        f"submit 直投必须是 _process_upload_bg（含错误终态包装），实际 {fn}")
    fn(*args, **kwargs)
    prog = ks.get_progress(PID, "f4bgtxt.txt")
    assert prog["status"] == "error", f"直投路径失败必须落错误终态: {prog}"
    assert "EMBEDDING_API_KEY" in prog["msg"] and "siliconflow.cn" in prog["msg"]


# ══════════════ 2. 存在性守卫：结构不得退化 ══════════════

def test_inner_swallow_pattern_must_stay_removed():
    """存在性守卫：`except Exception: logger.exception("知识库入库失败")` 这一
    内吞签名不得回归（N2-2 同款清单漂移教训：行为会被无害化重构悄悄抹掉）。"""
    src = KNOWLEDGE_PY.read_text(encoding="utf-8-sig")
    assert not re.search(r'except Exception:\s*\n\s*logger\.exception\("知识库入库失败', src), (
        "knowledge.py _process_upload 内层吞错模式回归——add_document 失败再次只进日志，"
        "外层 _set_progress_error 与同步错误响应全部失效（F4′修复①被撤销）"
    )


def test_submit_sites_must_use_error_reporting_wrapper():
    """存在性守卫：文本/URL 两处 submit 直投必须经 _process_upload_bg（错误终态包装），
    不得退回直投裸 _process_upload（background.submit 只记日志，轮询端看不到失败）。"""
    src = KNOWLEDGE_PY.read_text(encoding="utf-8-sig")
    assert hasattr(kmod, "_process_upload_bg"), "_process_upload_bg 包装函数被删除"
    n_wrapped = len(re.findall(r"submit\(_process_upload_bg,", src))
    n_raw = len(re.findall(r"submit\(_process_upload,", src))
    assert n_wrapped == 2 and n_raw == 0, (
        f"submit 直投点异常：包装 {n_wrapped} 处 / 裸投 {n_raw} 处（应为 2/0）——"
        "后台文本/URL 路径的失败将重新变得不可见"
    )


def test_sync_routes_must_convert_ingest_failure_to_structured_error():
    """存在性守卫：3 个同步 wait=1 调用点必须各自保留结构化错误响应转换
    （status:error + 原因），防止未来重构把异常直接漏给全局 500 兜底。"""
    src = KNOWLEDGE_PY.read_text(encoding="utf-8-sig")
    n = len(re.findall(r'\{"status": "error", "msg": "知识库入库失败："', src))
    assert n == 3, (
        f"同步入库失败 → 结构化错误响应的转换点应恰 3 处（文本/URL/文件），实际 {n} 处"
    )