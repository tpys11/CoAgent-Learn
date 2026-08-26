# -*- coding: utf-8 -*-
"""SQLiteClient 向量索引 mixin：sqlite-vec 建表 / 索引版本化（照 DeepTutor version-N）。
B2 拆分（2026-08-27）：方法自 base.py 逐字迁入。"""
import hashlib
import re


class VectorIndexMixin:
    """向量表建表 + embedding 签名版本管理。"""

    def create_vector_tables(self):
        """知识库向量表 + 图片跨模态向量表；维度统一 1024（Qwen3-VL-Embedding-8B MRL 实测输出）。
        2026-08-21：移除 memory_vectors/message_vectors 死表——对话记忆以文本形式承载
        （dialogues.summary + compressed_upto 游标），不再做向量存储/召回。"""
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS kb_vectors USING vec0("
            "doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
            "has_context INTEGER, content TEXT, embedding float[1024])"
        )
        # 图片跨模态向量表：与文字共用 Qwen3-VL-Embedding-8B@1024（文本/图片同空间）
        self.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS image_vectors USING vec0("
            "doc_id TEXT, project_id TEXT, source TEXT, content TEXT, file_path TEXT,"
            "mime TEXT, embedding float[1024])"
        )
        # 闭环四·B1：每块生成问题旁路表（决策 D-新2：vec0 虚拟表实测禁止 ALTER 加列，
        # OperationalError: virtual tables may not be altered——新列方案不可行改旁路表）。
        # questions 为 JSON 数组字符串；仅作 BM25 语料增量，不进向量不进检索返回结构。
        self.execute(
            "CREATE TABLE IF NOT EXISTS kb_gen_questions("
            "project_id TEXT, source TEXT, doc_id TEXT, questions TEXT, "
            "PRIMARY KEY(project_id, doc_id))"
        )
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_kbgen_project_source "
            "ON kb_gen_questions(project_id, source)"
        )
        # 闭环五·B4-lite：先修/相关关系边表（决策：LI SimplePropertyGraphStore 的
        # graph_dict[subj]=[rel,obj] 形状直译为普通 SQLite 表——无需图 DB）。
        # rel 白名单 {"先修","相关"}；仅新上传抽取，存量不补跑；冻结线砍环时整表闲置无害。
        self.execute(
            "CREATE TABLE IF NOT EXISTS kg_edges("
            "project_id TEXT, source TEXT, src TEXT, dst TEXT, rel TEXT, "
            "PRIMARY KEY(project_id, source, src, dst, rel))"
        )
        self.execute(
            "CREATE INDEX IF NOT EXISTS idx_kg_project_source "
            "ON kg_edges(project_id, source)"
        )
        # 知识库文档标题树（上传时提取 markdown 标题层级，供项目记忆知识图谱使用）
        self.execute(
            "CREATE TABLE IF NOT EXISTS kb_tree("
            "project_id TEXT, source TEXT, tree TEXT, updated_at TEXT DEFAULT (datetime('now')), "
            "PRIMARY KEY (project_id, source))"
        )

        # 链接/内置资源内容缓存：首次上传联网抓取后存库，之后同一资源直接从内部获取（不联网）
        self.execute(
            "CREATE TABLE IF NOT EXISTS preset_docs("
            "url TEXT PRIMARY KEY, title TEXT, content TEXT, updated_at TEXT DEFAULT (datetime('now')))"
        )
        # 内容级去重（照 DeepTutor file_hashes）：上传前按内容 sha256 查重，重复则跳过避免污染检索
        self.execute(
            "CREATE TABLE IF NOT EXISTS file_hashes("
            "project_id TEXT, sha256 TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')), "
            "PRIMARY KEY (project_id, sha256))"
        )
        # 动态服务配置（前端设置界面写入）：embedding/rerank/视觉 key 等，优先于 .env
        self.execute(
            "CREATE TABLE IF NOT EXISTS settings("
            "key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))"
        )
        # 索引版本注册表（照 DeepTutor version-N 思想）：embedding 签名（模型@维度）变化时
        # 新建物理表并切换，旧表保留只读——切模型不再需要清库重灌。append-only，活跃版本=最新一行。
        self.execute(
            "CREATE TABLE IF NOT EXISTS kb_index_versions("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "kind TEXT NOT NULL DEFAULT 'text', "
            "signature TEXT NOT NULL, "
            "dim INTEGER NOT NULL DEFAULT 1024, "
            "table_name TEXT NOT NULL, "
            "created_at TEXT DEFAULT (datetime('now')))"
        )

    def vector_table_dim(self, table: str) -> int | None:
        """读取已存在的 vec0 向量表维度；不存在或无法解析返回 None。"""
        rows = self.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not rows or not rows[0].get("sql"):
            return None
        m = re.search(r"float\[(\d+)\]", rows[0]["sql"])
        return int(m.group(1)) if m else None

    def ensure_vector_dim(self, table: str, expected: int | None = None) -> int:
        """确认向量表维度与当前配置一致；不一致时抛明确错误，避免静默写 0 块。
        expected 为空时按 EMBEDDING_DIM；图片表传入 VL_EMBEDDING_DIM。"""
        from core.config import config as _cfg
        if expected is None:
            expected = int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)
        actual = self.vector_table_dim(table)
        if actual is not None and actual != expected:
            raise RuntimeError(
                f"向量表 {table} 当前为 {actual} 维，embedding 配置为 {expected} 维；请重建向量表"
            )
        return actual if actual is not None else expected

    # ── 索引版本化（照 DeepTutor version-N：签名变更开新表，旧表保留只读回退）──

    def embedding_signature(self) -> str:
        """当前 embedding 配置签名：模型名@维度。签名一致才视为同一索引代际——
        同维度换模型（如 Qwen3-VL↔bge-m3 都是 1024 维）向量空间不同，必须开新版本。"""
        from core.config import config as _cfg
        model = getattr(_cfg, "EMBEDDING_MODEL", "") or "unknown"
        dim = int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)
        return f"{model}@{dim}"

    def _emb_dim(self) -> int:
        from core.config import config as _cfg
        return int(getattr(_cfg, "EMBEDDING_DIM", 1024) or 1024)

    def list_text_version_tables(self) -> list[str]:
        """全部文本向量版本物理表，最新在前；无注册记录时兜底返回旧主表"""
        rows = self.execute(
            "SELECT table_name FROM kb_index_versions WHERE kind='text' ORDER BY id DESC")
        tables = [r["table_name"] for r in rows]
        return tables or ["kb_vectors"]

    def peek_active_text_table(self) -> str:
        """读路径的签名感知解析（只读语义：绝不建表/切版）：
        - 当前签名有历史版本 → 返回该版本（配置回滚场景：旧代际内容立即可检索）
        - 无历史版本（全新签名的首次写之前）→ 返回最新表（检索空结果而非报错）
        - 无任何注册记录 → 旧主表"""
        sig = self.embedding_signature()
        rows = self.execute(
            "SELECT signature, table_name FROM kb_index_versions WHERE kind='text' ORDER BY id DESC")
        if not rows:
            return "kb_vectors"
        for r in rows:
            if r["signature"] == sig:
                return r["table_name"]
        return rows[0]["table_name"]

    def resolve_active_text_table(self) -> str:
        """写路径入口：返回与当前 embedding 签名一致的活跃表。
        - 无注册记录 → 既有 kb_vectors 注册为第 1 版（按当前签名登记）
        - 活跃版本签名一致 → 直接复用
        - 签名变化 → 复用历史同名签名的表（配置回滚场景），否则新建 kb_vectors_<hash8> 并切换"""
        with self._lock:
            sig = self.embedding_signature()
            dim = self._emb_dim()
            last = self.execute(
                "SELECT signature, table_name FROM kb_index_versions WHERE kind='text' "
                "ORDER BY id DESC LIMIT 1")
            if last:
                if last[0]["signature"] == sig:
                    return last[0]["table_name"]
                hist = self.execute(
                    "SELECT table_name FROM kb_index_versions WHERE kind='text' AND signature=? "
                    "ORDER BY id DESC LIMIT 1", (sig,))
                if hist:
                    table = hist[0]["table_name"]
                else:
                    table = f"kb_vectors_{hashlib.md5(sig.encode('utf-8')).hexdigest()[:8]}"
                    self._safe_table(table)
                    self.execute(
                        f"CREATE VIRTUAL TABLE IF NOT EXISTS {table} USING vec0("
                        "doc_id TEXT, project_id TEXT, source TEXT, chunk INTEGER, session_id TEXT,"
                        f"has_context INTEGER, content TEXT, embedding float[{dim}])")
                self.execute(
                    "INSERT INTO kb_index_versions(kind, signature, dim, table_name) "
                    "VALUES ('text', ?, ?, ?)", (sig, dim, table))
                return table
            # 首次注册：既有 kb_vectors 成为第 1 版
            actual = self.vector_table_dim("kb_vectors") or dim
            self.execute(
                "INSERT INTO kb_index_versions(kind, signature, dim, table_name) "
                "VALUES ('text', ?, ?, 'kb_vectors')", (sig, actual))
            return "kb_vectors"
