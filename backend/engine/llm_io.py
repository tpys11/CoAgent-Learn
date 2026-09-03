# -*- coding: utf-8 -*-
"""引擎侧 LLM 流式 JSON 工具。
自 agents/graph.py think_then_json 改造迁入（逻辑逐字等价），两处适配：
  1. 闭包捕获的 on_token / cancel_event 参数化为显式入参
  2. 其余分支（```json 围栏 → 裸花括号 → 纯文本兜底）逐字保留
旧 agents/graph.py 内的同名副本继续服务旧路径，Loop5 删除时一并消亡。"""
import json
import logging
import re

logger = logging.getLogger("coagent.llm_io")


def think_then_json(llm, system_prompt: str, user_prompt: str, agent_name: str,
                    silent: bool = False, on_delta=None,
                    on_token=None, cancel_event=None,
                    temperature: float | None = None) -> tuple[str, dict]:
    """流式思考：用chat_stream逐token推送，收集完整文本后提取JSON。
    silent=True：不推 step/thought_token（内部整理工作不展示在主思维链，产出仍返回给调用方）
    on_delta：与 silent 无关的 chunk 广播回调——静默子agent借此仅直播不落库。
    temperature：判卷类消费者（断言审核）固定低温防判定漂移；None=不透传（沿用默认）。"""
    collected = []

    def collect(chunk):
        collected.append(chunk)
        if on_token and not silent:
            on_token(agent_name, chunk)
        if on_delta and chunk:
            try:
                on_delta(chunk)
            except Exception:
                logger.debug("on_delta 直播回调异常（不扰主链）", exc_info=True)
    try:
        _kw = {"cancel_event": cancel_event}
        if temperature is not None:
            _kw["temperature"] = temperature
        llm.chat_stream(
            [{"role": "system", "content": system_prompt},
             {"role": "user", "content": user_prompt}],
            collect, **_kw
        )
        raw = "".join(collected)
        m = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
        if m:
            thinking = raw[:m.start()].strip()
            result = json.loads(m.group(1))
        else:
            m2 = re.search(r'\{[\s\S]*\}', raw)
            if m2:
                thinking = raw[:m2.start()].strip()
                result = json.loads(m2.group())
            else:
                thinking = raw[:300]
                result = {"content": raw}
        return thinking, result
    except Exception as e:
        return f"执行异常: {e}", {}
