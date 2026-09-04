# -*- coding: utf-8 -*-
"""领域课程资源：大纲生成 + 章节导读&真实链接（B3）
- outline：新建领域 AI 生成课程大纲(章) + 百科词条
- chapter：按需生成某章导读(markdown) + 联网搜真实链接(独立 websearch，不走 skills)
"""
import logging
import requests as _req
from fastapi import APIRouter
from pydantic import BaseModel
from core.model_provider import MODEL_MAIN
from core.memory_analysis import _extract_json

logger = logging.getLogger("coagent.domain_res")
router = APIRouter()
NL = chr(10)


class OutlineReq(BaseModel):
    domain: str
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = MODEL_MAIN


class ChapterReq(BaseModel):
    domain: str
    title: str = ""
    keywords: list = []
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    model: str = MODEL_MAIN


def _llm_json(api_key, base_url, model, prompt):
    resp = _req.post(
        (base_url or "https://api.deepseek.com/v1").rstrip("/") + "/chat/completions",
        json={"model": model, "thinking": {"type": "disabled"},
              "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer " + (api_key or "")}, timeout=120)
    if resp.status_code != 200:
        return None
    return _extract_json(resp.json()["choices"][0]["message"]["content"] or "")


def _llm_text(api_key, base_url, model, prompt):
    resp = _req.post(
        (base_url or "https://api.deepseek.com/v1").rstrip("/") + "/chat/completions",
        json={"model": model, "thinking": {"type": "disabled"},
              "messages": [{"role": "user", "content": prompt}]},
        headers={"Authorization": "Bearer " + (api_key or "")}, timeout=120)
    if resp.status_code != 200:
        return ""
    return resp.json()["choices"][0]["message"]["content"] or ""


@router.post("/api/domain/outline")
def domain_outline(req: OutlineReq):
    return _outline_sync(req)


def _outline_sync(req):
    name = (req.domain or "").strip()
    if not name:
        return {"status": "error", "msg": "领域名称不能为空"}
    prompt = NL.join([
        "请为学习领域「" + name + "」设计一套系统课程大纲，并给出该领域的百科词条。严格输出 JSON，不要代码块、不要额外文字：",
        "{",
        '  "chapters": [',
        '    {"title": "章节标题", "goal": "学完这章能掌握什么（一句话）", "keywords": ["2-3个便于联网搜索该章内容的主题词"]}',
        "  ],",
        '  "wiki": [',
        '    {"name": "词条名", "theme": "分组", "intro": "一句话", "detail": "介绍（80-120字）"}',
        "  ]",
        "}",
        "要求：chapters 5-8 章，从入门到进阶、覆盖该领域核心知识链路；wiki 5-8 个领域核心词条。",
    ])
    logger.info("[domain-outline] domain=%s key=%s", name, ('set' if (req.api_key or '').strip() else 'EMPTY'))
    data = _llm_json(req.api_key, req.base_url, req.model, prompt)
    if not data:
        return {"status": "error", "msg": "AI 返回内容无法解析"}
    chs = data.get("chapters") or []; wks = data.get("wiki") or []
    logger.info("[domain-outline] done chapters=%d wiki=%d", len(chs), len(wks))
    return {"status": "ok", "chapters": chs, "wiki": wks}


@router.post("/api/domain/chapter")
def domain_chapter(req: ChapterReq):
    return _chapter_sync(req)


def _chapter_sync(req):
    name = (req.domain or "").strip()
    title = (req.title or "").strip()
    if not name or not title:
        return {"status": "error", "msg": "领域/章节不能为空"}
    intro = ""
    try:
        intro = _llm_text(req.api_key, req.base_url, req.model,
            "你是「" + name + "」领域的老师。为章节「" + title + "」写一份精炼导读（Markdown，600-1000字）："
            "这章学什么、关键概念、建议的学习顺序、容易踩的坑、学完自测两问。"
            "严格禁止写任何网址/链接/URL（外部学习链接由系统另外提供），正文里不要出现 http 开头的文字。只输出 Markdown 正文。")
    except Exception:
        intro = ""
    logger.info("[domain-chapter] domain=%s title=%s key=%s", name, title, ('set' if (req.api_key or '').strip() else 'EMPTY'))
    links = []
    try:
        from services.websearch import search_multi
        kws = [str(k) for k in (req.keywords or []) if str(k).strip()]
        queries = []
        if kws:
            queries.append(" ".join(kws[:2]) + " 教程")
        queries.append(title + " " + name + " 入门")
        queries.append(name + " " + title + " 学习资料")
        links = search_multi(queries, max_per=4)
    except Exception:
        links = []
    return {"status": "ok", "intro": (intro or "").strip()[:3000], "links": links}
