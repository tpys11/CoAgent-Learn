# 总领会话交接：提交冲刺夜（2026-09-04 晚 → 09-05 凌晨）→ 09-05 收口日

> 写给：上下文压缩后重启的总领会话（续接实例）。
> 读取顺序：本文 → docs/PROGRESS.md → docs/progress/step-CALIB.md（最新一轮交接）→ 本文 §6 晨间清单。
> 铁律不变：不派生子 agent；改代码只出派发单（owner 直令直改模式除外，本夜已多次授权）；状态只认看板与本文。

---

## 1. 我是谁、现在在哪一步

- 我是 CoAgent-Learn 的全局唯一总领会话（调度与决策中枢）。owner 今晚密集推进**提交冲刺**（作品 09-05 提交）。
- **当前所处步骤**：全量跑数（54 例）**等待 owner 在其自己的终端执行**（命令已交付，见 §6-A）。
  我无法可靠派生持久后台进程（工具宿主会回收子进程——两次实证），跑数必须 owner 亲手跑。
- 跑数完成后：我判卷 → 双列复算 → 报告换数 → 数据集组装 → manual-review 重拟 → owner 签字 → owner 录视频/打包 → 提交。

## 2. 今晚完成链（全部已验收并推远端，CI 全绿）

按 commit 顺序（全在 master，远端=本地）：

| # | commit | 内容 | 验收要点 |
|---|---|---|---|
| 1 | 4c9972e | **FIXLLM**：base_llm 三缺陷（chat 重复 max_tokens kwarg【d5e65a5 引入】/chat_stream 空 choices IndexError/except 块外 str(e) UnboundLocalError 吞真实异常）+4 守卫 | 663 前基线 634+4；变异恰红；CI ✓ |
| 2 | 8eed9ca | **FIXAUX**：_make_llm/_make_fast_llm 档位感知（测试档 key=注册表格优先、严禁 DEEPSEEK 兜底=决策 38 契约闭合）+ think_then_json ast.literal_eval 兜底 + ServiceSettings zen→go 复制清除 | 646=638+8；rebase 吸收协作者 3 commit |
| 3 | d83bd73 | **FIXAUX-3**：chat() 缺省与 chat_with_json 2000→8000（glm-5.3-flash reasoning 4543 tok 烧穿 2000→正文空；参考 Z.AI 官方文档+Pi opencode-go 元数据） | 647 |
| 4 | 65d78d4 | **FIXAUX-3b**：_thinking_kwargs go 端点+thinking=False → extra_body reasoning_effort=low（P4/P5 实测推理归零、23s→12-15s） | 651 |
| 5 | 5ad13df | **IMGKEY**：四处 skills 提示词 IMG 标记关键词英文化（中文泛词在 Wikimedia 命中敦煌/快递标准档案的落库实证） | 656 |
| 6 | 456119d | **FIXEVAL**：runner _poll_progress 双信号收口（/api/knowledge/list chunks>0 兜底——根治协作者 P0-1 灌库卡死，owner 拍板我方接修） | 660 |
| 7 | e9314be | **FIXDEMO**：base_system 追加【难度适配】（prev_score 注入）+【术语规范】（中英对照）——适配 77.8%/覆盖 85.7% 的系统层根因（画像等级从未进提示词） | 663 |
| 8 | 519751a | **FIXMIND**：学情评估节点空内容兜底展示（超时/空产出双文案）；**金样再生 GOLDEN_REGEN=1**（diff 恰 +4 行=done 帧 +1 兜底条目，逐行核验通过） | 666 |
| 9 | 6c36d18 | **CALIB**：DIFFICULTY_RUBRIC 追加五档锚定量表（原 rubric 缺 0.0-0.4 低段锚→9 例恒 0.6）；level_score 禁入 prompt 红线（防循环失义） | 669 |
| 10 | 0cc5f2d | **FIXDEMO-2**：prev_score<0.35 追加【初学者模式·硬约束】五条（禁公式推导/生活化类比先行/术语白话/篇幅减半/下一步建议） | 671（现行基线） |
| 11 | b599d72 | **FIXDEMO2b**：【术语规范】追加「概念须用标准中文名称命名」（覆盖判定口径对齐） | 671（断言扩展不加例） |

BUMP 链（compose 钉定，全部守卫 9 绿+config 0+两行一致）：BUMP(7b91c44)→BUMP-2(8eed9ca)→BUMP-3(65d78d4)→BUMP-4(e9314be)→BUMP-5(0cc5f2d)→**BUMP-5b(b599d72)=现行 pin**。

