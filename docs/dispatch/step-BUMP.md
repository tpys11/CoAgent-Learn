你是 CoAgent-Learn 项目 Step-BUMP 的执行会话（T3 轻量轮：compose 镜像终钉）。仓库：D:\desktop\coAgent-Learn，分支 master。
## 0. 执行守则
- 不派生子 agent；不改派发单以外的任何文件；1 次非预期红即停止上报，禁自行修复。
- 凭据永不臆造（决策 35）。本任务不需要任何 API key。
- 行尾守则（E-42）：每笔 commit 前 `git diff --stat` 核对行数，出现全文件 diff = 行尾污染，立即停止上报。
- 不做：不改 README、不动 override/eval-override、不重建 dev 栈、不 pull 镜像起栈（终验是下一 Step）。

## 1. 任务
把 `deploy/docker-compose.yml` 的两处 image tag 由
`0164c6cca82ac0d40fb66e360f3b702b76ed779e` 换为 `7b91c447bf39cd8f5368d0f015943d8981ed1c20`
（第 6 行 frontend、第 32 行 backend，派发时点 HEAD=7b91c44 校准）。除这两行外文件零改动。

## 2. 步骤（按序，命令原文）
S0 前置核对：
  git rev-parse HEAD                  # 期望 7b91c447bf39cd8f5368d0f015943d8981ed1c20
  git status --short                  # 期望仅 ?? repomix.config.json / ?? coagent-learn-repomix.xml
  git grep -n 0164c6c -- deploy       # 期望恰 2 行（:6 :32）
S1 镜像存在性实证（防钉死不存在的 tag）：
  docker manifest inspect ghcr.io/tpys11/coagent-learn/frontend:7b91c447bf39cd8f5368d0f015943d8981ed1c20 > $null; echo "frontend exit=$LASTEXITCODE"
  docker manifest inspect ghcr.io/tpys11/coagent-learn/backend:7b91c447bf39cd8f5368d0f015943d8981ed1c20 > $null; echo "backend exit=$LASTEXITCODE"
  两者 exit 必须为 0；任一非 0 → 停止上报（不得改用其他 tag）。
S2 修改：用 python 做字节级替换，保留原行尾：
  python -c "p='deploy/docker-compose.yml';b=open(p,'rb').read();n=b.count(b'0164c6cca82ac0d40fb66e360f3b702b76ed779e');assert n==2,n;open(p,'wb').write(b.replace(b'0164c6cca82ac0d40fb66e360f3b702b76ed779e',b'7b91c447bf39cd8f5368d0f015943d8981ed1c20'))"
  git diff --stat                     # 期望恰 1 file, 2 insertions(+), 2 deletions(-)
  git diff                            # 贴入交接
S3 守卫与配置校验：
  python -m pytest tests/test_n3_release_packaging.py tests/test_n1_deploy_readiness.py -q     # 期望全绿，记录数字
  docker compose -f deploy/docker-compose.yml config > $null; echo "config exit=$LASTEXITCODE"  # 期望 0
S4 commit（一笔，只含该文件）：
  git add deploy/docker-compose.yml
  git commit -m "BUMP: pin compose images to 7b91c44 (post go/zai/zhipu-cleanup runtime)"
  git show --stat HEAD                # 期望仅 deploy/docker-compose.yml
S5 交接文档写入 docs/progress/step-BUMP.md（本派发单原文另存 docs/dispatch/step-BUMP.md），第二笔 commit 仅含这两个 docs 文件：
  git add docs/progress/step-BUMP.md docs/dispatch/step-BUMP.md
  git commit -m "docs(BUMP): dispatch + handoff"
S6 push（决策 30）：
  git push origin master             # 禁 --force、禁其他分支、禁 repomix 文件入库
  git ls-remote origin refs/heads/master; git rev-parse HEAD   # 两行原文贴交接，必须一致

## 3. 交接文档必含
①S0-S6 每条命令的实际输出关键行（HEAD、grep 计数、两个 manifest exit、diff --stat、pytest 数字、config exit、show --stat、ls-remote/rev-parse 两行原文）；②改动文件清单；③被否决方案/未走通路径（若无写「无」）；④待清理清单（预期：无临时文件）。
完成后把交接文档全文返回给 owner。
