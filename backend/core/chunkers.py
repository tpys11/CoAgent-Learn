# -*- coding: utf-8 -*-
"""切块器族：句子级窗口 / markdown 结构 / 语义断点（A3）/ 标题树提取。
B1 拆分（2026-08-27）：函数自 knowledge_service.py 逐字迁入；
测试补丁经门面命名空间回收保持可用（ks._chunk_semantic 等照旧可 patch）。"""
import re


def _is_junk_heading(name: str) -> bool:
    """垃圾标题判定：代码块外的残留代码行 / 过长的伪标题（如 ── xxx ──、=> 2、results = [）"""
    n = name.strip()
    if not (2 <= len(n) <= 60):
        return True
    if n.startswith(("──", "=>", "=", "|", "//", "#")):
        return True
    if "://" in n or n.count("_") > 4:
        return True
    return False


def _extract_tree(text: str) -> list:
    """从文档文本提取标题层级树（文档大纲：markdown 标题即章节层级）
    标题行开新节点；标题间的正文累积进节点 content（预览截断 2000 字）；
    ``` 围栏内的 # 行（代码注释）跳过；垃圾标题过滤。
    文档开头（首个标题前）的正文不归属任何节点。无标题时返回空列表（前端显示空树占位）。"""
    def _append_content(node: dict, line: str):
        c = node.get("content", "")
        if len(c) >= 2000:
            return
        piece = line.strip()
        if not piece:
            return
        node["content"] = (c + "\n" + piece) if c else piece
        if len(node["content"]) > 2000:
            node["content"] = node["content"][:2000]
    tree = []
    stack: list[tuple[int, dict]] = []
    pending: dict | None = None  # 正在累积正文的节点（最近的标题）
    in_fence = False  # ``` 代码块内：# 是注释不是标题
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = re.match(r"^(#{1,6})\s+(.+)$", line.rstrip()) if s.startswith("#") else None
        if m:
            lvl = len(m.group(1))
            name = m.group(2).strip()
            if _is_junk_heading(name):
                continue
            node = {"name": name, "children": []}
            while stack and stack[-1][0] >= lvl:
                stack.pop()
            if stack:
                stack[-1][1]["children"].append(node)
            else:
                tree.append(node)
            stack.append((lvl, node))
            pending = node
        else:
            if not stack:
                continue  # 文档开头正文（标题前）不归属任何节点
            _append_content(pending if pending is not None else stack[-1][1], line)
    return tree


def _split_sentences(text: str) -> list:
    """句子级切分：中文句号/问号/感叹号/分号 + 换行视为句界（对齐 DeepTutor 的句子级切块思想）"""
    # 先按行拆，再按中文/英文句末标点拆
    pieces = re.split(r"(?<=[。！？!?；;])\s*|\n", text)
    return [p.strip() for p in pieces if p.strip()]


def _chunk_text(text: str, size: int = 512, overlap: int = 50) -> list:
    """切块：句子级 + 512 字符窗口 + 50 重叠（照 DeepTutor SentenceSplitter chunk_size=512, chunk_overlap=50）。
    按句子累积成块，超过 size 则收束当前块并开新块；相邻块保留 overlap 的重叠尾巴避免语义被切断。"""
    text = (text or "").strip()
    if not text:
        return []
    sentences = _split_sentences(text)
    chunks: list = []
    cur = ""
    for s in sentences:
        if len(s) > size:
            # 超长单句：先收当前块，再硬切该句（带重叠）
            if cur:
                chunks.append(cur)
            s = s[:size]  # 超长句截断，避免单块过大
            cur = s
            continue
        if cur and len(cur) + 1 + len(s) > size:
            # 当前块放不下：收束（保留尾部 overlap 作下块开头）
            tail = cur[-overlap:] if overlap and len(cur) > overlap else ""
            chunks.append(cur)
            cur = (tail + " " + s).strip() if tail else s
        else:
            cur = (cur + " " + s).strip() if cur else s
    if cur:
        chunks.append(cur)
    return chunks


