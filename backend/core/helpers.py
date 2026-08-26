"""跨路由共享的小工具函数。"""
import logging

logger = logging.getLogger("coagent.helpers")


def _as_dict(data):
    """SQLite 存的 JSON 字符串转 dict。"""
    import json as _json
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return _json.loads(data)
        except _json.JSONDecodeError:
            return {}
    return {}


def extract_json_obj(text: str) -> dict:
    """提取文本中的 JSON 对象（容错：裸 JSON 或花括号片段）。"""
    import json as _json
    import re as _re
    try:
        d = _json.loads(text)
        return d if isinstance(d, dict) else {}
    except _json.JSONDecodeError:
        logger.debug("直出 JSON 解析失败，回退花括号片段提取")
    m = _re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            d = _json.loads(m.group(0))
            return d if isinstance(d, dict) else {}
        except _json.JSONDecodeError:
            logger.debug("花括号片段解析失败，返回空 dict")
    return {}


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数（中文约 2 字/token，英文约 4 字符/token）。
    用于上下文预算与压缩触发，不追求精确。"""
    if not text:
        return 0
    return max(1, len(text) // 2)
