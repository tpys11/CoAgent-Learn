# Step FIXMIND 交接文档（T2 微轮：学情评估节点空内容兜底展示——超时/空产出双文案 + 三守卫）

> 会话：CoAgent-Learn FIXMIND 执行会话。派发 HEAD=9cc1c91（实测一致，零漂移；开工 git pull 一次 Already up to date）。
> 落点 commit=519751a（一笔）；push 一次通过无拒（`9cc1c91..519751a master -> master`，未触发 rebase 序列）。
> 分支 master。触碰面：backend/engine/pipeline_v2.py + tests/golden/sse_frames_v2.json + tests/test_fixmind_fallback.py（3 文件，+66/-0）。
> 禁碰区零触碰：tests/eval/ 五运行面文件、deploy/eval-override.yml 全程未动（git status 为证）；
> 评测栈容器零操作（仅末尾一次 docker logs 只读快照）；副本库 %TEMP%\coagent-eval-data\ 零读写。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **空节点的两个成因路径**：①超时路径——`assess_future.result(timeout=15)` 15 秒回收窗超时
   （go 档思考模型实测 30-90s，3b 后 ~12s 贴边）→ `except Exception` 捕获 → assess_thinking 保持
   空串 → `if assess_thinking` 不成立 → mindchain 无「学情与记忆管理」条目 → 前端空节点；设计语义
   未丢，线程后台继续完成并写表。②空产出路径——评估正常返回但 assess_thinking_raw 为 None/空白，
   strip() 后为空串 → 同样走不进 if → 空节点；此路径无内容可展示，本轮按规则地板降级。
2. **为什么超时后评估仍会写表**：pipeline_v2.py `assess_exec.shutdown(wait=False)` 只释放执行器
   引用、不杀线程，评估线程继续跑完；assess.py 的 store_level_score 将结果写入 dialogues.profile
   学情表。超时只是主流程放弃等待本轮展示，写表路径不受影响，下次对话生效。
3. **兜底文案为什么区分两种形态**：用户事实不同——超时=评估实际会完成并写表，文案承诺「下次对话
   生效」如实；空产出=评估未产出内容、未写表，本轮真实降级为规则地板。混用会误导（对空产出承诺
   不存在的「下次生效」，或对超时误报「评估失败」）。
4. **§0.5 三类禁止及原因**：①评测栈容器操作（stop/kill/restart/exec/attach）——P1/P2/P3 正式
   跑数进行中，容器操作会中断跑数；②副本库 %TEMP%\coagent-eval-data\ 宿主侧读写——E-45 实证
   WAL 跨 OS 锁冲突 → disk I/O error 事故；③评测运行面文件（eval_runner.py / eval_cases.json /
   eval_judge.py / eval_kb_manifest.json / eval_stackprep.py 及 deploy/eval-override.yml）——
   每批从磁盘新起 Python 进程，盘上状态必须与已跑批一致，改动污染后续批次。
5. **push 被拒序列**：rebase → 复跑 pytest 确认绿 → 再推；禁 --force。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull; git log --oneline -3; git status --porcelain
Already up to date.
9cc1c91 docs(board): FIXAUX-3b acceptance + E-45 WAL lesson
?? coagent-learn-repomix.xml
?? repomix.config.json
```
判定：HEAD=9cc1c91 恰为派发锚 ✓；已跟踪文件零修改 = 无并行写入 ✓（2 个 repomix 产物为存量
untracked，非本会话产物，保持原状）。

### S1 修复+守卫（锚点实测命中后动笔）
- **before 锚点核对**：pipeline_v2.py:504-518 实测逐行命中规格——:504 `assess_score = None`
  初始化块、:510 `result(timeout=15)`、:512-513 except 分支、:515 `shutdown(wait=False)`、
  :516-518 if assess_thinking 块。规格行号与文件零漂移。
- **修复（三处，规格逐字）**：
  - a) :507 初始化块加 `assess_timeout = False`；:515 except 分支内加 `assess_timeout = True`；
  - b) :518-526 if/else 兜底块（超时=「本轮学情评估超时未返回，已转后台完成并写入学情表，结果
    下次对话生效。」/ 空产出=「学情评估未产出有效结果，本轮按规则地板继续。」）；
  - c) :522 注释「FIXMIND：空节点兜底展示——超时=评估转后台写表（owner 设计语义），空产出=规则地板」。
  - 红线核验：assess_future 提交逻辑、timeout=15、shutdown(wait=False)、评估写表路径全部原样
    （diff 仅 +8 行，全部在展示层）。
- **守卫**（新建 tests/test_fixmind_fallback.py，沿用仓库守卫范式：utf-8-sig 读盘、parents[1]
  根定位，参照 test_t54_t48_t56_guards.py）：
  - 源级① `test_assess_timeout_flag_and_branch_present`：含「assess_timeout = False」与
    「if assess_timeout else」；
  - 源级② `test_fallback_texts_present`：含「已转后台完成并写入学情表」与「规则地板继续」；
  - 源级③（回归锚）`test_assess_body_unchanged`：「result(timeout=15)」与「shutdown(wait=False)」
    原样存在（防误动评估本体）。

### S1 验证
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_fixmind_fallback.py -q
3 passed in 0.18s
```

