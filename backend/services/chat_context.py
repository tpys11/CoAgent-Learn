# -*- coding: utf-8 -*-
"""D1 自 main.py 原样迁入的对话上下文三函数（纯搬迁、零逻辑改动）：
- _auto_settings：Auto 模式设置推断（AI 读用户输入推断其余对话设置）
- _build_preloaded：生成节点上下文预查（画像缓存/历史预算块/知识库概述）
- _parse_special_inputs：消息内 URL 并行抓取并入文（20s 超时降级）

迁移动机：引擎层反向 import 应用入口（engine/pipeline_v2 三处 from main import），
main.py 沦为杂物抽屉、引擎无法脱离 FastAPI app 独立测试。
main.py 经 re-export import 保持 main.xxx 可解析（测试/旧调用零破坏）。
"""
import logging

from core.helpers import extract_json_obj  # 与原 main.py:31 同源（_auto_settings 使用）

logger = logging.getLogger(__name__)


def _auto_settings(api_key: str, message: str, template: str = "思考", infer_model: bool = False) -> dict:
    """Auto 模式：让 AI 读取用户输入，基于用户所选模板自动推断其余设置；infer_model=True 时同时推断模型；失败时返回空 dict（保持默认）"""
    from core.config import config as _cfg
    from core.model_provider import MODEL_FAST, MODEL_MAIN, MODEL_PRO
    _model_field = "\"model\": \"" + MODEL_PRO + "|" + MODEL_MAIN + "|glm-4-plus|glm-4-flash\", " if infer_model else ""
    prompt = (
        "你是对话设置分析器。模板已由用户选定，请根据用户的输入内容，推断其余最适合的对话设置，只输出 JSON：\n"
        "{" + _model_field + "\"outputFormat\": \"低结构化|高结构化\", "
        "\"outputStyle\": \"MD文档|对话形式\", \"thinking\": \"开|关\", "
        "\"outputVolume\": \"精简|适中|拓展\", \"depth\": \"浅|中|深\"}\n"
        f"已选档位：{template}（极速=快模型最短响应、思考=完整流程+轻量单审、研究=完整流程+严格检测，推断时可参考）\n"
        "推断规则：涉及学习/讲解/推导用较深深度与适中输出；复杂主题适当加重输出量；简单问答用精简。\n"
        f"模型推断规则（仅在要求推断模型时）：复杂/长篇任务用 {MODEL_PRO} 或 glm-4-plus；简单问答用 {MODEL_MAIN} 或 glm-4-flash。\n"
        f"用户输入：{message[:1500]}"
    )
    h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
    try:
        import requests as _req
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
                         json={"model": MODEL_FAST, "thinking": {"type": "disabled"}, "messages": [{"role": "user", "content": prompt}]},
                         headers=h, timeout=60)
        if resp.status_code != 200:
            return {}
        raw = resp.json()["choices"][0]["message"]["content"] or ""
        d = extract_json_obj(raw)
        if not d:
            return {}
        # 只接受合法取值，非法字段丢弃（template 由用户选择，不参与推断）
        ok = {
            "outputFormat": ["低结构化", "高结构化"],
            "outputStyle": ["MD文档", "对话形式"],
            "thinking": ["开", "关"],
            "outputVolume": ["精简", "适中", "拓展"],
            "depth": ["浅", "中", "深"],
        }
        if infer_model:
            ok["model"] = [MODEL_PRO, MODEL_MAIN, "glm-4-plus", "glm-4-flash"]
        out = {}
        for k, vals in ok.items():
            v = str(d.get(k, "")).strip()
            if v in vals:
                out[k] = v
        return out
    except Exception:
        return {}


