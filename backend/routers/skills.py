"""Skill 列表与占位的上传/删除接口。"""
import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


@router.get("/api/skills")
async def list_skills():
    from skills.registry import registry
    return {"skills": registry.list_all()}


@router.get("/api/skills/{name}/source")
async def skill_source(name: str):
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
        pass
    return {"name": name, "source": "", "path": ""}


class SkillUpload(BaseModel):
    name: str
    code: str


@router.post("/api/skills")
async def upload_skill(req: SkillUpload):
    """上传新 Skill（占位——后续实现文件写入）"""
    return {"status": "ok", "name": req.name, "message": "Skill 上传功能即将实现"}


@router.delete("/api/skills/{name}")
async def delete_skill(name: str):
    """删除 Skill（占位）"""
    return {"status": "ok", "name": name, "message": "Skill 删除功能即将实现"}
