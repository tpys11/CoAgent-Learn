"""示例 Skills — 后续所有技能按此模式新增"""

from skills import Skill
from skills.registry import registry


class KnowledgeRetrieval(Skill):
    """知识库检索"""
    name = "knowledge_retrieval"
    description = "从 Chroma 向量库检索与用户问题相关的文档片段，返回 Top-K 最相关结果"
    input_schema = {
        "query": {"type": "string", "description": "检索查询语句"},
        "top_k": {"type": "integer", "description": "返回结果数量，默认5"},
    }

    def execute(self, query: str = "", top_k: int = 5, **kwargs) -> dict:
        # TODO: 接入 Chroma 真实检索
        return {
            "results": [{"content": f"关于 [{query}] 的知识片段（Chroma 接入后生效）", "score": 0.9}],
            "total": 1,
        }


class UserDiagnosis(Skill):
    """学情诊断"""
    name = "user_diagnosis"
    description = "分析用户的知识水平和学习背景，输出诊断画像"
    input_schema = {
        "user_input": {"type": "string", "description": "用户的原始输入或交互历史"},
    }

    def execute(self, user_input: str = "", **kwargs) -> dict:
        return {
            "level": "intermediate",
            "strengths": ["Python基础", "LLM概念"],
            "gaps": ["LangGraph编排", "向量检索原理"],
            "suggestion": "建议从LangGraph入手",
        }


class MemoryReadWrite(Skill):
    """记忆读写"""
    name = "memory_ops"
    description = "读取或写入用户三层记忆（L1事件/L2事实/L3画像）"
    input_schema = {
        "action": {"type": "string", "description": "read 或 write"},
        "layer": {"type": "string", "description": "L1/L2/L3"},
        "data": {"type": "object", "description": "写入的数据（write时必填）"},
    }

    def execute(self, action: str = "read", layer: str = "L2", data: dict = None, **kwargs) -> dict:
        # TODO: 接入 SQLite 用户画像存储
        if action == "read":
            return {"memory": {layer: "暂无数据（SQLite 接入后生效）"}}
        return {"status": "written", "layer": layer}


class WebSearch(Skill):
    """联网搜索"""
    name = "web_search"
    description = "通过 SearXNG 元搜索引擎联网查找信息，返回摘要和来源链接"
    input_schema = {
        "query": {"type": "string", "description": "搜索关键词"},
        "max_results": {"type": "integer", "description": "最大结果数，默认3"},
    }

    def execute(self, query: str = "", max_results: int = 3, **kwargs) -> dict:
        # TODO: 接入 SearXNG
        return {
            "results": [{"title": f"搜索：{query}", "snippet": "SearXNG 接入后生效", "url": ""}],
            "total": 0,
        }


# ---- 注册所有 Skill ----
registry.register(KnowledgeRetrieval())
registry.register(UserDiagnosis())
registry.register(MemoryReadWrite())
registry.register(WebSearch())
