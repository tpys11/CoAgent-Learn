# -*- coding: utf-8 -*-
"""F9-S1 文档大纲三通道提取：书签优先 → 标题行 → LLM 兜底。
产出 kb_tree 文档节点树（{"name","children"[,"page"]}），供 S2 分类/S3 层级化/S4 统一渲染共用。

- 通道1 书签：fitz get_toc()（仅 PDF；最权威、带页码）——教辅/教材 PDF 的目录即大纲。
- 通道2 标题行：复用 chunkers._extract_tree（禁改文件只 import 复用），对齐既有 kb_tree 语义。
- 通道3 LLM：仅当前两通道皆空时兜底；走 engine.pipeline_v2._cached_llm 缓存
  （与 _make_llm/_make_fast_llm 共享 _LLM_CACHE，满足派发单「走 _make_llm 缓存」）；
  门控 KB_LLM_OUTLINE（默认开），任何失败 → 空树不阻断上传（B1 同款哲学）。

通道顺序取舍：书签是作者/排版方声明的事实结构（零成本零幻觉），故压过标题行启发式；
标题行是文本类上传唯一可靠结构信号；LLM 只补「两者皆无」的盲区，控制成本。
"""
import json
import logging
import re

logger = logging.getLogger("coagent.knowledge")

_LLM_MAX_ENTRIES = 120   # LLM 大纲条目封顶（成本/防幻觉爆炸）
_LLM_TEXT_CHARS = 8000   # 喂给 LLM 的正文上限（教材结构信息密度集中在前部）
_LLM_MIN_TEXT = 500      # 短文本（如单图描述）不值得 LLM 兜底——成本护栏

# ── F9-S2 正文/其他切割：类目常量与规则 ──
CATEGORY_BODY = "正文"
CATEGORY_SUMMARY = "小结"
CATEGORY_QUIZ = "习题"
CATEGORY_LAB = "实验"
CATEGORY_TEST = "总测试"
CATEGORY_APPENDIX = "附录"
CATEGORIES = (CATEGORY_BODY, CATEGORY_SUMMARY, CATEGORY_QUIZ, CATEGORY_LAB,
              CATEGORY_TEST, CATEGORY_APPENDIX)
_ARB_MAX = 40           # LLM 仲裁批次条目封顶
_SPAN_PATH_SEP = " > "  # _split_markdown_sections 的路径连接符（chunkers 域内约定）

# 强规则：命中即定类（高置信，不进仲裁）
_STRONG_RULES: list[tuple[str, "re.Pattern[str]"]] = [
    (CATEGORY_APPENDIX, re.compile(r"^(附录|appendix|参考文献|索引|references)", re.I)),
    (CATEGORY_SUMMARY, re.compile(r"(本章小结|本节小结|小结$|summary$)", re.I)),
    (CATEGORY_QUIZ, re.compile(r"(习题|练习|思考题|课后题|复习题|exercise|problem)", re.I)),
    (CATEGORY_TEST, re.compile(r"(总测试|测验|测试题|自测|试卷|期末|期中|模拟题|真题)", re.I)),
    (CATEGORY_LAB, re.compile(r"(^实验|^实训|^实操|^上机|实验[一二三四五六七八九十\d]|lab\s*\d)", re.I)),
]
# 歧义词：含之但无强规则命中 → 送 LLM 仲裁（如「单元测试」是教学内容而非总测试）
_AMBIGUOUS_RE = re.compile(r"(测试|训练|实践|案例|项目|作业|考核|评估|拓展|延伸|研讨)")


def _span_title(path: str) -> str:
    """span 路径取末段（节自身标题）。"""
    return (path or "").split(_SPAN_PATH_SEP)[-1].strip()


def _rule_classify(title: str) -> tuple[str, bool]:
    """强规则判定：返回 (类目, 是否歧义待仲裁)。无命中且含歧义词 → 待仲裁；否则正文。"""
    for cat, rx in _STRONG_RULES:
        if rx.search(title):
            return cat, False
    if _AMBIGUOUS_RE.search(title):
        return CATEGORY_BODY, True
    return CATEGORY_BODY, False


