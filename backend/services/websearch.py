# -*- coding: utf-8 -*-
"""独立联网搜索（backend 直连 anysearch，不走 skills.registry / 不依赖容器 skill 文件）。
用于「资源生成 / 领域生成」场景找真实链接；anysearch 免费、匿名可用。
与 deploy/skills/anysearch CLI 同一协议：POST api.anysearch.com/mcp，JSON-RPC tools/call name=search。
"""
import json
import re
import requests

_ENDPOINT = "https://api.anysearch.com/mcp"
_HEADERS = {"Content-Type": "application/json"}
_TIMEOUT = 30


def search(query: str, max_results: int = 5) -> list:
    """搜索真实网页，返回 [{title, url, snippet}]；失败/空返回 []（不阻塞调用方）。"""
    query = str(query or "").strip()
    if not query:
        return []
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": "search", "arguments": {"query": query, "max_results": min(int(max_results or 5), 10)}},
        }
        resp = requests.post(_ENDPOINT, json=payload, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return []
        result = data.get("result", {})
        text = ""
        for item in (result.get("content") or []):
            if item.get("type") == "text":
                text = item.get("text", "")
                break
        if not text:
            text = json.dumps(result, ensure_ascii=False)
        return _parse_md(text)
    except Exception:
        return []


def search_multi(queries, max_per: int = 4) -> list:
    """多查询并行搜索 → 按序合并去重（保留最先出现），供章节/主题多角度找资源。"""
    from concurrent.futures import ThreadPoolExecutor
    qs = [str(q).strip() for q in (queries or []) if str(q).strip()]
    if not qs:
        return []
    with ThreadPoolExecutor(max_workers=min(len(qs), 4)) as ex:
        all_res = list(ex.map(lambda q: search(q, max_per), qs))
    seen, out = set(), []
    for batch in all_res:
        for r in batch or []:
            url = (r.get("url") or "").strip()
            if url and url not in seen:
                seen.add(url)
                out.append(r)
        if len(out) >= 8:
            break
    return out[:8]


def _parse_md(text: str) -> list:
    """解析 anysearch 返回的 Markdown → [{title, url, snippet}]"""
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
