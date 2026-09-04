# -*- coding: utf-8 -*-
"""gen_image 资源生成技能：按主题搜索免费版权图片（Wikimedia Commons 主 + Openverse 备）。

Wave3 新增。设计：
- 主源 Wikimedia Commons（免费无 key，CC 图）；fallback Openverse（免费无 key）。
- 纯函数层（_parse_wikimedia/_parse_openverse/_dedupe/search_images）可独立测试。
- 关键词策略：短内容直接用；长内容（>40 字）先 LLM 提取 2 个关键词，LLM 失败回退截断。
契约：成功 {"content": str(markdown)} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
import re

import requests

from skills import Skill


_WIKIMEDIA_URL = "https://commons.wikimedia.org/w/api.php"
_OPENVERSE_URL = "https://api.openverse.org/v1/images/"
# Wikimedia 官方拒绝默认 python-requests UA（HTTP 403），需自定义 UA
_UA = {"User-Agent": "coAgent-Learn/1.0 (educational project)"}


def _parse_wikimedia(data: dict) -> list:
    """解析 Wikimedia API 响应 → [{url,title,source}]；过滤 width<400；任何异常返回 []。"""
    try:
        out = []
        for p in (data.get("query", {}).get("pages", {}) or {}).values():
            info = (p.get("imageinfo") or [{}])[0]
            url = info.get("thumburl") or info.get("url") or ""
            if not url:
                continue
            width = info.get("thumbwidth") or info.get("width") or 0
            if width and width < 400:
                continue
            title = (p.get("title") or "").replace("File:", "", 1)
            out.append({"url": url, "title": title, "source": "wikimedia"})
        return out
    except Exception:
        return []


def _parse_openverse(data: dict) -> list:
    """解析 Openverse API 响应 → [{url,title,source}]；任何异常返回 []。"""
    try:
        out = []
        for r in (data.get("results") or []):
            url = r.get("url") or ""
            if not url:
                continue
            out.append({"url": url, "title": r.get("title") or "", "source": "openverse"})
        return out
    except Exception:
        return []


def _dedupe(images: list) -> list:
    """按 url 去重保序。"""
    seen = set()
    out = []
    for img in images:
        u = img.get("url")
        if u and u not in seen:
            seen.add(u)
            out.append(img)
    return out


def search_images(query: str, limit: int = 2) -> list:
    """先 Wikimedia 后 Openverse 搜索图片；合并去重截断 limit；请求异常静默返回 []。"""
    kw = (query or "").strip()
    if not kw:
        return []
    results = []
    try:
        resp = requests.get(
            _WIKIMEDIA_URL,
            params={
                "action": "query", "generator": "search", "gsrsearch": kw,
                "gsrnamespace": 6, "gsrlimit": 5,
                "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": 800,
                "format": "json",
            },
            headers=_UA,
            timeout=8,
        )
        resp.raise_for_status()
        results.extend(_parse_wikimedia(resp.json()))
    except Exception:
        pass  # 边界处保留宽口径（含内建网络异常族）：主源败转 Openverse 备源
    if not results:
        try:
            resp = requests.get(_OPENVERSE_URL, params={"q": kw, "page_size": 5}, headers=_UA, timeout=8)
            resp.raise_for_status()
            results.extend(_parse_openverse(resp.json()))
        except Exception:
            pass  # 边界处保留宽口径：备源也败返回空，由调用方兜底
    return _dedupe(results)[:limit]


_LLM_KEYWORD_PROMPT = (
    "从以下内容提取 2 个最适合搜索配图的英文关键词（供 Wikimedia 检索），只输出逗号分隔，不要其他文字。\n内容：\n"
)


class GenImage(Skill):
    name = "gen_image"
    category = "resource"
    description = "按主题搜索免费版权图片（Wikimedia Commons / Openverse）"
    input_schema = {
        "content": {"type": "string", "description": "主题描述或学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "Markdown 图片列表（![] + 图源）"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            q = (content or "").strip()
            if not q:
                return {"error": "源内容为空"}
            keywords = [q]
            if len(q) > 40:
                keywords = self._extract_keywords(q, api_key, base_url, model)
            images = []
            for kw in keywords[:2]:
                images.extend(search_images(kw, limit=2))
            images = _dedupe(images)[:6]
            if not images:
                return {"error": "未找到合适图片，请换个描述重试"}
            lines = []
            for img in images:
                lines.append(f"![{img['title']}]({img['url']})")
                lines.append(f"*图源：{img['source']}*")
                lines.append("")
            return {"content": "\n".join(lines).strip()}
        except Exception as e:
            return {"error": str(e)[:200]}

    def _extract_keywords(self, text: str, api_key: str, base_url: str, model: str) -> list:
        """长内容 → LLM 提取 2 个关键词；失败/空回退 text[:40]。"""
        try:
            from core.base_llm import DeepSeekLLM
            from core.model_provider import resolve_model, current_tier
            _spec = resolve_model("main", current_tier())  # R-D S3：缺省模型/端点改问注册表（调用方传值优先，test 档随决策 38）
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or _spec.model,
                base_url=base_url or _spec.base_url,
                thinking=False,
            )
            out = llm.chat([{"role": "user", "content": _LLM_KEYWORD_PROMPT + text[:4000]}], temperature=0.3)
            out = (out or "").strip()
            kws = [k.strip() for k in re.split(r"[，,]", out) if k.strip()][:2]
            return kws or [text[:40]]
        except Exception:
            return [text[:40]]