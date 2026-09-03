# -*- coding: utf-8 -*-
"""数据库路径守卫：防止再次出现 CWD 相对路径导致的多库分叉（Bug猎杀后续·工程改进）。
背景：_DB_DIR 曾默认 "./data"（CWD 相对），本地 bat / 容器 / 其他启动目录各落一个 app.db，
最多同时存在三个库。现规则=默认锚定仓库根 data/，环境变量 SQLITE_DIR 可覆盖。
注意：套件中其他模块会经 config.load_dotenv() 把 .env 注入进程环境，因此本文件
只用【导入期快照】判断分支，不做执行期环境断言。"""
import os

from core.db import base

# 导入本模块瞬间抓拍（此时若被 dotenv 提前污染也如实反映 base 的实际解析输入）
_SQLITE_DIR_AT_IMPORT = os.environ.get("SQLITE_DIR")


def _expected_db_dir() -> str:
    """复刻 base 的解析规则：显式 env 优先（可为相对），否则锚定仓库根 data/。"""
    explicit = os.path.normpath(_SQLITE_DIR_AT_IMPORT) if _SQLITE_DIR_AT_IMPORT else None
    return explicit or os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(base.__file__)), "..", "..", "..", "data"))


def test_db_dir_matches_resolution_rule():
    """_DB_DIR 必须等于规则推导值——防止有人改回裸相对默认或破坏覆盖顺序。"""
    assert base._DB_DIR == _expected_db_dir(), f"{base._DB_DIR} != {_expected_db_dir()}"


def test_default_anchor_is_absolute_repo_data():
    """默认锚点本身必须绝对且指向 <包根父目录>/data——三分叉事故的根因守卫。
    布局说明：本地嵌套（backend/core/db）下包根父目录即仓库根（<repo>/data）；
    容器扁平（/app/core/db）下 3 级上溯落在 /（运行时由 SQLITE_DIR 覆盖，本测试
    仅防公式回退成 CWD 相对路径或层级漂移——直接镜像生产公式来源，杜绝私设算式）。"""
    from core.db import _sqlite_core
    pkg_root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(_sqlite_core.__file__))))
    anchor = _sqlite_core._DEFAULT_DB_DIR
    assert os.path.isabs(anchor), f"默认锚点是相对路径: {anchor}"
    assert anchor == os.path.normpath(os.path.join(os.path.dirname(pkg_root), "data")), (
        f"默认锚点偏离包根父目录 data/: {anchor}")


def test_data_dir_export_consistent():
    """上传目录派生源必须与库目录同源（main.py/knowledge.py 依赖）。"""
    assert base.DATA_DIR == base._DB_DIR