def classify_spans(text: str, api_key: str = "", llm_factory=None) -> list[dict]:
    """F9-S2 双通道切割：把 markdown 文本切成标题节并分类（规则主通道 + LLM 边界仲裁）。
    返回 [{"path"(> 连接), "title", "category", "arbitrated"}]，path 含祖先链。
    继承规则：自身无强命中的节继承最近祖先的类目（防「习题章下的题」被误标正文）。
    歧义节批量送一次 LLM（门控 KB_LLM_OUTLINE，失败/门关 → 规则缺省正文，绝不抛）。"""
    from core.chunkers import _split_markdown_sections
    spans: list[dict] = []
    for path, body in _split_markdown_sections(text or ""):
        title = _span_title(path)
        cat, ambiguous = _rule_classify(title)
        spans.append({"path": path, "title": title, "category": cat,
                      "arbitrated": False, "ambiguous": ambiguous,
                      "strong": cat != CATEGORY_BODY, "body_head": body[:200]})
    # 继承：自身无强命中才继承最近祖先类目（防「习题章下的题」被误标正文）；
    # 自身强命中（小结/习题等）绝不被祖先覆盖——AI-Agents 真实书实测暴露的 bug（F9-S5）。
    inherited_strength: dict[str, str] = {}  # path 前缀 → 类目（非歧义节均登记为祖先源）
    for s in spans:
        parts = s["path"].split(_SPAN_PATH_SEP)
        if not s["strong"]:
            best = None
            for depth in range(len(parts) - 1, 0, -1):
                anc = _SPAN_PATH_SEP.join(parts[:depth])
                if anc in inherited_strength:
                    best = inherited_strength[anc]
                    break
            if best is not None:
                s["category"] = best
        if not s["ambiguous"]:
            inherited_strength[s["path"]] = s["category"]
    # LLM 仲裁：仅歧义节（批量一次；失败不阻断）
    arb = [s for s in spans if s.pop("ambiguous")]
    if arb:
        from core.config import config as _cfg
        if int(getattr(_cfg, "KB_LLM_OUTLINE", 1) or 0) and (text or "").strip():
            if llm_factory is None:
                key = api_key or getattr(_cfg, "DEEPSEEK_API_KEY", "")
                if key:
                    llm_factory = _default_llm_factory
            if llm_factory is not None:
                _arbitrate(arb[:_ARB_MAX], llm_factory,
                           api_key or getattr(_cfg, "DEEPSEEK_API_KEY", ""))
    for s in spans:
        s.pop("body_head", None)
        s.pop("strong", None)
    return spans


def _arbitrate(spans: list[dict], llm_factory, api_key: str) -> None:
    """歧义节批量仲裁：LLM 只在六类白名单里选；任何失败保持规则缺省（正文）。"""
    try:
        llm = llm_factory(api_key)
    except Exception:
        logger.warning("[outline] 仲裁 LLM 构造失败，歧义节保持规则缺省", exc_info=True)
        return
    system = (
        "你是教材章节分类器。对以下章节逐个判断类目，只能取："
        + "、".join(CATEGORIES) + "。\n"
        '只输出 JSON：[{"i": 序号(从0), "category": "类目"}]；拿不准时输出"正文"。'
    )
    user = "\n".join(f"{i}. {s['title']}（开头：{s.pop('body_head', '')[:80] or '无'}）"
                     for i, s in enumerate(spans))
    try:
        raw = llm.chat([{"role": "system", "content": system},
                        {"role": "user", "content": user}], temperature=0.2)
        m = re.search(r"\[[\s\S]*\]", raw or "")
        data = json.loads(m.group()) if m else []
    except Exception:
        logger.warning("[outline] 仲裁 LLM 调用失败，歧义节保持规则缺省", exc_info=True)
        return
    for it in data if isinstance(data, list) else []:
        try:
            i = int(it.get("i"))
            cat = str(it.get("category") or "").strip()
        except Exception:
            continue
        if 0 <= i < len(spans) and cat in CATEGORIES:
            spans[i]["category"] = cat
            spans[i]["arbitrated"] = True