### S2 变异恰红 → 复绿（两轮变异，全带 $env:PYTHONPATH='backend'）
| 轮 | 注入 | 实测 | 还原后 |
|---|---|---|---|
| 变异A：整删 else 兜底块（规格原文字面） | pipeline_v2.py:518-526 | **②恰红**（文案断言命中）+①同红+③绿 → `2 failed, 1 passed` | 3 passed |
| 变异B：仅换兜底文案为占位串，保留条件式与结构 | pipeline_v2.py:523-525 | **恰红②**：`1 failed` = test_fallback_texts_present，①③绿 | 3 passed in 0.09s |

说明：变异 A 下①与②同时红，原因是「if assess_timeout else」物理位于 else 块内部（规格 after
代码与源级①断言自带的重叠，非实现偏差）——整删 else 块必然同时移除条件表达式。为单独证明
「守卫②恰红、①③不连带」，补变异 B 只移除文案字符串：结果恰为 ②红①③绿。两轮还原均复绿，
git diff 目检净变化 +8 行，兜底文案逐字无损（控制台乱码仅为显示层，UTF-8 往返零损）。

### S3 全量回归（两轮）
首轮：
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests -q
1 failed, 665 passed in 223.44s
FAILED tests/test_engine_v2_golden.py::test_v2_golden_sequence
```
**根因定性（非意外红，未触发还原-上报线）**：-vv 全帧 diff 显示整个 SSE 流仅第 14 帧（done）
mindchain 差异——golden 4 条 vs actual 5 条，actual 恰好多出 `{agent: "学情与记忆管理",
content: "学情评估未产出有效结果，本轮按规则地板继续。"}`（金样 fixture 的快模型评估响应
`{"level_score": 0.8, "evidence": "ok"}` 无 thinking 字段 → 空产出兜底，正是本特性预期行为）。
帧 0-13 全等、steps 全等、其余 done 字段全等。这是 FIXMIND 语义的必然结果：空节点从此不再空。
处置：仓库官方金样再生机制（test_engine_v2_golden.py:111-114，`GOLDEN_REGEN=1` 再生成提交，
注释明示「先 GOLDEN_REGEN=1 再生成提交」）；金样文件 tests/golden/sse_frames_v2.json 不在
§0.5 禁改清单（禁的是 tests/eval/ 五文件 + deploy/eval-override.yml），且 P2/P3 跑数批不消费
单测金样。
```
$ $env:GOLDEN_REGEN='1'; pytest tests/test_engine_v2_golden.py::test_v2_golden_sequence -q
1 skipped（再生路径）
```
EOL 规范化：再生经 Python write_text 在 Windows 下换行转换为 CRLF，而索引为 LF
（core.autocrlf=false），diff 膨胀为整文件 252 行；按 LF 重写后 diff 收敛为 **4 行纯新增**
（即 mindchain 新条目本体），语义零噪声。
```
$ pytest tests/test_engine_v2_golden.py tests/test_fixmind_fallback.py -q
7 passed in 0.65s
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests -q
666 passed, 1 warning in 329.56s (0:05:29)
```
对照：回填基线 663 + 新增守卫 3 = 666，**逐条吻合，零意外红**（warning=starlette httpx 弃用
提示，存量；评测在跑全量 5:29 略慢于常态，属机器负载非失败，与规格预案一致）。

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat
 backend/engine/pipeline_v2.py   | 8 ++++++++
 tests/golden/sse_frames_v2.json | 4 ++++
 2 files changed, 12 insertions(+)
$ git add backend/engine/pipeline_v2.py tests/golden/sse_frames_v2.json tests/test_fixmind_fallback.py
$ git commit   # FIXMIND: 学情评估节点空内容兜底展示（超时/空产出双文案）+变异记录+金样再生说明
[master 519751a]  3 files changed, 66 insertions(+)
$ git push
9cc1c91..519751a  master -> master   （一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
519751a FIXMIND: 学情评估节点空内容兜底展示（超时/空产出双文案）
9cc1c91..519751a  master -> master
```

