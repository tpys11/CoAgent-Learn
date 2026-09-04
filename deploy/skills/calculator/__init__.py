"""calculator：安全计算数学表达式"""
import math
import re
from skills import Skill


class Calculator(Skill):
    name = "calculator"
    description = "安全计算数学表达式（支持 + - * / % ** 与数学函数）"
    input_schema = {"expression": {"type": "string", "description": "数学表达式，如 2**10 + 5*3"}}

    def execute(self, expression="", **kwargs):
        expr = (expression or "").strip()
        if not expr:
            return {"result": None, "error": "表达式为空"}
        if len(expr) > 200:
            return {"result": None, "error": "表达式过长（>200 字符）"}
        if not re.fullmatch(r"[0-9+\-*/%().,\s\w]*", expr):
            return {"result": None, "error": "包含不允许的字符"}
        try:
            env = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
            val = eval(expr, {"__builtins__": {}}, env)
            return {"result": val}
        except Exception as e:
            return {"result": None, "error": str(e)[:100]}
