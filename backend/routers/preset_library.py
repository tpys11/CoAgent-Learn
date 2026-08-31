# -*- coding: utf-8 -*-
"""F13-S1 预设资源库路由：三级清单只读 + 占位元数据编辑。

GET /api/preset-library   领域→资源→文件三级索引（含页数等元数据）
PUT /api/preset-library/meta  编辑出版社/初版时间/封面占位字段（资源级）
原始文件经 /preset-library/{rel_path} 静态挂载回源（main.py，与 /uploads 同模式）。
"""
import logging

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("coagent.preset")
router = APIRouter()


class PresetMetaUpdate(BaseModel):
    rel_path: str
    publisher: str = ""
    pub_year: str = ""
    cover: str = ""


@router.get("/api/preset-library")
async def get_preset_library():
    """三级清单。扫描内建优雅降级（目录缺失=空清单、页数失败=留空），不抛 500。"""
    from starlette.concurrency import run_in_threadpool
    from services.preset_library import scan_preset_library
    return await run_in_threadpool(scan_preset_library)


@router.put("/api/preset-library/meta")
async def put_preset_meta(req: PresetMetaUpdate):
    """占位字段编辑；同步路径按约定返回 {"status":"error","msg"}（HTTP 200）。"""
    from starlette.concurrency import run_in_threadpool
    from services.preset_library import update_meta
    return await run_in_threadpool(
        update_meta, req.rel_path, req.publisher, req.pub_year, req.cover)
