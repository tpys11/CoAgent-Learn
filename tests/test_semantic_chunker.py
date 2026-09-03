# -*- coding: utf-8 -*-
"""闭环四·A3：语义断点切块守卫（_percentile 插值 / 断点分组 / 软着陆矩阵）。
假嵌入按调用序回放脚本向量——断点位置可预知，断言分组边界。"""
import pytest

from core.knowledge_service import _chunk_semantic, _percentile, _split_sentences


A4_B4 = ["甲一句。", "甲二句。", "甲三句。", "甲四句。", "乙五句。", "乙六句。", "乙七句。", "乙八句。"]


def _scripted(vectors):
    """按调用序回放向量的假 embed_fn（组合句按序传入，即句序）。"""
    def _fn(texts):
        assert len(texts) == len(vectors), f"组合句数 {len(texts)} ≠ 脚本 {len(vectors)}"
        return list(vectors)
    return _fn


# ---------- _percentile（线性插值，对齐 numpy.percentile linear） ----------

def test_percentile_linear_interpolation():
    assert _percentile([0, 0, 0, 1, 0, 0, 0], 95) == pytest.approx(0.7)
    assert _percentile([1, 2, 3, 4], 50) == pytest.approx(2.5)
    assert _percentile([5], 95) == pytest.approx(5.0)
    assert _percentile([], 95) == 0.0


# ---------- 断点分组 ----------

def test_semantic_two_topics_breakpoint():
    """前4句向量[1,0]、后4句[0,1] → 边界距离1.0 > 插值阈0.7 → 恰在甲四/乙五间断开。"""
    vecs = [[1, 0]] * 4 + [[0, 1]] * 4
    out = _chunk_semantic("".join(A4_B4), _scripted(vecs), size=512, overlap=50)
    assert len(out) == 2, out
    assert all(w in out[0] for w in ("甲一句", "甲四句")) and "乙" not in out[0]
    assert all(w in out[1] for w in ("乙五句", "乙八句")) and "甲" not in out[1]


def test_semantic_buffer_window_passed_to_embed():
    """buffer=1：传给 embed 的组合句应含邻句拼接（首句=自身+下一句）。"""
    seen = {}

    def _fn(texts):
        seen["combined"] = list(texts)
        return [[1, 0]] * len(texts)

    _chunk_semantic("首句内容。次句内容。", _fn, size=512, overlap=50)
    assert seen["combined"][0] == "首句内容。 次句内容。"
    assert seen["combined"][1] == "首句内容。 次句内容。"


# ---------- 软着陆矩阵 ----------

def test_semantic_empty_and_single_sentence():
    assert _chunk_semantic("", _scripted([])) == []
    assert _chunk_semantic("只有一句话没有句读", _scripted([[1, 0]])) == ["只有一句话没有句读"]
    # 单句带句读 → _split_sentences 得 1 句 → 兜底 _chunk_text
    assert _chunk_semantic("只有一句话。", _scripted([[1, 0]])) == ["只有一句话。"]


def test_semantic_no_breakpoint_oversized_group_splits():
    """全部同向向量 → 零断点单组；超长组回退 _chunk_text 切开。"""
    text = "".join("这是第%d句话内容比较长需要窗口切分。" % i for i in range(8))
    out = _chunk_semantic(text, _scripted([[1, 0]] * 8), size=80, overlap=10)
    assert len(out) >= 2  # 单组超长 → 句子级窗口回退
    assert "".join(out).replace(" ", "").startswith("这是第0句")


def test_semantic_embed_crash_soft_landing():
    def _boom(texts):
        raise RuntimeError("embedding 挂了")
    out = _chunk_semantic("正常一句话。", _boom)
    assert out == ["正常一句话。"]


def test_semantic_vec_count_mismatch_soft_landing():
    out = _chunk_semantic("一句话。两句话。", _scripted([[1, 0]]))  # 2句只回1向量
    assert len(out) == 1 and "一句话" in out[0]


# ---------- 切片②：add_document A3 门控接线 ----------

import core.knowledge_service as ks  # noqa: E402
from core.config import config as _cfg  # noqa: E402


class FakeKbRepo:
    """add_document 依赖面桩：捕获 bulk/tree，其余定值（表机制不参与断言）。"""

    def __init__(self):
        self.bulk = []
        self.trees = []

    def resolve_active_text_table(self):
        return "kb_vectors"

    def ensure_vector_dim(self, table, expected=None):
        return 1024

    def delete_kb_by_source(self, pid, src):
        return 0

    def upsert_kb_vectors_bulk(self, items, table="kb_vectors"):
        self.bulk.extend(items)

    def upsert_kb_tree(self, pid, src, tree):
        self.trees.append((pid, src, tree))


def _by_topic(texts):
    """内容感知假嵌入：按甲/乙出现次数占优分类（buffer 组合句在边界天然混面，
    占优判定才是稳定语义——含甲即甲会把边界组合句误判）。"""
    return [[1.0, 0.0] if t.count("甲") >= t.count("乙") else [0.0, 1.0] for t in texts]


def test_add_document_semantic_branch_wired(monkeypatch):
    repo = FakeKbRepo()
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _by_topic)
    monkeypatch.setattr(_cfg, "KB_CHUNKER", "semantic")
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    n = ks.add_document("p1", "".join(A4_B4), source="语义源", api_key="")
    assert n == 2
    assert [it[3] for it in repo.bulk] == [0, 1]                      # chunk 序号
    assert "甲四句" in repo.bulk[0][6] and "乙五句" in repo.bulk[1][6]  # 断点边界落位
    assert repo.bulk[0][7] == [1.0, 0.0] and repo.bulk[1][7] == [0.0, 1.0]  # 终块向量


def test_add_document_semantic_gated_off_for_headed_text(monkeypatch):
    """有标题文本不走语义切块（markdown 主道）——_chunk_semantic 被调用即失败。"""
    repo = FakeKbRepo()
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _by_topic)
    monkeypatch.setattr(_cfg, "KB_CHUNKER", "semantic")
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)

    def _boom(*a, **k):
        raise AssertionError("有标题文本不得进入语义切块分支")

    monkeypatch.setattr(ks, "_chunk_semantic", _boom)
    n = ks.add_document("p1", "# 动力学\n\n牛顿定律是力学核心。", source="标题源", api_key="")
    assert n >= 1 and "动力学" in repo.bulk[0][6]


def test_add_document_chunker_env_now_reachable(monkeypatch):
    """计划外修复证明：Config 声明 KB_CHUNKER 前 getattr 恒默认 self，llamaindex 刀1 分支不可达。
    声明后 env 值能进分支（本地无 llama_index 包 → 预期走回退而非报错）。"""
    repo = FakeKbRepo()
    monkeypatch.setattr(ks, "_db", repo)
    monkeypatch.setattr(ks, "_embed", _by_topic)
    monkeypatch.setattr(_cfg, "KB_CHUNKER", "llamaindex")
    monkeypatch.setattr(_cfg, "KB_META_ENHANCE", 0)
    assert _cfg.KB_CHUNKER == "llamaindex"  # Config 已声明（此前类上无此属性）
    n = ks.add_document("p1", "# 标题\n\n正文内容若干。", source="刀1源", api_key="")
    assert n >= 1  # llamaindex import 失败 → 回退自研 markdown，上传不炸
