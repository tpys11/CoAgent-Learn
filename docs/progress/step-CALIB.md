# Step CALIB 交接文档（T2 轮：判卷难度评定锚定校准 + 独立复算 + 报告成稿 + L3 起草）

> 会话：CoAgent-Learn CALIB 执行会话。派发 HEAD=a907516（实测一致，零漂移；开工 git pull 一次
> Already up to date）。落点 commit=6c36d18（一笔）；push 一次通过无拒
> （`a907516..6c36d18 master -> master`，未触发 rebase 序列）。
> 分支 master。触碰面：tests/eval/eval_judge.py（+6，规格授权唯一例外）+ tests/test_calib_rubric.py
> （新建守卫，+44）；另盘上工件 docs/submission/evidence/wave2-report.md、
> docs/submission/evidence/manual-review.md、docs/submission/演示视频脚本-v1.md（docs/* 全部
> gitignore :32，不入库，经 owner 回传）。
> 禁碰区自查：评测栈容器零操作（本会话连 docker logs 快照都无需）；副本库
> %TEMP%\coagent-eval-data\ 零读写；tests/eval/ 下除 eval_judge.py 外五运行面文件零触碰；
> deploy/eval-override.yml 零触碰；本会话 pytest 全量走 dev 库（669 passed，与评测副本库物理隔离）。
> 钦定禁碰兑现：fit.DEFAULT_TOL=0.25 与 fit_consistent 判定式全程未动（diff 为证）。

## 0. 复述门回答（开工前已答，经 owner 转总领）

1. **禁传 level_score 机制**：适配指标=|判卷 difficulty−画像 level_score|≤0.25，若判卷 LLM 看到
   level_score 会直接锚定它作答 → difficulty≈level_score 恒成立 → 适配恒过 9/9，指标循环失义作废。
2. **锚定量表五档**：0.0-0.2=纯生活化类比科普，无公式、术语均有白话解释；0.3-0.4=定义加直观例子，
   少量术语且均有中文解释，无推导；0.5-0.6=系统性讲解，含公式或代码，术语较密集；
   0.7-0.8=含推导步骤或高阶专题，密度高；0.9-1.0=论文级。评分只依据答案内容本身的深浅，
   与提问者是谁无关。
3. **judge 引用聚合缺陷**：汇总 invalid=47 与逐例加总 21 不符（evaluate() 用窄口径 sources 字段
   重算 verify_citations）；报告以逐例加总 21/47 为准并披露缺陷。
4. **expect_kps 还原方法**：字符串化数组→ast.literal_eval 还原→归一（去空格小写）子串匹配
   answer→逐例 hit/total 加总，对照总领口径 18/21=85.7% 交叉验证。
5. **锚定后仍恒 0.6 的路径**：升级 --judge-model glm-4.7 重判一轮双列两轮结果；仍失效→停止上报。
   （实际未触发：重判分布 {0.6×5, 0.8×4} 非恒值，见 S5。）
6. **两处钦定禁碰**：fit.py `DEFAULT_TOL=0.25` 与 `fit_consistent` 判定式。

## 1. 步骤命令实录

### S0 核对
```
$ git pull; git log -1 --format="%H %s"; git status
Already up to date.
a907516 docs(board): FIXMIND acceptance; archive step-FIXMIND handoff
（工作树仅存量 untracked：coagent-learn-repomix.xml / repomix.config.json，保持原状）
```
锚点实测：难度评定 prompt 实际位于 eval_judge.py **:41-49（DIFFICULTY_RUBRIC 常量）**，规格预估
:48 略偏——判据行=五档描述 :43-47、「只输出 JSON」行=:48。实测核对后动笔。
evidence 布局核对：`docs/submission/evidence/smoke/results-smoke.json` 已隔离子目录
（judge 顶层 glob `results-*.json` 不误收）✓。

### S1-S2 锚定量表追加（规格逐字）
- DIFFICULTY_RUBRIC 判据行后追加五档锚定量表（JSON 输出要求行原样保留在末位）；
  注释行「CALIB：锚定量表——glm-4-flash 无锚点时 9 例恒评 0.6 实证修复」；
  **level_score 未出现在该 prompt（红线），未传任何画像字段**。
- diff 净变化：+6 行（注释 1 + 锚点 5），全在常量块内，逻辑零改动。

### S3 守卫 + 变异恰红/复绿（tests/test_calib_rubric.py，源级断言）
- ① `test_anchor_scale_present`：「评分锚点」+「0.5-0.6=系统性讲解」存在；
- ② `test_no_level_score_in_rubric`：DIFFICULTY_RUBRIC **块内**禁 level_score
  （范围=常量块非全文件——judge 汇总/校准逻辑合法引用 level_score，全文件断言会误伤）；
- ③ `test_json_output_requirement_intact`：「只输出 JSON」原样存在。

| 变异 | 操作 | 结果 |
|---|---|---|
| 基线 | 原样 | 3 passed |
| A：删锚定量表块 | 移除注释+5 行锚点 | **恰红①**（1 failed: test_anchor_scale_present；②③绿） |
| B：注入 level_score | rubric 内加「参考提问者水平 level_score 后酌情调整评分。」 | **恰红②**（1 failed: test_no_level_score_in_rubric；①③绿） |
| 还原 | 移除注入行 | 3 passed 复绿 |

### S4 一笔 commit + push（E-42 对照）
```
$ git diff --stat        # commit 前
 tests/eval/eval_judge.py | 6 ++++++
 1 file changed, 6 insertions(+)
$ git add tests/eval/eval_judge.py tests/test_calib_rubric.py
$ git commit   # CALIB: difficulty 评定 prompt 追加锚定量表 + 源级守卫
[master 6c36d18] 2 files changed, 50 insertions(+)
$ git push
a907516..6c36d18  master -> master   （一次通过无拒）
```
**两行原文**：
```
6c36d18 CALIB: difficulty 评定 prompt 追加锚定量表 + 源级守卫
a907516..6c36d18  master -> master
```

### S5 重判 9 例（zhipu glm-4-flash 锚定版；key 三级回退自动解析，全程零接触零打印）
```
$ $env:PYTHONPATH="backend"; .venv\Scripts\python.exe tests/eval/eval_judge.py --evidence docs/submission/evidence
[judge] provider=zhipu model=glm-4-flash traps=18
IF-01/IF-02: diff=None（记录型）｜P1-01:8/12 diff=0.6 fit=False｜P1-02:3/6 diff=0.6 fit=False
P1-03:0/10 diff=0.6 fit=False｜P2-01:0/2 diff=0.8 fit=True｜P2-02:1/1 diff=0.8 fit=True
P2-03:5/8 diff=0.8 fit=True｜P3-01:0/1 diff=0.8 fit=True｜P3-02:0/3 diff=0.8 fit=True
P3-03:4/4 diff=0.6 fit=True
```
**difficulty 分布**：
- 修复前（存档 report-final-20260905-014550 实测）：**{0.6×8, 0.4×1(P1-01)}**——总领记录为
  「7 例 0.6+2 例 0.4（P1-01/P3-03）」，按实测存档 P3-03=0.6，**如实修正为 8+1**，报告已注明差异。
- 修复后（本轮重判实测）：**{0.6×5, 0.8×4}**——非恒值，锚定生效于高端（P2/P3 深答案正确上调
  0.8 档），**低端未解决（P1 三例仍卡 0.6）**。按复述门⑤不触发 glm-4.7 升级（非 9 例全同值）。
- **适配诚实结果：6/9=66.7%（校准前 7/9=77.8%，反降 1 例）**——翻案例=P1-01
  （修复前 0.4→dev 0.15 True；修复后 0.6→dev 0.35 False）。仍 <85%，如实呈现，禁改容差凑数已兑现。

### S6 独立复算（临时脚本 %TEMP%\coagent-calib\recalc.py，不入仓库；输出 recalc-out.md）

**三列对照**：

| 指标 | ① judge 汇总 | ②逐例加总/③独立复算（**终值**） | 目标 | 判定 |
|---|---|---|---|---|
| 断言级幻觉 | invalid 47/47（ratio 1.0）| **0/129=0%**（L2 0/9 例判幻；by_diag：虚构 0/检索缺口 19/无引用 0） | <5% | ✓ |
| 适配 | 0.6667 | **6/9=66.7%** | ≥85% | ✗ |
| 覆盖 | None（0/0） | **18/21=85.7%**（与总领口径完全交叉验证一致） | ≥90% | ✗ |

**聚合缺陷两处实证（报告已披露）**：
1. 幻觉汇总 47/47：evaluate() 用窄口径 `sources` 字段重算 verify_citations（逐例用扩展源集合
   KB∪检索命中）→ 全部误判 invalid；逐例实际 **21/47，KB 佐证率 26/47=55.3%**。
2. 覆盖汇总 None：evaluate() 读 `kps` 字段，数据字段名为 `expect_kps`（字段名错配）。
3. **总领通报的「expect_kps 字符串化」实测未复现**：results-P1/P2/P3.json 与 results-final.json
   中 expect_kps 均为 **list 类型**（复算脚本仍实现 literal_eval 双路兼容）；字符串化可能是
   此前已修复或另一工件口径——报告中如实披露，不掩盖。

逐例 miss 明细（未命中 3 KP）：P2-01「QKV」（答案用 Q/K/V 斜杠记法）、P2-03「长文本处理」
（答案措辞「长文本应对思路」）、P3-02「参数高效微调」（答案以代表技术 LoRA 通篇覆盖）——
三项均语义命中、仅字面子串未中，语义判定入 manual-review.md。
口径差披露：流内 hit_kps 英文 KP 按 \b 词边界（更严，同批 10/21），独立复算按钦定口径
去空格小写子串=18/21，报告以钦定口径为准。

### S7 报告成稿（docs/submission/evidence/wave2-report.md，骨架原样保留）
- §2 三指标表终值=独立复算值；逐例九行结果表；分母 failed_total=0 / valid_ratio=1.0 / skipped=0。
- §3 必披露 9 项逐项打勾（零引用 N=0、双模型评+容差 0.25 机制、关键词口径+词边界口径差、
  分母明细、L0 跳过 0/9+审核 7 过 2 拦+重稿 5 次（P1-01×1/P3-02×2/P3-03×2）、判卷三态
  9 正常 0 异常、决策 39 语料口径、RC5 备案、L3 抽查 ≥10%）。
- §4 五项本日追加披露：①缩量口径 9+IF2（owner 拍板）②L1 口径错配（go 档 web 引用为主，
  KB 佐证率 26/47=55.3% 如实呈现）③断言级三分类（14.7% 全为检索缺口与 web 兜底设计互证）
  ④expect_kps 实测 list 未复现字符串化+真实缺陷=字段名错配 ⑤锚定前后 difficulty 对照
  （8+1→5+4，适配 7/9→6/9 反降如实呈现）。
- §5 聚合缺陷两处实证；§6 校准逐例对照表；§7 产出手续与遗留风险。

### S8 manual-review.md（docs/submission/evidence/manual-review.md，判定框/签字栏全留空）
- §一 3 个未命中 KP 语义判定（每项：原文摘录/字面未中证据/语义命中证据/预填建议「判命中」/
  判定框 ☐ 留空；三项若均判命中→覆盖修正 21/21=100%，与 18/21 并存以 owner 判定为准）。
- §二 P1-02/P1-03 适配复核（level_score、前后两轮 difficulty、dev、锚定量表档位对照、
  深浅摘要、预填建议——P1-03 倾向改判成立=judge 低端失效最强实证；判定框留空）。
- §三 抽签 ≥10%（9 例抽 2：P1-01 好例——L1 8/12 系 web 口径错配非虚构、内容质量与诚实声明
  到位；P3-02 边界例——LoRA 主体自有知识+显式证据边界声明、线代部分讲义锚定 0/3 全命中、
  resets 2 次；判定框留空）。
- §四 签字栏 7 行全空（owner 亲签，未代签）。

### S9 视频脚本回填（docs/submission/演示视频脚本-v1.md，改动 2 处）
1. **新增 v1.2 回填注记行**（原 :4 v1.1 注记之后）：回填依据/缩量口径/适配未达标如实呈现声明。
2. **镜 10 行**（现 :29）：画面占位 `[Wave 2 回填实测数字]` → 实测终值（幻觉 0/129=0% 附三分类、
   适配 6/9=66.7% 附容差、覆盖 18/21=85.7%、样例 9+IF2）；台词「60 组用例实测」→
   「三类画像分层的 9 组核心用例实测，未达标项如实归因」；证据点列补数字源
   `evidence/wave2-report.md`。
   （镜 7 台词「适配 85% 指标」为目标值指称，非达标声称，未动。）

### S10 交接
- 全量回归：`pytest tests -q` → **669 passed, 1 warning in 237s**（FIXMIND 基线 666+本轮守卫 3，
  逐条吻合零意外红；warning=starlette/httpx 弃用存量）。
- 本交接文档 docs/progress/step-CALIB.md 本笔不 commit（一笔 commit 纪律），全文经 owner 回传总领。

## 2. 关键处置与被否方案

1. **守卫②断言范围=常量块而非全文件**：规格字面「prompt 不含 level_score」——eval_judge.py 其余
   位置（fit 调用、校准表）合法引用 level_score，全文件断言必然误伤；按红线本义收窄到
   DIFFICULTY_RUBRIC 源码块（regex 提取），变异 B 恰红验证通过。
2. **变异 B 注入形态**：用自然语句「参考提问者水平 level_score 后酌情调整评分。」注入 prompt
   字符串，而非 f-string 变量注入——源级断言按文本匹配，两者等价触发；自然语句更接近真实
   事故形态（提示词手写注入）。
3. **适配反降 1 例不掩盖、不追加 glm-4.7 轮次**：复述门⑤升级触发条件=「9 例全同值」，实测
   分布 {0.6×5, 0.8×4} 非恒值；锚定对高端有效（P2/P3 判分显著更合理）、低端失效（P1 恒 0.6）。
   追加 glm-4.7 轮次属新增变量且会覆盖 results-final.json 现场状态，未获授权不擅自扩轮——
   如实双列前后对照，升级决策上报 owner。
4. **expect_kps「字符串化」未复现的处置**：不按通报口径硬写报告——实测三批次+final 全为 list，
   报告披露实测+复算脚本保留 literal_eval 双路兼容（若他处确有字符串化工件，脚本可直接复算），
   同时指出真实汇总缺陷（字段名错配）——诚实原则高于口径一致。
5. **重判覆盖现场的管理**：results-final.json / cases/*/eval.json / summary/report-final.json
   已被锚定后重判版覆盖；修复前版本存档于 summary/report-final-20260905-014550.*（仓库内）+
   %TEMP%\coagent-calib\results-final-precab.json（本机备份）。报告所有「修复前」数据均引自
   存档非内存。
