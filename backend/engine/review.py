# -*- coding: utf-8 -*-
"""S5 ReviewGate（Loop4）：双LLM异构终审——知识正确性 + 指令遵从。
模式矩阵：研究必开(默认同源视觉版判卷；REVIEW_MODEL_RESEARCH 配硅基流动名+key 自动跨厂商防自我包庇)｜思考可配(默认关)｜极速关。
研究档升级（断言级忠实度审核）：单调用完成"声明拆解+逐条判定"，
unsupported 断言映射进前端既有 issues[] 样式（problem=【诊断】声明, fix=理由），
claims 全表交由调用方落 eval_traces 供幻觉率统计（L1）。
诊断分类抄 FactEval（证据强度×判定结果）：hallucination/retrieval_gap/no_evidence。"""
import json
import logging

from core.model_provider import MODEL_MAIN
from engine.llm_io import think_then_json

logger = logging.getLogger("coagent.review")
REVIEW_MAX_RETRY = 2
_FALLBACK_JUDGE = MODEL_MAIN  # 跨厂商名缺 key 时的响亮回退值

_CLAIMS_MAX = 15        # 声明条数上限（防碎化，FactEval MAX_CLAIMS 同思路）
_CHUNK_CHARS = 500      # 每块证据截断
_EVIDENCE_CHARS = 6000  # 证据总量封顶（防 prompt 爆）
_LABELS = {"supported", "unsupported"}
_DIAG_CN = {"hallucination": "虚构", "retrieval_gap": "检索缺口", "no_evidence": "无据"}


def review_enabled(template: str, settings: dict | None) -> bool:
    """门控谓词：极速恒关；研究恒开；思考由 settings.reviewEnabled 控制。"""
    if template == "极速":
        return False
    if template == "研究":
        return True
    return bool((settings or {}).get("reviewEnabled"))


def pick_judge_llm(template: str, req):
    """审核模型选择（研究档防自我包庇是设计目标）：
    研究档 = config.REVIEW_MODEL_RESEARCH（空=MODEL_MAIN 同源视觉版，走用户 key）；
      值含"/"（硅基流动命名风格）且配了硅基流动 key（VL_API_KEY/EMBEDDING_API_KEY）
      → 走硅基流动端点真跨厂商；
      含"/"但缺 key → WARNING 响亮回退 MODEL_MAIN（旧版静默 400 即本函数事故根因）。
    思考档 = config.REVIEW_MODEL_THINK（空=MODEL_MAIN），走用户 key。
    构造失败回退主模型接缝（原语义保留）。"""
    from core.base_llm import DeepSeekLLM
    from core.config import config as _cfg
    from engine.pipeline_v2 import _cached_llm
    # RA-S1：审核子开关「关=审核时用主模型」——follow_main='1' 时研究档判卷直接用主模型，
    # 短路下方 zen:/"/" 路由（关闭语义由独立布尔键承载，T51 禁空串写入）
    if template == "研究" and str(getattr(_cfg, "REVIEW_FOLLOW_MAIN", "0")) == "1":
        model = MODEL_MAIN
    else:
        model = ((_cfg.REVIEW_MODEL_RESEARCH if template == "研究" else _cfg.REVIEW_MODEL_THINK) or "").strip() or MODEL_MAIN
    key = req.api_key or _cfg.DEEPSEEK_API_KEY
    base_url = req.base_url
    if model.startswith("zen:"):
        # F14-S4e：zen: 前缀=OpenCode Zen 研究通道（同名 MAIN/REVIEW 但归 REVIEW 类）
        # 区别于 "/"（硅基流动同源但跨厂商路由，前缀是通配模型名+走自己 key）
        _zen_key = _cfg.ZEN_API_KEY or key
        if _zen_key:
            _body = model[4:].strip()
            return _cached_llm(
                _zen_key, _cfg.ZEN_BASE_URL, _body, False, None,
                lambda: DeepSeekLLM(api_key=_zen_key, model=_body,
                                    base_url=_cfg.ZEN_BASE_URL, thinking=False))
        logger.warning("研究档模型 %s 需要 Zen key（设置→AI服务），未配置——响亮回退 %s",
                        model, _FALLBACK_JUDGE)
        model = _FALLBACK_JUDGE
    elif template == "研究" and "/" in model:
        sf_key = _cfg.VL_API_KEY or _cfg.EMBEDDING_API_KEY
        if sf_key:
            key, base_url = sf_key, _cfg.VL_BASE_URL
        else:
            logger.warning("研究档判卷模型 %s 需要硅基流动 key（设置→AI服务），未配置——响亮回退 %s",
                           model, _FALLBACK_JUDGE)
            model = _FALLBACK_JUDGE
    try:
        # thinking=False：v4 系默认开思考，思考文本走 reasoning_content 会被
        # think_then_json 的 token 收集混入 JSON 提取（旧版"输出不可解析"的根因）
        # T32：走 D2 的通用进程级缓存（_cached_llm），传 judge 自己的组合参数
        # (key, base_url, model, thinking=False)——绝不复用 _make_llm（语义是
        # 「req 主模型」，会静默改变审核语义）；组合含 model/base_url/thinking，
        # judge 与主模型/其他端点互不串味。
        return _cached_llm(
            key, base_url, model, False, None,
            lambda: DeepSeekLLM(api_key=key, model=model, base_url=base_url,
                                thinking=False))
    except Exception:
        from engine.pipeline_v2 import _make_llm
        return _make_llm(req)


