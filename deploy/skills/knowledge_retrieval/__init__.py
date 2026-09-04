from skills import Skill


class KnowledgeRetrieval(Skill):
    name = "knowledge_retrieval"
    description = "从 Chroma 向量库检索与用户问题相关的文档片段"
    input_schema = {"query": {"type": "string", "description": "检索查询"}, "project_id": {"type": "string", "description": "项目ID"}, "top_k": {"type": "integer", "description": "返回数量"}}

    def execute(self, query="", project_id="default", top_k=5, include_images=True, rerank=True, **kwargs):
        try:
            from core.knowledge_service import search
            results = search(project_id, query, top_k, include_images=include_images, rerank=rerank)
            return {"results": results, "total": len(results)}
        except Exception as e:
            return {"results": [], "total": 0, "error": str(e)}
