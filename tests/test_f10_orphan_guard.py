# -*- coding: utf-8 -*-
"""F10-S3 孤儿级联守卫：删课后四表零残留 + by-source 级联 + 跨项目不可达 + 门面链路。

背景（派发单前提修正，总领照准）：kg_edges/kb_gen_questions 的项目级与 by-source 清理
自 338c5ddf（闭环四/五时代，早于 F9）已存在——delete_kb_project :398/:400、
delete_kb_by_source :379/:382。F9 §6.3 系误报（总领看板已登记更正）。
真实缺口=守卫缺口：此前无任何测试钉住两表删课零残留，将来有人摘掉这几行 DELETE
不会红。本文件把行为钉在真 SQLiteClient 临时库上（决策 18 守卫范式），
🔴 T50 领地（delete_kb_*/save_file_hash/upsert_vectors_bulk）零改动——守卫只读行为不改实现。
"""
import json

import pytest

from core.db.base import SQLiteClient


@pytest.fixture()
def db(tmp_path):
    c = SQLiteClient(db_path=str(tmp_path / "f10guard.db"))
    c.create_vector_tables()
    yield c


def _vec():
    return [0.0] * 1024


def _seed_vectors(db, pid, source, n=1):
    db.upsert_kb_vectors_bulk(
        [(f"{pid}|{source}|{i}", pid, source, i, "", 0, f"块{i}", _vec())
         for i in range(n)])


def _seed_questions(db, pid, source, n=1):
    """B1 旁路表：每块生成问题（主键 project_id+doc_id，source 列与向量同源）"""
    db.upsert_gen_questions_bulk(
        [(pid, source, f"{pid}|{source}|{i}", json.dumps([f"问题{i}"], ensure_ascii=False))
         for i in range(n)])


def _seed_edges(db, pid, source):
    """闭环五：先修/相关边（主键五元组）"""
    db.upsert_kg_edges_bulk([(pid, source, "第1章", "第2章", "先修")])


def _seed_all(db, pid, source):
    """一个来源的完整四表形态：向量+问题+边+树"""
    _seed_vectors(db, pid, source)
    _seed_questions(db, pid, source)
    _seed_edges(db, pid, source)
    db.upsert_kb_tree(pid, source, [{"name": "第1章 力学", "children": []}])


def _counts(db, pid):
    """四表残留计数（kb_vectors 跨全部文本版本——delete_kb_project 的清理面同样跨版本）"""
    vec = 0
    for t in db.list_text_version_tables():
        vec += db.execute(f"SELECT COUNT(*) c FROM {db._safe_table(t)} WHERE project_id=?", (pid,))[0]["c"]
    return {
        "kb_vectors": vec,
        "kb_tree": db.execute("SELECT COUNT(*) c FROM kb_tree WHERE project_id=?", (pid,))[0]["c"],
        "kg_edges": db.execute("SELECT COUNT(*) c FROM kg_edges WHERE project_id=?", (pid,))[0]["c"],
        "kb_gen_questions": db.execute("SELECT COUNT(*) c FROM kb_gen_questions WHERE project_id=?", (pid,))[0]["c"],
    }


# ---------- 四表零残留（删课项目级联） ----------

def test_delete_project_kb_four_tables_zero_residue(db, monkeypatch):
    """删课四表零残留：向量/树/边/问题全清。kg_edges/kb_gen_questions 清理在
    delete_kb_project :398/:400（338c5ddf 起）——本守卫钉死防将来回归（T50 孤儿形态
    的完整防御面，F9 §6.3 误报的实证更正）。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    _seed_all(db, "pA", "教材.pdf")
    ks.delete_project_kb("pA")
    counts = _counts(db, "pA")
    assert all(v == 0 for v in counts.values()), f"删课后四表残留：{counts}"


def test_delete_project_kb_zero_cross_project_blast(db, monkeypatch):
    """他人零触碰：删 pA，pB 同源同构四表逐项无损（跨项目删除可达=红线击穿）。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    _seed_all(db, "pA", "同名校.pdf")
    _seed_all(db, "pB", "同名校.pdf")
    ks.delete_project_kb("pA")
    b = _counts(db, "pB")
    assert all(v == 1 for v in b.values()), f"跨项目删除可达=红线击穿：{b}"


