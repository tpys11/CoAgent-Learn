"""Step C4 守卫：健康检查与自愈的 6 条「静默失效型」红线必须持续成立。

这几条漏配不会报错、所有功能测试照常通过，但评委部署体验悄悄劣化：
- backend 无 healthcheck → docker compose ps 永远只显示 Up，
  评委（非开发者）失去「我部署成功了」的唯一机器可读信号（C4 交接 3）。
- healthcheck 用 curl/wget → python:3.12-slim 里两者都不存在（C4 实测
  NO_CURL/NO_WGET），探针永远失败但没人看日志，healthy 永远不出现（C4 交接 4.3）。
- 探针不指向 /healthz → 探到业务端点会引入鉴权/参数/业务依赖型误报（C4 交接 4.2）。
- /healthz 路由被删 → 探针 404，与上一条同样静默失效（C4 交接 6.1）。
- frontend depends_on 不是 service_healthy → 启动窗口期评委可能撞见 502 错误页（C4 交接 6.3）。
- restart 缺失 → 后端崩溃不自愈；改成 always → 评委 down 后容器被 Docker 神秘复活（C4 交接 4.7）。
"""
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPOSE = PROJECT_ROOT / "deploy" / "docker-compose.yml"
MAIN = PROJECT_ROOT / "backend" / "main.py"


def _read(path: Path) -> str:
    # deploy/docker-compose.yml 带 UTF-8 BOM（与 C3 守卫同款读取方式）
    return path.read_text(encoding="utf-8-sig")


def _compose_service_block(text: str, name: str) -> str:
    """提取 compose 中某服务块（从服务行到下一个同级服务/顶级键）。"""
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if re.match(rf"^  {re.escape(name)}:\s*(#.*)?$", line):
            start = i + 1
            break
    assert start is not None, f"deploy/docker-compose.yml 缺少 {name} 服务"
    end = len(lines)
    for j in range(start, len(lines)):
        if re.match(r"^  \S", lines[j]):
            end = j
            break
    return "\n".join(lines[start:end])


def _healthcheck_test_command(block: str) -> str | None:
    """提取 healthcheck.test 的 exec 形式命令行（单行 JSON 数组）；无则 None。"""
    if not re.search(r"^    healthcheck:\s*$", block, re.M):
        return None
    m = re.search(r"^      test:\s*(\[.*\])\s*$", block, re.M)
    return m.group(1) if m else None


def test_backend_healthcheck_must_exist():
    """backend 必须有 healthcheck（test: 行存在）——否则 ps 永远只显示 Up。"""
    block = _compose_service_block(_read(COMPOSE), "backend")
    cmd = _healthcheck_test_command(block)
    assert cmd is not None, (
        "backend 服务缺少 healthcheck（或 test 行）——docker compose ps 永远只显示 Up，"
        "评委失去部署成功的机器可读信号"
    )


def test_backend_healthcheck_must_not_use_curl_wget():
    """探针命令不得用 curl/wget——python:3.12-slim 里没有（C4 实测），
    用了就是探针永远失败的静默失效。"""
    block = _compose_service_block(_read(COMPOSE), "backend")
    cmd = _healthcheck_test_command(block)
    if cmd is None:
        import pytest
        pytest.skip("healthcheck 块不存在（由 test_backend_healthcheck_must_exist 兜底）")
    assert "curl" not in cmd and "wget" not in cmd, (
        "healthcheck 命令使用了 curl/wget——python:3.12-slim 镜像内两者都不存在"
        "（C4 实测 NO_CURL/NO_WGET），探针会永远失败且无人看日志"
    )


def test_backend_healthcheck_must_target_healthz():
    """探针必须指向 /healthz——探业务端点会引入鉴权/参数/业务依赖型误报。"""
    block = _compose_service_block(_read(COMPOSE), "backend")
    cmd = _healthcheck_test_command(block)
    if cmd is None:
        import pytest
        pytest.skip("healthcheck 块不存在（由 test_backend_healthcheck_must_exist 兜底）")
    assert "/healthz" in cmd, (
        "healthcheck 命令未指向 /healthz——业务端点有鉴权/路径参数/依赖，"
        "会造成健康服务的假阴性"
    )


