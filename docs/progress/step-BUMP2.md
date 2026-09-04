# Step-BUMP2 交接文档：compose 镜像重钉至修复终态（8eed9ca）+ 评委路径轻复验

## 1. 改动文件清单
- `deploy/docker-compose.yml` (commit 1: `4721148b579458f74d2998b1c481be25f890699c`)
- `docs/dispatch/step-BUMP2.md` (commit 2: 本笔)
- `docs/progress/step-BUMP2.md` (commit 2: 本笔)

## 2. S0-S5 执行实录与关键输出

### S0 前置核对
```powershell
git rev-parse HEAD; git merge-base --is-ancestor 16c3a10 HEAD; echo "ancestor-check exit=$LASTEXITCODE"
# 输出：
# 16c3a1084de805075c42600d4b12dab2707cf2c8
# ancestor-check exit=0

git status --short; git branch --show-current
# 输出：
# ?? coagent-learn-repomix.xml
# ?? repomix.config.json
# master

git grep -n 7b91c447 -- deploy
# 输出：
# deploy/docker-compose.yml:6:    image: ghcr.io/tpys11/coagent-learn/frontend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
# deploy/docker-compose.yml:32:    image: ghcr.io/tpys11/coagent-learn/backend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
```

### S1 镜像存在性实证
```powershell
docker manifest inspect ghcr.io/tpys11/coagent-learn/frontend:8eed9caf7d3fc144a85acaeaac112010852fc55a > $null; echo "frontend exit=$LASTEXITCODE"
# 输出：
# frontend exit=0

docker manifest inspect ghcr.io/tpys11/coagent-learn/backend:8eed9caf7d3fc144a85acaeaac112010852fc55a > $null; echo "backend exit=$LASTEXITCODE"
# 输出：
# backend exit=0
```

### S2 修改与 diff 检验（python 字节级替换，保留行尾）
```python
# python -c（同 BUMP-1 手法）：binary 读入 → count==2 断言 → replace → binary 写回
# 输出：replaced count= 2
```
```powershell
git diff --stat
# 输出：
#  deploy/docker-compose.yml | 4 ++--
#  1 file changed, 2 insertions(+), 2 deletions(-)

git diff
# 输出：
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index 0dac0d9..410293d 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -3,7 +3,7 @@
     # C3: 多阶段构建的静态产物由 nginx 托管并反代后端（容器内 80，外部端口保持 5173）。
     # 不再挂载源码——HMR 随 dev server 退役；前端改动在宿主 npm run dev 验证、N2/N3 检查点重建镜像。
     # N3 子步骤 4 首推后回填完整 sha（首推 99cfe7c 构建通过后回填）
-    image: ghcr.io/tpys11/coagent-learn/frontend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
+    image: ghcr.io/tpys11/coagent-learn/frontend:8eed9caf7d3fc144a85acaeaac112010852fc55a
     container_name: guashuai-frontend
     ports:
       - "5173:80"
@@ -29,7 +29,7 @@

   backend:
     # N3 子步骤 4 首推后回填完整 sha（首推 99cfe7c 构建通过后回填）
-    image: ghcr.io/tpys11/coagent-learn/backend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
+    image: ghcr.io/tpys11/coagent-learn/backend:8eed9caf7d3fc144a85acaeaac112010852fc55a
     container_name: guashuai-backend
     ports:
       - "8000:8000"
```

### S3 守卫与配置校验
```powershell
$env:PYTHONPATH="backend"; .venv\Scripts\python.exe -m pytest tests/test_n3_release_packaging.py tests/test_n1_deploy_readiness.py -q
# 输出：
# .........                                                                [100%]
# 9 passed in 0.16s

docker compose -f deploy/docker-compose.yml config > $null; echo "config exit=$LASTEXITCODE"
# 输出：
# config exit=0
```

### S4 commit 镜像更新
```powershell
git add deploy/docker-compose.yml
git commit -m "BUMP-2: re-pin compose images to 8eed9ca (FIXLLM+FIXAUX fixes; submission-grade)"
git show --stat --oneline HEAD
# 输出：
# 4721148 BUMP-2: re-pin compose images to 8eed9ca (FIXLLM+FIXAUX fixes; submission-grade)
#  deploy/docker-compose.yml | 4 ++--
#  1 file changed, 2 insertions(+), 2 deletions(-)
```

### S5 文档提交
```powershell
git add -f docs/progress/step-BUMP2.md docs/dispatch/step-BUMP2.md
git commit -m "docs(BUMP-2): dispatch + handoff"
git show --stat HEAD
# 输出与 commit 2 哈希：见本文档随后的 git log / owner 回传总领（S8）
```

### S6 push 与远端一致性校验（本笔之后执行）
```powershell
git push origin master
git ls-remote origin refs/heads/master; git rev-parse HEAD
# 输出两行原文：经 owner 回传总领（S8）
```

### S7 评委路径轻复验（照 step-JUDGE.md 先例压缩版，本笔之后执行）
a) E-38 导出 dev 日志（%TEMP%\dev-backend-logs-prejudge2.txt / dev-frontend-logs-prejudge2.txt）→ 双 -f down
b) %TEMP% 从零 git clone https://github.com/tpys11/CoAgent-Learn.git（记 HEAD）
c) Test-Path .env=False → compose pull（记耗时）→ up -d → 轮询双 healthy（上限 180s）
d) compose images 两行 tag=8eed9caf… → curl :8000/healthz=200+{"status":"ok"} → curl :5173/=200 且 bundle js=200
e) E-38 先导日志 → down（不带 -v）→ docker ps 无 guashuai-* 残留
f) 恢复 dev：双 -f up -d（免 build，E-43）→ 双 healthy + 双探针 200
# 各步实测输出：经 owner 回传总领（S8）

## 3. 被否决方案 / 未走通路径
无。

## 4. 待清理清单
预期清理（S7 执行后随 S8 回传确认实际清单）：%TEMP% 下评委克隆目录、dev/judge 日志导出文件；dev 栈恢复后 docker ps 双 healthy。