**修正采信记录（我的误判，对方/实测纠正）**：①"expect_kps 字符串化"错误（实为 list；真实缺陷=judge 汇总读 kps 字段而数据为 expect_kps 的字段名错配+窄口径重算）②锚定前分布计数 7+2→实测 8+1 ③"学情评估阻塞 20-40s"夸大（实为线程池与检索重叠、15s 封顶——owner 的后台设计早已实现 90%，agent 名就叫"学情与记忆管理"）④E-45 宿主直连副本库写钥匙触发 WAL 事故（协作者护栏警告是对的，.env 注入才是正解）。

## 3. 当前系统状态快照

- 远端=本地=`b9edfa7`（其前 `b599d72`=代码终态=compose 钉定目标）；worktree 干净（仅 repomix 两 untracked）。
- 质量基线：**pytest 671 / vitest 331 / tsc 0**；CI 每 commit 三 job 全绿（逐一亲核）。
- dev 栈（5173）：backend 已重启=最新代码（含全部条款）；frontend=8eed9ca bundle（前端代码此后无变化=当前）。
- 评测栈（18000）：guashuai-eval-backend = **b599d72 镜像** healthy；钥匙走 .env（GO_API_KEY+EMBEDDING_API_KEY，我注入，值零经手打印）。
- 评测副本库：%TEMP%\coagent-eval-data\app.db——**E-45 禁宿主直连**（WAL 跨 OS 锁冲突已出过 disk I/O 事故一次；修复法=停容器→宿主 PRAGMA wal_checkpoint(TRUNCATE)→重启）。
- 评测钥匙换法（owner 亲手，配额紧时批间换）：停容器→改 .env GO_API_KEY→宿主清副本库 GO_API_KEY 行→起容器→下一批。

## 4. 评测三指标现状（两次 9 例跑的实测）

- **Run 1（FIXDEMO 前 9 例）**：断言级幻觉 0/129=0% ✓；适配 7/9=77.8%（钝尺）→校准重判 6/9=66.7%；覆盖 18/21=85.7%（独立复算口径）。
- **Run 2（硬约束后 P1×3 验证）**：3/3 fit 全过（难度 0.6→0.3/0.5/0.4）；L1 引用 P1-01/02 全有效；**速度 4-6 倍**（60-104s/例 vs 367-626s）。
- **Run 3（全量 54 例）**：**owner 待跑**（命令 §6-A）。跑完的数字=提交正式口径。
- 判卷已知缺陷（报告双列复算的依据）：①judge 引用汇总计数错（47/47 vs 逐例加总 21/47）②覆盖聚合 kp_total=0（字段名错配）③两套 level_score 快照（校准对 vs results 条目）数值不同。**报告一律以逐例加总+独立复算为准。**
- L3 素材：3 个未命中 KP 全为语义命中候选（QKV 斜杠记法/长文本应对/LoRA=参数高效微调）；owner 若判语义命中→覆盖 21/21=100%。

## 5. 提交材料状态

| 材料 | 状态 |
|---|---|
| wave2-report.md | ✅ CALIB 已成稿（9+5 披露打勾，基于 Run 1 数字）→ **待全量数字换数**（适配/覆盖/校准三行+锚定对照） |
| manual-review.md | ✅ CALIB 已起草（7 栏）→ **待按全量答案重拟**后 owner 亲签（L3 判定权在 owner，agent 禁代签） |
| 演示视频脚本 v1.2 | ✅ CALIB 回填 2 处 → 待全量终数再核 |
| 数据集材料（画像+中间数据+生成资源 ×2 组） | ❌ 未组装（官方格式；trace-export 端点在案：/api/chat/{dialogue_id}/trace-export） |
| PPT | owner 已委派 PPT agent（我交付了「记忆与上下文机制」两页素材 brief）——状态未回传 |
| 五件套打包/邮箱 | owner（邮箱 602808600@qq.com，压缩包「学校—姓名—作品名—手机号」，视频先压缩试发） |

## 6. 晨间清单（压缩后的我按此执行）

**A. owner 起跑全量（已交付的命令，重贴给 owner 即可）**：
```powershell
cd D:\desktop\coAgent-Learn
$env:PYTHONIOENCODING = "utf-8"
python -u tests/eval/eval_runner.py --base http://127.0.0.1:18000 --batch P1 --tier go --outdir docs/submission/evidence
python -u tests/eval/eval_runner.py --base http://127.0.0.1:18000 --batch P2 --tier go --outdir docs/submission/evidence
python -u tests/eval/eval_runner.py --base http://127.0.0.1:18000 --batch P3 --tier go --outdir docs/submission/evidence
# IF 6 例可选（时间富余再跑）
python -u tests/eval/eval_runner.py --base http://127.0.0.1:18000 --batch IF --tier go --outdir docs/submission/evidence
```
要点：P1 批因初学者硬约束很快（1-2 分/例）；配额紧→批间换 key（停容器→改 .env→宿主清副本库 GO_API_KEY 行→起容器，owner 亲手，key 值不经我）；判卷走 zhipu 免费、embedding 走 SF（不占 go 额度）。

