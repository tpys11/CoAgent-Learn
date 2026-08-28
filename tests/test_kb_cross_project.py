# -*- coding: utf-8 -*-
"""P0-2 回归：跨项目上传同一文件的去重/覆盖/复用。
1. doc_id 必须含 project_id（跨项目同内容互不覆盖——根因2）
2. 同项目重复上传跳过（返回 -1）
3. 跨项目第二次上传走复制路径：不影响 donor、目标项目得完整副本
"""
import hashlib

import pytest

import core.knowledge_service as ks
from core.knowledge_service import _make_doc_id

PDF = b"%PDF-1.4 fake-bytes"
SHA = hashlib.sha256(PDF).hexdigest()
SRC = "AI-Agents-in-Depth-zh-CN.pdf"
PA = "projA"   # 先上传者（donor）
PB = "projB"   # 后上传者


def test_doc_id_project_scoped():
    """跨项目同内容 doc_id 必不同；同项目同内容稳定（重传幂等前提）。"""
    a = _make_doc_id(PA, SRC, 0, "同一段文本")
    b = _make_doc_id(PB, SRC, 0, "同一段文本")
    assert a != b
    assert len(a) == 24, "长度必须与历史一致，避免列宽/类型变化"
    assert a == _make_doc_id(PA, SRC, 0, "同一段文本")
