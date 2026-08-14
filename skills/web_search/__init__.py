"""联网搜索（真实实现）：通过 AnySearch 统一搜索引擎执行搜索
（AnySearch：免费注册/匿名可用；通用搜索 + 垂直领域搜索；web_search 归主 Agent 调度）
"""
import os
import re
import subprocess

from skills import Skill


class WebSearch(Skill):
    name = "web_search"
    description = "通过 AnySearch 搜索引擎联网查找信息（真实搜索，通用/垂直领域）"
    input_schema = {"query": {"type": "string", "description": "搜索关键词"}, "max_results": {"type": "integer", "description": "最大结果数"}}

    def execute(self, query="", max_results=5, **kwargs):
        """调用 AnySearch CLI 搜索并解析结果；失败返回空（不阻塞主流程）"""
        try:
            cli = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "anysearch", "scripts", "anysearch_cli.py")
            if not os.path.exists(cli):
                return {"results": [], "total": 0}
            cmd = ["python", cli, "search", str(query), "--max_results", str(min(int(max_results or 5), 20))]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
            text = (r.stdout or "").strip()
            if not text:
                return {"results": [], "total": 0}
            results = _parse_md(text)
            return {"results": results, "total": len(results)}
        except Exception:
            return {"results": [], "total": 0}


def _parse_md(text: str) -> list:
    """解析 AnySearch CLI 的 Markdown 输出 → [{title, url, snippet}]"""
    results = []
    for block in re.split(r"### \d+\.\s*", text)[1:]:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        title = lines[0].strip()
        url = ""
        snippet = ""
        for ln in lines[1:]:
            m = re.match(r"-\s*\*\*URL\*\*:\s*(\S+)", ln)
            if m:
                url = m.group(1)
            elif ln.startswith("- "):
                snippet = ln[2:].strip()
        if title or url:
            results.append({"title": title, "url": url, "snippet": snippet[:500]})
    return results
