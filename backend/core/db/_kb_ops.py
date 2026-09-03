# -*- coding: utf-8 -*-
"""SQLiteClient 知识库域操作 mixin：向量块读写 / 旁路表（B1 问题、B4-lite 边）/
图片向量 / 标题树 / 内容去重 / URL 缓存 / 级联删除。
B2 拆分（2026-08-27）：方法自 base.py 逐字迁入。"""
import hashlib
import json

import sqlite_vec

# F9-S3 新增节点字段（层级化）；page/category 为 F9-S1/S2 先行增量的既有字段
_TREE_ADDED_FIELDS = ("id", "parent", "level")


def _hierarchify_tree(tree: list) -> list:
    """F9-S3：kb_tree 节点补层级字段（id/parent/level）——纯增量，name/children/content/
    page/category 一律原样保留（零丢失）。幂等：已有 id 的节点保持原值。
    id = md5(全路径#兄弟序)[:12]：路径派生 → 同结构重提取产生同 id（引用稳定）。"""
    def walk(nodes, parent_id, prefix, level):
        for idx, n in enumerate(nodes or []):
            if not isinstance(n, dict):
                continue
            name = str(n.get("name") or "")
            path = (prefix + "/" + name) if prefix else name
            if not n.get("id"):
                n["id"] = hashlib.md5(f"{path}#{idx}".encode("utf-8")).hexdigest()[:12]
            n["parent"] = parent_id
            n["level"] = level
            walk(n.get("children"), n["id"], path, level + 1)
    walk(tree, "", "", 1)
    return tree