def review_once(llm_review, answer: str, context_digest: str,
                strategy_directive: str) -> dict:
    """单次评审：{"passed", "score", "reasons", "skipped"}。
    score 为 0-100 整数（对齐前端 ReviewResult.score）；解析失败/审核器不可用 →
    skipped=True 且视为通过（不阻塞主流程），理由留痕。"""
    prompt = (
        "你是独立质检员，对学习助手的回答做终审（你与生成者不同源，请严格）。"
        "维度：①知识正确性——与参考上下文矛盾或明显虚构即不通过；引用标注是否可回指。"
        "②指令遵从——是否落实【输出策略指令】的信息密度与专业名词解释方式。\n"
        '只输出 JSON：{"passed": true|false, "score": 0到100的整数评分, '
        '"reasons": "未通过原因（通过则空）"}\n'
        f"【输出策略指令】{strategy_directive}\n"
        + (f"【参考上下文摘要】{context_digest[:1200]}\n" if context_digest else "")
        + f"【待审回答】{answer[:2500]}"
    )
    thinking = ""
    try:
        thinking, result = think_then_json(llm_review, prompt, "", "审核", silent=True)
        if not isinstance(result, dict) or "passed" not in result:
            return {"passed": True, "score": 100,
                    "reasons": "审核器输出不可解析，跳过本轮",
                    "thinking": thinking[:600], "skipped": True}
        passed = bool(result.get("passed"))
        try:
            score = max(0, min(100, int(result.get("score"))))
        except (TypeError, ValueError):
            score = 80 if passed else 30
        return {"passed": passed, "score": score,
                "reasons": str(result.get("reasons") or ""),
                "thinking": thinking[:600], "skipped": False}
    except Exception as e:
        return {"passed": True, "score": 100,
                "reasons": f"审核器异常跳过：{str(e)[:80]}",
                "thinking": "", "skipped": True}


def _compact_chunks(chunks) -> str:
    """断言审核的证据压缩：全量留存块（非 top3），每块 content 截断、总量封顶。
    剔除 parent_context（章节全文与子块内容重复，白耗预算）。"""
    parts: list[str] = []
    total = 0
    for i, c in enumerate(chunks or []):
        if isinstance(c, dict):
            item = {k: v for k, v in c.items() if k != "parent_context"}
            item["content"] = str(item.get("content") or "")[:_CHUNK_CHARS]
            text = json.dumps(item, ensure_ascii=False)
        else:
            text = str(c)[:_CHUNK_CHARS]
        if total + len(text) > _EVIDENCE_CHARS:
            parts.append(f"（证据过载，第{i + 1}块起省略）")
            break
        parts.append(f"[证据{i + 1}] {text}")
        total += len(text)
    return "\n".join(parts)


