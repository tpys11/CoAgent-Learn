# -*- coding: utf-8 -*-
"""性能回归守卫：/api/resources 查询必须走索引，禁止全表 SCAN。
背景 2026-08-26：无索引时 SCAN 路过巨型 content 行（单行4MB测试残留），
每次列表请求 200-780ms——用户可感知"左栏资源打不开"。用查询计划断言，
不依赖计时（CI 稳定）。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.db.base import SQLiteClient  # noqa: E402

SQL = ("SELECT id,name,content,type,file_ext,file_size,created_at FROM resources "
       "WHERE project_id=? ORDER BY created_at DESC")


def _plan(client, sql: str, params=("p",)):
    return [r["detail"] for r in client.execute("EXPLAIN QUERY PLAN " + sql, params)]


def test_resources_query_uses_index_not_scan(tmp_path):
    client = SQLiteClient(str(tmp_path / "idx.db"))
    client.init_tables()
    plan = _plan(client, SQL)
    assert any("idx_resources_project" in d for d in plan), plan
    assert not any(d.startswith("SCAN resources") for d in plan), plan


def test_giant_row_does_not_degrade_metadata_query(tmp_path):
    """同库存在巨型 content 行（他项目）时，目标项目列表仍走索引不受牵连。"""
    import time
    client = SQLiteClient(str(tmp_path / "giant.db"))
    client.init_tables()
    blob = "x" * (2 * 1024 * 1024)  # 2MB 模拟残留大行（他项目）
    client.execute("INSERT INTO resources(id,name,content,type,project_id) "
                   "VALUES('big1','大行',?,'doc','other-project')", (blob,))
    for i in range(5):
        client.execute("INSERT INTO resources(id,name,content,type,project_id) "
                       f"VALUES('t{i}','资源{i}','内容','doc','target-p')")

    t0 = time.perf_counter()
    rows = client.execute(SQL, ("target-p",))
    dt_ms = (time.perf_counter() - t0) * 1000
    assert len(rows) == 5
    # 宽松上限：索引路径下应远低于全表路过2MB溢出页的量级（实测SCAN≈200ms+）
    assert dt_ms < 120, f"查询耗时 {dt_ms:.0f}ms，疑似退化为全表扫描"