def annotate_categories_from_text(text: str, tree: list, api_key: str = "",
                                  llm_factory=None) -> list:
    """F9-S2：按 span 分类结果给 kb_tree 节点写 category 字段（display 用，best-effort：
    节点 "/" 路径与 span " > " 路径全串匹配优先，末段标题名匹配兜底）。原树原地补字段后返回。"""
    spans = classify_spans(text or "", api_key=api_key, llm_factory=llm_factory)
    by_full: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for s in spans:
        p = s["path"].replace(_SPAN_PATH_SEP, "/")
        by_full.setdefault(p, s["category"])
        by_name.setdefault(s["title"], s["category"])

    def walk(nodes, prefix):
        for n in nodes or []:
            if not isinstance(n, dict):
                continue
            name = str(n.get("name") or "").strip()
            p = (prefix + "/" + name) if prefix else name
            cat = by_full.get(p) or by_name.get(name)
            if cat:
                n["category"] = cat
            walk(n.get("children"), p)

    walk(tree, "")
    return tree


def scoped_text(text: str, include_paths: list[str]) -> str:
    """F9-S2 留存范围切分：仅保留命中勾选章节的标题节。
    连续段序列匹配：include 路径（"/" 连接，可含多级）归一为段序列，span 路径段序列
    含其作连续子串即保留——解析文本可能带书名根节/垃圾标题层使路径整体位移，
    精确前缀匹配在真实书上必落空（AI-Agents 书实测教训）；子树语义天然保持
    （子孙路径含同一连续段序列）。含 " > " 的子路径勾选同样生效（连读两段）。
    首个标题前内容恒保留（前言/出版说明，无从归类）。include 为空 → 空串（调用方须拒收）。
    已知限制：文本垃圾标题层插在勾选两级之间时该勾选可能落空——用户重勾父级纠偏。"""
    from core.chunkers import _split_markdown_sections

    def norm(s: str) -> str:
        return " ".join((s or "").split())

    inc_lists: list[list[str]] = []
    for p in (include_paths or []):
        # include 兼容两种连接约定：UI 树路径 "/" 与 span 域 " > "（子路径勾选两段连读）
        segs = [norm(x) for x in re.split(r"/| > ", (p or "")) if norm(x)]
        if segs:
            inc_lists.append(segs)
    if not inc_lists:
        return ""

    def hit(segs: list[str]) -> bool:
        return any(
            any(segs[i:i + len(ic)] == ic for i in range(len(segs) - len(ic) + 1))
            for ic in inc_lists)

    kept: list[str] = []
    for path, body in _split_markdown_sections(text or ""):
        if not path:
            kept.append(body)  # 首个标题前内容恒保留
            continue
        if hit([norm(x) for x in path.split(_SPAN_PATH_SEP)]):
            kept.append(body)
    return "\n".join(kept)


def _build_tree(items: list) -> list:
    """扁平 [{"name","level"[,"page"]}] → 嵌套树（栈式归组，_extract_tree 同款语义：
    层级可跳跃不丢节点）。书签/LLM 两通道共用的装配层；空名/超长伪标题在此过滤。"""
    tree, stack = [], []
    for it in items or []:
        name = str(it.get("name") or "").strip()
        try:
            lvl = int(it.get("level") or 1)
        except Exception:
            lvl = 1
        if not name or len(name) > 60 or lvl < 1:
            continue
        node = {"name": name, "children": []}
        page = it.get("page")
        if page:
            try:
                node["page"] = int(page)
            except Exception:
                pass
        while stack and stack[-1][0] >= lvl:
            stack.pop()
        (stack[-1][1]["children"] if stack else tree).append(node)
        stack.append((lvl, node))
    return tree


def _outline_from_bookmarks(pdf_bytes: bytes) -> list:
    """通道1：PDF 书签 → 树（节点带 1 起始页码 page）。打不开/无书签/任何异常 → []。"""
    import fitz
    doc = None
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        toc = doc.get_toc() or []
    except Exception:
        logger.warning("[outline] 书签读取失败，降级标题行通道", exc_info=True)
        return []
    finally:
        if doc is not None:
            doc.close()
    items = []
    for it in toc:
        try:  # get_toc 行 shape [lvl, title, page]；防御逐条降级（单条坏不弃整树）
            items.append({"name": str(it[1] or ""), "level": int(it[0]),
                          "page": int(it[2] or 0)})
        except Exception:
            continue
    tree = _build_tree(items)
    if tree:
        logger.info("[outline] 书签通道命中：%d 个顶级节点", len(tree))
    return tree


