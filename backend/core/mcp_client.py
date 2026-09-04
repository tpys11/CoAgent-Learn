# -*- coding: utf-8 -*-
"""MCP 客户端：连接外部 MCP Server，获取工具列表、调用工具"""
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client


def _connect_ctx(stype: str, target: str):
    """根据连接类型返回客户端上下文管理器"""
    stype = (stype or '').strip().lower()
    if stype == 'stdio':
        parts = (target or '').strip().split()
        if not parts:
            raise ValueError('stdio 命令不能为空')
        return stdio_client(StdioServerParameters(command=parts[0], args=parts[1:]))
    elif stype in ('http', 'sse'):
        return sse_client(target)
    raise ValueError('不支持的连接类型: ' + stype)


async def list_tools(stype: str, target: str) -> list:
    """连接 MCP Server，返回工具列表 [{name, description, schema}]"""
    async with _connect_ctx(stype, target) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.list_tools()
            tools = []
            for t in getattr(result, 'tools', []):
                tools.append({
                    "name": t.name,
                    "description": t.description or '',
                    "schema": getattr(t, 'inputSchema', {}) or {},
                })
            return tools


async def call_tool(stype: str, target: str, tool_name: str, arguments: dict) -> dict:
    """连接 MCP Server，调用指定工具，返回 {content, isError}"""
    async with _connect_ctx(stype, target) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments or {})
            content = []
            for c in getattr(result, 'content', []):
                content.append(getattr(c, 'text', str(c)))
            return {"content": content, "isError": getattr(result, 'isError', False)}
