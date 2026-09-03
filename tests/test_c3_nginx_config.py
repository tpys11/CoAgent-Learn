"""Step C3 守卫：前端 nginx 生产配置的 5 条「静默失效型」红线必须持续成立。

这几条漏配不会报错、所有自动化测试都会过，只有体验悄悄劣化：
- /api 关闭代理缓冲：nginx 默认 proxy_buffering on 会把 SSE 流攒在缓冲区，
  HTTP 200、内容一字不差，但「边生成边显示」彻底消失（C3 交接 4.4）。
- /uploads 反代：后端 main.py 把上传文件挂载在 /uploads，前端 <img src> 直引，
  漏配则知识库命中图片全部 404（C3 交接 4.6）。
- client_max_body_size：nginx 默认 1m，任何 PDF 上传都会 413（C3 交接 4.5）。
- compose 端口 5173:80 与无 bind mount：多阶段静态产物形态的标志，
  挂载回退说明 dev server 形态复活（C3 交接 4.2）。
"""
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
NGINX_CONF = PROJECT_ROOT / "frontend" / "nginx.conf"
COMPOSE = PROJECT_ROOT / "deploy" / "docker-compose.yml"


def _read(path: Path) -> str:
    # deploy/docker-compose.yml 带 UTF-8 BOM（pip/yaml 均容忍，按 utf-8-sig 读）
    return path.read_text(encoding="utf-8-sig")


def _location_block(conf: str, prefix: str) -> str:
    """提取 nginx.conf 中 location <prefix> {...} 的完整块（花括号配对）。"""
    m = re.search(r"location\s+" + re.escape(prefix) + r"\s*\{", conf)
    assert m, f"frontend/nginx.conf 缺少 location {prefix}"
    depth = 0
    for i in range(m.end() - 1, len(conf)):
        if conf[i] == "{":
            depth += 1
        elif conf[i] == "}":
            depth -= 1
            if depth == 0:
                return conf[m.end() - 1 : i + 1]
    raise AssertionError(f"location {prefix} 花括号不配对")


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


def test_api_location_must_disable_proxy_buffering():
    """SSE 流式保命条：/api location 必须显式 proxy_buffering off。"""
    conf = _read(NGINX_CONF)
    block = _location_block(conf, "/api/")
    assert re.search(r"proxy_buffering\s+off\s*;", block), (
        "/api location 缺少 proxy_buffering off——nginx 默认缓冲会把 SSE 攒到"
        "生成结束才吐出，流式体验静默消失（HTTP 200、内容完整、无人眼验收看不出）"
    )


def test_uploads_location_must_proxy_backend():
    """/uploads 必须反代到 backend，知识库图片回显才不 404。"""
    conf = _read(NGINX_CONF)
    block = _location_block(conf, "/uploads/")
    assert "guashuai-backend:8000" in block, (
        "/uploads location 未指向 guashuai-backend:8000——后端把上传文件挂载在"
        " /uploads（main.py StaticFiles），漏配则知识库命中图片全部 404"
    )


def test_client_max_body_size_at_least_10m():
    """上传体积必须显式放开：nginx 默认 1m，PDF 上传 413。"""
    conf = _read(NGINX_CONF)
    m = re.search(r"client_max_body_size\s+(\d+)\s*(m|g)\s*;", conf)
    assert m, "frontend/nginx.conf 缺少 client_max_body_size（nginx 默认 1m 会 413）"
    size, unit = int(m.group(1)), m.group(2)
    limit_mb = size * 1024 if unit == "g" else size
    assert limit_mb >= 10, (
        f"client_max_body_size 只有 {limit_mb}m——知识库 PDF 上传（后端上限 50MB）"
        "会被 nginx 挡下返回 413"
    )


def test_compose_frontend_port_is_5173_80():
    """容器内 nginx 监听 80，外部端口保持 5173（README 的 localhost:5173 不变）。"""
    text = _read(COMPOSE)
    block = _compose_service_block(text, "frontend")
    assert re.search(r'''["']5173:80["']''', block), (
        'frontend 端口必须映射 "5173:80"（nginx:alpine 容器内监听 80），'
        "改动会破坏 README 的 localhost:5173 入口"
    )


def test_compose_frontend_must_not_bind_mount_sources():
    """静态产物形态不得再挂载任何源码卷（bind mount 是 dev server 形态的标志）。"""
    text = _read(COMPOSE)
    block = _compose_service_block(text, "frontend")
    m = re.search(r"^    volumes:\s*$(.*?)(?=^    \S|\Z)", block, re.M | re.S)
    if m is None:
        return  # volumes 键不存在 = 合规
    mounts = [ln.strip() for ln in m.group(1).splitlines() if ln.strip().startswith("-")]
    assert not mounts, (
        f"frontend 服务不得再有 bind mount（生产形态由镜像内静态产物决定）：{mounts}"
    )
