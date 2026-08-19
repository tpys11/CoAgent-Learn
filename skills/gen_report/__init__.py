# -*- coding: utf-8 -*-
"""gen_report 资源生成技能：把学习内容整理为专业报告。

从 backend/services/resource_gen.py 迁移而来（Wave1 解耦）；Wave5 升级为专业报告结构：
自动嵌图（{{IMG:关键词|说明}} 标记 + 并行搜索）+ 内嵌 echarts 图表（合法性校验）。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
import json
import re
from concurrent.futures import ThreadPoolExecutor

from skills import Skill

_REPORT_PROMPT = (
    "把下面的内容整理成一份专业报告。结构要求：1) 标题；2) 摘要（3 句话内的执行摘要）；"
    "3) 关键要点（KPI 式列表）；4) 分节详述（每节一个小标题）；"
    "5) 若内容含可量化数据，用 ```echarts 代码块给出图表（只允许 line/bar/pie/radar 四种结构，只填数据）；"
    "6) 需要配图的位置输出标记 {{IMG:搜索关键词|图片说明}}，全文最多 4 处；"
    "7) 结论与建议。直接输出 Markdown 正文，不要额外解释。\n\n内容：\n"
)

_IMG_MARKER_RE = re.compile(r"\{\{IMG:([^|}]+)\|([^}]+)\}\}")
_MAX_IMAGES = 4


def replace_image_markers(md: str, searcher) -> str:
    """把 {{IMG:搜索词|说明}} 标记替换为真实图片 Markdown。

    searcher(kw, limit=1) -> list[dict]：注入依赖便于测试（真实链路由 execute 传入
    gen_image.search_images 的并行结果查找函数）。最多搜索前 4 处；命中 →
    ![说明](url) + 来源行；未命中/超限 → 「> 配图建议：…（未找到合适图片）」。
    """
    def _repl(m):
        kw, caption = m.group(1).strip(), m.group(2).strip()
        try:
            hits = searcher(kw, limit=1) or []
        except Exception:
            hits = []
        if hits and hits[0].get("url"):
            return f"![{caption}]({hits[0]['url']})\n*图：{caption}（来源：Wikimedia Commons/Openverse）*"
        return f"> 配图建议：{caption}（未找到合适图片）"

    # 只对前 _MAX_IMAGES 处标记调用 searcher，其余直接降级（控延迟）
    def _limited(md_inner):
        counter = {"n": 0}

        def _sub(m):
            if counter["n"] >= _MAX_IMAGES:
                return f"> 配图建议：{m.group(2).strip()}（未找到合适图片）"
            counter["n"] += 1
            return _repl(m)

        return _IMG_MARKER_RE.sub(_sub, md_inner)

    return _limited(md)


def sanitize_echarts_blocks(md: str) -> str:
    """校验 ```echarts fence 内的 JSON 是否合法（parse + _validate_chart_option）。

    非法 → fence 语言改为 json（降级为代码块展示，不丢内容）。
    """
    from skills.gen_chart import _validate_chart_option

    def _repl(m):
        body = m.group(1)
        try:
            opt = json.loads(body)
        except Exception:
            return "```json\n" + body + "```"
        if _validate_chart_option(opt) is not None:
            return "```json\n" + body + "```"
        return m.group(0)

    return re.sub(r"```echarts\n(.*?)```", _repl, md, flags=re.DOTALL)


class GenReport(Skill):
    name = "gen_report"
    category = "resource"
    description = "汇总讲解内容为结构化报告"
    input_schema = {
        "content": {"type": "string", "description": "学习内容"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "Markdown 报告正文"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            from core.base_llm import DeepSeekLLM
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or "deepseek-v4-flash",
                base_url=base_url,
                thinking=False,
            )
            text = llm.chat([{"role": "user", "content": _REPORT_PROMPT + (content or "")[:4000]}], temperature=0.5)
            text = (text or "").strip()
            if not text:
                return {"error": "模型未返回内容"}

            # 1) 校验并降级非法 echarts 块
            draft = sanitize_echarts_blocks(text)

            # 2) 提取前 4 处 IMG 标记，并行搜索图片
            markers = list(_IMG_MARKER_RE.finditer(draft))[:_MAX_IMAGES]
            results: dict = {}

            def _search(m):
                kw = m.group(1).strip()
                from skills.gen_image import search_images
                try:
                    return kw, search_images(kw, limit=1)
                except Exception:
                    return kw, []

            if markers:
                with ThreadPoolExecutor(max_workers=4) as ex:
                    futures = [ex.submit(_search, m) for m in markers]
                    for f in futures:
                        try:
                            kw, hits = f.result(timeout=8)
                            results[kw] = hits
                        except Exception:
                            pass

            # 3) 注入搜索结果替换标记
            final = replace_image_markers(draft, lambda kw, limit=1: results.get(kw, []))
            return {"content": final}
        except Exception as e:
            return {"error": str(e)[:200]}