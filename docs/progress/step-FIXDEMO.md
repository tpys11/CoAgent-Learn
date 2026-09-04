# Step FIXDEMO 交接文档（T2 微轮：主生成链难度适配显式化 + 术语中英对照——条款级提示词补强 + 守卫）

> 会话：CoAgent-Learn FIXDEMO 执行会话。派发 HEAD≥10c567a（实测 HEAD=cf868de，`git merge-base --is-ancestor 10c567a HEAD` → ANCESTOR-OK；开工 git pull 一次 Already up to date）。
> 落点 commit=e9314be（一笔，修复+守卫同笔）；push 一次通过无拒（`cf868de..e9314be master -> master`，未触发 rebase 序列）。
> 分支 master。触碰面：backend/engine/pipeline_v2.py（base_system 追加两块，+7 行）+ 新建 tests/test_fixdemo_prompt.py（3 守卫，+57 行），合计 2 files, +64/-0。
> 禁碰区零触碰：tests/eval/**、skills/**、review.py、REGISTRY 定义区全程未动；守则零真网零真实 key；未派生子 agent。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **prev_score 从哪来、为何判 None**：pipeline_v2.py:343（已就位）`prev_score = coerce_score(profile_cache.get("level_score"))`——学习者画像的当前水平分，随画像缓存一并预取（`_build_preloaded`），作用域先于 base_system 组装点（:565-578）。判 None 是因为画像可能缺失/未初始化/装载失败（coerce_score 对脏数据防御性返回 None）：此时无水平可贴合，【难度适配】块必须整体不出现，避免提示词出现空洞水平数字；`if prev_score is not None` 钉死该 None 分支。
2. **为什么守卫用源级断言而不用 LLM 行为测试**：执行守则"零真网零真实 key"直接排除真实模型调用；且 LLM 行为输出不确定、慢、贵，断言"术语出现在答案里"不稳定。本轮交付物就是提示词文本本身——源级断言确定性、毫秒级、零依赖，直接钉住条款与 None 分支，误删/回退立即红。
3. **既有钉字测试红了怎么办**：停下上报，禁自行改既有断言（S3 明令）。本轮未触发——663 全绿零意外红。
4. **全量回归基线数**：660（回填实测，step-FIXEVAL 轮"660 passed=656回填+4守卫"）；本次新增守卫 3 个，实测 660+3=663 全绿吻合。
5. **push 被拒序列**：`git pull --rebase` → 复跑守卫+全量 → 再推；全程禁 `--force`；再拒或冲突即停止上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull                      # Already up to date
$ git merge-base --is-ancestor 10c567a HEAD   # ANCESTOR-OK: HEAD >= 10c567a
$ git status --porcelain        # 仅 2 untracked（repomix 产物，非并行写入）
$ git log --oneline -3          # HEAD=cf868de（FIXEVAL acceptance 行）
```
判定：HEAD=cf868de ≥ 10c567a 实测通过 ✓；已跟踪文件零修改 = 无并行写入 ✓。

### S1 修改+守卫（锚点逐字命中后动笔）
- **锚点核对**（Read 实测，非凭规格推断）：
  - pipeline_v2.py:576-578 与规格 before 逐字一致（T56 注释 + 【公式格式】两行 append）；
  - :579 起即 context_blocks 画像/历史注入段——插入点=公式格式块之后、context_blocks 之前 ✓；
  - :343 `prev_score = coerce_score(...)` 在同一函数且先于插入点，作用域成立 ✓；
  - 锚唯一性预检（恰红可靠性）：`if prev_score is not None`/`{prev_score:.2f}`/【难度适配】/【术语规范】插入前计数均 0（插入后各恰 1）；【公式格式】/T56 注释各恰 1。
- **修改**（规格 after 逐字插入，+7 行）：
  ```
  # FIXDEMO：难度适配显式化——画像等级此前不在提示词，模型无从贴合（评测适配 77.8% 实证）
  if prev_score is not None:
      base_system += (
          f"\n【难度适配】学习者当前水平 {prev_score:.2f}（-1~1，越低越基础）："
          "内容深浅、术语密度、例题复杂度必须贴合该水平，低水平学习者避免密集高阶术语与长公式推导。")
  base_system += ("\n【术语规范】关键术语首次出现时给出中英文对照，"
                  "如「自注意力（Self-Attention）」「QKV（Query/Key/Value）」「KV缓存（KV Cache）」，全文统一用词。")
  ```
  公式格式块与 context_blocks 原样；其余档位/模板逻辑零变化。
- **守卫**（tests/test_fixdemo_prompt.py 新建，3 条，源级断言零真网，镜像 test_imgkey_prompts.py 风格）：
  1. 守卫①【难度适配】：条款在 + `{prev_score:.2f}` 注入在 + `if prev_score is not None` 在，
     且结构断言（【难度适配】行位于 if 行之后且缩进更深）——块嵌在守卫分支内，None 时整体不出现；
  2. 守卫②【术语规范】：条款在 + 「中英文对照」要求在；
  3. 守卫③（回归锚）：T56【公式格式】块原样存在（注释锚 + 正文条款 + `\\( \\)`/`\\[ \\]` 禁令子句 raw 串逐字），防本轮误删。
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_fixdemo_prompt.py -q
3 passed in 0.14s
```

### S2 变异恰红 → 复绿（两轮，edit 精确删块 + 备份字节级 Copy-Item 还原，非 git 回退）
| 轮 | 变异 | 实测 | 还原后 |
|---|---|---|---|
| 1 | 删【难度适配】块（注释+if 守卫整体） | **恰红**：`F..`＝`1 failed, 2 passed`（仅守卫①，②③同轮绿） | `3 passed` |
| 2 | 删【术语规范】块 | **恰红**：`.F.`＝`1 failed, 2 passed`（仅守卫②，①③绿） | `3 passed` |

（还原后复绿 3 passed in 0.17s；py_compile 通过；`git diff --stat` 目检＝pipeline_v2.py 恰 +7 行。
控制台中文乱码仅为 GBK 显示层，UTF-8 往返零损，与 IMGKEY/FIXAUX3b 轮记录一致。）

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
663 passed, 1 warning in 225.03s (0:03:45)
```
对照：回填基线 660 + 新增守卫 3 = 663，**逐条吻合，零意外红**（无既有钉字测试受 prompt 文本变化影响，
未触发"停下上报"分支；warning=starlette httpx 弃用提示，存量，与基线同源）。

### S4 一笔 commit + push（E-42 对照）
```
$ git status --porcelain; git add backend/engine/pipeline_v2.py tests/test_fixdemo_prompt.py; git diff --cached --stat
 backend/engine/pipeline_v2.py |  7 +++++++
 tests/test_fixdemo_prompt.py  | 57 +++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 64 insertions(+)
$ git commit -m "FIXDEMO: …（附变异恰红实证与 663 回归数）"
[master e9314be] …  2 files changed, 64 insertions(+)
$ git push
（EXIT 0，一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
e9314be FIXDEMO: 主生成链难度适配显式化 + 术语中英对照——base_system 于 T56 公式格式块后追加两块：…
cf868de..e9314be  master -> master
```

### S5 容器重启（backend 挂载即生效）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker inspect --format "{{.State.Health.Status}}" guashuai-backend   # 5s 轮询
POLL-1: starting
POLL-2: healthy
```

## 2. 被否方案
1. **LLM 行为测试做守卫**：见复述门②——违背零真网零 key、输出不确定；源级断言直接钉交付物（提示词文本）。
2. **无守卫直注 prev_score（裸 f-string）**：prev_score 为 None 时提示词出现「学习者当前水平 None」空洞数字误导
   模型，且无画像场景不可预期劣化；`if prev_score is not None` 钉死 None 分支（守卫①含结构断言双重锁定）。
3. **难度文案写成形容词映射表（如 0.15→"初学者"）**：引入新映射表与口径分歧，超出本轮条款级补强范围；
   直接注入实测值+贴合要求，最小改动。
4. **变异用 git checkout 回退整文件**：会把本轮修改连同守卫断言对象一起抹掉，且与"恰红"语义不符；
   精确删块+备份字节级还原，红得「恰」（失败用例恰 1、其余同轮绿即证据），还原可 diff 目检。
5. **守卫断言整段 f-string（含字面量 \n）**：转义歧义+未来无关微调即误红；锚定语义子串
   （【难度适配】/{prev_score:.2f}/if 守卫/【术语规范】/中英文对照/T56 回归锚），红/绿语义均精确。

## 3. 清理清单 / 遗留
1. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
2. 本交接文档 docs/progress/step-FIXDEMO.md **本笔不 commit**（维持一笔 commit 纪律，同 step-IMGKEY 惯例），
   全文经 owner 回传总领，待回传后归档。临时备份 pipeline_v2.keep.py 已清理。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 3 passed / 全量 663 passed / 两轮变异恰红复绿）。
4. **效果验证（真网，非本会话职责）**：需 owner/总领侧在 go 档（glm-5.3-flash）跑一轮 Wave 同口径评测，
   观察适配一致率能否从 77.8% 回升至 ≥85%、QKV/KV缓存/参数高效微调三个标准中文术语覆盖率能否从 85.7%
   回升至 ≥90%——本会话守则零真网未发起。
5. **口径观察（报总领定夺，本会话未动钦定文本）**：backend/engine/assess.py `coerce_score` docstring 与实现为
   `[0,1] float 或 None`，而钦定【难度适配】文案表述「-1~1，越低越基础」；两处口径存在表述差（方向语义
   "越低越基础"两口径一致，0.15 均判为低水平）。按红线规格逐字插入未做任何改写，提请总领确认是否后续轮次统一。
6. py_compile 通过；pytest 收集零告警；禁碰区（tests/eval/**、skills/**、review.py、REGISTRY 定义区）零触碰。
