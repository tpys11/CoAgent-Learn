# Step FIXDEMO2 交接文档（T2 微轮：初学者画像生成硬约束——难度真适配）

> 会话：CoAgent-Learn FIXDEMO-2 执行会话。派发 HEAD≥819110d（实测 HEAD=819110d 本身，`git merge-base --is-ancestor 819110d HEAD` → ANCESTOR_OK；开工 git pull 一次 Already up to date）。
> 落点 commit=0cc5f2d（一笔，修复+守卫同笔）；push 一次通过无拒（`819110d..0cc5f2d master -> master`，未触发 rebase 序列）。
> 分支 master。触碰面：backend/engine/pipeline_v2.py（【难度适配】块后追加 prev_score<0.35 分支块，+10 行）+ tests/test_fixdemo_prompt.py（增守卫④⑤，+31/-1），合计 2 files, +41/-1。
> 禁碰区零触碰：tests/eval/**、skills/**、review.py、REGISTRY 定义区、docs/submission/** 全程未动；evidence\ 下 results-*.json 与 kb-check-*.json（含 smoke 子目录）禁改禁删遵守；评测栈容器 guashuai-eval-* 与副本库 %TEMP%\coagent-eval-data\ 零触碰（E-45）；守则零真网零真实 key；未派生子 agent。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **阈值 0.35 的依据**：校准判卷 9 例实测中，三例初学者画像 level 0.25 / 0.25~0.3 / 0.3 全部偏差 0.3-0.35、超容差 0.25；中高级画像 0.6-0.85 偏差 ≤0.1 适配良好。0.35=初学者实测最高档 0.3+0.05 边距——三例初学者全部落在其下被覆盖，同时与中高级带（0.6 起）保持 0.25 隔离，不把适配良好的画像误划入硬约束分支。
2. **为什么原块保留只追加**：原【难度适配】块是 FIXDEMO 产物，对中高级已实证适配良好（偏差≤0.1），改它有已验证行为回归风险；追加式修改把影响面锁死在 `prev_score < 0.35` 分支内，中高级路径逐字节不变——即红线"原块逐字保留"。
3. **硬约束五条会不会误伤高水平画像**：不会。五条在 `if prev_score < 0.35:` 字符串拼接分支内，是代码层条件守卫而非模型自觉：prev_score ≥ 0.35（0.6-0.85）时分支为假，该块根本不进 system prompt；守卫④断言阈值分支存在且嵌套（缩进+行序）钉死；T56 公式块与【术语规范】块位置内容均不动。
4. **评测并行中三类禁止操作**：a) 触评测栈——guashuai-eval-* 容器与副本库 %TEMP%\coagent-eval-data\（E-45）；b) 改评测/提交材料——tests/eval/**、skills/**、review.py、REGISTRY 定义区、docs/submission/**（CALIB 产物）及 evidence\ 正式跑数证据 results-*.json / kb-check-*.json（禁改禁删）；c) --force 推送等覆盖共享提交/证据的破坏性操作（push 被拒只能 rebase→复跑→再推）。
5. **push 被拒序列**：`git pull --rebase` → 复跑全量测试确认绿 → 再推；全程禁 `--force`。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull                              # Already up to date
$ git log --oneline -6                  # HEAD=819110d（CALIB acceptance 行）
$ git status --porcelain                # 仅 2 untracked（repomix 产物，非并行写入）
$ git merge-base --is-ancestor 819110d HEAD   # ANCESTOR_OK
```
判定：HEAD=819110d ≥ 819110d 实测通过 ✓；已跟踪文件零修改=无并行写入 ✓。

### S1 修改+守卫（锚点逐字命中后动笔）
- **锚点核对**（Read 实测，非凭规格推断）：pipeline_v2.py:588-591 与规格 before 逐字一致（`if prev_score is not None:` + 【难度适配】两行 append）；:592 起即【术语规范】块——插入点=难度适配块之后、术语规范块之前 ✓；`git grep "难度适配" -- backend/` 全库恰 1 处 ✓；T56 公式格式块（:584-586）位于锚点之前不受影响。
- **修改**（规格 after 逐字追加，+10 行=注释 2 + `if prev_score < 0.35:` 1 + `base_system += (` 1 + 硬约束块头及五条 6）：
  ```
  if prev_score is not None:
      base_system += (
          f"\n【难度适配】学习者当前水平 {prev_score:.2f}（-1~1，越低越基础）："
          "内容深浅、术语密度、例题复杂度必须贴合该水平，低水平学习者避免密集高阶术语与长公式推导。")
      # FIXDEMO2：初学者硬约束——校准判卷实证 level 0.25-0.3 三例偏差 0.3-0.35 超容差 0.25，
      # 软条款模型不遵从，故低水平分支追加硬约束（阈值 0.35=初学者最高档 0.3+边距；中高级带 0.6 起不受影响）
      if prev_score < 0.35:
          base_system += (
              "\n【初学者模式·硬约束】该学习者处于基础阶段，本轮回答必须遵守："
              "①禁止公式推导，如需公式只给最终形式并配一句文字直觉；"
              "②每个概念先用生活化类比引入，再给正式定义；"
              "③高阶术语必须紧跟白话解释；"
              "④篇幅压缩：短句为主，总长不超过常规回答的一半；"
              "⑤结尾给一个「下一步建议」帮助学习者小步前进。")
  base_system += ("\n【术语规范】关键术语首次出现时给出中英文对照，"   ← 原样续接，零改动
  ```
  原【难度适配】块逐字保留；T56 公式格式块与【术语规范】块原样；`python -m py_compile backend/engine/pipeline_v2.py` → COMPILE_OK。
- **守卫**（并入既有 tests/test_fixdemo_prompt.py，源级断言零真网，镜像守卫①结构断言风格，+2 用例）：
  1. 守卫④【初学者模式·硬约束】：条款在 + `prev_score < 0.35` 阈值在，且结构断言（硬约束块行位于阈值行之后且缩进更深）——块嵌在阈值分支内，≥0.35 时整体不出现（红线钉死）；
  2. 守卫⑤（结构）：硬约束块位于【难度适配】块之后的源码行序断言；缺块场景早退（由守卫④恰红），保证变异「恰红」可归因。
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_fixdemo_prompt.py -v
5 passed in 0.14s   （守卫①②③既有 + ④⑤新增全绿）
```

### S2 变异恰红 → 复绿（edit 精确删块 + 同文还原，非 git 回退）
| 变异 | 实测 | 还原后 |
|---|---|---|
| 删【初学者模式·硬约束】块（注释+if 阈值分支整体） | **恰红**：`1 failed, 4 passed`（仅守卫④，失败点=首断言「缺【初学者模式·硬约束】条款」；守卫⑤缺块早退绿；①②③绿） | `5 passed` |

（还原与变异互为镜像 edit，`git diff` 复核还原后仅剩本笔改动；控制台中文乱码仅为 GBK 显示层，UTF-8 往返零损。）

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
671 passed, 1 warning in 209.75s (0:03:29)
```
对照：回填基线 669 + 新增守卫④⑤ = 671，**逐条吻合，零意外红**（未触发"1 次非预期红→还原→停止上报"分支；
warning=starlette httpx 弃用提示，存量，与 FIXDEMO 轮基线同源）。

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat
 backend/engine/pipeline_v2.py | 10 ++++++++++
 tests/test_fixdemo_prompt.py  | 32 ++++++++++++++++++++++++++++++-
 2 files changed, 41 insertions(+), 1 deletion(-)
$ git add backend/engine/pipeline_v2.py tests/test_fixdemo_prompt.py
$ git commit -m "FIXDEMO2: …（附变异恰红实证与 671 回归数）"
[master 0cc5f2d] …  2 files changed, 41 insertions(+), 1 deletion(-)
$ git push
（EXIT 0，一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
0cc5f2d FIXDEMO2: 初学者画像难度硬约束——难度真适配（prev_score<0.35 追加【初学者模式·硬约束】）
819110d..0cc5f2d  master -> master
```

### S5 容器重启（backend 挂载即生效；仅 guashuai-backend，未触 guashuai-eval-*）
```
$ docker restart guashuai-backend
guashuai-backend
$ 5s 轮询 docker inspect --format "{{.State.Health.Status}}"
HEALTHY after 10s
```

## 2. 被否方案
1. **LLM 行为测试做守卫**：违背零真网零 key；且行为断言会破坏变异「恰红」归因——删块时行为测试与守卫④同红，红不再"恰"；源级断言直接钉交付物（提示词文本），红/绿语义精确、毫秒级。
2. **改写/替换原【难度适配】块**：该块对中高级（0.6-0.85）已实证偏差≤0.1，动它=对已验证行为做无谓回归；只追加把 blast radius 锁死在低水平分支。
3. **阈值取 0.3 或抬高至 0.5**：取 0.3 时 `<` 比较会把实测恰为 0.3 的初学者例（已超容差）排除在外；抬至 0.5 则吞掉部分中间带、增加误伤面。0.35=实测最高档+最小安全边距，证据边界内最稳。
4. **不加阈值、对全水平追加硬约束**：直接违反红线（≥0.35 时本块不得出现）且会压缩高水平画像的推导深度——恰是本轮要修的反面。
5. **变异用 git checkout 回退整文件**：会把本轮修改连同守卫断言对象一起抹掉，且与"恰红"语义不符；精确删块+同文还原，红得「恰」（失败用例恰 1、其余同轮绿即证据），还原可 diff 目检。

## 3. 清理清单 / 遗留
1. 本交接文档 docs/progress/step-FIXDEMO2.md **本笔不 commit**（维持一笔 commit 纪律，同 step-FIXDEMO/step-IMGKEY 惯例），全文经 owner 回传总领，待回传后归档。
2. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 5 passed / 全量 671 passed / 变异恰红复绿）。
4. **效果验证（真网，非本会话职责）**：需 owner/总领侧在 go 档跑同口径 9 例评测，观察三例初学者画像（0.25-0.3）难度偏差能否从 0.3-0.35 收敛至 ≤0.25 容差内、中高级（0.6-0.85）偏差保持 ≤0.1 不回退——本会话守则零真网未发起。
5. **口径观察（承 FIXDEMO 轮遗留，报总领定夺，本会话未动钦定文本）**：assess.py `coerce_score` 口径 [0,1] vs 钦定文案「-1~1」之差仍开放；本轮阈值 0.35 对两口径下实测初学者带（0.25-0.3）判定一致（均 <0.35），不改变该遗留结论。
6. 禁碰区全程零触碰（tests/eval/**、skills/**、review.py、REGISTRY 定义区、docs/submission/**、evidence\ 正式跑数证据、guashuai-eval-* 容器、%TEMP%\coagent-eval-data\）；py_compile 通过；pytest 收集零告警。
