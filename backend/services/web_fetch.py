# -*- coding: utf-8 -*-
"""网页抓取 + SSRF 防护：安全 GET / 私网地址拦截 / 站点结构化摄取。

v2（2026-08-23）：从"拼接大字符串"升级为"结构化多页摄取"——
fetch_site_pages 返回 [{url,title,markdown}]，调用方按「站点→页面→章节」层级组装；
新增来源分类与 GitHub 仓库适配器（目录即大纲，零噪声）。
历史硬伤修复：12 页/200k 字符双上限导致的缺章节与伪标题污染。
"""

import re

MAX_LINK_PAGES = 60       # 站点最多摄取页数（原 12，李博杰整站案例实测不够）
MAX_PAGE_CHARS = 300_000  # 单页字符保险丝
MIN_PAGE_CHARS = 20

GITHUB_API = "https://api.github.com"
GITHUB_RAW = "https://raw.githubusercontent.com"


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
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
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


def _page_text(u: str) -> str:
    """单页 trafilatura 提取 → markdown；¶ 标题锚点剥离；超长保险丝截断"""
    import trafilatura
    md = trafilatura.extract(safe_get(u, timeout=15), url=u, include_comments=False,
                             include_tables=True, output_format="markdown") or ""
    lines = []
    for line in md.splitlines():
        if line.lstrip().startswith("#"):
            line = line.replace("¶", "").rstrip()
        lines.append(line[:MAX_PAGE_CHARS] if len(line) > MAX_PAGE_CHARS else line)
    text = "\n".join(lines).strip()
    return text[:MAX_PAGE_CHARS]


def _first_heading_text(md: str) -> str:
    """提取正文首个标题行文本（去 # 与空白），无则空串。页面命名优先用它。"""
    in_fence = False
    for line in (md or "").splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            m = re.match(r"^#{1,6}\s+(.+)$", s)
            if m:
                name = re.sub(r"[#¶]+", "", m.group(1)).strip()
                return name[:40]
    return ""


def _page_title(u: str, md: str = "") -> str:
    """页面命名：优先页内首个标题文本，URL 尾段作兜底"""
    from urllib.parse import unquote
    from_url = _first_heading_text(md)
    if from_url:
        return from_url
    segs = [unquote(s) for s in urlparse(u).path.split("/") if s.strip()]
    if not segs:
        return "首页"
    title = segs[-1]
    if not title or title.lower() in ("index", "index.html") and len(segs) > 1:
        title = segs[-2]
    title = re.sub(r"\.(html?|md|php|aspx)$", "", title, flags=re.I)
    title = re.sub(r"[-_]+", " ", title).strip()
    return title or "首页"


def fetch_site_pages(base_url: str) -> list[dict]:
    """文档站结构化摄取：sitemap 枚举全站 → 按路径深度排序（浅页优先）→ 并发提取。
    返回 [{url, title, markdown}]；不再做整体字符串拼接与截断。"""
    from urllib.parse import urlparse
    from concurrent.futures import ThreadPoolExecutor
    base_host = urlparse(base_url).netloc
    page_urls: list[str] = []
    try:
        r = safe_get(base_url.rstrip("/") + "/sitemap.xml", timeout=15)
        page_urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", r)
                     if urlparse(u).netloc == base_host and "/index." not in u]
    except Exception:
        pass
    if base_url not in page_urls:
        page_urls.insert(0, base_url)
    page_urls.sort(key=lambda u: u.count("/"))
    page_urls = page_urls[:MAX_LINK_PAGES]

    results: list[dict] = []

    def _job(u: str):
        t = _page_text(u)
        return {"url": u, "title": _page_title(u, t), "markdown": t}

    with ThreadPoolExecutor(max_workers=6) as _ex:
        for item in _ex.map(_job, page_urls):
            if len(item["markdown"]) >= MIN_PAGE_CHARS:
                results.append(item)
    return results


# ── 来源分类与 GitHub 适配器 ──────────────────────────────────────────

_GITHUB_SKIP_PREFIXES = ("node_modules/", ".github/", ".vscode/", "translations/")


def classify_url(url: str) -> str:
    """来源分类：github（仓库直连）/ docs（文档站·sitemap）。"""
    from urllib.parse import urlparse
    host = (urlparse(url).netloc or "").lower()
    parts = [s for s in urlparse(url).path.split("/") if s.strip()]
    if host == "github.com" and len(parts) >= 2:
        return "github"
    return "docs"


