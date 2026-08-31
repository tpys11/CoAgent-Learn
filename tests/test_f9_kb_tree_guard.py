# -*- coding: utf-8 -*-
"""F9-S3 kb_tree 层级化（父子字段）+ T50 数据丢失防御守卫。

🔴 红线（本子步硬约束）：跨项目删除不可达 + 重建不产生孤儿——守卫钉在行为层
（真 SQLiteClient 临时库实测），不钉 SQL 文本（A2/T38 教训：删掉产生行为的行，
守卫必须变红）。迁移为纯增量演进（只加 id/parent/level 字段），既有数据零丢失。
"""
import json

import pytest

from core.db.base import SQLiteClient

LEGACY_TREE = [
    {"name": "第1章 力学", "content": "力学绪论", "children": [
        {"name": "1.1 牛顿定律", "content": "三定律", "children": []}]},
    {"name": "第2章 习题", "children": []},
]


@pytest.fixture()
def db(tmp_path):
    c = SQLiteClient(db_path=str(tmp_path / "f9guard.db"))
    c.create_vector_tables()
    yield c


def _vec():
    return [0.0] * 1024


def _legacy() -> list:
    """LEGACY_TREE 深拷贝——upsert 会原地补层级字段，模块级常量严禁跨用例共享引用。"""
    return json.loads(json.dumps(LEGACY_TREE))


def _seed_vectors(db, pid, source, n=1):
    db.upsert_kb_vectors_bulk(
        [(f"{pid}|{source}|{i}", pid, source, i, "", 0, f"块{i}", _vec())
         for i in range(n)])


# ---------- 层级化写入（新上传即带父子字段） ----------

def test_upsert_writes_hierarchical_fields(db):
    db.upsert_kb_tree("pA", "教材.pdf", _legacy())
    tree = db.get_kb_tree("pA", "教材.pdf")
    root = tree[0]
    assert root["level"] == 1 and root["parent"] == ""
    assert root["id"]
    child = root["children"][0]
    assert child["parent"] == root["id"] and child["level"] == 2
    assert child["id"] != root["id"]


def test_rebuild_same_source_no_duplicate_row(db):
    """重建不产生孤儿（行级）：同 (project, source) 重灌 = PK upsert，永不增量残留。"""
    db.upsert_kb_tree("pA", "教材.pdf", _legacy())
    db.upsert_kb_tree("pA", "教材.pdf", _legacy())
    rows = db.execute("SELECT COUNT(*) c FROM kb_tree WHERE project_id='pA' AND source='教材.pdf'")
    assert rows[0]["c"] == 1


# ---------- 存量迁移（既有课程零丢失） ----------

def _seed_legacy_row(db, pid="pOld", source="旧教材.pdf"):
    db.execute(
        "INSERT INTO kb_tree(project_id, source, tree) VALUES (?,?,?)",
        (pid, source, json.dumps(_legacy(), ensure_ascii=False)))


def test_migrate_legacy_row_adds_fields_zero_loss(db):
    _seed_legacy_row(db)
    n = db.migrate_kb_tree_hierarchical()
    assert n == 1
    t = db.get_kb_tree("pOld", "旧教材.pdf")
    # 零丢失：name/content/children 结构逐字保留，仅新增 id/parent/level
    assert t[0]["name"] == "第1章 力学" and t[0]["content"] == "力学绪论"
    assert t[0]["children"][0]["content"] == "三定律"
    assert t[0]["children"][0]["parent"] == t[0]["id"]
    assert t[1]["level"] == 1 and t[1]["name"] == "第2章 习题"


def test_migrate_idempotent_same_bytes(db):
    _seed_legacy_row(db)
    db.migrate_kb_tree_hierarchical()
    t1 = db.execute("SELECT tree FROM kb_tree WHERE project_id='pOld'")[0]["tree"]
    db.migrate_kb_tree_hierarchical()
    t2 = db.execute("SELECT tree FROM kb_tree WHERE project_id='pOld'")[0]["tree"]
    assert t1 == t2


def test_migrate_runs_with_table_init(db):
    """迁移挂在 create_vector_tables 末尾：部署/重启即完成存量层级化（幂等）。"""
    _seed_legacy_row(db)
    db.create_vector_tables()
    t = db.get_kb_tree("pOld", "旧教材.pdf")
    assert t and t[0].get("id")


def test_migrate_corrupt_row_skipped_not_fatal(db):
    """坏 JSON 行跳过不阻断启动（可见日志；其余行照常迁移）。"""
    db.execute("INSERT INTO kb_tree(project_id, source, tree) VALUES ('pBad','x.pdf','{oops')")
    _seed_legacy_row(db)
    n = db.migrate_kb_tree_hierarchical()
    assert n == 1  # 好行迁到即可；坏行原样保留交人工处置


# ---------- 反向脚本（D4 先例：迁移必附回退路径） ----------

def test_reverse_script_strips_to_legacy_shape(db):
    db.upsert_kb_tree("pA", "教材.pdf", _legacy())
    tagged = [{**n, "page": 3, "category": "正文"} for n in db.get_kb_tree("pA", "教材.pdf")]
    db.execute("UPDATE kb_tree SET tree=? WHERE project_id='pA'",
               (json.dumps(tagged, ensure_ascii=False),))
    from core.db.rollback_f9_kb_tree import rollback_kb_tree_hierarchical
    rollback_kb_tree_hierarchical(db)
    t = db.get_kb_tree("pA", "教材.pdf")
    keys = sorted({k for n in t for k in n.keys()})
    assert keys == ["children", "content", "name"]  # 还原 pre-F9 形状（page/category 同属 F9 增量）
    assert t[0]["content"] == "力学绪论" and t[0]["children"][0]["name"] == "1.1 牛顿定律"


