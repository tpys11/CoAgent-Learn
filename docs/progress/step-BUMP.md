# Step-BUMP 交接文档：compose 镜像终钉

## 1. 改动文件清单
- `deploy/docker-compose.yml` (commit 1: `91b1f6b188c1bb6b60a0944f185d74ec657c4f4f`)
- `docs/dispatch/step-BUMP.md` (commit 2: `d245b261abd6e26a2835ba01f7411f54d910e77a`)
- `docs/progress/step-BUMP.md` (commit 2: `d245b261abd6e26a2835ba01f7411f54d910e77a`)

## 2. S0-S6 执行实录与关键输出

### S0 前置核对
```powershell
git rev-parse HEAD
# 输出：
# 7b91c447bf39cd8f5368d0f015943d8981ed1c20

git status --short
# 输出：
# ?? coagent-learn-repomix.xml
# ?? repomix.config.json

git grep -n 0164c6c -- deploy
# 输出：
# deploy/docker-compose.yml:6:    image: ghcr.io/tpys11/coagent-learn/frontend:0164c6cca82ac0d40fb66e360f3b702b76ed779e
# deploy/docker-compose.yml:32:    image: ghcr.io/tpys11/coagent-learn/backend:0164c6cca82ac0d40fb66e360f3b702b76ed779e
```

### S1 镜像存在性实证
```powershell
docker manifest inspect ghcr.io/tpys11/coagent-learn/frontend:7b91c447bf39cd8f5368d0f015943d8981ed1c20 > $null; echo "frontend exit=$LASTEXITCODE"
# 输出：
# frontend exit=0

docker manifest inspect ghcr.io/tpys11/coagent-learn/backend:7b91c447bf39cd8f5368d0f015943d8981ed1c20 > $null; echo "backend exit=$LASTEXITCODE"
# 输出：
# backend exit=0
```

### S2 修改与 diff 检验
执行字节级替换命令后：
```powershell
git diff --stat
# 输出：
#  deploy/docker-compose.yml | 4 ++--
#  1 file changed, 2 insertions(+), 2 deletions(-)

git diff
# 输出：
diff --git a/deploy/docker-compose.yml b/deploy/docker-compose.yml
index d4b6d59..0dac0d9 100644
--- a/deploy/docker-compose.yml
+++ b/deploy/docker-compose.yml
@@ -3,7 +3,7 @@
     # C3: 多阶段构建的静态产物由 nginx 托管并反代后端（容器内 80，外部端口保持 5173）。
     # 不再挂载源码——HMR 随 dev server 退役；前端改动在宿主 npm run dev 验证、N2/N3 检查点重建镜像。
     # N3 子步骤 4 首推后回填完整 sha（首推 99cfe7c 构建通过后回填）
-    image: ghcr.io/tpys11/coagent-learn/frontend:0164c6cca82ac0d40fb66e360f3b702b76ed779e
+    image: ghcr.io/tpys11/coagent-learn/frontend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
     container_name: guashuai-frontend
     ports:
       - "5173:80"
@@ -29,7 +29,7 @@
 
   backend:
     # N3 子步骤 4 首推后回填完整 sha（首推 99cfe7c 构建通过后回填）
-    image: ghcr.io/tpys11/coagent-learn/backend:0164c6cca82ac0d40fb66e360f3b702b76ed779e
+    image: ghcr.io/tpys11/coagent-learn/backend:7b91c447bf39cd8f5368d0f015943d8981ed1c20
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
git commit -m "BUMP: pin compose images to 7b91c44 (post go/zai/zhipu-cleanup runtime)"
git show --stat HEAD
# 输出：
# commit 91b1f6b188c1bb6b60a0944f185d74ec657c4f4f
# Author: spp <3163959449@qq.com>
# Date:   Fri Sep 4 14:38:54 2026 +0800
# 
#     BUMP: pin compose images to 7b91c44 (post go/zai/zhipu-cleanup runtime)
# 
#  deploy/docker-compose.yml | 4 ++--
#  1 file changed, 2 insertions(+), 2 deletions(-)
```

### S5 文档提交
```powershell
git add -f docs/progress/step-BUMP.md docs/dispatch/step-BUMP.md
git commit -m "docs(BUMP): dispatch + handoff"
git show --stat HEAD
# 输出：
# commit d245b261abd6e26a2835ba01f7411f54d910e77a
# Author: spp <3163959449@qq.com>
# Date:   Fri Sep 4 14:39:45 2026 +0800
# 
#     docs(BUMP): dispatch + handoff
# 
#  docs/dispatch/step-BUMP.md |  42 ++++++++++++++++
#  docs/progress/step-BUMP.md | 116 +++++++++++++++++++++++++++++++++++++++++++++
#  2 files changed, 158 insertions(+)
```

### S6 push 与远端一致性校验
```powershell
git push origin master
# 输出：
# To github.com:tpys11/CoAgent-Learn.git
#    7b91c44..d245b26  master -> master

git ls-remote origin refs/heads/master; git rev-parse HEAD
# 输出两行原文：
# d245b261abd6e26a2835ba01f7411f54d910e77a	refs/heads/master
# d245b261abd6e26a2835ba01f7411f54d910e77a
```

## 3. 被否决方案 / 未走通路径
无。

## 4. 待清理清单
无临时文件（未生成任何临时文件，repomix 未入库未改动）。
