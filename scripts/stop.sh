#!/bin/bash
# 一键停止 — 所有服务
set -e

echo "===== 停止全部服务 ====="
docker compose -f deploy/docker-compose.yml down

echo "===== 服务已停止 ====="
echo "（数据保存在 Docker Volume 中，下次启动时仍在）"
