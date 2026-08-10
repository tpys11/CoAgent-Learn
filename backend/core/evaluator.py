# -*- coding: utf-8 -*-
"""评估引擎：幻觉率 / 画像-资源难度适配准确率 / 核心知识点覆盖率"""
import json


def _call_llm(prompt, api_key=""):
    """调用 DeepSeek，返回文本"""
    try:
        import requests as _req
        from core.config import config as _cfg
        h = {"Authorization": "Bearer " + (api_key or _cfg.DEEPSEEK_API_KEY), "Content-Type": "application/json"}
        resp = _req.post(_cfg.DEEPSEEK_BASE_URL + "/chat/completions",
            json={"model": "deepseek-v4-flash", "messages": [{"role": "user", "content": prompt}], "max_tokens": 500},
            headers=h, timeout=60)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"] or ""
        return ""
    except Exception:
        return ""


def _extract_json(text):
    """提取 JSON"""
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        lines = s.split(chr(10))
        lines = [l for l in lines if not l.strip().startswith("```")]
        s = chr(10).join(lines).strip()
    start = s.find("{")
    end = s.rfind("}")
    if start >= 0 and end > start:
        s = s[start:end+1]
    try:
        return json.loads(s)
    except Exception:
        return None


def hallucination_rate(questions, kb_texts, api_key=""):
    """幻觉率：生成回答 → 拆断言 → 对照知识库判断是否符实"""
    if not questions:
        return {"rate": 0, "total_claims": 0, "hallucinated": 0, "detail": "无测试题"}
    kb_joined = chr(10).join(kb_texts[:30])[:6000]
    total_claims = 0
    hallucinated = 0
    details = []
    for q in questions[:5]:
        gen_prompt = "请回答以下问题，只输出简洁的事实性内容：" + chr(10) + q
        if kb_joined:
            gen_prompt = "请仅基于以下知识库内容回答，若知识库没有相关内容则回复【知识库未收录】：" + chr(10) + "【知识库】" + chr(10) + kb_joined[:4000] + chr(10) + "【问题】" + chr(10) + q
        answer = _call_llm(gen_prompt, api_key)
        if not answer:
            continue
        claim_prompt = "把下面的回答拆分成独立的断言（事实性陈述），每个一行，只输出断言列表：" + chr(10) + answer[:1500]
        claims_raw = _call_llm(claim_prompt, api_key)
        if not claims_raw:
            continue
        judge_prompt = "判断以下每个断言是否能在知识库中找到依据（符实）。只输出JSON：{claims:[{claim:...,supported:true/false}]}" + chr(10)
        judge_prompt += "【知识库】" + chr(10) + kb_joined[:4000] + chr(10) + "【断言】" + chr(10) + claims_raw[:1500]
        judge_raw = _call_llm(judge_prompt, api_key)
        judge = _extract_json(judge_raw)
        if isinstance(judge, dict) and isinstance(judge.get("claims"), list):
            for c in judge["claims"]:
                total_claims += 1
                if not c.get("supported", True):
                    hallucinated += 1
                    details.append({"question": q, "claim": c.get("claim", "")})
    rate = round(hallucinated / total_claims * 100, 1) if total_claims else 0
    return {"rate": rate, "total_claims": total_claims, "hallucinated": hallucinated, "details": details[:5]}


def adaptation_accuracy(profiles, api_key=""):
    """画像-资源难度适配准确率"""
    if not profiles:
        return {"rate": 0, "total": 0, "matched": 0, "detail": "无画像"}
    total = 0
    matched = 0
    details = []
    for p in profiles[:5]:
        level = p.get("level", "intermediate")
        topic = p.get("topic", "基础知识")
        gen = _call_llm("为水平为" + level + "的学习者生成关于" + topic + "的一道测试题，并标注难度(L1基础/L2基础+/L3中等/L4难/L5挑战)。只输出JSON：{question:...,difficulty:L3}", api_key)
        d = _extract_json(gen)
        if not d or not d.get("difficulty"):
            continue
        diff = str(d["difficulty"]).upper()
        total += 1
        expect = {"beginner": ["L1", "L2"], "intermediate": ["L3"], "advanced": ["L4", "L5"]}
        exp = expect.get(level, ["L3"])
        ok = any(e in diff for e in exp)
        if ok:
            matched += 1
        else:
            details.append({"level": level, "difficulty": diff})
    rate = round(matched / total * 100, 1) if total else 0
    return {"rate": rate, "total": total, "matched": matched, "details": details[:5]}


def knowledge_coverage(knowledge_points, topic, api_key=""):
    """核心知识点覆盖率"""
    if not knowledge_points:
        return {"rate": 0, "total": 0, "covered": 0, "detail": "无知识点清单"}
    content = _call_llm("请写一段关于" + topic + "的讲解（500字内），覆盖尽量多的核心知识点。", api_key)
    if not content:
        return {"rate": 0, "total": len(knowledge_points), "covered": 0}
    check = _call_llm("以下是知识点清单和讲解内容。判断每个知识点是否在讲解中出现。只输出JSON：{covered:[知识点名...]}。" + chr(10) + "【清单】" + chr(10) + chr(10).join(knowledge_points) + chr(10) + "【讲解】" + chr(10) + content[:3000], api_key)
    d = _extract_json(check)
    covered_list = d.get("covered", []) if isinstance(d, dict) else []
    total = len(knowledge_points)
    covered = len(covered_list)
    rate = round(covered / total * 100, 1) if total else 0
    return {"rate": rate, "total": total, "covered": covered, "points": covered_list}