def parse_github_url(url: str) -> tuple[str, str, str | None]:
    """解析 github.com/{owner}/{repo}[/tree/{ref}] 形式 → (owner, repo, ref|None)。"""
    from urllib.parse import urlparse
    parts = [s for s in urlparse(url).path.split("/") if s.strip()]
    owner, repo = parts[0], parts[1].removesuffix(".git")
    ref = None
    if len(parts) >= 4 and parts[2] in ("tree", "blob"):
        ref = parts[3]
    return owner, repo, ref


def fetch_github_repo_pages(url: str, max_files: int = 120) -> list[dict]:
    """GitHub 仓库适配器：Git Trees API 拉 .md 文件树 → raw 直读。
    目录路径映射为页面标题（大纲层级随仓库目录而来）；README 排最前。
    匿名限额：API 调用 ≤2 次/次上传（仓库信息+树），raw 下载走 CDN 不计入。"""
    import requests as _req
    from urllib.parse import quote
    from urllib.parse import unquote as _unq
    owner, repo, ref_hint = parse_github_url(url)
    h = {"Accept": "application/vnd.github+json"}
    info = _req.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=h, timeout=30)
    info.raise_for_status()
    ref = ref_hint or info.json().get("default_branch") or "main"
    tree = _req.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{ref}?recursive=1",
        headers=h, timeout=30)
    tree.raise_for_status()
    blobs = [e for e in tree.json().get("tree", [])
             if e.get("type") == "blob" and str(e.get("path", "")).lower().endswith(".md")]
    blobs = [b for b in blobs
             if not b["path"].startswith(".")
             and not any(b["path"].startswith(p) for p in _GITHUB_SKIP_PREFIXES)]
    # README 置顶，其余按路径排序（目录顺序即阅读顺序）
    blobs.sort(key=lambda b: (not str(b["path"]).lower().endswith("readme.md"), b["path"]))
    blobs = blobs[:max_files]

    out: list[dict] = []
    base_raw = f"{GITHUB_RAW}/{owner}/{repo}/{ref}"
    paths = [str(b["path"]) for b in blobs]

    def _download(path: str) -> tuple[str, str] | None:
        try:
            t = _req.get(f"{base_raw}/{quote(path)}", timeout=30).text
        except Exception:
            return None
        if len(t.strip()) < MIN_PAGE_CHARS:
            return None
        return path, t

    # 并发直读（raw 走 CDN，无 API 限额消耗）
    with ThreadPoolExecutor(max_workers=6) as _ex:
        results = list(_ex.map(_download, paths))
    for b, r in zip(blobs, results):
        if not r:
            continue
        path, t = r
        out.append({
            "url": f"https://github.com/{owner}/{repo}/blob/{ref}/{path}",
            "title": _unq(path)[:-3].replace("-", " ").replace("_", " "),
            "markdown": t,
        })
    return out


# ── 层级组装（站点→页面→章节） ────────────────────────────────────────

def demote_headings(md: str, levels: int = 1) -> str:
    """整篇 markdown 标题降级 N 层（``` 围栏内不动），用于把页面内容挂到层级树下。"""
    out: list[str] = []
    in_fence = False
    for line in md.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence and re.match(r"^#{1,6}\s", line):
            cur = len(line) - len(line.lstrip("#"))
            new = min(6, cur + levels)
            out.append("#" * new + line.lstrip("#"))
        else:
            out.append(line)
    return "\n".join(out)


def assemble_hierarchical(site_title: str, pages: list[dict]) -> str:
    """组装「站点(H1) → 页面(H2) → 页内标题(降一级后)」的标准 Markdown。
    页面标题去重（同名追加序号）；页内容含 ``` 时降级自动跳过围栏行。"""
    parts: list[str] = [f"# {site_title}"]
    used: set[str] = set()
    for idx, p in enumerate(pages):
        title = (p.get("title") or "").strip() or f"页面 {idx + 1}"
        base, i = title, 2
        while title in used:
            title = f"{base} ({i})"
            i += 1
        used.add(title)
        parts.append(f"\n\n## {title}\n\n")
        parts.append(demote_headings(p.get("markdown") or "", 1))
    return "".join(parts).strip()


def derive_site_title(url: str) -> str:
    """从 URL 推导站点标题：优先最后一个有意义的路径段，否则域名。"""
    from urllib.parse import urlparse, unquote
    host = (urlparse(url).netloc or "").strip()
    segs = [unquote(s) for s in urlparse(url).path.split("/") if s.strip()]
    for seg in reversed(segs):
        if seg.lower() not in ("zh", "en", "index", "index.html", "home"):
            return re.sub(r"[-_]+", " ", seg).strip() or host
    return host
