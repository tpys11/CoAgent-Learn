# -*- coding: utf-8 -*-
"""文档解析服务（ParsePort，照 DeepTutor 可插拔解析引擎）：
PDF 走可配置引擎——PyMuPDF4LLM（本地快道）/ MinerU 云 API（高保真）/ Mathpix 云 API（公式专家）。
配置引擎失败自动降级：云引擎 → PyMuPDF4LLM → 旧版 file_parser，永不硬失败。

各引擎协议：
- PyMuPDF4LLM：进程内 fitz stream → to_markdown（无 OCR，需原生文字层）
- MinerU：申请预签名URL → PUT 原始字节（不带任何额外头）→ 轮询 batch 结果 → ZIP 内取 full.md
- Mathpix：multipart POST /v3/pdf（app_id/app_key 头）→ 轮询 status=completed → GET .mmd
"""
import io
import logging
import time
import zipfile

logger = logging.getLogger("coagent.parse")

MINERU_API = "https://mineru.net/api/v4"
MATHPIX_API = "https://api.mathpix.com"

_POLL_INTERVAL = 5      # 轮询间隔秒
_POLL_TIMEOUT = 300     # 云引擎最长等待秒

# F8-S4：扫描件判定阈值——前 3 页可提取文字层总字符 < 该值 → 判扫描件（is_ocr=True）
_OCR_TEXT_THRESHOLD = 32
# F8-S4：近空文本阈值——pymupdf4llm 输出低于该值视为「提不出内容」，触发 MinerU OCR 重试
_NEAR_EMPTY_CHARS = 16


def _needs_ocr(data: bytes) -> bool:
    """fitz 文字层检测：前 3 页 get_text 总长 < 阈值 → 判扫描件。
    打不开的文档不决策（返回 False），交给引擎链自己报错降级。"""
    import fitz
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        return False
    try:
        total = 0
        for page in list(doc)[:3]:
            total += len((page.get_text() or "").strip())
            if total >= _OCR_TEXT_THRESHOLD:
                return False
        return True
    finally:
        doc.close()


# ── 引擎实现：每个返回 markdown 文本，失败抛异常 ──

def _parse_pymupdf4llm(data: bytes) -> str:
    import fitz
    import pymupdf4llm
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        md = pymupdf4llm.to_markdown(doc)
    finally:
        doc.close()
    return (md or "").strip()


def _parse_mineru(data: bytes, filename: str, is_ocr: bool | None = None) -> str:
    import requests as _req
    from core.config import config as _cfg
    token = getattr(_cfg, "MINERU_API_TOKEN", "")
    if not token:
        raise RuntimeError("未配置 MinerU API Token，扫描件/公式高保真解析不可用（原因）——PDF 将降级 pymupdf4llm（后果）。"
                           "怎么办：mineru.net 免费申请 Token 后填入 设置 → AI 服务 → 文档解析")
    if is_ocr is None:
        # F8-S4：is_ocr auto——前 3 页无文字层（扫描件）才走 OCR；文字版 PDF 保持快速通道
        is_ocr = _needs_ocr(data)
    h = {"Authorization": "Bearer " + token}
    # 1. 申请预签名上传 URL
    resp = _req.post(f"{MINERU_API}/file-urls/batch", headers=h, timeout=30, json={
        "files": [{"name": filename, "is_ocr": bool(is_ocr),
                   "enable_formula": True, "enable_table": True, "language": "ch"}]})
    resp.raise_for_status()
    d = resp.json().get("data") or {}
    batch_id = d.get("batch_id")
    url = (d.get("file_urls") or [None])[0]
    if not batch_id or not url:
        raise RuntimeError("MinerU 预签名申请失败: " + str(d)[:200])
    # 2. 上传原始字节（官方要求：不得携带任何额外 Header）
    put = _req.put(url, data=data, timeout=120)
    put.raise_for_status()
    # 3. 轮询结果
    deadline = time.time() + _POLL_TIMEOUT
    zip_url = ""
    while time.time() < deadline:
        st = _req.get(f"{MINERU_API}/extract-results/batch/{batch_id}", headers=h, timeout=30)
        st.raise_for_status()
        items = ((st.json().get("data") or {}).get("extract_result")) or []
        state = (items[0] or {}).get("state", "") if items else ""
        if state == "done":
            zip_url = (items[0] or {}).get("full_zip_url", "")
            break
        if state in ("failed", "error"):
            raise RuntimeError("MinerU 解析失败: " + str(items[0])[:200])
        time.sleep(_POLL_INTERVAL)
    if not zip_url:
        raise RuntimeError(f"MinerU 解析超时（>{_POLL_TIMEOUT}s）")
    # 4. 下载 ZIP 并抽取 full.md
    zbytes = _req.get(zip_url, timeout=120).content
    with zipfile.ZipFile(io.BytesIO(zbytes)) as zf:
        names = [n for n in zf.namelist() if n.endswith(".md")]
        if not names:
            raise RuntimeError("MinerU 结果 ZIP 内未找到 Markdown")
        best = max(names, key=lambda n: ("full" in n.lower(), len(n)))
        return zf.read(best).decode("utf-8", errors="replace").strip()


