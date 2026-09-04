# Step IMGKEY 交接文档（T2 微轮：IMG 配图检索关键词英文化——skills 提示词收口 + 守卫）

> 会话：CoAgent-Learn IMGKEY 执行会话。派发 HEAD=ca75e66（实测精确一致，零漂移；开工 git pull 一次 Already up to date）。
> 落点 commit=5ad13df（与预期一笔一致）；push 一次通过无拒（`ca75e66..5ad13df master -> master`）。
> 分支 master。触碰面：skills/gen_guide、skills/gen_report、skills/gen_diagnosis、skills/gen_image 四个 __init__.py（各 1 行 prompt）+ 新建 tests/test_imgkey_prompts.py（5 files, +92/-4）。
> 一笔 commit（修复+守卫同笔）。禁碰区零触碰：backend/** 全程未动（本修纯 skills 提示词层）；守则为源级+纯函数，零真网零真实 key。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **为什么在标记生成端修英文而不是 embed_images 加翻译层**：根因在 LLM 生成 `{{IMG:关键词|说明}}`
   标记那一刻就写成了中文泛词——生成端提示词约束是零依赖、零时延、确定性的上游修复。embed_images
   加翻译层=额外一次 LLM/翻译 API 调用：违背本仓零真网零真实 key 守则，引入时延与新失败点，翻译歧义
   不可控，属下游打补丁。守卫第 5 条反向锁定：gen_report/gen_image 源码无 translate/翻译 字样，防未来画蛇添足。
2. **gen_diagnosis 若无标记指令的处置**：grep 实证其 L15 含同款 IMG 标记指令（「需要配图的位置输出标记
   {{IMG:搜索关键词|图片说明}}，全文最多 4 处」）→ 按规格走「同款追加」，非豁免分支。守卫保留动态豁免
   分支：未来若移除标记指令则豁免英文化断言，但须断言豁免依据成立（源码确无 {{IMG: 指令锚），失真即红。
3. **standard 档（deepseek）会受影响吗**：会。skills 提示词对各档共用，deepseek 生成 gen_guide/gen_report/
   gen_diagnosis 正文与 gen_image 提取词时读同一批 prompt。影响=IMG 关键词收窄为英文 2-3 词、题注保持中文；
   标记格式（`{{IMG:关键词|说明}}`）与数量上限（4 处）不变，仅语言约束收窄，预期 Wikimedia/Openverse 命中率
   提升；deepseek 对此类显式指令遵循充分，风险低。
4. **push 被拒序列**：`git pull --rebase` → 复跑 pytest 全绿 → 再次 push；全程禁 `--force`；再拒或 rebase
   冲突即停止上报。（本轮未触发——一次通过。）

## 1. 步骤命令实录

### S0 核对
```
$ git pull                      # Already up to date
$ git log --oneline -6          # HEAD=ca75e66（BUMP-3 direct-edit 行）
$ git status --porcelain=v1     # 仅 2 untracked（repomix 产物，非并行写入）
$ git merge-base --is-ancestor ca75e66 HEAD   # HEAD_OK
```
判定：HEAD=ca75e66 精确命中 ≥ 要求 ✓；已跟踪文件零修改 = 无并行写入 ✓。

### S1 四处提示词修改+守卫（锚点逐字命中后动笔）
- **锚点核对**（git grep 实证）：
  - gen_guide L13 / gen_report L18 / gen_diagnosis L15 均逐字命中规格引文
    「（…）需要配图的位置输出标记 {{IMG:搜索关键词|图片说明}}，全文最多 4 处；」；
  - **gen_diagnosis 含标记指令 → 同款追加（③非豁免）**；
  - gen_image L101 `_LLM_KEYWORD_PROMPT` 与规格 before 文案逐字一致；
  - 基线：四个目标 prompt 原均无「英文」字样；skills/ 无 translate/翻译（守卫基线干净）。
- **修改**（追加子句插在「全文最多 4 处；」与下一条款之间，保持单分号，三技能同款）：
  ```
  ；IMG 标记的搜索关键词必须用英文（2-3 个词，供 Wikimedia 检索），图片说明保留中文；
  ```
  gen_image after（规格逐字）：
  ```
  从以下内容提取 2 个最适合搜索配图的英文关键词（供 Wikimedia 检索），只输出逗号分隔，不要其他文字。\n内容：\n
  ```
- **守卫**（tests/test_imgkey_prompts.py 新建，5 条，源级+纯函数零网络）：
  1. gen_guide：prompt 源码含「英文」计数≥1 + 规格子句在 + IMG 指令行恰 1 处且含「英文」；
  2. gen_report：同款；
  3. gen_diagnosis：有标记指令 → 同款断言；无标记指令 → 豁免并断言豁免依据（源码无 {{IMG: 字样）；
  4. gen_image：_LLM_KEYWORD_PROMPT 含规格 after 文案（截取至句号，避开字面量 \n 转义歧义）；
  5. embed_images 搜索链（gen_report.embed_images/search_images → gen_image.search_images）
     无 translate/翻译 字样——英文化只在生成端，防链路加翻译层。

### S1 验证
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest tests/test_imgkey_prompts.py -q
5 passed in 0.11s
```

### S2 变异恰红 → 复绿（两轮，精确串替换，非 git 回退）
| 轮 | 变异 | 实测 | 还原后 |
|---|---|---|---|
| 1 | gen_guide IMG 指令行去「英文」子句（还原 before） | **恰红**：`1 failed, 4 passed`（仅 test_gen_guide，无连带） | `5 passed` |
| 2 | gen_image _LLM_KEYWORD_PROMPT 还原 before 文案 | **恰红**：`1 failed, 4 passed`（仅 test_gen_image） | `5 passed` |

（控制台中文乱码仅为显示层，UTF-8 往返零损，与 FIXAUX3b 轮记录一致；还原后 git diff 目检=预期单行变更。）

### S3 全量回归
```
$ $env:PYTHONPATH='backend'; .venv\Scripts\python.exe -m pytest -q
656 passed, 1 warning in 56.67s
```
对照：回填基线 651（step-FIXAUX3b.md S3）+ 新增守卫 5 = 656，**逐条吻合，零意外红**
（warning=starlette httpx 弃用提示，存量，与基线同源）。

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat
 skills/gen_diagnosis/__init__.py | 2 +-
 skills/gen_guide/__init__.py     | 2 +-
 skills/gen_image/__init__.py     | 2 +-
 skills/gen_report/__init__.py    | 2 +-
 4 files changed, 4 insertions(+), 4 deletions(-)
$ git add <四个 skills __init__.py> tests/test_imgkey_prompts.py; git commit
[master 5ad13df] IMGKEY: IMG 检索关键词英文化——skills 提示词层收口（…）
 5 files changed, 92 insertions(+), 4 deletions(-)
$ git push
（EXIT 0，一次通过无拒，未触发 rebase 序列）
```

**两行原文**：
```
5ad13df IMGKEY: IMG 检索关键词英文化——skills 提示词层收口（gen_guide/gen_report/gen_diagnosis 标记指令 + gen_image 提取词）
ca75e66..5ad13df  master -> master
```

### S5 容器重启（skills 挂载即生效）
```
$ docker restart guashuai-backend
guashuai-backend
$ docker ps --filter "name=guashuai-backend" --format "{{.Names}} {{.Status}}"
guashuai-backend Up 12 seconds (healthy)
```

## 2. 被否方案
1. **embed_images 加翻译层**：见复述门①——违背零真网零 key、加时延/失败点、根因错位；守卫第 5 条已把
   「搜索链无翻译」钉进测试。
2. **英文约束写成全内容英文 / 只改 gen_image 不改标记指令**：正文与图片说明面向中文读者须保留中文，只收窄
   IMG 关键词语言；gen_image 单改不覆盖三技能标记路径（embed_images 消费的关键词来自标记本身）。
3. **守卫逐字断言整段 prompt（含字面量 \n）**：转义歧义 + 未来无关微调即误红；改为锚定语义子串
   （指令锚行恰 1 处 + 规格子句 + after 文案句号前），红/绿语义均精确。
4. **变异用 git checkout 回退整文件**：会连守卫一起回退测不出红；精确串替换只动目标 prompt，
   红得「恰」（其余 4 条同轮绿即证据），还原对称可 diff 目检。
5. **无翻译层断言只测 gen_image**：搜索链入口在 gen_report.embed_images/search_images（薄封装延迟导入
   gen_image 实现），翻译层可插在两端——两端都锁。

## 3. 清理清单 / 遗留
1. untracked：`coagent-learn-repomix.xml`、`repomix.config.json`（非本会话产物，保持原状）。
2. 本交接文档 docs/progress/step-IMGKEY.md 本笔不 commit（维持一笔 commit 纪律），全文经 owner 回传总领，待回传后归档。
3. CI：push 后远端 CI 状态建议 owner 总领侧核对（本地三绿证据：守卫文件 5 passed / 全量 656 passed / 两轮变异恰红复绿）。
4. **效果验证（真网，非本会话职责）**：需 owner/总领侧在资源面板跑一轮 gen:gen_guide / gen:gen_report 生成，
   观察新条目 IMG 标记关键词是否为英文 2-3 词、题注是否保留中文、Wikimedia 命中是否对题——本会话守则零真网未发起。
5. py_compile 五文件通过；pytest 收集零告警。
