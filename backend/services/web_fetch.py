# -*- coding: utf-8 -*-
"""网页抓取 + SSRF 防护：安全 GET / 私网地址拦截 / 站点结构化摄取。

v2（2026-08-23）：从"拼接大字符串"升级为"结构化多页摄取"——
fetch_site_pages 返回 [{url,title,markdown}]，调用方按「站点→页面→章节」层级组装；
新增来源分类与 GitHub 仓库适配器（目录即大纲，零噪声）。
历史硬伤修复：12 页/200k 字符双上限导致的缺章节与伪标题污染。
"""

import re
from concurrent.futures import ThreadPoolExecutor

MAX_LINK_PAGES = 60       # 站点最多摄取页数（原 12，李博杰整站案例实测不够）
GITHUB_MAX_FILES = 120    # GitHub 仓库最多摄取 .md 数
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


def fetch_site_pages(base_url: str, max_pages: int | None = None,
                     include_groups=(), exclude_groups=()) -> list[dict]:
    """文档站结构化摄取：sitemap 枚举全站 → 语言组过滤 → 按路径深度排序（浅页优先）→ 并发提取。
    include/exclude_groups 为语言路径段前缀（如 /en/，来自 probe_url 的 groups）；
    无语言段的页面不受 include 限制。返回 [{url, title, markdown}]。"""
    from urllib.parse import urlparse
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
    page_urls = _apply_doc_groups(base_url, page_urls, include_groups, exclude_groups)
    page_urls.sort(key=lambda u: u.count("/"))
    page_urls = page_urls[:max_pages or MAX_LINK_PAGES]

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

# ── 语言识别与结构分组（上传前预览用） ────────────────────────────────

_LANG_LABELS = {"en": "英语", "ja": "日语", "ko": "韩语", "zh": "中文", "zh-cn": "简体中文",
                "zh-tw": "繁体中文", "zhtw": "繁体中文", "fr": "法语", "de": "德语", "es": "西班牙语",
                "ru": "俄语", "pt": "葡萄牙语", "it": "意大利语", "tr": "土耳其语", "ar": "阿拉伯语",
                "he": "希伯来语", "hu": "匈牙利语", "id": "印尼语", "ta": "泰米尔语", "vi": "越南语"}
_FOREIGN_LANG_CODES = {"en", "ja", "ko", "fr", "de", "es", "ru", "pt", "it", "tr",
                       "ar", "he", "hu", "id", "ta", "vi"}


def _lang_label(code: str) -> str:
    return _LANG_LABELS.get(code.lower(), code)


def _gh_group_key(path: str) -> str | None:
    """GitHub .md 路径 → 分组键（顶层目录前缀；translations 展开到语言级）；根目录单文件返回 None。"""
    segs = path.split("/")
    if len(segs) == 1:
        return None
    if segs[0].lower() == "translations" and len(segs) >= 3:
        return f"translations/{segs[1]}/"
    return segs[0] + "/"


def _doc_scope_path(base_url: str, u: str) -> str:
    """u 相对站点根的路径（剥离站点自身挂载前缀，如 /book/），保留前导 /。"""
    from urllib.parse import urlparse as _up
    base_path = (_up(base_url).path or "").rstrip("/")
    p = _up(u).path or "/"
    if base_path and (p + "/").startswith(base_path + "/"):
        return p[len(base_path):] or "/"
    return p


def _doc_group_key(base_url: str, u: str) -> str | None:
    """文档站 URL → 一级路径分组键（如 chapter1/、book-es/、en/），与 GitHub 目录分组对齐；
    站点根页面返回 None（视作主内容，不受分组过滤影响）。"""
    sp = _doc_scope_path(base_url, u).lstrip("/")
    if not sp:
        return None
    seg = sp.split("/")[0]
    if not seg:
        return None
    return seg.lower() + "/"


def _seg_lang_code(seg: str) -> str | None:
    """段的语言码推断：纯语言码（en、zh-cn）或连字符后缀（book-es、tr-ja）。"""
    s = seg.lower()
    if s in _LANG_LABELS:
        return s
    tail = s.rsplit("-", 1)[-1]
    if tail != s and tail in _LANG_LABELS:
        return tail
    return None


def _seg_label(seg: str) -> str:
    """分组显示名：语言段给人类可读名，翻译式命名（book-es）标注为「翻译 · X」。"""
    code = _seg_lang_code(seg)
    if not code:
        return seg
    base = seg.lower()
    if base == code:
        return _LANG_LABELS[code]
    prefix = base[: len(base) - len(code) - 1]
    if "book" in prefix or "translation" in prefix or "i18n" in prefix:
        return f"翻译 · {_LANG_LABELS[code]}"
    return f"{seg}（{_LANG_LABELS[code]}）"


