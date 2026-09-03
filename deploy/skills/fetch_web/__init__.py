"""fetch_web：抓取指定网页内容并提取正文文本"""
import re
import requests
from skills import Skill


class FetchWeb(Skill):
    name = "fetch_web"
    description = "抓取指定网页内容并提取正文文本"
    input_schema = {"url": {"type": "string", "description": "网页链接"}, "max_chars": {"type": "integer", "description": "最大返回字符数"}}

    def execute(self, url="", max_chars=3000, **kwargs):
        if not url:
            return {"results": [], "total": 0, "error": "缺少 url 参数"}
        try:
            r = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            html = r.text
            text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return {"results": [{"title": url, "content": text[:max_chars]}], "total": 1, "status": r.status_code}
        except Exception as e:
            return {"results": [], "total": 0, "error": str(e)[:200]}