class KbOpsMixin:
    """知识库域数据操作。表名进 f-string 前一律过 self._safe_table 白名单闸。"""

    def has_file_hash(self, project_id: str, sha256: str) -> bool:
        """内容级去重：该项目的 sha256 是否已入库"""
        rows = self.execute("SELECT 1 FROM file_hashes WHERE project_id = ? AND sha256 = ?", (project_id, sha256))
        return bool(rows)

    def save_file_hash(self, project_id: str, sha256: str, source: str):
        """记录已入库内容的 sha256（供后续去重）"""
        self.execute(
            "INSERT OR REPLACE INTO file_hashes(project_id, sha256, source) VALUES (?,?,?)",
            (project_id, sha256, source),
        )

    def get_preset_doc(self, url: str) -> dict | None:
        """按 url 取已缓存的内容（内部获取，不联网）"""
        rows = self.execute("SELECT url, title, content FROM preset_docs WHERE url = ?", (url,))
        return rows[0] if rows else None

    def save_preset_doc(self, url: str, title: str, content: str):
        """保存 url 抓取内容到缓存（供后续内部获取）"""
        self.execute(
            "INSERT INTO preset_docs(url, title, content, updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(url) DO UPDATE SET title=excluded.title, content=excluded.content, updated_at=datetime('now')",
            (url, title, content),
        )

    def upsert_kb_vector(self, doc_id: str, project_id: str, source: str, chunk: int,
                         session_id: str, has_context: bool, content: str, embedding: list,
                         table: str = "kb_vectors"):
        # vec0 表不支持 UPDATE，用 DELETE+INSERT 实现 upsert
        self._safe_table(table)
        with self._lock:
            conn = self._new_conn()
            try:
                conn.execute(f"DELETE FROM {table} WHERE doc_id = ?", (doc_id,))
                conn.execute(
                    f"INSERT INTO {table}(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (None, doc_id, project_id, source, chunk, session_id, int(has_context), content,
                     sqlite_vec.serialize_float32(embedding)),
                )
                conn.commit()
            finally:
                conn.close()

    def upsert_kb_vectors_bulk(self, items: list, table: str = "kb_vectors"):
        """批量 upsert：vec0 表不支持 UPDATE，先批量 DELETE 已存在 doc_id，再批量 INSERT。
        分批（每批 500）提交：控制单事务时长（大批量从分钟级锁窗口降到秒级），
        同时规避旧版 SQLite 的 SQLITE_MAX_VARIABLE_NUMBER（999）上限。
        items: [(doc_id, project_id, source, chunk, session_id, has_context, content, embedding)]"""
        if not items:
            return
        import sqlite_vec as _sv
        self._safe_table(table)
        _BATCH = 500
        with self._lock:
            conn = self._new_conn()
            try:
                for start in range(0, len(items), _BATCH):
                    batch = items[start:start + _BATCH]
                    ids = [it[0] for it in batch]
                    ph = ",".join("?" * len(ids))
                    # 纵深防御（P0-2 根因2）：doc_id 已在生成侧注入 project_id（_make_doc_id），
                    # 此处 DELETE 再叠加项目条件，杜绝历史/旁路数据引发的跨项目误删。
                    conn.execute(f"DELETE FROM {table} WHERE project_id = ? AND doc_id IN ({ph})",
                                 [batch[0][1]] + ids)
                    conn.executemany(
                        f"INSERT INTO {table}(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [(None, it[0], it[1], it[2], it[3], it[4], int(it[5]), it[6], _sv.serialize_float32(it[7])) for it in batch],
                    )
                    conn.commit()
            finally:
                conn.close()

    def fetch_kb_rows(self, project_id: str, source: str):
        """跨项目复用读取（P0-2 根因1）：按 (project_id, source) 读全部块。
        必须返回原生 tuple（不走统一 execute 的 dict 化——tuple 解包 dict 会得到键名
        字符串，曾导致复制行 embedding 变成字面量 "embedding" 被(vec0)拒收）。
        embedding 为存储态 BLOB 原样返回，写入端不得再 serialize。"""
        table = self.peek_active_text_table()
        with self._lock:
            conn = self._new_conn()
            try:
                cur = conn.execute(
                    f"SELECT chunk, has_context, content, embedding FROM {table} "
                    "WHERE project_id = ? AND source = ? ORDER BY chunk",
                    (project_id, source),
                )
                return cur.fetchall()
            finally:
                conn.close()

    def find_donor_by_hash(self, sha256: str, exclude_project_id: str):
        """跨项目复用：找其他项目中"同 sha256 且向量仍完整在库"的 donor（排除幽灵 hash）。
        返回 (project_id, source) 或 None；多 donor 取最近入库的一个。"""
        table = self.peek_active_text_table()
        rows = self.execute(
            "SELECT fh.project_id AS p, fh.source AS s FROM file_hashes fh "
            f"WHERE fh.sha256 = ? AND fh.project_id <> ? "
            f"  AND EXISTS (SELECT 1 FROM {table} v "
            "              WHERE v.project_id = fh.project_id AND v.source = fh.source) "
            "ORDER BY fh.created_at DESC LIMIT 1",
            (sha256, exclude_project_id),
        )
        return (rows[0]["p"], rows[0]["s"]) if rows else None

    def insert_kb_vectors_raw(self, items: list, table: str = "kb_vectors"):
        """跨项目复制专用写入：embedding 已是存储态 BLOB，直接 INSERT——
        不得走 upsert_kb_vectors_bulk（其内部 serialize_float32 会对 BLOB 二次封装）。
        同 doc_id 先按 (project_id, doc_id) 删除，语义与 upsert 对齐。"""
        if not items:
            return
        _BATCH = 500
        with self._lock:
            conn = self._new_conn()
            try:
                for start in range(0, len(items), _BATCH):
                    batch = items[start:start + _BATCH]
                    pid = batch[0][1]
                    ids = [it[0] for it in batch]
                    ph = ",".join("?" * len(ids))
                    conn.execute(f"DELETE FROM {table} WHERE project_id = ? AND doc_id IN ({ph})",
                                 [pid] + ids)
                    conn.executemany(
                        f"INSERT INTO {table}(rowid, doc_id, project_id, source, chunk, session_id, has_context, content, embedding) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [(None, it[0], it[1], it[2], it[3], it[4], int(it[5]), it[6], it[7]) for it in batch],
                    )
                    conn.commit()
            finally:
                conn.close()

    def upsert_image_vectors_bulk(self, items: list):
        """批量 upsert 图片向量：vec0 不支持 UPDATE，先 DELETE 再 INSERT。
        items: [(doc_id, project_id, source, content, file_path, mime, embedding)]"""
        if not items:
            return
        import sqlite_vec as _sv
        with self._lock:
            conn = self._new_conn()
            try:
                for it in items:
                    conn.execute("DELETE FROM image_vectors WHERE doc_id = ?", (it[0],))
                    conn.execute(
                        "INSERT INTO image_vectors(rowid, doc_id, project_id, source, content, file_path, mime, embedding) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (None, it[0], it[1], it[2], it[3], it[4], it[5], _sv.serialize_float32(it[6])),
                    )
                conn.commit()
            finally:
                conn.close()

    def search_image_vectors(self, project_id: str, query_embedding: list, k: int = 3) -> list[dict]:
        import sqlite_vec as _sv
        with self._lock:
            conn = self._new_conn()
            try:
                rows = conn.execute(
                    "SELECT rowid, distance, doc_id, source, content, file_path, mime "
                    "FROM image_vectors WHERE project_id = ? AND embedding MATCH ? AND k = ? "
                    "ORDER BY distance",
                    (project_id, _sv.serialize_float32(query_embedding), k),
                ).fetchall()
            finally:
                conn.close()
        return [dict(r) for r in rows]

    def get_image_docs(self, project_id: str) -> list[dict]:
        """取项目全部图片向量元数据（用于判断是否需要跨模态检索）"""
        return self.execute(
            "SELECT rowid, doc_id, source, content, file_path, mime FROM image_vectors WHERE project_id = ?",
            (project_id,),
        )

    def delete_image_by_source(self, project_id: str, source: str) -> int:
        rows = self.execute(
            "SELECT rowid FROM image_vectors WHERE project_id = ? AND source = ?",
            (project_id, source),
        )
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM image_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    def delete_image_project(self, project_id: str) -> int:
        rows = self.execute("SELECT rowid FROM image_vectors WHERE project_id = ?", (project_id,))
        ids = [r["rowid"] for r in rows]
        if ids:
            ph = ",".join("?" * len(ids))
            self.execute(f"DELETE FROM image_vectors WHERE rowid IN ({ph})", tuple(ids))
        return len(ids)

    def upsert_kb_tree(self, project_id: str, source: str, tree: list):
        """保存文档标题树（json）。F9-S3：写入前补层级字段（幂等，纯增量）。"""
        tree = _hierarchify_tree(tree or [])
        self.execute(
            "INSERT INTO kb_tree(project_id, source, tree, updated_at) VALUES (?,?,?,datetime('now')) "
            "ON CONFLICT(project_id, source) DO UPDATE SET tree=excluded.tree, updated_at=datetime('now')",
            (project_id, source, json.dumps(tree, ensure_ascii=False)),
        )

    def get_kb_tree(self, project_id: str, source: str) -> list:
        """读取文档标题树（无则空列表）"""
        import json as _json
        rows = self.execute("SELECT tree FROM kb_tree WHERE project_id=? AND source=?", (project_id, source))
        if not rows or not rows[0].get("tree"):
            return []
        try:
            t = _json.loads(rows[0]["tree"])
            return t if isinstance(t, list) else []
        except Exception:
            return []

    def delete_kb_tree_by_source(self, project_id: str, source: str) -> int:
        """删除某来源文档的标题树"""
        return self.execute("DELETE FROM kb_tree WHERE project_id=? AND source=?", (project_id, source))

    def purge_kb_tree_project(self, project_id: str) -> int:
        """F9-S3（T50 防御）：项目级联删除时清理该项目全部 kb_tree 行。
        项目内闭合（WHERE project_id=? 单域），杜绝「kb_tree 残留孤儿」（T50 实证形态）。
        新增方法而非改动既有 delete_kb_*（T50 领地零接触纪律）。"""
        return self.execute("DELETE FROM kb_tree WHERE project_id=?", (project_id,))

    def migrate_kb_tree_hierarchical(self) -> int:
        """F9-S3 存量迁移：为全部 kb_tree 行补层级字段（幂等、纯增量、零丢失）。
        坏 JSON 行跳过（可见日志）交人工处置，绝不阻断启动。返回实际改写行数。"""
        import logging as _logging
        _log = _logging.getLogger("coagent.knowledge")
        rows = self.execute("SELECT project_id, source, tree FROM kb_tree")
        migrated = 0
        for r in rows or []:
            raw = r.get("tree")
            if not raw:
                continue
            try:
                t = json.loads(raw)
                if not isinstance(t, list):
                    raise ValueError("tree 不是数组")
            except Exception:
                _log.warning("[kb_tree 迁移] 坏 JSON 行跳过 project=%s source=%s",
                             r.get("project_id"), r.get("source"))
                continue
            new = json.dumps(_hierarchify_tree(t), ensure_ascii=False)
            if new != raw:
                self.execute("UPDATE kb_tree SET tree=? WHERE project_id=? AND source=?",
                             (new, r["project_id"], r["source"]))
                migrated += 1
        if migrated:
            _log.info("[kb_tree 迁移] 层级化完成：%d 行补齐 id/parent/level", migrated)
        return migrated

    def search_kb_vectors(self, project_id: str, query_embedding: list, k: int = 12,
                          table: str = "kb_vectors") -> list[dict]:
        self._safe_table(table)
        with self._lock:
            conn = self._new_conn()
            try:
                rows = conn.execute(
                    "SELECT rowid, distance, doc_id, source, chunk, session_id, has_context, content "
                    f"FROM {table} WHERE project_id = ? AND embedding MATCH ? AND k = ? "
                    "ORDER BY distance",
                    (project_id, sqlite_vec.serialize_float32(query_embedding), k),
                ).fetchall()
            finally:
                conn.close()
        return [dict(r) for r in rows]

    def get_kb_docs(self, project_id: str, table: str = "kb_vectors") -> list[dict]:
        """取活跃版本全部向量块（doc_id, source, chunk, content），供 BM25 与列表展示"""
        self._safe_table(table)
        return self.execute(
            "SELECT rowid, doc_id, source, chunk, session_id, has_context, content "
            f"FROM {table} WHERE project_id = ? ORDER BY chunk",
            (project_id,),
        )

    def upsert_gen_questions_bulk(self, items: list):
        """闭环四·B1：批量写每块生成问题（旁路表幂等 upsert，重传同 doc_id 直接覆盖）。
        items: [(project_id, source, doc_id, questions_json_str)]"""
        if not items:
            return
        with self._lock:
            conn = self._new_conn()
            try:
                conn.executemany(
                    "INSERT INTO kb_gen_questions(project_id, source, doc_id, questions) "
                    "VALUES (?, ?, ?, ?) ON CONFLICT(project_id, doc_id) "
                    "DO UPDATE SET source=excluded.source, questions=excluded.questions",
                    items,
                )
                conn.commit()
            finally:
                conn.close()

    def get_gen_questions(self, project_id: str) -> dict:
        """闭环四·B1：项目全部每块问题 {doc_id: questions_json_str}，供 BM25 语料拼接"""
        rows = self.execute(
            "SELECT doc_id, questions FROM kb_gen_questions WHERE project_id = ?",
            (project_id,),
        )
        return {r["doc_id"]: r["questions"] for r in rows or []}

    def upsert_kg_edges_bulk(self, items: list):
        """闭环五·B4-lite：批量写先修/相关边（主键五元组幂等 upsert）。
        items: [(project_id, source, src, dst, rel)]"""
        if not items:
            return
        with self._lock:
            conn = self._new_conn()
            try:
                conn.executemany(
                    "INSERT INTO kg_edges(project_id, source, src, dst, rel) "
                    "VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, source, src, dst, rel) "
                    "DO NOTHING",
                    items,
                )
                conn.commit()
            finally:
                conn.close()

    def get_kg_edges(self, project_id: str) -> list[dict]:
        """闭环五：项目全部关系边 [{src, dst, rel}]，供报告先修注解"""
        rows = self.execute(
            "SELECT src, dst, rel FROM kg_edges WHERE project_id = ?",
            (project_id,),
        )
        return [dict(r) for r in rows or []]

    def delete_kb_by_source(self, project_id: str, source: str) -> int:
        """删除某来源：跨全部文本向量版本（任何代际里的残留都清掉）"""
        total = 0
        for table in self.list_text_version_tables():
            rows = self.execute(
                f"SELECT rowid FROM {self._safe_table(table)} WHERE project_id = ? AND source = ?",
                (project_id, source),
            )
            ids = [r["rowid"] for r in rows]
            if ids:
                ph = ",".join("?" * len(ids))
                self.execute(f"DELETE FROM {self._safe_table(table)} WHERE rowid IN ({ph})", tuple(ids))
                total += len(ids)
        # B1 旁路表级联：问题文本与向量块同源同生命周期
        self.execute("DELETE FROM kb_gen_questions WHERE project_id = ? AND source = ?",
                     (project_id, source))
        # 闭环五级联：关系边同源同生命周期
        self.execute("DELETE FROM kg_edges WHERE project_id = ? AND source = ?",
                     (project_id, source))
        return total

    def delete_kb_project(self, project_id: str) -> int:
        """删除项目知识库：跨全部文本向量版本"""
        total = 0
        for table in self.list_text_version_tables():
            rows = self.execute(
                f"SELECT rowid FROM {self._safe_table(table)} WHERE project_id = ?", (project_id,))
            ids = [r["rowid"] for r in rows]
            if ids:
                ph = ",".join("?" * len(ids))
                self.execute(f"DELETE FROM {self._safe_table(table)} WHERE rowid IN ({ph})", tuple(ids))
                total += len(ids)
        # B1 旁路表级联
        self.execute("DELETE FROM kb_gen_questions WHERE project_id = ?", (project_id,))
        # 闭环五级联
        self.execute("DELETE FROM kg_edges WHERE project_id = ?", (project_id,))
        return total
