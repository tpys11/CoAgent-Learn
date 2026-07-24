"""Skill 基类 — 每个功能模块继承此类，即可被 Agent 通过统一接口调用"""

from typing import Any


class Skill:
    """Agent 可调用的功能模块"""

    name: str = ""          # 唯一标识
    description: str = ""   # LLM 判断何时调用
    input_schema: dict = {} # 输入参数 JSON Schema

    def execute(self, **kwargs) -> dict:
        """执行技能，返回结果字典"""
        raise NotImplementedError

    def to_api_desc(self) -> dict:
        """生成 LLM function-calling 格式的描述"""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": self.input_schema,
                "required": list(self.input_schema.keys()),
            },
        }
