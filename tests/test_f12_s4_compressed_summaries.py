# -*- coding: utf-8 * -*-
"""F12-S4 守卫：压缩摘要素材只读对接。

- 存在性守卫：GET /api/projects/{pid}/compressed-summaries 必须注册（前端记忆框素材数据源）；
- 语义守卫：端点实现只读——源码不得出现 UPDATE/INSERT dialogues 语句（预算机制零接触）。
T33 纪律：main 延迟到执行期导入，避免 collection 期 load_dotenv 污染 test_db_path。
"""
from pathlib import Path


def _collect_paths(routes) -> set:
    """递归收集路由路径。本机 FastAPI 的 include_router 产生 _IncludedRouter 嵌套：
    子路由挂在 original_router.routes 下，对象本身无 .path。"""
    out = set()
    for r in routes:
        p = getattr(r, "path", None)
        if p:
            out.add(p)
        sub = getattr(r, "routes", None) or getattr(getattr(r, "original_router", None), "routes", None)
        if sub:
            out |= _collect_paths(sub)
    return out


def test_compressed_summaries_route_registered():
    from main import app  # 执行期导入（T33）
    paths = _collect_paths(app.routes)
    assert "/api/projects/{pid}/compressed-summaries" in paths, \
        "压缩摘要只读端点未注册（F12-S4 前端素材断供）"


def test_compressed_summaries_is_read_only():
    """端点与配套 repo 方法不得写 dialogues 表（只读对接红线，compress.py 预算机制零接触）。"""
    router = Path(__file__).resolve().parents[1] / "backend" / "routers" / "memory.py"
    repo = Path(__file__).resolve().parents[1] / "backend" / "core" / "db" / "project_repo.py"
    src = router.read_text(encoding="utf-8-sig")
    func = src.split("def compressed_summaries", 1)[1].split("\n@router", 1)[0] if "def compressed_summaries" in src else ""
    assert func, "compressed_summaries 端点缺失"
    assert "UPDATE" not in func and "INSERT" not in func and "DELETE" not in func, \
        "压缩摘要端点含写语句（违反只读对接）"
    repo_src = repo.read_text(encoding="utf-8-sig")
    m = repo_src.split("def list_dialogue_summaries", 1)
    assert len(m) == 2, "repo 缺 list_dialogue_summaries（F12-S4 配套读方法）"
    body = m[1].split("    def ", 1)[0]
    assert "SELECT" in body and "UPDATE" not in body and "INSERT" not in body, \
        "list_dialogue_summaries 必须是纯 SELECT"
