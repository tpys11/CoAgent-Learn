# -*- coding: utf-8 -*-
"""单步4·资源对话模式分类器：纯规则矩阵（零 LLM、零 DB）。"""
from engine.resource_mode import classify_resource_mode as classify


def test_directed_replacement_edit():
    """定向指令：含具体替换文本 → 修改模式。"""
    assert classify("把第二段的'30天'改成'45天'") == "edit"
    assert classify("标题换成：RAG 实战指南") == "edit"
    assert classify("将参数替换为 45") == "edit"
    assert classify("删除第三部分") == "edit"
    assert classify("把第一段改得更口语化") == "edit"
    assert classify("第三节扩写两个例子") == "edit"


def test_question_edit():
    """纯提问 → edit 分支 💬 协议承接（不产版本）。"""
    assert classify("这份资料讲的是什么？") == "edit"
    assert classify("为什么选这个方案？") == "edit"
    assert classify("好了吗") == "edit"


def test_nondirected_gen():
    """指出问题但无正确信息 → 生成模式（系统供证+审核）。"""
    assert classify("这部分讲错了") == "gen"
    assert classify("数据好像不对，帮我修正") == "gen"
    assert classify("帮我优化下第二部分") == "gen"
    assert classify("重新生成一版") == "gen"
    assert classify("内容有点单薄，补充更多实例") == "gen"


def test_directed_wins_over_question_and_modify():
    """优先级：定向指令 > 提问/修正诉求——'把X改成Y？'是定向修改而非提问。"""
    assert classify("把第二段改成什么了？") == "edit"
    assert classify("把讲错的地方改成正确版本") == "edit"


def test_default_and_empty():
    """兜底默认 gen（安全侧）；空输入 gen。"""
    assert classify("") == "gen"
    assert classify("继续") == "gen"
    assert classify(None) == "gen"
