"""跨路由共享的小工具函数。"""


def _as_dict(data):
    """SQLite 存的 JSON 字符串转 dict。"""
    import json as _json
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            return _json.loads(data)
        except Exception:
            return {}
    return {}
