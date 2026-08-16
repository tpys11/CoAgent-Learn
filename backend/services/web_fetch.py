# -*- coding: utf-8 -*-
"""网页抓取 + SSRF 防护：安全 GET / 私网地址拦截 / 站点正文抓取。"""

MAX_LINK_PAGES = 12
MAX_LINK_CHARS = 200000


def is_disallowed_host(host: str) -> bool:
    """拒绝私网/回环/链路本地主机（SSRF 防护，参考 DeepTutor web_fetch）"""
    import ipaddress
    import socket
    candidate = (host or "").strip().strip("[]")
    try:
        ip = ipaddress.ip_address(candidate)
        return (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified)
    except ValueError:
        pass
    lower = candidate.lower()
    if lower in {"localhost", "ip6-localhost", "ip6-loopback"} or lower.endswith(".local"):
        return True
    try:
        infos = socket.getaddrinfo(candidate, None)
    except OSError:
        return True
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
                return True
        except ValueError:
            continue
    return False


def safe_get(page_url: str, timeout: int = 15) -> str:
    """安全 GET：不跟随重定向，手动逐跳（最多 3 跳）校验 host（防 SSRF 经 302 绕过私网/云 metadata）。"""
    from urllib.parse import urlparse
    import requests as _req
    from core.config import config as _cfg
    headers = {"User-Agent": "Mozilla/5.0 (coagent-learn)"}
    proxies = {"http": _cfg.PROXY_URL, "https": _cfg.PROXY_URL} if _cfg.PROXY_URL else None
    cur = page_url
    for _ in range(4):
        host = (urlparse(cur).hostname or "").strip()
        if not host or is_disallowed_host(host):
            raise ValueError("拒绝访问私网/回环地址")
        resp = _req.get(cur, timeout=timeout, headers=headers, allow_redirects=False, proxies=proxies)
        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("Location"):
            cur = _req.compat.urljoin(cur, resp.headers["Location"])
            continue
        resp.raise_for_status()
        return resp.text
    raise ValueError("重定向次数过多")


def fetch_site_text(base_url: str) -> str:
    """链接上传抓取：sitemap 定位全部页面 → requests 并发抓取 → trafilatura 提取正文。"""
    import re as _re
    from urllib.parse import urlparse
    from concurrent.futures import ThreadPoolExecutor
    base_host = urlparse(base_url).netloc

    def _page_text(u: str) -> str:
        import trafilatura
        try:
            return (trafilatura.extract(safe_get(u, timeout=15), url=u, include_comments=False, include_tables=True) or "").strip()
        except Exception:
            return ""

    page_urls: list[str] = []
    try:
        r = safe_get(base_url.rstrip("/") + "/sitemap.xml", timeout=15)
        page_urls = [u for u in _re.findall(r"<loc>([^<]+)</loc>", r)
                     if urlparse(u).netloc == base_host and "/index." not in u]
    except Exception:
        pass
    if base_url not in page_urls:
        page_urls.insert(0, base_url)

    pages = page_urls[:MAX_LINK_PAGES]
    results: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=6) as _ex:
        for u, t in zip(pages, _ex.map(_page_text, pages)):
            if len(t) >= 20:
                results.append((u, t))
            if sum(len(x[1]) for x in results) >= MAX_LINK_CHARS:
                break
    return _re.sub(r"\n{3,}", "\n\n", "\n".join("=== 页面: " + u + " ===\n\n" + t for u, t in results))[:MAX_LINK_CHARS]
