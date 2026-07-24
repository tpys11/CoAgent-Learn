from skills import Skill


class WebSearch(Skill):
    name = "web_search"
    description = "通过 SearXNG 元搜索引擎联网查找信息"
    input_schema = {"query": {"type": "string", "description": "搜索关键词"}, "max_results": {"type": "integer", "description": "最大结果数"}}

    def execute(self, query="", max_results=3, **kwargs):
        return {"results": [{"title": f"搜索：{query}", "snippet": "SearXNG 接入后生效", "url": ""}], "total": 0}
