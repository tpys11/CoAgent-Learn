"""Step N3 守卫（子步骤 1 创建：T17 依赖声明守卫；子步骤 6 续写发布封装其余守卫）。

T33 约束：collection 期不得模块级 import `engine.pipeline_v2` / `main`
——二者依赖重、副作用大，会拖垮全量收集。本文件只做文件/文本级断言。
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = PROJECT_ROOT / "backend" / "requirements.txt"
COMPOSE = PROJECT_ROOT / "deploy" / "docker-compose.yml"
WORKFLOW = PROJECT_ROOT / ".github" / "workflows" / "build-push.yml"
README = PROJECT_ROOT / "README.md"


def _compose_text() -> str:
    """E-2：compose 带 UTF-8 BOM，统一 utf-8-sig 读。"""
    return COMPOSE.read_text(encoding="utf-8-sig")


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


def test_n3_images_pinned_to_full_sha():
    """两个服务的 image: 必须指向 GHCR 且 tag 是完整 40 位 sha，不是 latest（防可变标签）。"""
    text = _compose_text()
    images = re.findall(
        r"image:\s*ghcr\.io/tpys11/coagent-learn/(\w+):([^\s]+)", text
    )
    assert len(images) == 2, "应有 backend/frontend 两个 image: 声明，实际：%r" % (images,)
    names = sorted(n for n, _ in images)
    assert names == ["backend", "frontend"], "image 服务名异常：%r" % (names,)
    for name, tag in images:
        assert tag != "latest", "%s 的 tag 不得是 latest（可变标签，评委无法定位版本）" % name
        assert re.fullmatch(r"[0-9a-f]{40}", tag), (
            "%s 的 tag 不是完整 40 位 commit sha：%r" % (name, tag)
        )


def test_n3_code_mounts_removed():
    """决策 19：三条代码挂载必须已移除（走 A 后 skills 已烤进镜像，也不得再挂）。"""
    text = _compose_text()
    for banned in ("../backend:/app", "../tests:/app/tests", "../skills:/app/skills"):
        assert banned not in text, "代码挂载应已移除（决策 19），发现：%s" % banned


def test_n3_data_volume_kept():
    """E-25/E-26：../data:/app-data 必须保留（fresh clone 的 data/ 依赖种子文档）。"""
    text = _compose_text()
    assert "../data:/app-data" in text, "数据卷 ../data:/app-data 不得移除"


def test_n3_runtime_contract_intact():
    """env_file / command / healthcheck / restart 必须仍在（与 test_n1/c4/c1 互为双保险）。"""
    text = _compose_text()
    for token in (
        "env_file:",
        "required: false",
        "command:",
        "healthcheck:",
        "restart: unless-stopped",
    ):
        assert token in text, "compose 运行时契约缺失：%s" % token


def test_n3_workflow_installed_and_valid():
    """workflow 存在且含 packages: write、裸 sha + latest 双标签、setup-buildx（首跑教训）。

    type=sha 仅允许出现在注释里（坑位警告）——配置位置一旦出现即红（sha- 前缀坑）。
    """
    assert WORKFLOW.exists(), ".github/workflows/build-push.yml 不存在"
    text = WORKFLOW.read_text(encoding="utf-8")
    # 配置层断言一律用剥注释后的文本——坑位警告注释里也写着 packages: write / type=sha，
    # 裸子串匹配会被注释糊弄（M5 变异实测：删掉配置行守卫仍绿，假阴性）。
    code_text = "\n".join(ln.split("#", 1)[0] for ln in text.splitlines())
    assert "packages: write" in code_text, "workflow 缺 packages: write（推不上 GHCR）"
    assert "type=raw,value=${{ github.sha }}" in code_text, "workflow 缺裸 sha 标签"
    assert "type=raw,value=latest" in code_text, "workflow 缺 latest 标签"
    assert "docker/setup-buildx-action" in code_text, (
        "workflow 缺 setup-buildx-action：type=gha 缓存在默认 docker driver 上"
        "不受支持（N3 首跑 failure 根因）"
    )
    offenders = [ln.strip() for ln in code_text.splitlines() if "type=sha" in ln]
    assert not offenders, "配置位置出现 type=sha（sha- 前缀坑）：%r" % (offenders,)


def test_n3_readme_compose_commands_carry_f_flag():
    """README 所有 docker compose 项目操作命令必须带 -f deploy/docker-compose.yml。

    `docker compose version` 是版本检查、与项目无关，豁免。
    """
    text = README.read_text(encoding="utf-8")
    offenders = []
    for i, ln in enumerate(text.splitlines(), 1):
        m = re.search(
            r"docker compose\s+(up|down|ps|pull|logs|build|restart|stop|kill|exec)\b", ln
        )
        if m and "-f deploy/docker-compose.yml" not in ln:
            offenders.append((i, ln.strip()))
    assert not offenders, "README 存在不带 -f 的 docker compose 命令：%r" % (offenders,)
