#!/bin/bash
# 一键启动 — 全部服务
set -e

echo "===== 检查环境变量 ====="
if [ ! -f .env ]; then
    echo "错误: .env 文件不存在，请从 .env.template 复制并填写"
    exit 1
fi

echo "===== 拉取并启动全部服务 ====="
docker compose -f deploy/docker-compose.yml up -d --build

echo ""
echo "===== 服务已启动 ====="
echo "后端（FastAPI + NiceGUI）: http://localhost:8000"
echo "Chroma 向量库:           http://localhost:8001"
echo ""
echo "查看日志: docker compose -f deploy/docker-compose.yml logs -f"