def _parse_mathpix(data: bytes, filename: str) -> str:
    import requests as _req
    from core.config import config as _cfg
    app_id = getattr(_cfg, "MATHPIX_APP_ID", "")
    app_key = getattr(_cfg, "MATHPIX_APP_KEY", "")
    if not app_id or not app_key:
        raise RuntimeError("未配置 Mathpix App ID / App Key（设置 → AI 服务 → 文档解析）")
    h = {"app_id": app_id, "app_key": app_key}
    resp = _req.post(f"{MATHPIX_API}/v3/pdf", headers=h, timeout=120,
                     files={"file": (filename, data)},
                     data={"options_json": '{"math_formats":["latex"]}'})
    resp.raise_for_status()
    pdf_id = resp.json().get("pdf_id")
    if not pdf_id:
        raise RuntimeError("Mathpix 提交失败: " + str(resp.json())[:200])
    deadline = time.time() + _POLL_TIMEOUT
    while time.time() < deadline:
        st = _req.get(f"{MATHPIX_API}/v3/pdf/{pdf_id}", headers=h, timeout=30).json()
        status = st.get("status", "")
        if status == "completed":
            break
        if status == "error":
            raise RuntimeError("Mathpix 解析失败: " + str(st.get("error"))[:200])
        time.sleep(_POLL_INTERVAL)
    else:
        raise RuntimeError(f"Mathpix 解析超时（>{_POLL_TIMEOUT}s）")
    md = _req.get(f"{MATHPIX_API}/v3/pdf/{pdf_id}.md", headers=h, timeout=120)
    md.raise_for_status()
    return (md.text or "").strip()


_ENGINES = {
    "pymupdf4llm": lambda data, fn: _parse_pymupdf4llm(data),
    "mineru": _parse_mineru,
    "mathpix": _parse_mathpix,
}


# ── 对外入口 ──

def configured_engine() -> str:
    from core.config import config as _cfg
    eng = (getattr(_cfg, "PARSE_ENGINE", "") or "pymupdf4llm").lower()
    return eng if eng in _ENGINES else "pymupdf4llm"