# ---------- 🔴 T50 防御守卫：跨项目删除不可达 ----------

def test_delete_tree_by_source_project_scoped(db):
    db.upsert_kb_tree("pA", "同名校.pdf", _legacy())
    db.upsert_kb_tree("pB", "同名校.pdf", _legacy())
    db.delete_kb_tree_by_source("pA", "同名校.pdf")
    assert db.get_kb_tree("pA", "同名校.pdf") == []
    assert db.get_kb_tree("pB", "同名校.pdf"), "跨项目删除可达=红线击穿"


def test_delete_vectors_by_source_project_scoped(db):
    _seed_vectors(db, "pA", "同名校.pdf")
    _seed_vectors(db, "pB", "同名校.pdf")
    db.delete_kb_by_source("pA", "同名校.pdf")
    left = db.execute("SELECT COUNT(*) c FROM kb_vectors WHERE project_id='pB' AND source='同名校.pdf'")
    assert left[0]["c"] == 1, "跨项目向量删除可达=红线击穿"


def test_delete_doc_service_scoped_no_cross_project_blast(db, monkeypatch):
    """服务层删除（delete_doc）：pA 的树/向量全清，pB 逐字节无伤。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    db.upsert_kb_tree("pA", "S.pdf", _legacy())
    db.upsert_kb_tree("pB", "S.pdf", _legacy())
    _seed_vectors(db, "pA", "S.pdf")
    _seed_vectors(db, "pB", "S.pdf")
    ks.delete_doc("pA", "S.pdf")
    assert db.get_kb_tree("pA", "S.pdf") == []
    assert db.get_kb_tree("pB", "S.pdf")
    assert db.execute("SELECT COUNT(*) c FROM kb_vectors WHERE project_id='pA'")[0]["c"] == 0
    assert db.execute("SELECT COUNT(*) c FROM kb_vectors WHERE project_id='pB'")[0]["c"] == 1


# ---------- 🔴 T50 防御守卫：重建/删除项目不产生孤儿 ----------

def test_delete_project_kb_purges_kb_tree(db, monkeypatch):
    """项目级联删除必须连带 kb_tree（T50 孤儿形态：kb_tree 残留而项目已亡）。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    db.upsert_kb_tree("pA", "a.pdf", _legacy())
    db.upsert_kb_tree("pA", "b.pdf", _legacy())
    db.upsert_kb_tree("pB", "c.pdf", _legacy())
    _seed_vectors(db, "pA", "a.pdf")
    ks.delete_project_kb("pA")
    assert db.execute("SELECT COUNT(*) c FROM kb_tree WHERE project_id='pA'")[0]["c"] == 0
    assert db.execute("SELECT COUNT(*) c FROM kb_vectors WHERE project_id='pA'")[0]["c"] == 0
    assert db.get_kb_tree("pB", "c.pdf"), "跨项目删除可达=红线击穿"


def test_purge_reachable_through_kb_repo_facade(db):
    """真实应用路径走 KbRepo 门面（delete_project_kb 的 _db 即它）——
    门面缺代理会让 purge 静默失效（F9-S5 E2E 实证），此守卫钉住门面链路。"""
    from core.db.kb_repo import KbRepo
    repo = KbRepo(db=db)
    db.upsert_kb_tree("pA", "a.pdf", _legacy())
    db.upsert_kb_tree("pB", "b.pdf", _legacy())
    repo.purge_kb_tree_project("pA")
    assert db.get_kb_tree("pA", "a.pdf") == []
    assert db.get_kb_tree("pB", "b.pdf"), "门面 purge 越项目=红线击穿"


def test_rescope_reingest_keeps_single_tree_row(db, monkeypatch):
    """留存范围重入库（重建路径）：同源重灌后 kb_tree 仍恰一行（无孤儿、无重复）。"""
    import core.knowledge_service as ks
    monkeypatch.setattr(ks, "_db", db)
    monkeypatch.setattr(ks, "_embed", lambda texts: [_vec() for _ in texts])
    monkeypatch.setattr(ks, "enhance_questions", lambda *a, **k: 0)
    monkeypatch.setattr(ks, "extract_kg_edges", lambda *a, **k: 0)
    ks.add_document("pA", "# 第1章\n正文块文字若干。", source="教材.pdf",
                    outline_tree=[{"name": "第1章", "children": []}])
    ks.add_document("pA", "# 第1章\n改后的正文块文字。", source="教材.pdf",
                    outline_tree=[{"name": "第1章", "children": []}])
    assert db.execute("SELECT COUNT(*) c FROM kb_tree WHERE project_id='pA'")[0]["c"] == 1


def test_kb_repo_facade_exposes_purge():
    """门面守卫（S5 E2E 实证教训）：knowledge_service._db 是 KbRepo 门面而非裸
    SQLiteClient——新增 purge 必须在门面透传，否则删课级联静默失效（异常被路由吞）。"""
    from core.db.kb_repo import KbRepo
    assert hasattr(KbRepo, "purge_kb_tree_project")