def _github_tree(owner: str, repo: str, ref_hint: str | None) -> tuple[str, list[str]]:
    """仓库信息 + 递归树各一次 API 调用 → (ref, 全部 .md 路径)。"""
    import requests as _req
    h = {"Accept": "application/vnd.github+json"}
    info = _req.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=h, timeout=30)
    info.raise_for_status()
    ref = ref_hint or info.json().get("default_branch") or "main"
    tree = _req.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{ref}?recursive=1",
                    headers=h, timeout=30)
    tree.raise_for_status()
    return ref, [e["path"] for e in tree.json().get("tree", [])
                 if e.get("type") == "blob" and str(e.get("path", "")).lower().endswith(".md")]


def _apply_gh_groups(paths: list[str], include_groups=(), exclude_groups=()) -> list[str]:
    """按组前缀过滤 .md 路径：根文件始终保留；include 非空时目录文件须命中；
    exclude 命中即剔除。硬跳过前缀（. 开头/node_modules/translations）仍生效，
    除非被 include 显式点名——用户可借此取回 translations/ja 等被默认排除的语言。"""
    inc = [x for x in (include_groups or []) if x]
    exc = [x for x in (exclude_groups or []) if x]
    out: list[str] = []
    for p in paths:
        hard = p.startswith(".") or any(p.startswith(s) for s in _GITHUB_SKIP_PREFIXES)
        if hard and not any(p.startswith(x) for x in inc):
            continue
        g = _gh_group_key(p)
        if inc and g is not None and g not in inc:
            continue
        if exc and g is not None and g in exc:
            continue
        out.append(p)
    return out


def _apply_doc_groups(base_url: str, urls: list[str],
                      include_groups=(), exclude_groups=()) -> list[str]:
    """按一级路径分组过滤 URL：根页面始终保留，分组页须命中 include 且不落 exclude。"""
    inc = {x for x in (include_groups or []) if x}
    exc = {x for x in (exclude_groups or []) if x}
    out: list[str] = []
    for u in urls:
        g = _doc_group_key(base_url, u)
        if g is not None:
            if inc and g not in inc:
                continue
            if g in exc:
                continue
        out.append(u)
    return out


def probe_url(url: str) -> dict:
    """上传前轻量预扫描：只拉结构清单（GitHub Trees API / sitemap），不抓正文、不入库。
    返回 {kind,title_hint,total_files,max_files,truncated,groups,languages,warnings}，
    groups[].default_selected 即前端预勾选建议。"""
    kind = classify_url(url)
    warnings: list[str] = []
    if kind == "github":
        owner, repo, ref_hint = parse_github_url(url)
        _ref, paths = _github_tree(owner, repo, ref_hint)
        base = [p for p in paths
                if not p.startswith(".")
                and not any(p.startswith(s) for s in _GITHUB_SKIP_PREFIXES)]
        root_n = sum(1 for p in paths if "/" not in p)
        counts: dict[str, int] = {}
        for p in paths:          # 用全量路径分组：translations/* 才会出现在可勾选列表
            g = _gh_group_key(p)
            if g:
                counts[g] = counts.get(g, 0) + 1
        has_zh_dir = any(k.split("/")[0].lower().startswith("zh") for k in counts)
        groups: list[dict] = []
        languages: list[dict] = []
        for k in sorted(counts):
            seg0 = k.split("/")[0]
            m_tr = re.match(r"^translations/([^/]+)/$", k)
            code = (m_tr.group(1).lower() if m_tr
                    else seg0.lower() if seg0.lower() in _FOREIGN_LANG_CODES
                    or seg0.lower().startswith("zh") else "")
            foreign = bool(m_tr) or seg0.lower() in _FOREIGN_LANG_CODES
            label = f"翻译 · {_lang_label(code)}" if m_tr else (
                _lang_label(seg0.lower()) if code else seg0.rstrip("/"))
            # 默认勾选：中文/中性目录选中；外语组仅当「无根内容且无任何中文」时兜底全选
            sel = True if not foreign else (
                code.startswith("zh") or not (root_n > 0 or has_zh_dir))
            groups.append({"key": k, "label": label, "count": counts[k],
                           "default_selected": bool(sel)})
            if m_tr:
                languages.append({"code": code, "label": _lang_label(code),
                                  "count": counts[k], "key": k})
        total = len(base)
        if total > GITHUB_MAX_FILES:
            warnings.append(f".md 文件共 {total} 个，超过上限 {GITHUB_MAX_FILES}，"
                            "将按「README 优先→路径排序」取前部分")
        return {"status": "ok", "kind": "github", "title_hint": f"{owner}/{repo}",
                "total_files": total, "max_files": GITHUB_MAX_FILES,
                "truncated": total > GITHUB_MAX_FILES, "groups": groups,
                "languages": languages, "warnings": warnings}
    # 文档站：sitemap 预扫
    from urllib.parse import urlparse as _up
    base_host = _up(url).netloc
    urls: list[str] = []
    try:
        r = safe_get(url.rstrip("/") + "/sitemap.xml", timeout=15)
        urls = [u for u in re.findall(r"<loc>([^<]+)</loc>", r)
                if _up(u).netloc == base_host and "/index." not in u]
    except Exception:
        pass
    if url not in urls:
        urls.insert(0, url)
    plain = sum(1 for u in urls if _doc_group_key(url, u) is None)
    counts: dict[str, int] = {}
    for u in urls:
        g = _doc_group_key(url, u)
        if g:
            counts[g] = counts.get(g, 0) + 1

    def _seg_is_zh(seg: str) -> bool:
        code = _seg_lang_code(seg)
        return bool(code) and code.startswith("zh")

    has_zh = any(_seg_is_zh(k.rstrip("/")) for k in counts)
    has_home = plain > 0 or has_zh
    groups = [{"key": "", "label": "站点主内容", "count": plain,
               "default_selected": True}] if plain else []
    for k in sorted(counts):
        seg = k.rstrip("/")
        code = _seg_lang_code(seg)
        foreign = code in _FOREIGN_LANG_CODES if code else False
        # 外语段默认不勾，除非除它之外没有任何主内容可保（避免空选）
        sel = (not foreign) or (bool(code) and code.startswith("zh")) or (not has_home)
        groups.append({"key": k, "label": _seg_label(seg),
                       "count": counts[k], "default_selected": bool(sel)})
    if len(urls) <= 1:
        warnings.append("未发现 sitemap，将只抓取该页本身")
    elif len(urls) > MAX_LINK_PAGES:
        warnings.append(f"页面数约 {len(urls)}，超过上限 {MAX_LINK_PAGES}，浅层页面优先")
    return {"status": "ok", "kind": "docs", "title_hint": derive_site_title(url),
            "total_files": len(urls), "max_files": MAX_LINK_PAGES,
            "truncated": len(urls) > MAX_LINK_PAGES, "groups": groups,
            "languages": [], "warnings": warnings}


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


