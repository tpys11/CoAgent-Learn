# -*- coding: utf-8 -*-
"""gen_chart 资源生成技能：把数据整理为 ECharts 图表配置（模板约束生成 + 校验降级）。

Wave4 新增。设计：
- 只允许 line/bar/pie/radar 四种模板结构（CHART_TEMPLATES），prompt 强约束，防 LLM 产出任意 JSON。
- _validate_chart_option 纯函数可测；校验失败返回 error（resource_gen 归一化），不向前端吐坏配置。
- 成功返回 ```echarts fence 包裹的 JSON（前端 echarts fence 渲染，照抄 mermaid 模式）。
契约：成功 {"content": str} / 失败 {"error": str}——归一化由 resource_gen 层完成。
"""
import json
from typing import Optional

from skills import Skill


CHART_TEMPLATES = {
    "line": {
        "title": {"text": "图表标题"},
        "tooltip": {"trigger": "axis"},
        "xAxis": {"type": "category", "data": ["类别1", "类别2", "类别3"]},
        "yAxis": {"type": "value"},
        "series": [{"name": "系列名", "type": "line", "data": [10, 20, 30]}],
    },
    "bar": {
        "title": {"text": "图表标题"},
        "tooltip": {"trigger": "axis"},
        "xAxis": {"type": "category", "data": ["类别1", "类别2", "类别3"]},
        "yAxis": {"type": "value"},
        "series": [{"name": "系列名", "type": "bar", "data": [10, 20, 30]}],
    },
    "pie": {
        "title": {"text": "图表标题"},
        "tooltip": {"trigger": "item"},
        "series": [{"name": "系列名", "type": "pie", "radius": "60%",
                    "data": [{"value": 30, "name": "类别1"}, {"value": 50, "name": "类别2"}]}],
    },
    "radar": {
        "title": {"text": "图表标题"},
        "radar": {"indicator": [{"name": "维度1", "max": 100}, {"name": "维度2", "max": 100}]},
        "series": [{"name": "系列名", "type": "radar",
                    "data": [{"value": [80, 60], "name": "对象名"}]}],
    },
}

_CHART_TEMPLATE_JSON = json.dumps(CHART_TEMPLATES, ensure_ascii=False, indent=2)

_ALLOWED_SERIES_TYPES = {"line", "bar", "pie", "radar", "scatter", "funnel", "gauge"}

_CHART_PROMPT = (
    "把下面的数据整理成一个 ECharts 图表。只允许使用以下 4 种模板结构（line/bar/pie/radar），"
    "从中选最合适的一种，只填数据与标题，不得改动结构，不得输出除 JSON 以外的任何文字。\n"
    "模板：\n" + _CHART_TEMPLATE_JSON + "\n\n数据：\n"
)


def _validate_chart_option(data) -> Optional[str]:
    """校验 ECharts option 结构；合法返回 None，否则返回错误信息。"""
    if not isinstance(data, dict):
        return "生成的图表配置不合法，请重试"
    series = data.get("series")
    if not isinstance(series, list) or not series:
        return "生成的图表配置不合法，请重试"
    for s in series:
        if not isinstance(s, dict):
            return "生成的图表配置不合法，请重试"
        if s.get("type") not in _ALLOWED_SERIES_TYPES:
            return "生成的图表配置不合法，请重试"
    return None


class GenChart(Skill):
    name = "gen_chart"
    category = "resource"
    description = "把数据渲染为 ECharts 图表"
    input_schema = {
        "content": {"type": "string", "description": "数据或描述"},
        "api_key": {"type": "string", "description": "API Key"},
        "base_url": {"type": "string", "description": "Base URL"},
        "model": {"type": "string", "description": "模型名"},
    }
    output_schema = {
        "content": {"type": "string", "description": "```echarts fence 包裹的 ECharts option JSON"},
    }
    retries = 1

    def execute(self, content="", api_key="", base_url="", model="", **kwargs):
        try:
            from core.base_llm import DeepSeekLLM
            from core.model_provider import resolve_model, current_tier
            _spec = resolve_model("main", current_tier())  # R-D S3：缺省模型/端点改问注册表（调用方传值优先，test 档随决策 38）
            llm = DeepSeekLLM(
                api_key=api_key,
                model=model or _spec.model,
                base_url=base_url or _spec.base_url,
                thinking=False,
            )
            data = llm.chat_with_json(
                [{"role": "user", "content": _CHART_PROMPT + (content or "")[:4000]}],
                {"properties": {"series": {"type": "array"}}, "required": ["series"]},
                temperature=0.3,
            )
            err = _validate_chart_option(data)
            if err:
                return {"error": err}
            return {"content": "```echarts\n" + json.dumps(data, ensure_ascii=False) + "\n```"}
        except Exception as e:
            return {"error": str(e)[:200]}