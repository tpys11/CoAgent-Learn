"""多智能体协同调度逻辑单元测试（pytest）

覆盖 agents/graph.py 的确定性纯逻辑（不依赖 LLM/网络）：
- _is_rule_simple 程序规则极速路径判定（意图分流的确定性分支）
- _merge_stats 并行节点统计 reducer（LangGraph 并行合并正确性）
- _build_out_cand 输出增强模板候选构造

对应官方提交要求："单元测试用例（针对多智能体协同调度逻辑等核心模块）"。
运行（后端容器内）：python -m pytest tests/test_graph_logic.py -v
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.graph import _is_rule_simple, _merge_stats, _build_out_cand


# ---------- _is_rule_simple：程序规则简单问题判定 ----------

class TestIsRuleSimple:
    def test_empty_input(self):
        """空输入/纯空白 → 简单（不触发规划 LLM）"""
        assert _is_rule_simple("") is True
        assert _is_rule_simple("   ") is True
        assert _is_rule_simple(None) is True

    def test_greeting_simple(self):
        """问候/闲聊/礼貌用语 → 简单"""
        for t in ["你好", "您好", "hi", "Hello", "嗨", "哈喽", "在吗", "谢谢", "感谢", "再见", "拜拜", "你是谁", "你能做什么", "早上好", "晚上好"]:
            assert _is_rule_simple(t) is True, f"应判简单: {t}"

    def test_learning_hard_keys_not_simple(self):
        """教学/学习动词命中 → 不判简单（宁可走模型路径，极短学习请求不被误判）"""
        for t in ["讲讲transformer", "讲一下什么是注意力", "什么是机器学习", "啥是向量数据库", "解释一下梯度下降", "了解多智能体", "理解一下RAG", "掌握python", "如何学习", "为什么用向量", "推导贝叶斯公式", "讲原理"]:
            assert _is_rule_simple(t) is False, f"不应判简单: {t}"

    def test_too_long_not_simple(self):
        """超过 30 字 → 不判简单"""
        assert _is_rule_simple("这是一段比较长的文字描述了我想要了解的详细内容三十多个字了吧") is False

    def test_short_without_keyword_simple(self):
        """≤10 字且无硬关键词 → 简单"""
        assert _is_rule_simple("今天天气不错呀") is True

    def test_medium_no_keyword_not_simple(self):
        """11-30 字、无硬关键词、非问候 → 交给模型（不简单）"""
        assert _is_rule_simple("我想随便聊一聊今天发生的事情") is False


# ---------- _merge_stats：并行节点 task_stats reducer ----------

class TestMergeStats:
    def test_token_estimate_accumulates(self):
        cur = {"token_estimate": 100, "nodes": {"study": {"ms": 50}}}
        upd = {"token_estimate": 50, "nodes": {"kb": {"ms": 30}}}
        out = _merge_stats(cur, upd)
        assert out["token_estimate"] == 150, "token_estimate 必须累加"
        assert out["nodes"] == {"study": {"ms": 50}, "kb": {"ms": 30}}, "并行节点统计须合并"

    def test_plain_value_overwrites(self):
        out = _merge_stats({"x": 1}, {"x": 3})
        assert out["x"] == 3

    def test_empty_inputs(self):
        assert _merge_stats({}, {}) == {}
        out = _merge_stats({"a": 1}, None)
        assert out == {"a": 1}
        out = _merge_stats(None, {"b": 2})
        assert out == {"b": 2}

    def test_current_not_mutated(self):
        cur = {"token_estimate": 10}
        _merge_stats(cur, {"token_estimate": 5})
        assert cur["token_estimate"] == 10, "reducer 不得就地修改共享 state"


# ---------- _build_out_cand：输出增强模板候选构造 ----------

class TestBuildOutCand:
    def test_non_output_enhance_template(self):
        assert _build_out_cand([], "基础") == ""
        assert _build_out_cand([{"id": "main", "subAgents": [{"id": "t", "name": "树状结构", "form": "树状"}]}], "检索增强") == ""

    def test_output_enhance_without_subs(self):
        assert _build_out_cand([], "输出增强") == ""
        assert _build_out_cand([{"id": "main", "subAgents": []}], "输出增强") == ""

    def test_output_enhance_with_subs(self):
        agents = [{"id": "main", "subAgents": [
            {"id": "tree", "name": "树状结构", "form": "树状"},
            {"id": "card", "name": "要点卡片", "form": "卡片"},
        ]}]
        out = _build_out_cand(agents, "输出增强")
        assert "tree=树状结构(树状)" in out
        assert "card=要点卡片(卡片)" in out
        assert "output_subs" in out
        assert "0-1 个" in out


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
