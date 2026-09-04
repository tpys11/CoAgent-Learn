你是 CoAgent-Learn 项目 BUMP-2 的执行会话（T3 轻量轮：compose 镜像重钉至修复终态 + 评委路径轻复验）。仓库：D:\desktop\coAgent-Learn，分支 master。

## 0. 执行守则
不派生子 agent；不改派发单外文件；1 次非预期红即停止上报；E-42 行尾核对（每笔 commit 前 diff --stat）；凭据零需求。
协作：协作者可能并行 push——被拒=pull --rebase → 复跑守卫 → 再推，禁 --force。

## 1. 任务
deploy/docker-compose.yml 两处 image tag：`7b91c447bf39cd8f5368d0f015943d8981ed1c20` → `8eed9caf7d3fc144a85acaeaac112010852fc55a`（第 6 行 frontend、第 32 行 backend）。除两行外零改动。依据：7b91c44 镜像不含 FIXLLM（4c9972e）与 FIXAUX（8eed9ca）修复，评委/跑数栈必须吃修复终态。

## 2. 步骤（命令原文）
S0 核对：git rev-parse HEAD（期望≥16c3a10）/ git status --short（期望仅 repomix 两文件）/ git grep -n 7b91c447 -- deploy（期望恰 2 行）。
S1 镜像存在性（CI 已 success，仍须实证）：
  docker manifest inspect ghcr.io/tpys11/coagent-learn/frontend:8eed9caf7d3fc144a85acaeaac112010852fc55a > $null; echo "frontend exit=$LASTEXITCODE"
  docker manifest inspect ghcr.io/tpys11/coagent-learn/backend:8eed9caf7d3fc144a85acaeaac112010852fc55a > $null; echo "backend exit=$LASTEXITCODE"
  任一非 0 → 停止上报。
S2 字节级替换（python，同 BUMP-1 手法，保留行尾）后：git diff --stat（期望 1 file +2/-2）+ git diff 贴交接。
S3 守卫：PYTHONPATH=backend pytest tests/test_n3_release_packaging.py tests/test_n1_deploy_readiness.py -q（全绿）；docker compose -f deploy/docker-compose.yml config > $null（exit 0）。
S4 commit 一笔：git add deploy/docker-compose.yml；commit -m "BUMP-2: re-pin compose images to 8eed9ca (FIXLLM+FIXAUX fixes; submission-grade)"；git show --stat 核单文件。
S5 本派发单存 docs/dispatch/step-BUMP2.md；交接写 docs/progress/step-BUMP2.md；第二笔 commit 仅含这两 docs 文件（git add -f）。
S6 push origin master → ls-remote/rev-parse 两行原文贴交接。
S7 评委路径轻复验（照 step-JUDGE.md 先例压缩版）：
  a) 导出 dev 日志（E-38）→ docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml down
  b) $env:TEMP 下从零 git clone https://github.com/tpys11/CoAgent-Learn.git（记 HEAD=16c3a10 或更新）
  c) Test-Path .env=False；docker compose -f deploy/docker-compose.yml pull（记耗时）→ up -d → 轮询双 healthy（上限 180s）
  d) docker compose -f deploy/docker-compose.yml images（两行 tag=8eed9caf…贴原文）；curl :8000/healthz=200+{"status":"ok"}；curl :5173/=200 且 bundle js=200
  e) E-38 先导日志 → down（不带 -v）→ docker ps 无 guashuai-* 残留
  f) 恢复 dev：cd D:\desktop\coAgent-Learn → 双 -f up -d（免 build，E-43）→ 双 healthy + 双探针 200
S8 交接必含：各步关键输出（manifest 双 exit、diff --stat、pytest 数字、images 两行原文、两行核对、S7 各探针）、改动清单、被否/没走通路径（无则写无）、清理清单。全文经 owner 回传总领。

## 3. 复述门（开工前回答，经 owner 转总领）
①为什么 dev 栈 restart 即可而评委栈必须换镜像？②S1 任一 manifest 非 0 为什么不许改用其他 tag？③S7 为什么必须先 down dev 栈？④push 被拒动作序列？