def check_engine_health(stage: str) -> None:
    """F8-S1 引擎健康检查：所选云引擎缺凭据时打 WARNING（不是失败——解析会自动降级）。
    stage: "startup"（应用启动后一次）| "parse"（每次解析调用前）。缺凭据属
    「优雅降级 + 可见日志」（CONVENTIONS §6），文案需含原因/后果/怎么办。"""
    eng = configured_engine()
    if eng == "pymupdf4llm":
        return  # 本地引擎无需凭据
    from core.config import config as _cfg
    if eng == "mineru" and not getattr(_cfg, "MINERU_API_TOKEN", ""):
        logger.warning("[引擎健康][%s] 已选 MinerU 但未配置 MINERU_API_TOKEN——"
                       "公式/扫描件高保真解析不可用，PDF 将降级 pymupdf4llm（无 OCR）。"
                       "怎么办：mineru.net 免费申请 Token 后填入 设置 → AI 服务 → 文档解析",
                       stage)
    elif eng == "mathpix" and not (getattr(_cfg, "MATHPIX_APP_ID", "")
                                   and getattr(_cfg, "MATHPIX_APP_KEY", "")):
        logger.warning("[引擎健康][%s] 已选 Mathpix 但未配置 MATHPIX_APP_ID/MATHPIX_APP_KEY——"
                       "公式专家解析不可用，PDF 将降级 pymupdf4llm。"
                       "怎么办：mathpix.com 申请后填入 设置 → AI 服务 → 文档解析",
                       stage)


def _try_mineru_ocr_retry(data: bytes, filename: str) -> tuple[str, str] | None:
    """F8-S4：pymupdf4llm 输出近空（扫描件典型症状）时，降级链前用 MinerU(is_ocr=True)
    重试一次——仅在已配 token 时尝试；失败静默回到降级链（优雅降级语义不变）。"""
    from core.config import config as _cfg
    if not getattr(_cfg, "MINERU_API_TOKEN", ""):
        return None
    try:
        text = _parse_mineru(data, filename, is_ocr=True)
        if text:
            logger.warning("pymupdf4llm 输出近空，MinerU OCR 重试成功 fname=%s chars=%d",
                           filename, len(text))
            return text, "mineru-ocr"
    except Exception as e:
        logger.warning("MinerU OCR 重试失败：%s", str(e)[:200])
    return None


def scanned_pdf_guidance() -> str:
    """F8-S4：扫描件无 OCR 出路时的「怎么办」指引；已配 token 返回空串（无此问题）。"""
    from core.config import config as _cfg
    if getattr(_cfg, "MINERU_API_TOKEN", ""):
        return ""
    return ("该 PDF 提取不出文字层，可能是扫描件/图片型 PDF。"
            "怎么办：到 mineru.net 免费申请 API Token 并填入 设置 → AI 服务 → 文档解析"
            "（配置后自动走 OCR 识别），或改用文字版 PDF。")


def parse_document(filename: str, data: bytes) -> tuple[str, str]:
    """按设置解析 PDF，失败逐级降级，永不抛出。返回 (text, engine_used)。
    降级链：配置引擎 → pymupdf4llm → 旧版 file_parser（markitdown/pypdf）；
    F8-S4：pymupdf4llm 输出近空时先试 MinerU OCR 重试，再进降级链。
    F8-S3：引擎输出在返回前统一过规范化闸（legacy 回退路径在 file_parser 出口已过）。"""
    from core.file_parser import parse_file
    from core.text_normalizer import normalize_extracted_text
    check_engine_health("parse")
    engine = configured_engine()
    order = [engine] + [e for e in ("pymupdf4llm",) if e != engine]
    last_err = None
    for eng in order:
        try:
            text = (_ENGINES[eng])(data, filename)
            # F8-S4：快道（pymupdf4llm 无 OCR 能力）输出近空 → 先试 MinerU OCR，再降级
            if eng == "pymupdf4llm" and (not text or len(text.strip()) < _NEAR_EMPTY_CHARS):
                retry = _try_mineru_ocr_retry(data, filename)
                if retry:
                    return normalize_extracted_text(retry[0]), retry[1]
            if text:
                text = normalize_extracted_text(text)
                if text:
                    if eng != engine:
                        logger.warning("解析引擎 %s 失败已降级 %s（原因见前条日志）", engine, eng)
                    return text, eng
            logger.warning("解析引擎 %s 返回空文本，尝试降级", eng)
        except Exception as e:
            last_err = e
            logger.warning("解析引擎 %s 失败：%s", eng, str(e)[:200])
    logger.warning("全部解析引擎失败，回退旧版 file_parser（最后错误：%s）", str(last_err)[:200])
    return parse_file(filename, data), "legacy"
