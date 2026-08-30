"""Step N3 守卫（子步骤 1 创建：T17 依赖声明守卫；子步骤 6 续写发布封装其余守卫）。

T33 约束：collection 期不得模块级 import `engine.pipeline_v2` / `main`
——二者依赖重、副作用大，会拖垮全量收集。本文件只做文件/文本级断言。
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"


def _requirement_specs() -> list[str]:
    """返回 requirements.txt 的非空非注释行（剥离行内注释）。

    E-2：该文件带 UTF-8 BOM，统一用 utf-8-sig 读，否则首行包名会带 BOM 前缀。
    """
    text = REQUIREMENTS.read_text(encoding="utf-8-sig")
    specs: list[str] = []
    for line in text.splitlines():
        code = line.split("#", 1)[0].strip()
        if code:
            specs.append(code)
    return specs


def test_t17_requests_explicitly_declared():
    """T17：requests 必须显式声明且下界 2.32.0。

    5 处惰性 import（embeddings / followups / knowledge_service / memory_analysis）
    此前靠 markitdown 传递提供，而 markitdown 下界极松（>=0.0.1a2）；镜像冻结后
    任何一次重建若解析漂移，这些功能分支会 ImportError。显式声明把依赖钉死。
    """
    specs = _requirement_specs()
    hits = [s for s in specs if re.match(r"^requests\s*[<>=!~]", s)]
    assert len(hits) == 1, (
        "requests 应恰显式声明 1 次（T17），实际：%r" % (hits,)
    )
    assert ">=2.32.0" in hits[0].replace(" ", ""), (
        "requests 下界应为 >=2.32.0：%r" % (hits[0],)
    )