# ---------- by-source 级联（删单资源路径） ----------

def test_delete_doc_source_cascade_cleans_questions_and_edges(db, monkeypatch):
    """删单资源：kb_gen_questions/kg_edges 同源同生命周期（delete_kb_by_source :379/:382）；
    同项目他源不误伤，跨项目同源不可达。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    _seed_all(db, "pA", "a.pdf")
    _seed_all(db, "pA", "b.pdf")
    _seed_all(db, "pB", "a.pdf")
    ks.delete_doc("pA", "a.pdf")
    # a.pdf 的边/问题随源清
    rows = db.execute("SELECT source FROM kg_edges WHERE project_id='pA'")
    assert [r["source"] for r in rows] == ["b.pdf"], "a.pdf 的 kg_edges 未随源清理"
    rows = db.execute("SELECT source FROM kb_gen_questions WHERE project_id='pA'")
    assert {r["source"] for r in rows} == {"b.pdf"}, "a.pdf 的 kb_gen_questions 未随源清理"
    # 同项目 b.pdf 不误伤
    assert _counts(db, "pA")["kb_vectors"] == 1
    # 跨项目 pB 的 a.pdf 完好
    assert all(v == 1 for v in _counts(db, "pB").values()), "跨项目删除可达=红线击穿"


# ---------- 门面链路（F9-S5 E2E 教训：单测裸 client 通过≠门面链路通） ----------

def test_delete_project_kb_through_facade_db(db, monkeypatch):
    """真实应用路径：knowledge_service._db 是 KbRepo 门面——级联必须穿透门面仍四表零残留
    （门面缺代理会在真实路径 AttributeError 被路由吞掉、清理形同虚设）。"""
    import core.knowledge_service as ks
    from core.db.kb_repo import KbRepo
    monkeypatch.setattr(ks, "_db", KbRepo(db=db))
    _seed_all(db, "pA", "a.pdf")
    ks.delete_project_kb("pA")
    counts = _counts(db, "pA")
    assert all(v == 0 for v in counts.values()), f"门面链路四表残留：{counts}"


def test_kb_repo_facade_exposes_project_and_source_delete():
    """门面存在性守卫：两表清理在 _db.delete_kb_project/delete_kb_by_source 内部，
    门面缺任一代理即静默失效。"""
    from core.db.kb_repo import KbRepo
    assert hasattr(KbRepo, "delete_kb_project")
    assert hasattr(KbRepo, "delete_kb_by_source")


def test_facade_passthrough_reaches_sqliteclient(db):
    """门面透传行为层验证：KbRepo(db=...) → SQLiteClient 真删（非 no-op），项目级与 by-source 双路径。"""
    from core.db.kb_repo import KbRepo
    repo = KbRepo(db=db)
    _seed_questions(db, "pA", "a.pdf")
    _seed_edges(db, "pA", "a.pdf")
    repo.delete_kb_project("pA")
    assert db.execute("SELECT COUNT(*) c FROM kg_edges WHERE project_id='pA'")[0]["c"] == 0
    assert db.execute("SELECT COUNT(*) c FROM kb_gen_questions WHERE project_id='pA'")[0]["c"] == 0
    _seed_questions(db, "pA", "a.pdf")
    _seed_edges(db, "pA", "a.pdf")
    repo.delete_kb_by_source("pA", "a.pdf")
    assert db.execute("SELECT COUNT(*) c FROM kg_edges WHERE project_id='pA'")[0]["c"] == 0
    assert db.execute("SELECT COUNT(*) c FROM kb_gen_questions WHERE project_id='pA'")[0]["c"] == 0
