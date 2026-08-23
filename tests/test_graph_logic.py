"""多智能体协同调度逻辑单元测试（pytest）

覆盖 agents/graph.py 的确定性纯逻辑（不依赖 LLM/网络）：
- _is_rule_simple 程序规则极速路径判定（意图分流的确定性分支）
- _merge_stats 并行节点统计 reducer（LangGraph 并行合并正确性）
- _resolve_plan_targets 档位路由目标判定（极速/思考/研究档差异 + 研究档强制搜索）

对应官方提交要求："单元测试用例（针对多智能体协同调度逻辑等核心模块）"。
运行（后端容器内）：python -m pytest tests/test_graph_logic.py -v
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.graph import _is_rule_simple, _merge_stats, _resolve_plan_targets


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


# ---------- _resolve_plan_targets：档位路由目标判定 ----------

class TestResolvePlanTargets:
    def test_speed_mode_always_kb(self):
        """极速档：固定做知识库检索（全局降幻觉·纯工具调用保持极速），跳过联网搜索/子Agent整理"""
        assert _resolve_plan_targets("极速", []) == ["kb"]
        assert _resolve_plan_targets("极速", ["知识库管理"]) == ["kb"]
        assert _resolve_plan_targets("极速", ["搜索增强"]) == ["kb"]

    def test_think_mode_no_plan_defaults_kb(self):
        """思考档无plan 为空 → 默认走知识库检索（2026-08 行为变更：回答须有据可依）"""
        assert _resolve_plan_targets("思考", []) == ["kb"]

    def test_think_mode_kb_when_planned(self):
        """思考档：plan 含知识库管理 → 调 kb 节点"""
        assert _resolve_plan_targets("思考", ["知识库管理"]) == ["kb"]
        assert _resolve_plan_targets("思考", ["搜索增强"]) == ["kb"]
        assert _resolve_plan_targets("思考", ["知识库管理", "搜索增强"]) == ["kb"]

    def test_research_mode_forces_search(self):
        """研究档：即使规划不含搜索，也强制并入搜索增强（保证一轮联网搜索）"""
        assert _resolve_plan_targets("研究", []) == ["kb"]
        assert _resolve_plan_targets("研究", ["知识库管理"]) == ["kb"]
        assert _resolve_plan_targets("研究", ["搜索增强"]) == ["kb"]

    def test_plan_not_mutated(self):
        """不得就地修改传入的 plan（并行状态共享安全）"""
        p = ["知识库管理"]
        _resolve_plan_targets("研究", p)
        assert p == ["知识库管理"], "研究档强制搜索不得写入原 plan"


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-v"]))
