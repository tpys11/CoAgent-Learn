from skills import Skill


class KnowledgeRetrieval(Skill):
    name = "knowledge_retrieval"
    description = "从 Chroma 向量库检索与用户问题相关的文档片段"
    input_schema = {"query": {"type": "string", "description": "检索查询"}, "top_k": {"type": "integer", "description": "返回数量"}}

    def execute(self, query="", top_k=5, **kwargs):
        return {"results": [{"content": f"关于 [{query}] 的知识片段", "score": 0.9}], "total": 1}
