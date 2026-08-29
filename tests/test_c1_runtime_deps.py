"""Step C1 守卫：容器启动零联网安装的前提必须持续成立。

C1 之后 compose 不再在启动时 pip install（断网可用，启动行为 =
镜像构建期装入 backend/requirements.txt 的依赖）。
- 测试 1：backend/requirements.txt 必须继续声明全部运行时包
  （Step C2 清理死依赖时删错任一行，会导致容器 import 崩溃）。
- 测试 2：deploy/docker-compose.yml 的启动链路里不得再出现 pip install。
"""
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"
COMPOSE = PROJECT_ROOT / "deploy" / "docker-compose.yml"

# 后端运行时会 import（或 FastAPI 文件上传隐式需要）的包，镜像构建期必须装好。
# 依据：C1 实测——backend 源码逐包核对 import + 镜像 pip list 版本核对
# （详见 Step C1 交接文档）。命名按 PEP 503 规范化后比较（rank_bm25 = rank-bm25）。
RUNTIME_REQUIRED = [
    "fastapi",
    "uvicorn",
    "sqlite-vec",
    "python-multipart",
    "pypdf",
    "python-docx",
    "python-pptx",
    "rank-bm25",
    "jieba",
    "pymupdf4llm",
    "trafilatura",
    "markitdown",
    "llama-index-core",
]


def _declared_requirement_names(text: str) -> set[str]:
    names = set()
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue  # 跳过空行/注释/--extra-index-url 等选项行
        name = re.split(r"[\[<>=!~;\s]", line, maxsplit=1)[0].strip().lower()
        if name:
            names.add(name.replace("_", "-"))
    return names


def test_runtime_packages_stay_declared_for_image_build():
    # utf-8-sig：requirements.txt 带 UTF-8 BOM，用裸 utf-8 会让首行 fastapi 带上 \ufeff 前缀
    declared = _declared_requirement_names(REQUIREMENTS.read_text(encoding="utf-8-sig"))
    missing = [pkg for pkg in RUNTIME_REQUIRED if pkg not in declared]
    assert not missing, (
        f"backend/requirements.txt 缺少运行时包 {missing}；"
        "compose 启动已不联网装包（Step C1），缺行会导致容器 import 崩溃"
    )


def test_compose_backend_starts_without_pip_install():
    text = COMPOSE.read_text(encoding="utf-8")
    assert "pip install" not in text, (
        "deploy/docker-compose.yml 里不得再出现 pip install："
        "启动期联网安装会让断网环境无法启动（Step C1 移除的行为）"
    )
    assert '["uvicorn", "main:app"' in text, (
        "backend command 应为 exec 形式 uvicorn 启动"
    )