### S5 容器重启（dev 栈，与评测零交集）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 9 seconds (healthy)
（29 秒复核：Up 29 seconds (healthy)，healthcheck 稳定）
```

## 2. 关键处置与被否方案

1. **金样再生（本会话唯一超出规格步骤字面的动作）**：规格 S1-S6 未列金样步骤，但 S3 要求全量
   绿对照 663 回填——兜底特性必然使空评估路径的 done 帧 mindchain 多一条目，金样不更新则套件
   永远红，与「还原→上报」相比，走仓库官方 GOLDEN_REGEN 机制（注释明示「再生成提交」）是唯一
   既达成特性又保持套件绿的合规范路径。再生后经 -vv 与 --ignore-all-space 双重核验：语义差异
   恰为 +1 条兜底条目，其余逐帧逐字节全等。
2. **EOL 噪声不入库**：write_text 默认换行转换产生 252 行 CRLF/LF 假差异，若直接提交会把
   「+4 行语义」膨胀成整文件重写，污染 blame 与 review——按索引 EOL（LF）重写收敛后再入笔。
3. **变异策略「整删 else 块」 vs 「仅换文案」**：规格字面是前者，但其下①②同红（条件表达式物理
   位于块内）；为满足「恰红②」的精度要求补做后者，两轮证据都留档（见 S2 表），红得「恰」有
   完整解释而非单点巧合。
4. **首轮全量红不按「1 次非预期红→还原→停止上报」处置**：该条款针对根因不明的意外失败；本轮红
   在动手前即可由特性语义完全解释（空评估路径 mindchain 必增条目），且 -vv diff 证实差异面
   恰为该条目、零其他漂移——定性为预期行为变更对金样基线的必要更新，非回归。
5. **守卫不做运行时断言（不起真管线断言 SSE 帧）**：源级断言是本仓库守卫既有范式（T54 等同构），
   且 v2 管线全链起服需隔离桩矩阵，超出微轮触碰面；金样测试已从运行时层覆盖 done 帧 mindchain
   含兜底条目，两层互补不重复。

## 3. 清理清单 / 遗留

1. **§0.5 自查**：本会话存续期间评测跑数未受影响——评测栈容器零操作（全会话仅末尾一次
   `docker logs guashuai-eval-backend --tail 5` 只读快照，healthz 200 轮询正常至 01:08:34）；
   副本库 %TEMP%\coagent-eval-data\ 零读写（含目录内容未枚举，E-45 红线执行）；评测运行面文件
   零改动（git status 为证）；本会话 pytest 全量走 dev 库 data/app.db 与 tmp_path 隔离库，
   与评测副本库物理隔离。eval_all.log 宿主侧未定位到（应在总领侧会话重定向），跑数推进以
   上述零触碰事实 + eval 栈健康快照为证，请总领侧以 eval_all.log 交叉确认。
2. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（存量，保持原状）。
3. 本交接文档 docs/progress/step-FIXMIND.md 本笔不 commit（一笔 commit 纪律），全文经 owner
   回传总领，待回传后归档。
4. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 3 passed / 金样+守卫
   7 passed / 全量 666 passed，变异恰红复绿两轮留档）。
5. 行为零变化承诺：assess_future 提交逻辑、result(timeout=15)、shutdown(wait=False)、
   store_level_score 写表路径、ctx_steps 步骤帧全部与修复前一致（diff 仅 +8 展示层行 + 守卫 +
   金样 +1 条目）；唯一用户可见变化=空评估路径 mindchain/前端不再出现空节点，且文案如实区分
   超时/空产出两态。
