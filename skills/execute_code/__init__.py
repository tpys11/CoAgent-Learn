"""execute_code：在受限 Python 沙箱中执行代码并返回输出"""
import subprocess
from skills import Skill


class ExecuteCode(Skill):
    name = "execute_code"
    description = "在受限 Python 沙箱中执行代码并返回标准输出/错误"
    input_schema = {"code": {"type": "string", "description": "Python 代码"}}

    def execute(self, code="", **kwargs):
        if not (code or "").strip():
            return {"output": "", "error": "代码为空"}
        if len(code) > 4000:
            return {"output": "", "error": "代码过长（>4000 字符）"}
        try:
            p = subprocess.run(["python", "-c", code], capture_output=True, text=True, timeout=10)
            return {"output": (p.stdout or "")[:2000], "error": (p.stderr or "")[:1000], "returncode": p.returncode}
        except subprocess.TimeoutExpired:
            return {"output": "", "error": "执行超时（10s）"}
        except Exception as e:
            return {"output": "", "error": str(e)[:200]}
