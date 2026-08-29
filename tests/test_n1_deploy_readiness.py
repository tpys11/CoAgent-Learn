"""Step N1 守卫：部署就绪的两条关键约束必须持续成立。

评委从 GitHub 全新 clone（没有 .env）照 README 部署，N1 保证这条路是通的：
- 测试 1：deploy/docker-compose.yml 的 backend env_file 必须保持 required: false。
  改回硬依赖列表（- ../.env）会让无 .env 的全新 clone 在 docker compose up 时
  直接报 "env file ... not found"，整组服务起不来（N1 实测原文留存于交接文档）。
- 测试 2：.env.example 不得带 UTF-8 BOM。带 BOM 的模板被 cp 成 .env 后，首个
  变量名的解析依赖 compose 版本的未文档化宽容行为（N1 实测 v5.1.3 会剥离 BOM，
  但评委的 Docker 版本不可控），不得把部署正确性押在它上面。
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPOSE = PROJECT_ROOT / "deploy" / "docker-compose.yml"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"


def _env_file_block_entries() -> list[str]:
    """返回 compose 里 env_file: 块内的非注释条目行（剥离缩进）。"""
    lines = COMPOSE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip() == "env_file:")
    entries: list[str] = []
    for line in lines[start + 1 :]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue  # 空行/注释行不结束块
        if (len(line) - len(line.lstrip())) <= 4:
            break  # 回到与 env_file: 同级或更浅缩进 → 块结束
        entries.append(stripped)
    return entries


def test_compose_env_file_must_be_optional():
    block = _env_file_block_entries()
    assert any("../.env" in entry for entry in block), (
        "deploy/docker-compose.yml 的 env_file 必须仍指向 ../.env"
        "（.env 是可选覆盖配置的入口，删除会破坏该能力）"
    )
    assert any("required: false" in entry for entry in block), (
        "env_file 必须保持 required: false：改回硬依赖会让评委 clone 后"
        "（无 .env）docker compose up 直接失败，整组服务起不来（Step N1 实测）"
    )


def test_env_example_must_not_have_bom():
    raw = ENV_EXAMPLE.read_bytes()
    assert not raw.startswith(b"\xef\xbb\xbf"), (
        ".env.example 不得带 UTF-8 BOM：cp 成 .env 后首个变量名的解析"
        "依赖 compose 版本的未文档化行为（Step N1 实测 v5.1.3 可剥离，"
        "但评委 Docker 版本不可控），必须保持无 BOM"
    )
