# -*- coding: utf-8 -*-
"""F13-S1 预设资源库守卫：E-25 数据边界（preset_library 已跟踪 / data/app.db 仍被忽略 /
dockerignore 排除）+ 三级索引扫描行为（真实入库文件 + 嵌套健壮性）+ 元数据往返 + 装配冒烟。

T33：core/services/main 一律延迟到执行期导入，避免 collection 期 load_dotenv 污染。
"""
import os
import subprocess

import pytest

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# 入库清单 3 文件（owner 08-31 圈定，docs/dispatch/step-F13.md S1）
EXPECTED_TRACKED = [
    "data/preset_library/ai原理与应用简述/AI 编程学习路线（鱼皮）.md",
    "data/preset_library/ai工程与应用/AI-Agents-books（李博杰）/引言＋基础知识（1-4章）.pdf",
    "data/preset_library/线性代数/线性代数讲义_武汉大学_马涛.pdf",
]


def _git(*args) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-c", "core.quotepath=false", *args],
        cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8")


# ---------- E-25 数据边界守卫（存在性守卫，硬失败） ----------

def test_f13_preset_files_tracked_and_on_disk():
    """入库清单 3 文件必须已被 git 跟踪且实体在盘——预设库数据边界的第一半。"""
    out = _git("ls-files", "--", "data/preset_library").stdout.splitlines()
    tracked = {line.strip() for line in out if line.strip()}
    for rel in EXPECTED_TRACKED:
        assert rel in tracked, f"预设库文件未入库（git ls-files 缺失）: {rel}"
        p = os.path.join(REPO_ROOT, rel.replace("/", os.sep))
        assert os.path.isfile(p), f"清单文件不在盘: {rel}"
        assert os.path.getsize(p) > 0, f"清单文件为空: {rel}"


def test_f13_app_db_still_ignored():
    """E-25 边界第二半：data/app.db 必须仍被 gitignore（数据库永不入库）。"""
    r = _git("check-ignore", "-v", "data/app.db")
    assert r.returncode == 0, f"data/app.db 不再被忽略（gitignore 边界漂移）: {r.stdout!r}"


def test_f13_preset_library_not_ignored():
    """反向边界：入库的 3 文件必须不被任何 gitignore 规则误伤（否则 fresh clone 缺资源）。"""
    for rel in EXPECTED_TRACKED:
        r = _git("check-ignore", "-v", rel)
        assert r.returncode != 0, f"预设库文件被 gitignore 误伤: {rel} -> {r.stdout!r}"


def test_f13_dockerignore_excludes_preset_library():
    """108MB 不进镜像的上下文闸门：.dockerignore 必须排除 data/preset_library/。"""
    with open(os.path.join(REPO_ROOT, ".dockerignore"), "r", encoding="utf-8-sig") as f:
        lines = {line.strip() for line in f if line.strip() and not line.startswith("#")}
    assert "data/preset_library/" in lines, ".dockerignore 缺 data/preset_library/ 排除行"


# ---------- 三级索引扫描行为（真实入库文件） ----------

def _scan_with_tmp_db(monkeypatch, tmp_path):
    """扫描走临时库：页数缓存写入 tmp，不触碰真实 data/app.db。"""
    from core.db.base import SQLiteClient
    import services.preset_library as svc
    client = SQLiteClient(db_path=str(tmp_path / "app.db"))
    client.init_tables()
    monkeypatch.setattr(svc, "get_db", lambda: client)
    return svc


