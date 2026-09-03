"""Step D1 守卫：engine 层对 main 的反向依赖必须被测试钉住。

D1 把 _auto_settings / _build_preloaded / _parse_special_inputs 从 main.py
原样迁入 services/chat_context.py（字节级零逻辑改动），engine/ 三处
`from main import` 清零——但当时没有任何测试钉住这件事。后续若有人再从
engine 反向 import main（pipeline_v2 → main → engine 的循环 import），
不会有任何一条测试变红。

范式（决策 18）：存在性守卫硬失败 + 属性守卫 skip 兜底，读文件统一 utf-8-sig，
目标是「一处坏掉只红对应那一条」。

T33 说明：本文件只做源码文本扫描，模块级与测试函数内都不 import
engine.pipeline_v2 / main，不会触发 core.config.load_dotenv() 把 .env 的
SQLITE_DIR 注入进程环境，因此不会污染 test_db_path 的导入期快照。
"""
import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND = PROJECT_ROOT / "backend"
ENGINE = BACKEND / "engine"
CHAT_CONTEXT = BACKEND / "services" / "chat_context.py"

# D1 迁入 chat_context.py 的三个函数（匹配 def 名字 + "("，避免误匹配同名变量/字符串）
CHAT_CONTEXT_FUNCS = ["_auto_settings", "_build_preloaded", "_parse_special_inputs"]

# 反向依赖模式：`from main import ...`（含函数内缩进形式）与裸 `import main`
REVERSE_IMPORT_RE = re.compile(
    r"^\s*(from\s+main\s+import\b|import\s+main\b)", re.MULTILINE
)
# FastAPI 装配层：engine 也不得反向依赖 routers（与 main 同属 app 入口层）。
# 注意：engine 允许 `from fastapi.responses import StreamingResponse`（框架类型），
# 本守卫只拦装配层模块，不拦框架本身——不要扩大成「禁 fastapi」。
APP_LAYER_RE = re.compile(
    r"^\s*(from\s+routers[\s.]|import\s+routers\b)", re.MULTILINE
)


def _engine_py_files() -> list[Path]:
    return sorted(ENGINE.rglob("*.py")) if ENGINE.is_dir() else []


def test_d1_engine_dir_and_chat_context_exist():
    """存在性守卫：守护对象消失时硬失败，防止下面的属性守卫空转变假绿。"""
    files = _engine_py_files()
    assert files, (
        "backend/engine/ 不存在或没有任何 *.py：D1 守卫对象消失，"
        "先确认目录结构是否被整体改动"
    )
    assert CHAT_CONTEXT.is_file(), (
        "backend/services/chat_context.py 不存在：D1 迁入的三个函数失去了家，"
        "engine 层将被迫重新反向 import main"
    )


def test_d1_engine_no_reverse_import_main():
    """硬守卫：engine/**/*.py 不得出现 from main import / import main（含函数内）。"""
    offenders: list[str] = []
    for path in _engine_py_files():
        text = path.read_text(encoding="utf-8-sig")
        for m in REVERSE_IMPORT_RE.finditer(text):
            lineno = text.count("\n", 0, m.start()) + 1
            offenders.append(f"{path.relative_to(PROJECT_ROOT)}:{lineno}")
    assert not offenders, (
        f"engine 层重新出现对 main 的反向依赖 {offenders}；"
        "pipeline_v2 → main → engine 会成环（D1 消除的依赖方向），"
        "需要共享逻辑请下沉到 services/ 或在函数内延迟导入"
    )


def test_d1_engine_no_app_layer_import():
    """属性守卫（skip 兜底）：engine 不得依赖 routers 装配层。"""
    files = _engine_py_files()
    if not files:
        pytest.skip("engine 目录不存在，交由存在性守卫报错")
    offenders: list[str] = []
    for path in files:
        text = path.read_text(encoding="utf-8-sig")
        for m in APP_LAYER_RE.finditer(text):
            lineno = text.count("\n", 0, m.start()) + 1
            offenders.append(f"{path.relative_to(PROJECT_ROOT)}:{lineno}")
    assert not offenders, (
        f"engine 层出现对 FastAPI 装配层(routers)的依赖 {offenders}；"
        "engine 是纯领域逻辑层，装配层入口只能由 main.py 引用"
    )


def test_d1_chat_context_holds_three_migrated_funcs():
    """存在性守卫：chat_context.py 必须仍持有 D1 迁入的三个函数。"""
    if not CHAT_CONTEXT.is_file():
        pytest.skip("chat_context.py 不存在，交由存在性守卫报错")
    text = CHAT_CONTEXT.read_text(encoding="utf-8-sig")
    missing = [fn for fn in CHAT_CONTEXT_FUNCS if f"def {fn}(" not in text]
    assert not missing, (
        f"chat_context.py 丢失了 D1 迁入的函数 {missing}；"
        "main.py 上的同名符号只是兼容 re-export，真身必须留在 services/"
    )
