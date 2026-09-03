# -*- coding: utf-8 -*-
"""pytest 配置：test_base_llm.py 是需真实 API Key 的手动验证脚本（无 Key 时 sys.exit），
不作为单元测试收集；只跑纯逻辑测试 test_graph_logic.py。"""
collect_ignore = ["test_base_llm.py"]

import os
import weakref

import pytest


@pytest.fixture(autouse=True)
def _p1_release_cached_conn_before_file_delete(monkeypatch):
    """P1.2 配套（纯测试基建，不改任何产品代码与断言）：
    P1.2 后 execute 走实例级缓存连接，SQLiteClient 存活期间持有 db 文件句柄；
    Windows 上对打开中的文件 os.remove 报 WinError 32——test_engine_finalize.py:128
    在测试体内 os.remove(dbp)（全库唯一一处测试中删除 db 文件，P1.2 首次全量回归
    恰好且仅该条 PermissionError 实证）。此 fixture 桥接：删除文件前，先释放追踪到的
    同路径 client 的缓存连接（下次 execute 经 _get_shared_conn 自动重建，语义无损）。
    对非 db 文件的删除零影响；无匹配 client 时行为与原生 os.remove/unlink 完全一致。"""
    from core.db.base import SQLiteClient  # 延迟导入：conftest 顶层保持无 core 依赖

    live = weakref.WeakSet()
    orig_init = SQLiteClient.__init__

    def tracking_init(self, *args, **kwargs):
        orig_init(self, *args, **kwargs)
        live.add(self)

    monkeypatch.setattr(SQLiteClient, "__init__", tracking_init)

    orig_remove = os.remove
    orig_unlink = os.unlink

    def _release_same_path(path):
        try:
            target = os.path.abspath(str(path)).lower()
        except (TypeError, ValueError):
            return
        for c in list(live):
            if getattr(c, "_shared_conn", None) is not None \
                    and os.path.abspath(c.db_path).lower() == target:
                c._discard_shared_conn()

    def remove(path, *args, **kwargs):
        _release_same_path(path)
        return orig_remove(path, *args, **kwargs)

    def unlink(path, *args, **kwargs):
        _release_same_path(path)
        return orig_unlink(path, *args, **kwargs)

    monkeypatch.setattr(os, "remove", remove)
    monkeypatch.setattr(os, "unlink", unlink)
    yield