def test_f13_scan_three_level_index(monkeypatch, tmp_path):
    import services.preset_library as svc
    _scan_with_tmp_db(monkeypatch, tmp_path)
    out = svc.scan_preset_library()
    assert out["status"] == "ok"
    domains = {d["name"]: d for d in out["domains"]}
    for name in ("ai原理与应用简述", "ai工程与应用", "线性代数"):
        assert name in domains, f"缺领域: {name}（实际: {sorted(domains)}）"
    # 文件直挂领域 → 资源名 = 文件名去扩展；md 页数留空、URL 前缀正确
    md_dom = domains["ai原理与应用简述"]
    assert len(md_dom["resources"]) == 1
    md_res = md_dom["resources"][0]
    assert md_res["name"] == "AI 编程学习路线（鱼皮）"
    assert md_res["files"][0]["ext"] == "md" and md_res["files"][0]["pages"] is None
    assert md_res["files"][0]["url"].startswith("/preset-library/ai%E5%8E%9F%E7%90%86")
    # 资源文件夹形态：AI-Agents-books（李博杰）内文件独立摄取，PDF 页数经 pypdf 实算
    eng = {r["name"]: r for r in domains["ai工程与应用"]["resources"]}
    assert "AI-Agents-books（李博杰）" in eng
    f0 = eng["AI-Agents-books（李博杰）"]["files"][0]
    assert f0["ext"] == "pdf" and isinstance(f0["pages"], int) and f0["pages"] > 0
    # 线代 PDF 页数实算 > 0
    lin = {r["name"]: r for r in domains["线性代数"]["resources"]}
    assert any(
        isinstance(f["pages"], int) and f["pages"] > 0
        for r in lin.values() for f in r["files"]), "线性代数 PDF 页数未实算"


def test_f13_nested_folder_robustness(monkeypatch, tmp_path):
    """owner 未来嵌套数据路径解析健壮性：子目录=资源文件夹；更深层继续按「直接含文件的
    目录」切资源；posix 相对路径 + 空格/括号名不破。"""
    import services.preset_library as svc
    _scan_with_tmp_db(monkeypatch, tmp_path)
    root = tmp_path / "preset_library"
    dom = root / "领域A"
    (dom / "资源文件夹").mkdir(parents=True)
    (dom / "资源文件夹" / "子目录").mkdir()
    (dom / "散文件 资源(1).pdf").write_bytes(b"x")
    (dom / "资源文件夹" / "a.pdf").write_bytes(b"x")
    (dom / "资源文件夹" / "b.md").write_bytes(b"x")
    (dom / "资源文件夹" / "子目录" / "c.pdf").write_bytes(b"x")
    monkeypatch.setattr(svc, "PRESET_DIR", str(root))
    out = svc.scan_preset_library()
    dom_out = out["domains"][0]
    assert dom_out["name"] == "领域A"
    by_name = {r["name"]: r for r in dom_out["resources"]}
    assert set(by_name) == {"散文件 资源(1)", "资源文件夹", "子目录"}
    assert [f["rel_path"] for f in by_name["资源文件夹"]["files"]] == [
        "领域A/资源文件夹/a.pdf", "领域A/资源文件夹/b.md"]
    assert by_name["子目录"]["files"][0]["rel_path"] == "领域A/资源文件夹/子目录/c.pdf"


# ---------- 元数据占位编辑往返 ----------

def test_f13_meta_roundtrip(monkeypatch, tmp_path):
    import services.preset_library as svc
    _scan_with_tmp_db(monkeypatch, tmp_path)
    rel = EXPECTED_TRACKED[0].replace("data/preset_library/", "", 1)  # md 文件 rel_path
    r1 = svc.update_meta(rel, publisher="测试出版社", pub_year="2025", cover="cover.png")
    assert r1["status"] == "ok"
    out = svc.scan_preset_library()
    res = [r for d in out["domains"] for r in d["resources"] if r["files"][0]["rel_path"] == rel][0]
    assert res["publisher"] == "测试出版社" and res["pub_year"] == "2025"
    # 结构化错误：未知 rel_path / 空标识
    assert svc.update_meta("不存在.pdf", "", "", "")["status"] == "error"
    assert svc.update_meta("", "", "", "")["status"] == "error"


# ---------- 装配冒烟（路由注册 + 静态挂载 + 启动扫描在 lifespan 生效） ----------

def test_f13_api_preset_library_smoke():
    from fastapi.testclient import TestClient  # 延迟导入（T33）
    from main import app
    with TestClient(app) as tc:  # with 触发 lifespan → 启动扫描真实执行
        resp = tc.get("/api/preset-library")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok" and len(body["domains"]) >= 3
        names = {d["name"] for d in body["domains"]}
        assert {"ai原理与应用简述", "ai工程与应用", "线性代数"} <= names
        # 原始文件静态回源可达：直接用扫描产物里的编码 URL 拉 md 原文
        md_url = next(f["url"] for d in body["domains"] for r in d["resources"]
                      for f in r["files"] if f["ext"] == "md")
        r = tc.get(md_url)
        assert r.status_code == 200 and "AI" in r.text[:2000]