def _split_markdown_sections(text: str) -> list[tuple[str, str]]:
    """按 markdown 标题把文本切成节：返回 [(标题路径, 节正文)]。
    - ``` 围栏内的 # 是代码注释不是标题（复用 _extract_tree 的围栏语义）
    - 垃圾标题过滤复用 _is_junk_heading
    - 首个标题前的导语也保留为一节（路径为空串）"""
    sections: list[tuple[str, str]] = []
    stack: list[tuple[int, str]] = []   # (层级, 标题名)
    buf: list[str] = []

    def emit():
        nonlocal buf
        body = "\n".join(buf).strip()
        buf = []
        path = " > ".join(name for _, name in stack)
        if body:
            sections.append((path, body))

    in_fence = False
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            buf.append(line)
            continue
        if not in_fence and s.startswith("#"):
            m = re.match(r"^(#{1,6})\s+(.+)$", line.rstrip())
            if m and not _is_junk_heading(m.group(2).strip()):
                emit()                                   # 先收束上一节（旧栈）
                lvl, name = len(m.group(1)), m.group(2).strip()
                while stack and stack[-1][0] >= lvl:
                    stack.pop()
                stack.append((lvl, name))
                buf.append(line)                         # 标题行留在节内
                continue
        buf.append(line)
    emit()
    return sections


def _chunk_markdown(text: str, size: int, overlap: int) -> list:
    """按标题结构切块：每节一块；超长节内部回退句子级窗口切分。
    每块自带标题路径前缀（如「第2章 动力学 > 2.3 角动量」），保证块自含检索上下文。"""
    out: list = []
    for path, body in _split_markdown_sections(text):
        prefix = (path + "\n") if path else ""
        if len(body) <= size:
            out.append(prefix + body)
        else:
            for piece in _chunk_text(body, size=size, overlap=overlap):
                out.append(prefix + piece)
    return [c.strip() for c in out if c and c.strip()]


def _percentile(vals: list, p: float) -> float:
    """线性插值百分位（与 numpy.percentile 默认 linear 语义逐点一致），免 numpy 硬依赖。"""
    s = sorted(vals)
    if not s:
        return 0.0
    k = (len(s) - 1) * p / 100.0
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def _cos_dist(a: list, b: list) -> float:
    """余弦距离 1-cos；零向量视为同向（距离 0，不产生断点）。"""
    da = sum(x * x for x in a) ** 0.5
    db = sum(x * x for x in b) ** 0.5
    if da <= 0 or db <= 0:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    return 1.0 - max(-1.0, min(1.0, dot / (da * db)))


def _chunk_semantic(text: str, embed_fn, size: int = 512, overlap: int = 50,
                    buffer: int = 1, pct: float = 95) -> list:
    """语义断点切块（A3）：算法与默认参数照抄 llama-index-core SemanticSplitterNodeParser
    （容器实装源码摘证 2026-08-27：buffer=1 时组合句=i±1 邻句拼接后整句嵌入，
    相邻组合句余弦距离超过 95 百分位处开新块）。句切复用 _split_sentences；
    超长语义组内部回退 _chunk_text（对齐 _chunk_markdown 超长节模式）。
    embed_fn(texts)->vecs 注入式（生产 _embed / 测试确定性假函数）。
    软着陆：<2 句 / 嵌入异常 / 返回数不符 → _chunk_text 兜底，本函数绝不抛。"""
    text = (text or "").strip()
    if not text:
        return []
    sents = _split_sentences(text)
    if len(sents) < 2:
        return _chunk_text(text, size=size, overlap=overlap)
    try:
        combined = [" ".join(sents[max(0, i - buffer): i + buffer + 1])
                    for i in range(len(sents))]
        vecs = embed_fn(combined)
        if not vecs or len(vecs) != len(sents):
            return _chunk_text(text, size=size, overlap=overlap)
        dists = [_cos_dist(vecs[i], vecs[i + 1]) for i in range(len(sents) - 1)]
        thresh = _percentile(dists, pct)
        groups: list[list[str]] = [[sents[0]]]
        for i in range(1, len(sents)):
            if dists[i - 1] > thresh:
                groups.append([])
            groups[-1].append(sents[i])
        chunks: list = []
        for g in groups:
            piece = " ".join(g)
            if len(piece) <= size:
                chunks.append(piece)
            else:
                chunks.extend(_chunk_text(piece, size=size, overlap=overlap))
        return [c.strip() for c in chunks if c and c.strip()]
    except Exception:
        return _chunk_text(text, size=size, overlap=overlap)