def fetch_github_repo_pages(url: str, max_files: int | None = None,
                            include_groups=(), exclude_groups=()) -> list[dict]:
    """GitHub 仓库适配器：Git Trees API 拉 .md 文件树 → raw 直读。
    目录路径映射为页面标题（大纲层级随仓库目录而来）；README 排最前。
    include/exclude_groups 为目录前缀组（如 AI/、translations/ja/，来自 probe_url）；
    include 可显式取回默认硬跳过的 translations/<lang>。匿名限额：API ≤2 次/次上传。"""
    import requests as _req
    from urllib.parse import quote
    from urllib.parse import unquote as _unq
    owner, repo, ref_hint = parse_github_url(url)
    ref, all_paths = _github_tree(owner, repo, ref_hint)
    paths = _apply_gh_groups(all_paths, include_groups, exclude_groups)
    # README 置顶，其余按路径排序（目录顺序即阅读顺序）
    paths.sort(key=lambda p: (not p.lower().endswith("readme.md"), p))
    paths = paths[:max_files or GITHUB_MAX_FILES]

    out: list[dict] = []
    base_raw = f"{GITHUB_RAW}/{owner}/{repo}/{ref}"

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
    for path, r in zip(paths, results):
        if not r:
            continue
        _, t = r
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


def _strip_leading_title(md: str, title: str) -> str:
    """若正文首个标题行与页面标题同源（页面标题本就取自该首标题），剥除这一行——
    否则组装后「页面 H2 + 原 H1 降级 H2」形成同名字兄弟节点，大纲每章重复两次。
    归一化比较（去全部空白）；标题可能被截断至 40 字，故接受前缀匹配。围栏内不动。"""
    t_norm = re.sub(r"\s+", "", title or "")
    if not t_norm:
        return md
    in_fence = False
    decided = False
    out: list[str] = []
    for line in md.splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if not decided and not in_fence and re.match(r"^#{1,6}\s+\S", s):
            decided = True  # 只裁决第一个标题，其余一律保留
            h_norm = re.sub(r"\s+", "", re.sub(r"^#+\s*", "", s))
            if h_norm == t_norm or h_norm.startswith(t_norm):
                continue
        out.append(line)
    return "\n".join(out)


def assemble_hierarchical(site_title: str, pages: list[dict]) -> str:
    """组装「站点(H1) → 页面(H2) → 页内标题(降一级后)」的标准 Markdown。
    页面标题去重（同名追加序号）；页内容含 ``` 时降级自动跳过围栏行；
    与页面标题同源的正文首标题先行剥除（大纲去重）。"""
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
        parts.append(demote_headings(_strip_leading_title(p.get("markdown") or "", title), 1))
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