**B. 跑完后的我**：
1. 检查 eval_all.log 三批 EXIT=0 + results 文件（P1/P2/P3 各 18 例）。
2. results-smoke.json+kb-check-smoke.json → evidence\smoke\（防重复计样——judge 会把 smoke 的 P1-01 重复计入，实证缺陷）。
3. 判卷（PYTHONPATH=backend + .venv python + -u）→ **双列复算**（judge 汇总有已知缺陷，逐例加总+独立覆盖复算为准；expect_kps 若为 list 直接用，无需 literal_eval——CALIB 修正）。
4. wave2-report.md 换数（适配/覆盖/校准三行+锚定对照）→ 报告定稿。
5. 数据集组装：挑 2 例（含 trace）→ GET /api/chat/{dialogue_id}/trace-export → evidence\dataset_examples\。
6. manual-review 按最终答案重拟（KP 语义判定+fit 复核+抽签）→ owner 亲签。
7. 雷达图：python tests/eval/eval_report_html.py --evidence docs/submission/evidence。
8. 视频脚本镜 10 核对 → owner 录视频 → 打包。

**C. 挂账（不阻塞提交，已登记）**：T61（三处独立构造 memory_edit/chat_context/outline_service）、T62（coerce_score [0,1] vs -1~1 口径）、T63（记忆机制对账——**T63 行还没登记进看板**，对账全文在 docs/progress/memory-audit-20260905.md，主干已实现、缺口 6 项：四件套 schema/预提醒/跨会话按需读取/薄弱点翻转/时效分治/禁发降级——见 §7）、glm-4.7 补轮（owner 决策）、run_eval 聚合缺陷修复（协作者）、学情后置化确认（owner 设计已实现 90%——混合式：并行重叠+15s 宽限+写表+下次读表）、BUMP-2 S7（SSH 评委复验，建议打包前对最终 pin 走一遍）。

**D. 待 owner 的决策/动作**：①起跑全量（§6-A）②manual-review 亲签 ③录视频 ④PPT agent 产物核收 ⑤glm-4.7 补轮与否。

## 7. 本夜新登记（看板已含）与待登记

- 已登记：决策 43、E-43/E-44/E-45、T61/T62、FIXAUX-3b/CALIB 等全部验收行、两处总领误判修正（字符串化→字段名错配；锚定计数 7+2→8+1）。
- **待登记（压缩后第一件事）**：T63 行（记忆机制对账指针→docs/progress/memory-audit-20260905.md；主干已实现、缺口 6 项）+ 评测结果行（全量跑数完成后）。

## 8. 关键命令备忘（压缩后的我直接用）

```powershell
# 判卷
$env:PYTHONPATH="backend"; $env:PYTHONIOENCODING="utf-8"
.venv\Scripts\python.exe -u tests\eval\eval_judge.py --evidence docs\submission\evidence
# 雷达图/HTML
.venv\Scripts\python.exe tests\eval\eval_report_html.py --evidence docs\submission\evidence
# 评测栈刷新（新镜像 CI 绿后）
docker compose -f deploy/docker-compose.yml -f deploy/eval-override.yml up -d backend --force-recreate
# 两行核对
git ls-remote origin refs/heads/master; git rev-parse HEAD
# CI 代核（API 免凭据）
curl.exe -s -o "$env:TEMP\opencode\ci.json" "https://api.github.com/repos/tpys11/CoAgent-Learn/commits/<sha>/check-runs"
# 评测栈日志
docker logs guashuai-eval-backend --since 60m
```

## 9. 协作关系与边界（本夜实践沉淀）

- 协作者 seek-end（tests/eval 领地）：今晚我方接修了其 P0-1（FIXEVAL）——**须通知其 pull**（456119d），其自研修复若已在途会撞车；其 7 笔 EVALOPT 全部 CI 绿未验收（等其交付跑数+报告时我按领地验收）。
- 领地边界裁定：tests/eval 归协作者；backend/skills/frontend 归我方派发；结构性需求（如 upload-progress 后端语义变更）经我派发，不直改。
- 双轨制：docs/progress/* 与 docs/submission/* 本地不入库（docs/* gitignore）；入库白名单=代码+tests+PROGRESS.md+step-*.md（-f）。

## 10. 风险与异常预案

- 跑数中断（配额/网络/卡死）：批间可换 key（§3 配方）；批内卡死→owner Ctrl+C→重跑该批（入库 hash 去重不重复消耗）。
- 判卷 zhipu 通道失败：--judge-provider sf 备选（需 --replica-db 读凭据——**E-45：只读连接也有 WAL 可见性陷阱，sf 通道需 replica-db 时先停容器再读**）。
- 评测栈 backend 重启后 settings 空（已发生过一次）：钥匙从 .env 重播种即可，runner 走 .env 回退链。
- 任何非预期红：停止上报，不扩修（owner 在场时转派发单流程）。
