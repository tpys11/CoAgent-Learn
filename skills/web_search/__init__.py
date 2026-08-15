"""联网搜索（真实实现）：通过 AnySearch 统一搜索引擎执行搜索
（AnySearch：免费注册/匿名可用；通用搜索 + 垂直领域搜索；web_search 归学习助手调度）

固定规则（与前端「对话→全局性基础设定→搜索机制」文案对齐）：
- 并行执行多个搜索查询（原始问题 + 拆解的关键子查询），汇总去重
- 优质信息源（官方文档/权威社区，见 rules.QUALITY_SOURCE_POOL）命中置顶
- 返回 10-20 条优质结果，供生成阶段参考
"""
import os
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from skills import Skill


def _quality_score(url: str) -> int:
    """优质信息源加分：命中 backend.rules 优质源域名池则 +1；edu/org 域名额外 +1"""
    try:
        from rules import QUALITY_SOURCE_POOL
    except Exception:
        QUALITY_SOURCE_POOL = []
    host = urllib.parse.urlparse(url or "").netloc.lower()
    score = 0
    for d in QUALITY_SOURCE_POOL:
        if host == d or host.endswith("." + d):
            score += 1
    if host.endswith(".edu") or host.endswith(".org"):
        score += 1
    return score


def _search_one(query: str, max_results: int) -> list:
    cli = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "anysearch", "scripts", "anysearch_cli.py")
    if not os.path.exists(cli):
        return []
    import subprocess
    try:
        cmd = ["python", cli, "search", str(query), "--max_results", str(max_results)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        text = (r.stdout or "").strip()
        if not text:
            return []
        return _parse_md(text)
    except Exception:
        return []


class WebSearch(Skill):
    name = "web_search"
    description = "通过 AnySearch 搜索引擎联网查找信息（真实搜索，通用/垂直领域）"
    input_schema = {"query": {"type": "string", "description": "搜索关键词"}, "max_results": {"type": "integer", "description": "最大结果数"}}

    def execute(self, query="", max_results=5, **kwargs):
        """并行多查询搜索 → 合并去重 → 优质源置顶 → 返回 10-20 条；失败返回空（不阻塞主流程）"""
        try:
            query = str(query or "").strip()
            if not query:
                return {"results": [], "total": 0}
            per = max(5, min(int(max_results or 5), 12))
            # 并行查询集合：原始问题 + 按关键词拆解的子查询（覆盖多角度，提升召回与优质源命中）
            queries = _expand_queries(query)
            seen: dict = {}
            with ThreadPoolExecutor(max_workers=min(len(queries), 4)) as _ex:
                _futures = [_ex.submit(_search_one, q, per) for q in queries]
                for _f in _futures:
                    try:
                        for r in _f.result():
                            key = (r.get("url") or r.get("title") or "").strip()
                            if not key or key in seen:
                                continue
                            r["quality"] = _quality_score(r.get("url", ""))
                            seen[key] = r
                    except Exception:
                        continue
            results = list(seen.values())
            # 优质源置顶（quality 降序），再按条数截断到 20
            results.sort(key=lambda r: -r.get("quality", 0))
            results = results[:20]
            return {"results": results, "total": len(results)}
        except Exception:
            return {"results": [], "total": 0}


def _expand_queries(query: str) -> list:
    """原始问题 + 按连接词拆出的关键子查询（去重、限长）"""
    out = [query]
    # 拆解：分隔「、，, 和/与」的并列子主题，各自单独搜索（避免长问题召回差）
    for sep in ["、", "，", ",", " 和 ", " 与 "]:
        if sep in query:
            for part in re.split(re.escape(sep), query):
                part = part.strip()
                if 2 <= len(part) <= 40 and part not in out:
                    out.append(part)
            break  # 只拆一层
    return out[:4]


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