def _build_preloaded(pid: str, did: str, user_input: str) -> dict:
    """生成节点上下文预查（main.py 预取 → 塞 state["preloaded"]，generate_node 不再直接查库）。
    各段独立容错：单段失败不影响其他段，生成节点按 preloaded 有无决定注入。"""
    import json as _json
    out = {"dialogue_profile_cache": None, "history": None, "kb_overview": None}
    # 对话学情画像（1.5 合成缓存）：对话全程用合成画像，不再注入个人/课程记忆
    try:
        from core.sqlite_client import get_db
        _drow = get_db().execute("SELECT profile FROM dialogues WHERE id=%s", (did,))
        if _drow and _drow[0].get("profile"):
            _p = _json.loads(_drow[0]["profile"])
            if isinstance(_p, dict):
                out["dialogue_profile_cache"] = _p
    except Exception:
        logger.exception("预查对话画像失败")
    try:
        from core.sqlite_client import get_db
        from core.helpers import estimate_tokens
        from core.compress import HISTORY_TOKEN_BUDGET
        _dbx = get_db()
        _drow = _dbx.execute("SELECT summary, compressed_upto FROM dialogues WHERE id=%s", (did,))
        _hist = {
            "summary": (_drow[0].get("summary") or "") if _drow else "",
            "compressed_upto": int((_drow[0].get("compressed_upto") or 0) if _drow else 0),
            "recent": [], "vector_hits": [],
        }
        _rows = _dbx.execute(
            "SELECT role, content FROM messages WHERE dialogue_id=%s AND id > %s ORDER BY created_at DESC LIMIT 200",
            (did, _hist["compressed_upto"]))
        # 从最新往回累加，保留到预算为止（与 generate_node 原逻辑一致）
        _recent = []
        _used = 0
        for _r in _rows:
            _c = str(_r.get("content") or "")
            if not _c or _c == "（系统未生成内容）":
                continue
            _t = estimate_tokens(_c)
            if _recent and _used + _t > HISTORY_TOKEN_BUDGET:
                break
            _recent.append({"role": _r.get("role"), "content": _c})
            _used += _t
        _recent.reverse()
        _hist["recent"] = _recent
        # 历史向量召回已移除（2026-08-21）：message_vectors 死表删除，压缩历史以 summary 文本承载
        out["history"] = _hist
    except Exception:
        logger.exception("预查历史失败")
    try:
        from core.knowledge_service import list_docs
        _docs = list_docs(pid)
        if _docs:
            out["kb_overview"] = "；".join(f"{d.get('source', '')}({d.get('chunks', 0)}块)" for d in _docs[:20])
    except Exception:
        logger.exception("预查知识库概述失败")
    return out


def _parse_special_inputs(message: str) -> str:
    """特殊格式并行解析：检出消息中的 URL（最多 5 个）并行抓取正文并合并进消息（20s 超时降级，不阻塞主流程）。
    附件（doc/docx/pdf/md）由前端解析为文本内联进消息（【用户上传文件: xx】+内容），此处不再处理；
    若标记后无内容（解析失败未内联），保持原文不动，由模型按原样处理。"""
    import re as _re
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as _FTimeout
    urls = _re.findall(r"https?://[^\s\u4e00-\u9fff()（）\[\]【】，。！？、；：\"'”’]+", message or "")
    urls = [u.rstrip(".,;:)") for u in urls][:5]
    if not urls:
        return message or ""
    from skills.registry import registry
    def _fetch(u):
        try:
            r = registry.execute("fetch_web", url=u, max_chars=3000)
            if r.get("results"):
                return "【网页内容: " + u + "】\n" + str(r["results"][0].get("content") or "")[:3000]
        except Exception:
            logger.debug("URL 解析失败（将抛给上层汇总）: %s", u, exc_info=True)
        raise RuntimeError("fetch failed: " + u)
    parts = []
    logger.info("特殊格式并行解析启动：%d 个 URL", len(urls))
    with ThreadPoolExecutor(max_workers=len(urls)) as _ex:
        _futs = {_ex.submit(_fetch, u): u for u in urls}
        for _f, _u in _futs.items():
            try:
                _txt = _f.result(timeout=20)
                if _txt:
                    parts.append(_txt)
            except _FTimeout:
                logger.warning("URL 解析超时（>20s）：%s", _u)
                parts.append("（链接 " + _u + " 解析超时，未获取内容）")
            except Exception:
                logger.warning("URL 解析失败：%s", _u)
                parts.append("（链接 " + _u + " 解析失败，未获取内容）")
    return (message or "") + "\n\n" + "\n\n".join(parts)