6. **S7-S9 产物不入 git**：docs/* 整目录 gitignore（.gitignore:32），报告/复核单/视频脚本为
   盘上工件，与 FIXMIND 以来「材料经 owner 回传」惯例一致；本会话仅 1 笔代码 commit（6c36d18）。

## 3. 清理清单 / 遗留

1. **§0.5 自查**：评测栈容器零操作；副本库零读写（含目录未枚举）；tests/eval/ 运行面五文件中
   仅 eval_judge.py 按规格授权修改；deploy/eval-override.yml 零触碰；pytest 全量走 dev 库。
2. untracked 保持原状：`coagent-learn-repomix.xml`、`repomix.config.json`（存量，非本会话产物）。
3. 遗留风险（报告 §7 已列）：①适配低端判别未解决——glm-4-flash 对浅答案恒 0.6，候选后续=
   升级 judge-model 或生成侧 difficulty 自标（均属他域决策，未动）；②样本量 9 例，指标敏感；
   ③run_eval 聚合两缺陷（字段名错配 + 源集合窄口径）建议后续修复，本会话未越界改动；
   ④manual-review.md 三 KP 判定若 owner 均判命中，覆盖终值改 21/21=100%，视频镜 10 与报告
   需同步回填（依赖 owner 签署）。
4. 待 owner 动作：签 manual-review.md（7 栏）；回传本交接+报告+复核单；决定是否追加
   glm-4.7 判卷轮次与 run_eval 聚合缺陷修复排期。
5. CI：push 后远端状态建议 owner 侧核对（本地证据：守卫 3 passed / 全量 669 passed，
   变异恰红复绿两轮留档）。
