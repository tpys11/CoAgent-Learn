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