_CLAIMS_PROMPT = (
    "你是独立质检员（你与生成者不同源，请严格）。对【待审回答】做断言级忠实度核查：\n"
    "1) 抽取事实性断言（观点/建议/客套话不算；提取时不判真假，只提取）；"
    "每条恰好一个可独立验证的事实，代词/模糊指代替换为实体；最多15条；\n"
    "2) 对照【参考证据】逐条判定 label：supported（证据明确支撑或直接蕴含——从严）/"
    "unsupported（无支撑或矛盾）；\n"
    "3) 每个 unsupported 按证据强度给诊断 diag：hallucination（证据明确矛盾或虚构）/"
    "retrieval_gap（证据与问题沾边但不足以支撑）/no_evidence（上下文完全未覆盖）；\n"
    "4) 另核对【输出策略指令】的指令遵从（信息密度、名词解释方式）。\n"
    '只输出 JSON：{"claims":[{"claim":"...","label":"supported|unsupported",'
    '"confidence":0到1,"reason":"...","diag":"hallucination|retrieval_gap|no_evidence"}],'
    '"instruction_ok":true|false,"instruction_note":"..."}\n'
)


def review_claims(llm_review, answer: str, chunks, strategy_directive: str) -> dict:
    """研究档断言级忠实度审核（单调用：拆解+判定合一，temperature=0 防判定漂移）。

    出参为 review_once 的严格超集：review_once 全部键 + issues/claims/skipped。
    判定规则（写死）：任一 claim unsupported 或 instruction_ok=false → 不通过；
    score = round(100×supported/总断言)，空 claims → 100 通过（reasons 留注记）。
    fail-open：解析失败/审核器异常 → skipped=True 视为通过（与 review_once 同语义），
    reasons 带"本轮未经完整审核"前缀——经调用方 suggestion 映射后对用户可见。
    """
    prompt = (
        _CLAIMS_PROMPT
        + f"【输出策略指令】{strategy_directive}\n"
        + (f"【参考证据】\n{_compact_chunks(chunks)}\n" if chunks else "【参考证据】（无）\n")
        + f"【待审回答】{answer[:2500]}"
    )
    thinking = ""
    try:
        thinking, result = think_then_json(llm_review, prompt, "", "审核",
                                           silent=True, temperature=0)
        if not isinstance(result, dict) or not isinstance(result.get("claims"), list):
            return {"passed": True, "score": 100,
                    "reasons": "本轮未经完整审核（审核器输出不可解析）",
                    "issues": [], "claims": [],
                    "thinking": thinking[:600], "skipped": True}
        claims: list[dict] = []
        for c in result["claims"][:_CLAIMS_MAX]:
            if not isinstance(c, dict):
                continue
            label = str(c.get("label") or "")
            if label not in _LABELS:
                continue  # 白名单外整条丢弃（judge 输出走样时不迁就）
            try:
                conf = max(0.0, min(1.0, float(c.get("confidence"))))
            except (TypeError, ValueError):
                conf = 0.5
            entry = {"claim": str(c.get("claim") or "")[:200],
                     "label": label, "confidence": round(conf, 2),
                     "reason": str(c.get("reason") or "")[:200]}
            if label == "unsupported":
                diag = str(c.get("diag") or "")
                entry["diag"] = diag if diag in _DIAG_CN else "no_evidence"
            claims.append(entry)
        instruction_ok = bool(result.get("instruction_ok", True))
        unsupported = [c for c in claims if c["label"] == "unsupported"]
        total = len(claims)
        passed = not unsupported and instruction_ok
        score = round(100 * (total - len(unsupported)) / total) if total else 100
        reasons_parts = [f"{c['claim']}（{c.get('diag', '')}）：{c['reason']}"
                         for c in unsupported]
        if not instruction_ok:
            reasons_parts.append(f"指令遵从未达标：{str(result.get('instruction_note') or '')[:150]}")
        if not total:
            reasons_parts.append("未抽取到事实断言（视为通过）")
        issues = [{"problem": f"【{_DIAG_CN[c['diag']]}】{c['claim']}", "fix": c["reason"]}
                  for c in unsupported]
        return {"passed": passed, "score": score,
                "reasons": "；".join(reasons_parts),
                "issues": issues, "claims": claims,
                "thinking": thinking[:600], "skipped": False}
    except Exception as e:
        return {"passed": True, "score": 100,
                "reasons": f"本轮未经完整审核（审核器异常：{str(e)[:60]}）",
                "issues": [], "claims": [], "thinking": "", "skipped": True}