def _outline_from_title_lines(text: str) -> list:
    """通道2：markdown 标题行（复用禁改的 chunkers._extract_tree——语义与存量 kb_tree 一致）。"""
    from core.chunkers import _extract_tree
    return _extract_tree(text or "")


def _default_llm_factory(key: str):
    """生产 LLM 构造：走 pipeline_v2._cached_llm（共享 _make_llm 的缓存池）；
    thinking=False 快速档（大纲提取无需深思）。engine 延迟导入防环（B1 先例）。"""
    from engine.pipeline_v2 import DEFAULT_MODEL, _cached_llm
    from core.base_llm import DeepSeekLLM
    return _cached_llm(
        key, None, DEFAULT_MODEL, False, None,
        lambda: DeepSeekLLM(api_key=key, model=DEFAULT_MODEL, thinking=False))


def _outline_from_llm(text: str, api_key: str = "", llm_factory=None) -> list:
    """通道3：LLM 兜底（注入 llm_factory 可打桩且免 key 检查——测试缝语义同 B1）。"""
    text = text or ""
    if len(text.strip()) < _LLM_MIN_TEXT:
        return []
    from core.config import config as _cfg
    if not int(getattr(_cfg, "KB_LLM_OUTLINE", 1) or 0):
        return []
    if llm_factory is None:
        key = api_key or getattr(_cfg, "DEEPSEEK_API_KEY", "")
        if not key:
            return []
        llm_factory = _default_llm_factory
    try:
        llm = llm_factory(api_key or getattr(_cfg, "DEEPSEEK_API_KEY", ""))
    except Exception:
        logger.warning("[outline] LLM 构造失败，放弃大纲兜底", exc_info=True)
        return []
    system = (
        "你是文档大纲提取器。下面给出一份文档的正文片段（可能缺少章节标记）。"
        "推断它的章节层级结构，按文档顺序输出扁平大纲列表。\n"
        '只输出 JSON 数组：[{"name": "章节名", "level": 层级整数(从1开始)}]，'
        "最多 " + str(_LLM_MAX_ENTRIES) + " 条；章节名必须取自文档原文词语，不许编造；"
        "确无章节结构的普通文章输出空数组 []。"
    )
    try:
        raw = llm.chat([{"role": "system", "content": system},
                        {"role": "user", "content": text[:_LLM_TEXT_CHARS]}],
                       temperature=0.2)
    except Exception:
        logger.warning("[outline] LLM 大纲生成失败（不阻断上传）", exc_info=True)
        return []
    m = re.search(r"\[[\s\S]*\]", raw or "")
    try:
        data = json.loads(m.group()) if m else []
    except Exception:
        logger.warning("[outline] LLM 大纲解析失败（输出不是合法 JSON 数组）")
        return []
    if not isinstance(data, list):
        return []
    items = []
    for it in data[:_LLM_MAX_ENTRIES]:  # KG 同款防御式 coerce：逐条降级不弃整树
        if not isinstance(it, dict):
            continue
        try:
            lvl = max(1, int(it.get("level") or 1))
        except Exception:
            lvl = 1
        items.append({"name": it.get("name"), "level": lvl})
    return _build_tree(items)


def extract_outline(text: str, pdf_bytes: bytes | None = None, api_key: str = "",
                    llm_factory=None) -> list:
    """三通道提取入口：书签 → 标题行 → LLM 兜底；全空返回 []（前端空树占位，不阻断上传）。
    pdf_bytes：PDF 原始字节（仅文件上传链路有；文本/URL 摄取传 None）。
    llm_factory：测试注入缝（注入时免 key 检查）；生产走 _default_llm_factory。"""
    if pdf_bytes:
        tree = _outline_from_bookmarks(pdf_bytes)
        if tree:
            return tree
    tree = _outline_from_title_lines(text)
    if tree:
        return tree
    return _outline_from_llm(text, api_key, llm_factory)