def test_main_must_define_healthz_route():
    """backend/main.py 必须存在 GET /healthz 路由——探针 404 同样静默失效。"""
    src = _read(MAIN)
    assert re.search(r'@app\.get\(\s*["\']/healthz["\']\s*\)', src), (
        'backend/main.py 缺少 @app.get("/healthz") 路由——Docker 探针将拿到 404，'
        "healthy 永远不出现"
    )


def test_frontend_depends_on_must_wait_service_healthy():
    """frontend 必须等 backend healthy 才启动（condition 形式），
    消除启动窗口期 nginx 反代 502 的评委可见错误页。"""
    block = _compose_service_block(_read(COMPOSE), "frontend")
    assert re.search(
        r"depends_on:\s*\n\s+backend:\s*\n\s+condition:\s*service_healthy", block
    ), (
        "frontend 的 depends_on 必须是 {backend: {condition: service_healthy}} 形式——"
        "短形式只等容器启动不等服务就绪，启动窗口期评委可能看到 502 错误页"
    )


def test_both_services_restart_unless_stopped():
    """两个服务都必须 restart: unless-stopped——缺失则崩溃不自愈；
    always 则评委 down 后容器被 Docker 神秘复活。"""
    for name in ("frontend", "backend"):
        block = _compose_service_block(_read(COMPOSE), name)
        assert re.search(r"^    restart:\s*unless-stopped\s*(#.*)?$", block, re.M), (
            f"{name} 服务缺少 restart: unless-stopped——崩溃不自愈（缺失）"
            "或 down 后被拉起（always），都会破坏评委预期"
        )


# ---------------------------------------------------------------------------
# F3（N2-1）追加：frontend 自己的 healthcheck 守卫（以上 6 条 C4 守卫不动）。
# 背景：N2 实测 frontend 只显示 Up；nginx:alpine 自带 busybox wget，可用；
# 但 host 必须写 127.0.0.1——nginx listen 80 纯 IPv4，localhost 解析 ::1 且
# busybox wget 无 IPv6→IPv4 回退（容器内实测：127.0.0.1 退出码 0，localhost 退出码 1），
# 写 localhost 探针会永远失败且 healthy 永不出现——又一类静默失效（E-19 同族）。

def test_frontend_healthcheck_must_exist():
    """frontend 必须有自己的 healthcheck——否则 ps 永远只显示 Up，
    「双服务 healthy」的部署成功信号在 frontend 侧缺失（N2-1）。"""
    block = _compose_service_block(_read(COMPOSE), "frontend")
    cmd = _healthcheck_test_command(block)
    assert cmd is not None, (
        "frontend 服务缺少 healthcheck——docker compose ps 永远只显示 Up，"
        "评委失去 frontend 侧部署成功的机器可读信号（N2-1）"
    )


def test_frontend_healthcheck_must_use_loopback_ipv4():
    """frontend 探活 host 必须是 127.0.0.1，禁止 localhost——
    localhost 解析 ::1 而 nginx 仅监听 IPv4，busybox wget 无回退（N2 容器内实测）。"""
    block = _compose_service_block(_read(COMPOSE), "frontend")
    cmd = _healthcheck_test_command(block)
    if cmd is None:
        import pytest
        pytest.skip("frontend healthcheck 不存在（由 test_frontend_healthcheck_must_exist 兜底）")
    assert "127.0.0.1" in cmd and "localhost" not in cmd, (
        "frontend healthcheck 探活地址必须用 127.0.0.1——localhost 解析 ::1"
        "（nginx 仅 IPv4、busybox wget 无回退），探针永远失败且无人看日志"
    )
