"""Skill 列表与占位的上传/删除接口。"""
import os
import logging

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("coagent.skills")


@router.get("/api/skills")
def list_skills():
    from skills.registry import registry
    return {"skills": registry.list_all()}


@router.get("/api/skills/{name}/source")
def skill_source(name: str):
    """Skill 实现源码（详情弹层展示具体实现）"""
    try:
        from skills.registry import registry
        for s in registry.list_all():
            if s["name"] == name:
                p = os.path.join("/app/skills", s["folder"], "__init__.py")
                if os.path.exists(p):
                    src = open(p, encoding="utf-8").read()
                    return {"name": name, "source": src[:6000], "path": f"skills/{s['folder']}/__init__.py"}
    except Exception:
        logger.exception("读取 Skill 源码失败 name=%s", name)
    return {"name": name, "source": "", "path": ""}


class SkillUpload(BaseModel):
    name: str
    code: str


@router.post("/api/skills")
async def upload_skill(req: SkillUpload):
    """上传新 Skill：代码写入 skills/ 目录 + 动态加载"""
    import re as _re
    name = (req.name or "").strip()
    code = req.code or ""
    if not name or not _re.fullmatch(r"[a-z_][a-z0-9_]*", name):
        return {"status": "error", "msg": "skill 名称需为小写字母/数字/下划线（如 my_skill）"}
    if not code.strip():
        return {"status": "error", "msg": "代码不能为空"}
    folder = os.path.join("/app/skills", name)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "__init__.py"), "w", encoding="utf-8") as f:
        f.write(code)
    from skills.registry import registry
    result = registry.reload_skill(name)
    if result.get("status") == "error":
        return {"status": "error", "msg": "加载失败：" + result.get("msg", "")}
    return {"status": "ok", "name": result.get("name", name)}


@router.delete("/api/skills/{name}")
async def delete_skill(name: str):
    """删除 Skill：删 skills/ 目录 + 移除注册"""
    import shutil as _sh
    from skills.registry import registry
    folder = os.path.join("/app/skills", name)
    if os.path.isdir(folder):
        _sh.rmtree(folder)
    registry.remove_skill(name)
    return {"status": "ok", "name": name}


@router.post("/api/mcp/tools")
async def mcp_list_tools(req: dict):
    """连接 MCP Server，返回其工具列表"""
    from core.mcp_client import list_tools
    stype = req.get("type", "stdio")
    target = req.get("target", "")
    if not target:
        return {"status": "error", "msg": "连接目标不能为空"}
    try:
        tools = await list_tools(stype, target)
        return {"status": "ok", "tools": tools}
    except Exception as e:
        return {"status": "error", "msg": str(e)[:300]}


@router.post("/api/mcp/call")
async def mcp_call_tool(req: dict):
    """调用 MCP Server 的某个工具"""
    from core.mcp_client import call_tool
    stype = req.get("type", "stdio")
    target = req.get("target", "")
    tool = req.get("tool", "")
    args = req.get("args", {})
    if not target or not tool:
        return {"status": "error", "msg": "参数不完整"}
    try:
        result = await call_tool(stype, target, tool, args)
        return {"status": "ok", "result": result}
    except Exception as e:
        return {"status": "error", "msg": str(e)[:300]}
