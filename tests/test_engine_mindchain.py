# -*- coding: utf-8 -*-
"""Loop6·思维链持久化纯函数验证：显示名归一 + 连续同名合并 + 空内容丢弃。"""
from engine.mindchain import display_name, merge_consecutive


def test_display_norm():
    assert display_name("学习助手·规划") == "学习助手"
    assert display_name("学习助手·生成") == "学习助手"
    assert display_name("主Agent") == "学习助手"
    assert display_name("主 Agent") == "学习助手"
    assert display_name("综合概述性记忆") == "学习助手"
    assert display_name("知识库管理") == "知识库管理"  # 非映射名原样
    assert display_name("") == ""


def test_merge_adjacent_same_display_collapses():
    """规划→生成 显示名同为学习助手且相邻 → 合并为单条，内容换行拼接。"""
    mc = [{"agent": "学习助手·规划", "content": "规划思考"},
          {"agent": "学习助手·生成", "content": "生成思考"}]
    out = merge_consecutive(mc)
    assert len(out) == 1
    assert out[0]["agent"] == "学习助手·规划"
    assert out[0]["content"] == "规划思考\n生成思考"


def test_merge_keeps_non_adjacent_same_display():
    """中间隔其他agent时同名不相邻 → 各自保留不合并。"""
    mc = [{"agent": "学习助手·规划", "content": "a"},
          {"agent": "知识库管理", "content": "b"},
          {"agent": "学习助手·生成", "content": "c"}]
    out = merge_consecutive(mc)
    assert [x["agent"] for x in out] == ["学习助手·规划", "知识库管理", "学习助手·生成"]
    assert [x["content"] for x in out] == ["a", "b", "c"]


def test_merge_drops_empty_content():
    mc = [{"agent": "知识库管理", "content": ""},
          {"agent": "审核", "content": None},
          {"agent": "审核", "content": "有效"}]
    out = merge_consecutive(mc)
    # 前两条空内容丢弃；后两条同名相邻合并
    assert out == [{"agent": "审核", "content": "有效"}]


def test_merge_does_not_mutate_input():
    mc = [{"agent": "规划", "content": "x"}, {"agent": "规划", "content": "y"}]
    snapshot = [dict(e) for e in mc]
    merge_consecutive(mc)
    assert mc == snapshot


def test_merge_skips_non_dict():
    out = merge_consecutive(["垃圾", {"agent": "a", "content": "b"}, 42])
    assert out == [{"agent": "a", "content": "b"}]
