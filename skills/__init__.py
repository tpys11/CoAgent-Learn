"""Skill 基类 — 每个功能模块继承此类，存入独立文件夹"""
from typing import Any


class Skill:
    """Agent 可调用的功能模块。一个文件夹 = 一个 Skill = 一个 MCP 模块"""

    name: str = ""
    description: str = ""
    input_schema: dict = {}
    output_schema: dict = {}
    resources: dict = {}
    prompts: dict = {}
    retries: int = 0

    def execute(self, **kwargs) -> dict:
        raise NotImplementedError
