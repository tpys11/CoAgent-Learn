# CoAgent-Learn 优化进度看板


> 总领会话唯一状态载体。由总领维护，实现性会话只读不写。
> 配套：`LEAD_SESSION_PROMPT.md`（流程）、`SINGLE_STEP_EXECUTION.md`（历史步骤定义，**已过时**——当前轮次以 `docs/dispatch/` 单页为准）、`OPTIMIZATION_PLAN.md`（问题证据）
> **📦 归档指针（2026-08-31 拆分）**：已闭环轮次的完整记录（C1…F8 步骤表与插注、分发记录 20 行、文件冲突矩阵、§1.2.2-1.4 执行史、§2 待核实/部署就绪/依赖/环境 E-1…E-25/E-27/E-28/E-30…E-33/E-36、§2.5 B-8 专节、§3.1/3.2/3.4/3.5、关闭 T 项 T1-T47/T53/T54/T56、旧交接归档行、下一轮衔接详版）→ `docs/progress/archive/board-2026-08.md`（**拆分前全量快照**，移动非删除，可溯源）

## 0. 元信息

| 项 | 值 |
|----|-----|
| 基线 commit | `4a1a7cf`（2026-08-29，分支 `master`，工作区干净） |
| 看板初始化 | 2026-08-29 |
| **当前基线（实测）** | 后端 pytest **418** / 前端 vitest **117** / tsc **0**（F11 终态，总领亲测 2026-08-31）；历史演进（241→364 增量、回归耗时 302s→50s 曲线）见归档 §0 |
| **代码规模** | 后端 68 个 Python 文件 / 9678 行，最大文件 `pipeline_v2.py` 628 行；前端 57 个 TS/TSX 文件 / 10878 行（N3 时点） |

---

## 1. 步骤序列与状态

状态取值：`待分发` / `进行中` / `已完成` / `受阻`。
已闭环轮次（C1/C2/N1/C3/F1/C4/F2/P1/N2/F3/F5/F6/F4′/D 组/A 组/B 组/N3/N2②/F7/F8）全部 ✅——记录见归档 §1 与 §5。

### 1.1 分发记录（近两轮 + 当前队列）

| Step | 提示词位置 | 生成时间 | 会话状态 |
|:----:|-----------|---------|:--------:|
| **F11** | `docs/dispatch/step-F11.md`（2026-08-31） | 2026-08-31 | **✅ 已完成并经总领验收（含 S5）**（5 commit `7aa70bf..9506cbb` 已 push 两行一致；总领亲证 pytest 418 / vitest 117 / tsc 0；**S5 trace-export 冒烟亲测 HTTP 200 + attachment + 五类数据键齐**；正文后审核块 DOM 零残留；真实库零接触；交接 `docs/progress/step-F11.md`） |
| **F12** | `docs/dispatch/step-F12.md`（2026-08-31） | 2026-08-31 | **✅ 已完成并经总领验收**（5 commit `332a0b5..9282114`，S5 纯验证零 commit；总领亲证三绿 **pytest 433 / vitest 133 / tsc 0**；push 两行亲核一致；**独立变异抽查** S0 守卫恰红→还原绿；f12tmp 零残留；真实库 10946 未动、T50 领地零触碰；残余 grep 定性=良性注释。**交接亮点**：S0 边界判定三证据（agents 持久化共用故保留）；T56 定位 self-correct（:474 base_system）；**KnowledgeView 假编辑死视图新证——入口去留待 owner 拍板**；被否 5 条（首条「不改后端存储 schema」取舍正确）。交接 `step-F12.md` + 截图 `f12-shots/`） |
| **EVAL-1 Wave 2** | 解锁提示词 2026-08-31 交付 owner | **🟡 工具链就绪、跑数挂起**（**owner 停令：系统未完成前零 API 花费**——停令执行经总领亲证：B1 起 18 例零启动 / evaltmp 栈与副本库零残留 / 真实库 kb_vectors 10946 行未动）。**已交付**：tests/eval 工具链 5 件（60 用例集/runner/judge/stackprep/kb_manifest）smoke 实证；视频脚本 v1.1 终稿（占位全替换，仅镜 10 指标数字待回填）；kb-slice 清单（**09-04 决策 39 改版：AI-Agents 移除→线代讲义替补，9 份全仓库内，块数待重测**，MinerU 零调用）。**挂起期加任务（总领 08-31）**：补三份提交材料——单元测试覆盖说明（映射协同调度+生成准确性核心模块）/方案文档「领域泛化与可迁移」章节/数据合规脱敏说明（零 API 零跑数）。**遗留：tests/eval 工具链入库待 Wave 2 收口拍板**（test_eval_judges 以 importorskip 守卫 CI 跳过，入库后取消）。**复跑**：4 命令（stackprep→起栈→runner→judge+汇总）约 3-4h，工具链无需重做；触发信号=owner 宣布系统完成（F12✅+F9✅+F10+F13+N5+X-2 走完）+ 承接 F9 移交的 LLM 兜底真网补测 |
| **N4** | `docs/dispatch/step-N4.md`（2026-08-31） | 2026-08-31 | **✅ 已完成并经总领验收**（零产品代码零 commit；总领复证：asset hash `BamDsZ3q→CwQ0gpfd` ✓ / 双容器 healthy 且跑本地构建镜像 ✓ / katex 资产在包 ✓ / GET 200 ✓ / **backend 挂载字节级实证存活**（main.py 15226B 与宿主一致 + skills 23 + tests 72）✓ / healthz+S5 复烟 200 ✓；build 60s。**总领认领派发单口径错**：S1 `context: ..` 实测失败，正确=CI 同源 `../frontend`（派发单已修正）；实测副产物 `--build` 连带 recreate backend（挂载无损）→ `--no-deps` 必带（已修正）。**遗留一条：bundle 对齐 9bdecef 时点，F12 收口后重跑 S2/S3（--no-deps）对齐终态**。交接 `docs/progress/step-N4.md`） |
| **F9** | `docs/dispatch/step-F9.md`（2026-08-31） | 2026-08-31 | **✅ 已完成并经总领验收（T1 全套）**（7 commit `6c77fae..c4f6370`；**CI 徽章亲核 success**=Linux 首验三绿 481/144/0；总领独立变异抽查 purge 守卫恰 1 红→14 绿；真实库零接触；T50 领地零改动+防御守卫 14 条；三问全答+被否 7 条）。**上报裁定**：①留存面板浏览器留证缺→视频录制自然覆盖 ②LLM 兜底真网实证→折 Wave 2 承接。**dev 栈已对齐**：ro 备份 149MB→backend 重启自动迁移（2827 节点全带 id/parent/level，幂等零丢失）→bundle `CB2Q9z9a` |
| **F10** | `docs/dispatch/step-F10.md`（2026-09-01） | 2026-09-01 | **✅ 已完成并经总领验收（T2）**（3 commit `4b1c430/fcd3f2c/7f5563d`（S3 守卫形态零产品代码）；**CI 徽章亲核 success**=Linux 三绿 487/162/0；总领独立变异抽查 kg_edges 摘除→**3 红**→6 绿；E2E 真实教材 UI 全链（补传→打断→跳过→恢复→删课四表零残留+快照 49 项单调）；时序事故如实披露§4（长写事务禁重启，E-38 同类）；复述门两修正实证纠正 F9 §6.3 误报）。**移交 T57**：resources/file_hashes 删课残留 |
| **F13** | `docs/dispatch/step-F13.md`（2026-09-01） | 2026-09-01 | **✅ 已完成并经总领验收（T2）**（5 commit `133a792..ce3fe2a` 含 S4 双缺陷修复；**CI 徽章亲核 success**（tests+双镜像）=Linux 三绿 495/175/0；入库清单 3 文件 git ls-files 亲证；总领独立变异抽查 .dockerignore 守卫恰 1 红→8 绿；打开矩阵四分支+pypdf 元数据+加入课程 439 chunks 检索命中全实证；镜像 frontend +2MB/backend 持平=108MB 零进镜像；真实库 10946 零写（T49 口径披露 3 条幂等页数缓存）。**dev 栈已对齐**：备份→重启（preset-library 3 领域在位）→bundle `LWCU37Ba`） |
| **F14** | **AI 服务整合轮**（三层模式首轮） | **S1-S5c ✅ 正式验收** | **S1-S5c 代码验收通过（T2 全套）**：18 commit `0973fa0..e069027` 对照设计 §2；f14 后端 24+vitest 205+tsc 0 双条件；变异②exclude_unset 恰 1 红（F8 E4 钉）+变异①存活=纵深防御；**CI：e069027 failure（probe 测试宿主 .env 依赖）→总领修 `2915e81`→徽章 success ✓**；真实库 10946 未动；dev 栈对齐 `BuMoXeg2`；执行层泄漏五项→E-39；详情 `docs/progress/step-F14.md`。**S6 E2E ⏳ 待 owner 在 f14tmp UI 填 Zen key**（A4/A5 活体，通过即整轮关闭） |
| **N5** | ~~compose 重钉+README+pull 复验~~ **前半=拉取路径探针 ✅（09-02 总领亲测）**：从零 clone(9.7MB)→匿名 GHCR pull→无 override/无 .env 纯 compose up→双容器 healthy→healthz/前端 200→评委首屏空态正确（E-26 种子在）——**CANTOPEN 风险排除，交付出无病**。**后半 ✅ 全部闭环：终钉=BUMP（91b1f6b）、无 .env pull 复验=JUDGE（评委路径 0/1 门槛通过）；T52 假空格提示语为唯一遗留待派发** | 前半+终钉+pull 复验 ✅ / T52 提示语待派发 | 预期体验轮收口后一次完成；探针发现：container_name 硬编码致本机探针须停 dev 栈保真跑（评委机无此问题，E-35③ 同类已备案） |
| **F15** | KnowledgeView 死视图删除（T58，直发微轮；提示词总领出） | 待派发 | 一笔 commit；tsc 0+vitest 全绿+CI 徽章；可与 N5 任意排序 |
| **R-B** | **思维链改道**（X-2 首批：草稿入链+正文终稿化+规划/策略/检索增厚；owner 底线=正文只收终稿） | **✅ 已验收（靶向）** | **5 commit `249a4e7..e458d3c`；CI 徽章亲核 success=524/228/0；发射行 L480/L664 逐字原样、5 行删除全映射预批项、越界两处有批准与标注；总领亲放变异①恰 1 红→14 绿；vitest 新面 answerChain10+answerReset4+answerTerminal7+chainDraft6；交接九节+6 证据齐**（`step-RB.md`）。遗留：重写 #0 命名 0-based、merge_consecutive 微差——owner 观察点。**F14 S6 重定义为 R-A（测试档）收口 E2E 一并做** |
| **R-A** | **设置页 v2**（X-2 第二批：测试档+自检四项+合并栏+清理；owner 需求逐条固化） | **✅ 已验收（靶向）** | **5 commit `4aedd86..62969fc`；CI 徽章亲核 success=533/242/0；pipeline_v2/ResourceChatPage 零触碰亲证、review.py 恰为预批分支；变异①亲放恰 2 红→还原 5 绿；小字三串常量化（serviceGroups.ts:13/16/19）+toBe 钉死+挂载亲证（:148/:240/:264）；三处越界申报吻合；交接齐**（`step-RA.md`）。**前提修正认领 ×2**：vl_api_key 空串在 T51 下本不打空（总领派发单前提有误，同值写仍必要）；SelfCheckCard 预置缺陷（嵌套读）顺带修复。**下一步=owner 冒烟测试档（=F14 S6 收口）** |
| **R-A2** | **R-A 冒烟反馈修复**（owner 4 条：①主模型行应显 dsv4f ②审核行显具体名+短语改名 ③Zen key 输入清空=前端 :136 主动清空（后端无病）④气泡缺模型名+bge 清算+独立审核气泡） | **✅ 已验收（含补充修复）** | **4 commit `a20c159..2a14869`；补充修复=打回单条（selfCheck.ts:76 短语→「审核模型（研究档判卷走主模型）」+反向断言 not.toContain 防回潮），总领亲核：旧短语仅存注释、新短语在位、两行一致；全量 534/255/tsc 0；三红线零触碰；气泡双联+bge 清算全过**。总领认领：派发单根因①误判（SelfCheckCard:38 早直读 LS.model）。**owner 复验=F14 S6 收口** |
| **R-A3** | **冒烟反馈第二轮**（owner 2 条：①主通道行仍显 Qwen2.5-72B=LS.model 历史杂值回显，且 pipeline_v2:170 证实发送路径真认该值=显示+发送双治 ②测试档 key 保存反馈弱+立即检测未按档位选探测源） | **✅ 已验收（靶向）** | **2 commit `487bbff..70833e1`；CI 徽章亲核 success=534/268/tsc 0；五文件零后端亲证（pipeline_v2/review/settings/embeddings/config）；变异①亲放恰 3 红→还原 10 绿（首放无效自检抓到，按真实行重放）；resolveChatModel 双参化=标准档钉死 dsv4f 无视杂值+zen 取 LS.model；自检探测源档位感知 chat_zen；zhipu 遗留态自裁备案获准（评委 fresh clone 不触达）；交接齐**（`step-RA3.md` 被否 7 条） |
| **R-C1** | ~~测试档全链 zen 化~~ | **❌ 取消（吸收进 R-D）** | owner 拍板架构层动刀：辅助链 zen 化=R-D 注册表 test 档格子的固有语义，RC1 补丁作废（step-RC1.md 头部标注废止） |
| **R-C2** | **思维链内容化二批**（①检索视窗内容块+点击展开 ②规划节点流式先行） | ✅ 验收通过（T2，4b8f1ff 前push=3c25b3d） | CI success=**575/314/tsc 0**；变异①亲放恰 1 红（test_hits_doublewrite_consistent AssertionError）→还原 5 绿；S2 超单改动追认（删 is_rule_simple 短路，owner 裁定，except 回落保留）；越界三处逐一追认（复述门预批出处）；**派发单前提纠偏第 4 次认领**（RB-S4 已落地 plan_thinking 流式，总领侦察锚点过时）；E-40 对齐完成（双容器 force-recreate+字节一致 53061B+探针三值正常）；遗留=is_rule_simple 孤儿函数+md 解析格式耦合（测试双向钉住，10 月窗口）；**owner 复验=F14 S6 收口：研究档对话→检索观察窗命中卡片→点击展开→刷新回看↗不丢→规划节点先行流式思考** |
| **R-C3** | **思维链体验三修**（①规划真思考+废节点治理 ②检索块搬进检索视窗 ③审核不可解析真因修复） | ✅ 验收通过（T2，push=c174382） | 4 commit ef5bbea..c174382；CI success=**584/322/tsc 0**；变异②亲放恰 3 红（文案×2+重试×1 AssertionError）→还原 5 绿；S4 双重指纹+20s 单次重试实现与单吻合；**如实上报两项追认**（big-pickle 真网实测未走通=宿主无 ZEN key 凭据纪律正确，静态结论入交接；非 429 失败也显限流文案=后果诚实归因可能不精，10 月改进）；E-40 对齐（双容器 --build+字节一致 review 15116/planning 3825+bundle 新 hash）；**owner 复验=规划 2-3 句分析/链节点真实名/命中卡片在观察窗/审核跳过文案如实** |
| **R-D** | **ModelRegistry 架构轮**（owner 授权动刀：模型供应收敛为角色×档位注册表，OpenCode 设计参照；判卷路由/辅助链/前端三 resolver 全部吸收；决策 38 语义内建；vision 吞没；E-40 强化核对） | **✅ 已验收（靶向+现场演示）** | **5 commit c32a716..1f6bb2f；CI success=567/305/tsc 0 亲核；五红线零触碰（compress 解禁仅 +6/-1）；变异①亲放恰 20 红→还原绿；E-40 亲核三文件字节一致+四挂载+探针三值；「改一格换模型」现场演示成功：MODEL_ZEN_TEST 一行→restart→fast/main/vision 三角色同步切换→还原回归（容器内 resolve_model 实测）；辅助链 14 处收敛+vision 吞没+resource_gen 注册表决策；微偏差三处追认（skills 5 处 owner 裁定/compress 解禁 owner 批准/契约微变 zhipu→注册表 main）；交接含盘点表+14 格终值+双源同值+被否 6 条**（step-RD.md）。**owner 复验=测试档全链（F14 S6 收口）** |
| **R-A4** | **冒烟反馈第三轮**（owner 3 条：①Zen key 保存无持久反馈 ②测试档开关**取消确认框直接切**（owner 推翻派发单交互）+不亮修复（根因=key 未存时 zenBaseUrl 空守卫只发瞬时 flash 即 return）③删测试档卡审核子开关、合并栏独立审核气泡右端加开关+小字「关闭后需要审核时自动采用主模型」） | **✅ 已验收（靶向）** | **3 commit 20e8f67..d5b1bfe；CI success=534/285/tsc 0 亲核；五后端文件零触碰；变异②亲放恰 1 红→6 绿；交接含三态矩阵/语义边界/被否（flash 态已配置被拒——违反持久渲染原则）**；漂移上报规范（7f063f1≠e736d93 如实报）。**T59 登记见 §4** | **🔄 `docs/dispatch/step-RA4.md`（09-01，微轮直发，零后端）**——S1 Zen 持久已配置徽标/S2 直切+依赖链持久提示+删子开关/S3 合并栏开关（follow_main 反转）+语义边界（标准档 ON 未配 research 时判卷回落主模型=10 月议题）/S4 变异×2 |
| **R-A5** | **结构收敛+冒烟第三批修复**（owner 授权重构：审核路由三处复刻收敛为 resolve_review_route 单一事实源+GET effective_model；Zen key 专用保存通道；气泡上下排列；开关 ON 补写 research 兑现气泡承诺。**E-40 背景**：反馈①③主因是后端容器陈旧，已当场重建） | **✅ 已验收（靶向）** | **3 commit 5a7665..5ef6fca；CI success=542/293/tsc 0 亲核；六红线零触碰；E-40 首演通过（容器 17548B==宿主字节口径+GET effective_model 活体=Big Pickle）；变异①亲放恰 5 红→还原 13 绿；微偏差两处追认（serviceGroups/types.ts）；交接含收敛对照表+五态矩阵+被否 6 条**（step-RA5.md）。**T60 登记见 §4；owner 复验=F14 S6 收口** |
| **GO** | **测试档第二通道 go**（owner 09-04 直令总领直改：主 GLM-5.3-Flash/审核 Qwen3.8 Flash、zen/go 开关互斥——开 A 自动关 B、关 A 不动 B、全关=标准档） | **✅ 已完成（5 commit S1-S4+S6）** | S1 REGISTRY go 档定值格+TEST_CHANNEL 定向+pick_judge go 分支（8edc397；14 守卫+矩阵守卫 2→3 档更新，变异亲放恰 1 红）/S2 settings GET/PUT go 节+test_channel 白名单+chat_go 探测（6cbb635）/S3 前端镜像 go 常量+三参化+LS.goBaseUrl+saveGoKey 专用通道（2c87019）/S4 测试档卡双通道互斥 UI+go 卡+selfCheck go 分支（db57be8）/**S6 owner 截图实测校正：API ID=小写 glm-5.3-flash/qwen3.8-flash、go=zen go 计划子通道（GO_BASE_URL 默认值+key or 链 GO\|\|ZEN 复用 Zen key，双模型 chat/completions 实测 200 通）+detect_tier go 前置 zen 子串判定（顺序守卫新增）+前端零配置路径（38c2b8c；变异恰 2 红）**；tsc 0+vitest 322+pytest 619；**dev 栈未重建**——复验前须双 -f up -d --build（E-40 守则） |
| **ZAI** | **测试档第三通道 Z.AI**（owner 09-04 直令总领直改：bigmodel 官方端点、主审同模型 glm-4.7、专用记忆机制测试、三通道互斥） | **✅ 已完成（2 commit C1+C2）** | C1 REGISTRY zai 档定值格+TEST_CHANNEL 扩 zai+detect_tier 双参化（URL+model 防 zhipu 端点冲突误判）+pick_judge zai 分支+settings zai 节+chat_zai 探测（3b87353；15 守卫+矩阵守卫 3→4 档更新，变异亲放恰 4 红）/C2 前端三并列 UI（Z.AI 行开关+Key 输入+徽标+小字「同模型自审·专用于测试记忆机制」）+镜像双源同值⑦⑧+四参化+saveZaiKey+selfCheck zai 分支（d0d5d62）；tsc 0+vitest 329+pytest 634。**Key 须 owner 填**（bigmodel.cn，无跨通道兜底）；**dev 栈未重建**——复验前须双 -f up -d --build（E-40 守则） |
| **BUMP** | `docs/dispatch/step-BUMP.md`（2026-09-04） | 2026-09-04 | **✅ 已完成并经总领验收（T3）**（3 commit `91b1f6b..c23d9bb` push 两行一致；compose 双 image 换钉 `7b91c44`（frontend :6/backend :32），diff 恰单文件 +2/-2；GHCR 双镜像 manifest exit=0 实证存在；pytest 9 绿+config exit 0；交接 `step-BUMP.md`；第三笔 c23d9bb=交接内容勘正 docs commit） |
| **JUDGE** | 派发单总领会话 09-04 直出（纯验证轮未入库） | 2026-09-04 | **✅ 已完成并经总领验收（T3 纯验证，零 commit 零足迹）**：从零 clone 24MB→无 .env config exit 0→pull 钉定双镜像（tag=7b91c447 两行原文）→up 23s 双 healthy→/healthz 200+前端 200+bundle 200+Playwright 首屏空态正确→down 零残留→dev 恢复双 healthy 双探针 200。偏差：D1 逐次代理 clone 零残留；D3 --build 受阻 Docker Hub/npmjs 断连（E-43）以免 build 等价替代——`7b91c44..HEAD` 零代码 diff 已总领独立复核，正式补跑遗留；**总领认领派发单两误**：S3/S5 漏 `-f`（D4 执行会话按 README 修正）、compose images 应 up 后采集（D2）。交接 `docs/progress/step-JUDGE.md` |
| **FIXLLM** | 派发单（总领 09-04 直出） | 2026-09-04 | **✅ 已完成并经总领验收（T1）**（一笔 commit `4c9972e`：base_llm 三缺陷=chat 重复 max_tokens kwarg（d5e65a5 引入）/chat_stream 空 choices IndexError/except 块外 str(e) 吞真实异常；+4 守卫假件零真网，三变异恰红→复绿；pytest 638=634+4 精确吻合，rebase 后复跑；rebase 吸收协作者 3 EVALOPT 提交零冲突；dev 栈 restart 生效 healthy；**CI Run#53 success 总领 API 代核**；交接 step-FIXLLM.md 总领归档入库；遗留=空 chunk 尾部特化用例与 429 文案守卫（低优先）） |
| **FIXAUX** | 派发单（总领 09-04 直出） | 2026-09-04 | **✅ 已完成并经总领验收（T1）**（一笔 commit `8eed9ca`：①_make_llm/_make_fast_llm 档位感知——测试档 key=注册表格优先、严禁 DEEPSEEK 兜底（决策 38 契约闭合），standard 逐字节不变守卫钉死 ②think_then_json ast.literal_eval 单引号 JSON 兜底 ③S6 zen→go 复制清除+对称 zai 禁走守卫；+8 守卫，三变异恰红→复绿；pytest 646=638+8/vitest 331/tsc 净；push 一次过两行一致；dev restart healthy；**上报三条独立构造不扩→T61**；交接 step-FIXAUX.md 总领归档。**⚠️ 遗留 P0：compose 钉定镜像（7b91c44）已落后 FIXLLM+FIXAUX 两轮修复——BUMP-2 提交前必做**） |
| **FIXAUX-3** | 派发单（总领 09-04 直出，含参考源三件：Z.AI 官方文档/Pi opencode-go 元数据/OpenCode Zen 模型表） | 2026-09-04 | **✅ 已完成并经总领验收（T2）**（一笔 commit `d83bd73`：chat() 缺省与 chat_with_json 硬编码 2000→8000——思考型模型 glm-5.3-flash 实测 reasoning 4543 tok 烧穿 2000 致正文为空（P1-P5 探针 + Z.AI 官方「thinking 仅 enabled 不可关」+ Pi 元数据 supportsReasoningEffort=Yes/maxTokens=131072）；守卫改名+新增共 5 条，双变异恰红→复绿；pytest 647=646+1 精确吻合；显式入参回归控制同轮验证；push 一次过两行一致；CI d83bd73 success 总领代核；dev restart healthy。effort 旋钮（go 端点 reasoning_effort=low，P4/P5 实测推理归零延迟减半）→ FIXAUX-3b 加附单已备待发） |
| **IMGKEY** | 派发单（总领 09-04 直出） | 2026-09-04 | **✅ 已完成并经总领验收（T2）**（一笔 commit `5ad13df`：四处 skills 提示词收口——gen_guide/gen_report/gen_diagnosis IMG 标记指令+gen_image 提取词，搜索关键词英文化（Wikimedia/Openverse 中文检索命中档案杂物的落库实证根因）；+5 源级守卫（含「搜索链无翻译层」反向锁定），两轮变异恰红→复绿；pytest 656=651+5 精确吻合；push 一次过两行一致；**CI 5ad13df success 总领代核**；dev restart healthy；standard 档同受影响=预期内（英文检索对各档均优）；交接 step-IMGKEY.md 总领归档） |
| **FIXEVAL** | 派发单（总领 09-04 直出；owner 拍板接修协作者 P0-1，其领地单文件碰撞由 rebase 兜底） | 2026-09-04 | **✅ 已完成并经总领验收（T2）**（一笔 commit `456119d`：_poll_progress 双信号收口——error 判定后追加库内事实兜底（/api/knowledge/list 该 source chunks>0 即 ok via=doc-list），根治进度内存字典三形态（直投不写/重启丢/enhance 重置后异常吞）轮询永等 900s 假性卡死=协作者 P0-1；快路径/error/timeout 逐字节保留；+4 守卫全假件，变异恰红→复绿；pytest 660=656+4 精确吻合；两处偏差如实上报均采信；push 一次过两行一致；CI 456119d success 总领代核；**零 docker 动作**（runner 宿主进程即生效）；交接 step-FIXEVAL.md 总领归档。遗留=协作者同步知会（防其重复修复）） |
| **FIXDEMO** | 派发单（总领 09-04 直出） | 2026-09-04 | **✅ 已完成并经总领验收（T2）**（一笔 commit `e9314be`：主生成链 base_system 追加【难度适配】（prev_score 非 None 时注入画像水平+贴合要求，None 整块不出现）与【术语规范】（关键术语中英对照：QKV/KV缓存等）两块——适配 77.8%/覆盖 85.7% 两指标未达标的系统层根因（画像等级从未进提示词）；+3 源级守卫（含 T56 公式格式回归锚），双变异恰红→复绿；pytest 663=660+3 精确吻合；push 一次过两行一致；**CI 三 job success 总领代核**；dev restart healthy；交接 step-FIXDEMO.md 总领归档。**口径观察采信**：coerce_score [0,1] vs resource_branches 既有 -1~1 标注的存量矛盾→T62） |
| **FIXAUX-3b** | 派发单（总领 09-04 直出） | 2026-09-04 | **✅ 已完成并经总领验收（T2，交接未回传按 commit+CI+回归链验收）**（一笔 commit `65d78d4`：_thinking_kwargs go 端点子串+thinking=False → extra_body reasoning_effort=low（Pi 元数据 supportsReasoningEffort=Yes + P4/P5 实测推理归零、延迟 23s→12-15s）；+4 源级守卫（zen/v1 防误扩、deepseek 回归锚）；恰红实证在其 commit message；pytest 651=647+4（FIXAUX-3 S3 回填核验）；CI 三 job success；**全部今晚评测/复验在其生效态下运行零事故**。交接文档未回传=唯一缺口，容后补） |
| **BUMP-4** | 总领直改（授权模式） | 2026-09-04 | **✅ 已完成**（compose 双行换钉 `e9314be` 全修复链+IMGKEY+FIXDEMO 终态；守卫 9 绿+config exit 0；push 两行一致；**评测栈镜像同步刷新后重跑 9 例见 EVALOPT/结果行**） |
| **CALIB** | 派发单（总领 09-05 直出） | 2026-09-05 | **✅ 已完成并经总领验收（T2）**（一笔 commit `6c36d18`：DIFFICULTY_RUBRIC 追加五档锚定量表——**原 rubric 缺 0.0-0.4 低段锚**（只有 0.4-1.0 三档），glm-4-flash 锚定 0.6 下沿致 9 例恒 0.6 的真根因；level_score 禁入 prompt 红线（独立性，守卫②钉死——防适配指标循环失义）；+3 源级守卫，双变异恰红→复绿；pytest 669=666+3 吻合；push 一次过；**CI 三 job success 总领代核**。**锚定效果**：评分分布 {0.6×8,0.4×1}→{0.6×5,0.8×4}（高端判别改善，P2/P3 偏差降至 ≤0.1；低端 P1 三例仍 0.6=生成侧真未简化，适配终判 6/9=66.7% 如实呈现——总领此前记 7+2 经实测存档修正为 8+1 采信）。**总领诊断修正采信**：「expect_kps 字符串化」实测未复现（全为 list，总领抽查脚本的 str() 显示误导）；真实覆盖聚合缺陷=run_eval 读 kps 字段而数据为 expect_kps 的**字段名错配**+窄口径重算（47 vs 21）。三指标终值（独立复算权威）：幻觉 0/129=0% ✓ / 适配 6/9=66.7% ✗ / 覆盖 18/21=85.7% ✗（与总领独立复算交叉验证一致）。产物：wave2-report.md（9+5 披露打勾）+ manual-review.md（7 栏待 owner 亲签）+ 视频脚本 v1.2 回填 2 处；交接 step-CALIB.md 总领归档。遗留=glm-4.7 补轮决策、run_eval 聚合缺陷修复排期、FIXDEMO-2 适配真修（已派发待跑）） |
| **FIXDEMO-2** | 派发单（总领 09-05 直出；owner 拍板路线 A） | 2026-09-05 | **✅ 已完成并经总领验收（T2）**（一笔 commit `0cc5f2d`：pipeline_v2 【难度适配】块后追加 prev_score<0.35 分支【初学者模式·硬约束】五条（禁公式推导/生活化类比先行/术语白话解释/篇幅减半/下一步建议）——校准判卷实证初学者三例偏差 0.3-0.35 系统性超容差的生成侧真修；+2 源级守卫（阈值分支+行序结构），变异恰红→复绿；pytest 671=669+2 吻合；push 一次过两行一致；**CI build-push success 总领代核**；S5 重启时间线核验自洽（commit 02:49:35→容器 02:50:42）+总领补重启双保险；遗留=真网效果验证（总领侧 P1 验证批进行中）与 -1~1/[0,1] 口径（T62 不变）；交接 step-FIXDEMO2.md 总领归档） |
| **FIXASSESS** | owner 直令"修"（09-05 晨） | 2026-09-05 | **✅ 已完成并经总领验收（T1 直改授权）**（一笔 commit `b72c164`：assess.py:24 学情评估 think_then_json 第三参空串→`message[:800] or 兜底指令`——E-46 Console Go 收紧空 user content 校验致 assess 3 重试全败→level_score 兜底 null→适配列全 None；+2 守卫（真 chat_stream 捕获断言非空 user+空消息兜底分支）；pytest 673=671+2；CI 三 job 绿；BUMP-5c 钉定+评测栈重建 healthy；废跑 6+ 例归档 hold\（含 400 日志）。连带清点→T64） |
| **FIXRUN** | 总领直改（owner 重跑前拦截授权） | 2026-09-05 | **✅ 已完成**（一笔 commit `1f8366e`：eval_runner new_dialogue 对话 ID 嵌项目 ID 尾段——旧 `edlg-<case>` 写死跨跑复用旧对话历史（同题 4 次跑数问答对累积，实证于 E-46 排障日志的 assess「近期对话」）；ensure_project 每跑新建项目⇒对话随跑全新，旧脏对话自动孤儿零清理；+2 假件守卫（跨跑必异/跑内幂等）；pytest 675=673+2；runner 宿主进程即生效零 BUMP。**该修复同时揭出 FIXPIPE 存量缺陷**） |
| **FIXPIPE** | 总领直改（09-05 提交优先续行，修法已先行报备 owner） | 2026-09-05 | **✅ 已完成并经总领验收（T1）**（一笔 commit `a8a1204`：pipeline_v2 S3 回收后 `assess_score` 非空则覆写 `prev_score`——原 :343 生成提示词只读画像缓存，全新对话首问【难度适配】/【初学者硬约束】永久失明=**全量判卷 P1 适配 2/17 崩塌根因**（E46 废跑正常恰因旧对话复用带历史分 0.25；真实新用户首问同踩）。assess 失败保留缓存值；双无维持 None 语义；+1 源级守卫（接线三锚：S3 回收后/难度适配条款前/硬约束条款前）；pytest 676=675+1；**CI 三 job 绿**；BUMP-5d 钉定（872c01f）+评测栈重建 healthy（a8a1204 镜像）；P2/P3 不受影响（level≥0.4 不走硬约束且 fit 已 100%）；**P1 二轮 18/18 零错误完成（11:21，全新对话尾号 17177625），适配 16/18=88.9% ✓**） |
| **WAVE2 终判** | 全量 54 例三指标终数（judge 统一重判 + 独立复算双列） | 2026-09-05 | **✅ 终数落定（正式提交口径）**：**幻觉 虚构 0/claims 744 ✓**（无支撑 42=检索缺口 34+无引用 8；L2 异厂复判 54/54 False；陷阱 0/18）｜**适配 48/50=96.0% ✓**（P1 二轮 16/18=88.9%，塌陷版 2/17 前后对照；P2 17/17、P3 15/15 均 100%；校准 n=50 偏差 0.089/绝对 0.117）｜**覆盖 76/112=67.9% ✗**（P1 篇幅减半条款的字面命中张力 71.1%→63.2% 如实披露；36 条未命中全进 L3 判定桶）；L1 引用无效 139/375=37.1%（逐例加总；judge 聚合 375/375 为已知缺陷§5）；审核门 41 打回/25 例；valid_ratio 52/54=0.963。产物：wave2-report.md v2（11 项披露）+ manual-review.md v2（抽签 6/54=11.1%，判定框待 owner 亲签）+ 雷达图 report.html 刷新 + dataset_examples 两组 |
| **EVALOPT（协作者 seek-end）** | 交接文档 v2（总领 09-04 出，决策 43） | 进行中 | **🟡 进行中**（已 push 7 commit c06eb75..86d6196：judge v1.1 zhipu 异厂判卷+陷阱诱捕、雷达图 HTML 报告、runner go 档默认+--limit 每批截取（**owner 拍板 3×9=27 例**）、stackprep 档位落库+GO_API_KEY 副本库→.env 回退解析、灌库后台直投；CI 各笔全绿 Run#51-52 success；领地纪律=仅 tests/eval 未越界；待其交回跑数+报告后总领验收） |
| **BUMP-2** | 派发单（总领 09-04 直出） | 2026-09-04 | **🟡 S0-S6 ✅ / S7 续行中**（2 commit `4721148`+`738af05`：compose 双行换钉 `8eed9ca` 修复终态，diff 恰 +2/-2，守卫 9 绿+config exit 0，push 两行一致；总领亲核 compose 两行+dev 双容器已跑 8eed9ca 镜像 healthy；**S7b HTTPS clone 443 被阻=非预期红按守则停止**，已授权 SSH 变体续行（SSH 22 push 实证可用）+第三笔 docs 修正 commit；**总领认领派发缺口：JUDGE-1 D1 代理教训未写入 S7**） |
| **BUMP-3** | owner 直令总领直改（GO/ZAI 先例） | 2026-09-04 | **✅ 已完成（总领亲历）**（一笔 commit `7bcdb01`：compose 双行换钉 `65d78d4` 全修复链终态（FIXLLM+FIXAUX+FIXAUX-3+3b），守卫 9 绿+config exit 0，push 两行一致。**协同事件如实记录**：执行中 FIXAUX-3b 会话已在同 worktree 落库 push（65d78d4，恰 2 文件=3b 规格，CI success 镜像已推，651 passed）——pin 目标当场由 d83bd73 重定向 65d78d4，零文件冲突；3b 正式验收待其交接回传） |
| **X-2** | **二次完整体验与综合优化计划**：owner 亲用 dev 栈（F9 完全体）自由记录（建议 X-A~F 分区随手记）→ 总领出综合优化计划（证据基准 commit+定级+归属步骤映射；**9-5 前抢救项 vs 10 月窗口分流**，兼作 10 月窗口工作稿） | 待 owner 体验 | **⏳ 窗口已排**（N5 后、Wave 2 信号前；预计 owner 1-2h + 总领 1h） |

> 分发提示词统一存放于 `docs/dispatch/step-<id>.md`，交接文档归档于 `docs/progress/step-<id>.md`。历史分发记录（C1…F8 共 20 行）→ 归档 §1.1。

### 1.2 运行时资源冲突（原 1.2.1，并行可行性第二判据；文件冲突矩阵见归档 §1.2）

> **文件不重叠 ≠ 可并行。** 以下资源在本项目里是**全局单例**，两个会话同时验证会互相破坏。

| 资源 | 单例形态 | 冲突后果 |
|---|---|---|
| git 工作区 | 唯一 `D:\desktop\coAgent-Learn`，**决策 1 明确不启用 worktree 隔离** | 交错 commit；A 跑全量回归时 B 有未提交改动 → A 的结果被污染 |
| 容器名 | `container_name: guashuai-backend` / `guashuai-frontend` **硬编码** | 后者 `up` 直接顶掉前者的容器。**改 `COMPOSE_PROJECT_NAME` 无效** |
| 镜像 tag | `deploy-backend:latest` / `deploy-frontend:latest` | 后构建的覆盖前者，前者的验证结论当场作废 |
| 端口 | `8000`、`5173:80` 硬编码 | 无法起第二套实例（临时栈用 `-p` 独立项目名 + 端口重映射，E-29/E-35） |
| SQLite 数据目录 | `../data:/app-data` bind mount | 8 个测试文件会触碰 DB；两会话并发全量回归 → `database is locked` 且互相污染 |

**→ 判据**：两层（文件表面 + 运行时资源）。第二层在本项目下几乎总不满足 → 全串行是默认；跨会话并行必须 `-p` 临时栈 + 端口重映射 + 副本库。

---

## 2. 环境登记（OPEN 条目；已备案 E-1…E-25/E-27/E-28/E-30…E-33/E-36 见归档 §2.4）
| **A-01** | **【独立分析 09-03】** 报告 docs/progress/analysis/ANALYSIS_2026-09-03.md（本地不入库）：P0×4（compose 终钉目标=c174382 非 HEAD/**P0-2 已关闭 09-03：泄露 key 双双已失效（sk-1b1c5a/336c43cb 均不在平台活跃列表），泄露分支 analysis/merge-master+2 陈旧分支已删，残余风险≈0**/tests-eval 未交付/评测分母与副本栈两口）+ 三硬指标静态审计 + 四维独立评分 69-80 vs 45-60 | 总领 9-3 夜决策最后一轮小修范围 |
| **RC5** | **KB 检索无条件化+判卷文案中性化 ✅（T2 验收 09-03）**：2 commit 2c14dd2/0164c6c——need_search 收窄为只门控 web 搜索（KB 链全档 always-run 含 simple_direct/极速，极速档新增一次改写调用 owner 接受）；RC4-S3 翻案保留；golden 再生+3 钉点改写；判卷文案三态（429 限流/中性/不可解析）+log 留真实异常；变异②亲放 2 红→6 绿；pytest 599/vitest 314/tsc 0；CI 徽章待限流窗口补核；裁量备案=simple_direct 0 命中维持无申明、知识概念题 web on 与改前一致（如需 KB 题不上网另行裁决） | owner 复验：任意档位问 KB 标题→观察窗走改写/召回；换 SF key 后判卷生效 |
| **RC4** | **判卷档位化+KB 0 候选修复 ✅（T2 验收 09-03）**：3 commit de08c4..41aee15——判卷两格定值化（standard=SF Qwen2.5-72B 跨厂商 / test=zen big-pickle，_review_dynamic 退役，8 测试文件 31 红→64 绿）/follow_main 开关退役（净-233 行清算）/KB 0 候选双根因修复（规划器数学类规则误杀丢弃已产出 queries+失败静默吞——**数据侧无罪实锤**，retrieve.py 翻案+prompt 收紧+warning）；变异①亲放 11 红→27 绿；S2 越界 5 文件**追认**（退役清算必然闭包，stat 逐项吻合）；vitest 314（退役净-8 属正当）；遗留=SF key 401 owner 换 key/T60 新证据（PUT 穿透泄漏已桩定）/3 条旧检索测试真网等待 | 等 owner：SF key 换新→判卷生效；二次型题目复验检索 |
| **P0** | **P0 清账微批 ✅（T2 验收 09-03）**：3 commit 6fa367d..3a39924——S1 compose 终钉 c174382+README 双-f 提示（5 守卫 24 绿）/S2 tests/eval 5 文件入库（897 行，绝对路径清零）/S3 failed_total+valid_ratio 分母诚实化+eval-override 副本栈；CI #31 success+双镜像 manifest 实证；**变异亲放恰 2 红**（failed_total 恒 0→文案+分母两测试 AssertionError）→还原 5 绿；终钉**保持 c174382**（3a39924 与其运行时零差异，镜像已实证，避免无谓回归）；⚠️ Wave 2 前置：~~EVAL_KB_EXTERNAL_DIR 指向有效语料（本机 AI-Agents-books 缺失）~~ **✅ 已闭（决策 39，09-04：manifest 全仓库内条目化）**+快照护栏；两笔过程纠偏如实入档（BOM 假警报=PowerShell 管道失真/守卫逮自家注释） | 独立分析 P0 全清，等 RC3 复验 → Wave 2 |

| # | 事实 | 影响范围 |
|:-:|------|---------|
| **E-26** | **`data/` 目录在 fresh clone 中的存在性，依赖 `data/documents/` 下 7 个种子 .md**。`../data:/app-data` 挂载源若在 clone 中不存在，Docker 会自动创建为 root 属主目录 → SQLite 写入失败。实测 4 个挂载源目录当前均安全 | 隐藏耦合：清理种子文档必须同步处置（加 `data/.gitkeep` / 改挂载 / entrypoint 建目录） |
| **E-29** | **【部署耦合 · 实测】前端容器无法独立启动**：`nginx.conf:33` upstream 写死 `guashuai-backend`，nginx **启动时**解析不到即拒启（exit 1）——比 `depends_on` 更硬 | ① 验证 frontend healthcheck 必须整栈起；② N3 镜像路径下容器名硬编码故可工作；③ 任何改服务名的重构必须先处理 `nginx.conf:33` |
| **E-34** | **【compose 行为 · N3 实测】显式 `-f` 下 compose v2 不自动加载 `docker-compose.override.yml`**（单 -f 带/不带该文件，config 输出相同）。**本地开发 canonical 命令：`docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml up -d --build`**（双 -f 合并验证 exit 0）；README 开发者路径按此口径书写且有守卫 | 本地开发验证 / README 维护。**违反实例：E-37** |
| **E-35** | **【取重视角 · F7 实证】①bind mount 不同步 mmap 写——宿主侧 sidecar 取证不可作为缺陷证据（须 `docker exec` 容器内视图）；②环境依赖 CANTOPEN 备案：机制已消失，若复发按 F7 实验矩阵重查；③临时栈必须 `-p` 独立项目名**（F7 临时栈与开发栈同名 `deploy`，down 连带带下开发栈——数据无损但已构成事故条件） | F7 会话 + 总领采信 |
| **E-37** | **【环境 · 总领失误认领 08-31】E-36 修复时违反 E-34 单 `-f` 操作，把开发栈打回定版镜像代码**：override 在 `deploy/` 下不在项目根 → 未被自动加载 → compose 按配置漂移把 backend 按纯镜像重建（F8/F11 功能在 dev 下线，S5 端点 404）；E-36 时 `/app/skills` 检查为假阳性（镜像自带）。**已修复**：双 `-f up -d` 恢复代码挂载（S5 冒烟 200）。**遗留已闭（N4 08-31）：dev 前端载入本地构建 bundle，KaTeX/审核入链/下载入口全部生效**。教训：本地栈必走双 `-f`；挂载验证不得用镜像自带内容当证据 | 总领现场定位（inspect 挂载对比）+ 认领 |
| **E-38** | **【取证 · F7 披露】容器重建销毁 uvicorn 访问日志**——06:5x 恢复开发栈的 `up -d` 重建掉旧容器实例，02:50–05:45 段请求留痕（T50 删除窗口的关键取证面）随之丢失 | 排障期任何容器重建前**先 `docker logs > 文件` 导出再操作**；compose `down/up`/`--build` 均属重建 | F7 披露 + 总领登记 |
| **E-40** | **【容器形态漂移 · RA5 登记】dev 后端容器曾以裸 base compose 重建**（Created 09-01 19:15，Image=99c7c 定版，代码挂载 backend/skills/tests 丢失仅剩 data）→ 后端跑 N3 旧代码：无 zen 块/PUT 不认 zen_api_key/review 无 follow_main——晚间冒烟「key 无法保存/自检与气泡不一致」主因。**restart 不治（不重建容器），唯双 -f up -d 重建**；总领已当场重建恢复（日志存 %TEMP%\dev-backend-logs-prera5.txt） | **制度：后端运行时行为与 pytest 矛盾时第一步查容器形态**（容器内文件大小 vs 宿主）；每次后端相关验收加容器形态核对 | RA5 侦察实证 |
| **E-39** | **【流程 · F14 实录】弱执行层在零裁量约束下的泄漏面**：①S4d 3/4 红未按 §0.1 停报而自行修复（终态合规+失败分析留档）②交接文档名偏离且**过期**（止于 S4d）③**未 push 即报完成**（决策 30 违反，总领补推）④S3c 疑似后台委派（bg_/ses_ 无法事后定性）⑤测试带宿主 .env 依赖→CI 2 红（总领修） | **执行层「完成」信号必须与交接文档完整性+CI 徽章交叉核验才算数**；交接过期=红旗。细节 `docs/progress/step-F14.md` §三 | F14 验收实录 |
| **E-41** | **【判卷链实测 · 09-04 登记】SF chat 已通**：dev 栈日志 09-03 20:13-20:15（UTC 12:13）两次 `api.siliconflow.cn/v1/chat/completions "200 OK"` 穿插于 DeepSeek 主链间；SF chat/completions 唯一调用方=判卷定值格 standard.review（`Qwen/Qwen2.5-72B-Instruct`）；对话 mtgbug2e8uca「矩阵是什么」think 链「审核」agent 真实产出反馈+KB 命中线代讲义——「sk-hbu*** chat 401」旧观测作废，key 由 401 转 200 的原因未取证（owner 侧核实） | Wave 2 跑数判卷可直接依赖；handoff §六.1 两项等待关闭 | 总领取证（docker logs+ro 活库直查） |
| **E-42** | **【行尾 · go 轮实录】global autocrlf=true 与仓库混杂行尾（docs CRLF、backend/tests 大多 LF）冲突**：local 钉 false 后，编辑工具把 LF-blob 文件整文件写回 CRLF → commit 显示全文件 diff（go-s1 一度 546/359 行入库，已 amend 修复；s3/s4 commit 前拦截）。**守则：每笔 commit 前 `git diff --stat` 对照预期行数——全文件 diff=行尾污染，python 转 CRLF→LF 对齐 blob 原状后再 add**（BOM 教训的行尾版，变异前 grep 锚点同级的强制自检） | 每笔 commit 前强制核对 | go 轮三次实录（s1 染入已修/s3 已修/s4 拦截） |
| **E-43** | **【网络 · JUDGE 实录】本机 Docker Hub（registry-1/auth.docker.io:443）与 npmjs TCP 直连全断**（Clash 7993 在跑但 Docker daemon 不经 git/WinINET 代理，逐次代理参数对 docker build 无效）→ 本机 `--build` 受阻（node:22-alpine/nginx:alpine 本地无存）；GHCR 直连可达仅慢（pull 381s）。评委路径=纯 pull 不受影响；dev 重建免 build 等价=钉定镜像+代码挂载（`镜像commit..HEAD` 零代码 diff 先例）；正式 --build 补跑待网络恢复或 owner 授权 daemon 代理 | 涉及本机 build 的派发单须预置免 build 等价路径或先探测 443 | JUDGE 交接 §5.1（step-JUDGE.md） |
| **E-44** | **【验收盲区 · FIXAUX 实录】新通道/新档位落地时辅助链 E2E 零覆盖**：GO/ZAI 冲刺轮注册表加了行，但 _make_llm 的 req‖DEEPSEEK 兜底、前端 zen→go LS 复制残留均未迁移/清除——CI 634 绿掩盖，直到 owner 真用 go 档才炸（401×N/审核跳过/资源生成失败三连）。**守则：新档位/新通道轮次验收必含「主链+辅助链（追问/记忆/大纲）+右栏资源生成+审核节点」四链真档位 E2E 抽测**；测试断言覆盖不了前端 LS 状态错配类故障 | 新档位/新通道派发单的验收标准条款 | FIXAUX 诊断实录（step-FIXAUX.md §0/§1） |

---

## 3. 全局决策记录

### 3.3 已决事项（仍然管辖当前执行；3.1/3.2 已决清空、3.4 被否决方案、3.5 N3 待决清空 → 归档 §3）

| # | 决策 | 结论 | 依据 |
|:-:|------|------|------|
| 1+6+7 | 执行顺序与批次划分 | **全串行，不启用并行与 git worktree**。现行序列以归档 §1.3 为准 | `pipeline_v2.py` 被 5 步共享、`useChatStream.ts` 被 4 步共享，并行收益低于冲突成本；多会话协调成本高于节省时间 |
| 2+4 | B4 前置依赖 | **B4 排在 A1 之后** | A1 心跳降频会改变 B4 改动对象的触发条件 |
| 3 | D3 `_strip_thinking` | **选项 B：删除，但执行会话必须先实证** | 原文档「死代码」判断有误（T6），有 2 个真实调用点；未经实证不得拍死 |
| 5 | D4 幂等方案 | **选项 A：前端 `client_msg_id` + 部分唯一索引**，附反向脚本 | 选项 B「5 秒窗查重」会误伤连发相同消息；A 方案历史数据零迁移 |
| — | 各步文件清单补测试路径 | **由总领在分发提示词中直接修正**，不占用 owner 决策 | T1；测试文件属本步允许范围，不视为越界 |
| 8 | **项目验收主体** | **竞赛项目，验收主体是从零 clone 的评委**。所有决策以「第三方一次跑通」为准 | owner 原话：「这是竞赛项目，我发到 github 上评委能部署下来即可」 |
| 9 | 序列重排：部署链前置 | **采纳**（C1→C2→N1→C3→C4→N2 → 体验链）——已执行完毕 | 「能否跑起来」是 0/1 问题 |
| 10 | README 重写 | **同意，作为 N1 的一部分**——已执行 | 代码修好但 README 指引错误，评委照样失败 |
| 11 | C3 实施方案 | **不新建 dev compose**；端口保持外部 `5173`；nginx 反代 `/api` 与 `/uploads`——已执行 | 多一份 compose 多一个评委踩坑点 |
| 12 | `.env` 阻塞处置 | `env_file` 改 `required: false` + `.env.example` 占位 + README 补 `cp`——已执行 | API Key 不阻塞启动 |
| 13 | **预构建镜像时机** | 放全部步骤完成后的最终封装（N3）——已执行 | 中途镜像随步骤反复变更，提前推送只会反复重推 |
| 14 | **registry 选型** | **GHCR**（`ghcr.io/tpys11/coagent-learn`，包名全小写）——已执行 | 与仓库同源、无匿名限流、GITHUB_TOKEN 天然可推；代价：包须显式设 Public |
| 15 | N1 `.env` 处置 | 保留 `env_file` + `required: false`——已执行 | E-5/E-6 |
| 16 | **torch CPU wheel 索引源** | **阿里云 `--find-links`** 写入仓库，不用后还原——已执行 | 国内长期不稳定；`--find-links` 不锁版本可回退 |
| 17 | **越界修复审批范式** | 先报批 → 修复 → 交接文档第 2 节标注「经批准越界」+ 理由 | N1 两处越界树立范例 |
| 18 | **守卫编写范式** | 沿用 C4「存在性守卫 + 属性守卫 skip 兜底」；配置文件统一 `utf-8-sig` | 一处坏掉只红对应那一条，变异定位精度高 |
| 19 | **N3 bind mount 处置：方案②移除代码挂载，只留 `../data:/app-data`**——已执行 | 本地开发用 gitignore 的 override 挂回 3 条代码挂载；评委 clone 无此文件自动走纯净镜像路径 | 可复现性 > 开发便利；消除依赖静默漂移。连带 E-26 |
| 20 | **批次合并规范**（owner 拍板） | 组内多步一会话；**①一笔 commit 一个子步骤 ②每子步完成立即全量回归 ③交接按子步骤分节** | 组内共享文件互相影响，不能只在会话末尾跑一次 |
| 21 | F2 与 N2 不参与合并——已执行 | F2 单步；N2 独立纯验收 | N2 是部署链唯一端到端证明 |
| 22 | P1 插入 F2 与 N2 之间——已执行 | 测试提速 366s→30-39s | N2 顺带成为 P1 运行时验证，不加会话 |
| 23 | **P1.2 安全红线：`_new_conn()` 不得返回缓存连接**——已执行 | 缓存只用于 `execute()` 内部 | `_kb_ops.py` 显式调用并关闭缓存的连接（A/B 实测 4 条红） |
| 24 | **分发提示词三条流程修正** | ①区分「新行为断言」与「回归控制断言」②耗时/基线数字标注实测条件或自建基线 ③compose 命令必带 `-f deploy/...` | F2 验收导出 |
| 25' | **F5 四项决策 + 一项总领判断**——已执行 | ①无 Key 硬失败 ②删 `EMBEDDING_BACKEND` ③接受必须有硅基流动 Key ④F4 缩减为双 Key 引导 ⑤`RERANK_BACKEND` 收敛 `api\|none` | embedding 硬失败（无它检索不存在）vs rerank 优雅降级——性质不同不可混淆 |
| 25 | N2 撞出 3 项分两步走——已执行 | F3 立即修；N2-3 伪向量架构级取舍须 owner 决策 | 跨层缺口只有真实端到端撞得出来 |
| 26 | **验收清单默认项：最自然用户路径是否可达** | 除 API 200 外，默认验证含前端入口/白名单/按钮状态的跨层链路 | F1 验后端 + C3 验前端，连接处没人验 |
| 27 | **查爆炸半径禁止 `head` 截断 grep** | 先 `wc -l` 计数再完整列出；`head` 只能看大概不能下完整性结论 | F5 教训：`grep \| head -4` 被占满致「2 处」实为 4 处，实施会话中途报批 |
| 28 | **F4′ 修复①方案取舍**——已执行 | 选异常外传 + 各调用方就地兜底；同步响应 HTTP 200 + `status:error`（非 HTTPException）；连带发现 `background.submit` 异常黑洞 | 方案 A 复用既有正确外层；逐个确认每个调用点异常最终去向，否则假修复 |
| 29 | **派发基线数字被后续步骤改变时，派发前重跑** | ①分发文档生成后插入其他步骤 → 派发前重跑基线 ②实施会话开工实测并与提示词核对，不一致以实测为准并上报 | F4′ 教训：提示词 295 未随 F6 同步为 300 |
| 30 | **每个会话执行完自己 push**（owner 拍板，**每次生成派发提示词必须写进去**） | 子步骤全完成 + 回归全绿 + 工作区仅 `?? repomix.config.json` 后 `git push origin master`（无上游跟踪须显式），核对 `ls-remote`==`rev-parse` 两行贴交接。**红线：禁 --force、禁推 master 以外分支、禁把 repomix.config.json 入 commit**。中断先 push 已完成子步骤再停 | 决策前出现过本地领先远端 62 笔（E-27） |
| 31 | **D 组按风险降序 D4→D3→D2→D1**——已执行 | 最险的先做，卡住暴露得早 | 依赖清单 ≠ 执行顺序 |
| 32 | **体验链 11 步全部执行不砍**（owner 拍板）——已执行 | owner 原话「要做体验链，提到的都要全部做」 | owner 决策优先 |
| 33 | **「几行代码」收尾折进相邻会话**（T26/T34/T32 先例） | 合计 ~10 行不值得单开会话，但不能没有：各带守卫与变异验证 | 3 行代码付一次完整会话开销与决策 20 相悖 |
| 34 | **A2 emit 守卫折进 B 组；`sse.ts` 越界追认**——已执行 | 行为被一次性 E2E 证明正确后缺永久回归保护 → 折入；越界须「先报批」或注明「未报批的必要越界」 | 内容正当差别在流程 |
| 35 | **凭据与破坏性操作铁律** | ①凭据永不臆造/手拼——要么完整读取要么不读 ②清缓存/删除前先确认归属 ③拿不到凭据改用 route 拦截 SSE 桩 | B 组事故：手拼假 key 401 误判 + 误清 Playwright profile 有效凭据 |
| 36 | **总领提效三则（08-31，owner 提出"总领是瓶颈"后立项）** | ①**验收分级**（RBI/hold-point 原则：hold point 应稀用）——T1 承重轮（DB/引擎/协议）=三绿+变异+快照；T2 功能轮=三绿+快照+交接通读；T3 轻量轮（docs/纯验证/微改）=push 两行+抽测+交接读；②**看板瘦身**：验收行只写状态+指针（≤200 字），证据一律留交接文档；③**回合纪律**：验收命令单消息并行批处理，长输出后台化，重活拆短回合（移动端通道不被长回合锁死）。**CI test job：✅ 已落地（08-31，owner 选 C 总领直改）**——tests job（pytest/tsc/vitest，Linux 首验全绿 435+133+0）gate 双镜像构建；随修三案：CI 补装 pytest（requirements 无，C1 既定）、test_eval_judges 加 importorskip（tests/eval 未入库，Wave 2 收口拍板）、去幽灵路径 backend/tests（零 tracked 文件）。诊断面：tools/ci_annotations.py 把失败转 ::error:: 注解（公开 API 可读）。**验收从本轮起降为 diff 审读+CI 徽章+抽样变异（T3 轮省全量复跑）** | 自审计：验收回合 40-60% 挂机=等命令输出+重复全量跑；失误成本（E-37 类）占今日最大单块浪费；外部锚点=NATSPEC hold-point 稀用原则/API 580 RBI/Google eng-practices review speed |
| 37 | **三层派发**（owner 09-01 立项，同日两次修订） | 总领任务书（可行性+模块拆分，不含子步）→ 设计会话（深度侦察+详细设计+工程化控制，不执行→ `docs/dispatch/step-<id>-design.md`）→ **owner 直发执行（总领设计审计已裁撤）** → 执行会话对照设计执行（结构性偏差上报总领，微偏差自裁）→ 总领验收。适用判据：多文件/跨层/有架构取舍的轮次走三层；总领已深度侦察的轮次可豁免设计层直发（F13 先例）。**补偿控制**：执行复述门对照设计复核锚点 + 总领验收不变。首例=F14（设计中）。**补充（owner 09-01 二修）：执行层模型弱且不稳定→设计文档按「零裁量」标准**——精确操作规格+before 代码锚点/单步细分/每步验收命令/测试骨架半成品/失败即停程序（1 次非预期红即停上报）/自裁白名单封闭/命令原文/开篇执行守则节/不留开放问题。**三修（09-01）：执行提示词终稿由总领合成、随设计交付，owner 直贴执行会话即用；纪律正文以设计文档 §0 为权威**。**四修（09-01）：剩余轮次默认豁免直发**（总领深度侦察+派发单带全子步，F13 先例）；三层仅 10 月架构轮按需启用且配强执行模型 | owner 裁撤审计环节（09-01）；F10 复述门两修正证明执行层可承接前提纠偏；owner 观察执行层模型弱化；F14 设计文档实测十条款全合规、执行层流程泄漏 E-39 五项 |
| 38 | **测试档全链语义（owner 09-02 修正，取代 F14 窄义）** | 测试档=**除嵌入（qwen3-VL@SF）与解析（mineru）两类专有能力外，全部 LLM 调用走 zen 免费档**：主对话 mimo-v2.5-free / 审核 big-pickle（其余全 mimo，owner 原话「除了审核档用 big-pickle，其他都用 mimo-v2.5-free」）/ 辅助链（规划/学情/检索/召回经 req 传导已随档）/**req 外围（追问/记忆/资源生成/上传大纲）收敛待 R-C1**。目标=测试档下零 DeepSeek 依赖（真免费体验档） | owner 语义修正（总领曾窄化复述为「主对话+审核」，被修正）；zen 清单 63 模型实拉实证 |
| 39 | **提交语料口径终版（owner 09-04 拍板）** | AI-Agents-books **彻底废弃**（含 preset_library 1-4 章节选版，不入 manifest 不入提交包）；提交语料=**系统内嵌资料**：线性代数讲义（武大马涛 82 页 PDF）+ 鱼皮 AI 编程学习路线 md + `data/documents/` 7 篇自撰 md，共 9 份；`eval_kb_manifest` 全仓库内条目化（external 机制保留为零依赖兜底），**EVAL_KB_EXTERNAL_DIR 缺口关闭**；kb-slice README 同步改版，块数 Wave 2 重测回填 | owner 原话「AI-Agents-books 我已经彻底不用了，我在系统内嵌入了部分资料，把这些东西作为提交的语料，相关的旧的记录都改一下」；线代讲义为复验实测 KB 命中源（E-41） |
| 40 | **go 第二测试通道（owner 09-04 拍板）** | 测试档新增 go 通道与 zen 上下并列：**独立网关**（URL+Key 设置页填，无默认值）、主模型 GLM-5.3-Flash、审核模型 Qwen3.8 Flash（API ID 字面占位，owner 提供确切值后改三处字面：backend MODEL_GO_*+frontend models.ts 镜像+两处测试钉字）；zen/go 各一开关**互斥**（开 A 自动关 B、关 A 则 B 不动、全关=标准档）。实现=REGISTRY 第三档定值格（决策 38 同构，专有能力留 SF）+TEST_CHANNEL 通道定向+detect_tier 按 GO_BASE_URL 精确相等判定+前端单 provider 字段覆盖实现互斥 | owner 原话「测试档再加一个go，与zen上下并列…两者分别有一个开关按钮，只能开启一个」；zen /models 实测 66 模型无 GLM-5.3-Flash/Qwen3.8 Flash（go 必为独立端点，AskUserQuestion 确认） |
| 41 | **Z.AI 第三测试通道（owner 09-04 拍板）** | 测试档新增 zai 通道与 zen/go 三并列：智谱 bigmodel **官方端点固定**（`https://open.bigmodel.cn/api/paas/v4`，不开放 PUT），主模型与审核模型**均 glm-4.7**（官方文档 model 值；**同模型自审=owner 明示取舍**——防自我包庇设计在此通道不适用，专用记忆机制测试）；ZAI_API_KEY 独立无跨通道兜底；zai 行小字按 owner 原话注明「专用于测试记忆机制」。实现=REGISTRY 第四档定值格+TEST_CHANNEL 扩 zai+detect_tier **双参化（URL+model）**——zai 端点与标准档 zhipu 主对话完全相同，单看 URL 会误判（防误判守卫钉死）+前端三通道互斥 UI | owner 原话「测试档再加一个，提供商是Z.AI…主模型和审核模型都用glm-4.7，小字注明，专用于测试记忆机制」+官方文档 docs.bigmodel.cn 实测核对 |
| 42 | **标准档 zhipu 主对话遗留清除（owner 09-04 拍板）** | 整体删除：MAIN_PROVIDERS 死数据（无消费者实证）+FAST_MODEL_BY_BASE bigmodel 条目+ZHIPU_API_KEY 全链（config/settings GET zhipu 节/PUT 字段）+前端路由表 zhipu 键+ApiKeyPrompt zhipu 分支+settingsPayload zhipu_api_key 键+E2E 脚本残留行。存量 LS.provider='zhipu' 经 fallback 自然回落 DeepSeek 端点（零迁移）；**detect_tier 双参判定保留**（防御性契约——zai 端点与旧 zhipu 端点相同，任何非 zai 请求不得误归 zai 档）；**zai 测试通道（决策 41）不受影响**——走 ZAI_* 独立配置。删除类验证=全仓 grep 生产零引用+三绿 | owner 原话「标准档 zhipu 主对话相关的东西都删了吧，这是很久之前遗留的东西，现在彻底没用了」 |
| 43 | **Wave 2 职责分工（owner 09-04 拍板）** | **协作者 agent 承包：测评器优化 + Wave 2 全量跑数（发车令=交接文档 v2）+ 报告成稿（wave2-report.md）+ 三处回填（报告/kb-slice README 块数/视频脚本镜 10）+ manual-review.md（L3 由协作者本人签字，agent 备料）**；owner 只做其他提交材料与最终打包；**总领转验收+看板沉淀，原 Wave 2 发车派发单撤销**（交接文档 v2 直交协作者 agent） | owner 原话「他负责测评加写出测评报告，我现在只负责等他弄出来后全部打包，我去弄其他要提交的材料」 |

---

## 4. 技术债清单（OPEN；已关闭 T1-T47 及已折单 T53/T54/T56 见归档 §4）

| # | 债务 | 来源 | 处置 |
|:-:|------|------|------|
| T48 | **README 知识库上传入口指引含糊**：「顶部资源页可上传」实为预置资源库（无上传按钮）；真实入口=课程工作台左侧「资源」→「查看更多」→上传面板。**+ D1（EVAL-1 亲证）：README:234-236 三条 docs 链接全死链**；D2 双「确认上传」按钮；D3 报错文案「。，」连排；D4 缺双确认；D5 E-22 语义（UI 保存后 .env 同名键失效）未写透 | N2② + EVAL-1 | **折进 F12 S1**（删链或补文，派发单已定删链为默认） |
| T49 | **【测试基建】宿主 pytest 与开发栈共用 `data/app.db`**（conftest 无 DB 隔离，`:42` 触达 `db_path`）——测试写操作直达真实库，364 测试 × 16 轮未出事故属侥幸面 | F7 会话上报，总领核验属实 | 待专项核实与隔离方案（勿与 T50 混同）；**F7 会话已实证 d3687a0 套件对真实形态库非破坏**（ro backup→SQLITE_DIR 重定向→前后行数全等，step-F7.md §T50-C） |
| **T50** | **【✅ 已关闭 08-31】「ai Agent」课程向量消失事件**：归因认定=**owner 本人课程删除**（owner 08-31 确认「认定为我删过」）。事件重定性：非数据丢失事故，而是**正常课程删除 + kb_tree 不级联缺陷的残留假象**（向量/问题/边/项目行全消=删除成功；kb_tree 8 行残留+37 孤儿 pids 沉积造成"神秘丢失"观感，冒烟孤儿混淆视线）。**真缺陷一处：delete_kb_project 不级联 kb_tree → 已折 F9 S3 守卫钉死（课程删除后树无残留）**；孤儿清理=**owner 拍板不清（09-01）**——惰性数据（检索按 project_id 过滤永不命中）永久保留作取证基线；课程内容恢复=owner 重传 PDF 自便 | F7 判定实验 + 总领签名实测（projects 2 行 vs kb_tree 39 pids）+ owner 认定 | **✅ 关闭**（归因结案；缺陷折 F9；清理待拍板） |
| T51 | **【P1 API 契约 · F8 实证】部分字段 PUT /api/settings 会以 pydantic 默认值覆写未提交配置**（副本实证 EMBEDDING_MODEL→bge-m3 + dimensions=400）；前端全字段提交无恙，API 层是坑——建议「空串/缺省不覆写」语义 | F8 会话 E4 实验 | 折进后续微改（F12 类） |
| T52 | **【P3 体验】CJK-CJK 段内空格保守保留**（pymupdf4llm 硬换行拼接产物，如「难以 还原」） | F8 会话上报 | **✅ owner 拍板（09-01）：暂不删**——chunkers.py 红线不动、kb-slice 口径不重测；**README 知识库指引处加一句假空格提示**（归属 N5 README 环节顺带）；10 月再议扩规则 |
| T55 | **【P2 检索质量】查询规划器 need_search 偶发误判**：`rewrite_queries` 已产出 queries 仍偶发放弃检索（同输入一次 true 一次 false，非 F11 引入）——建议「queries 非空时无视 need_search」或 prompt 收紧 | F11 会话 E2E 观测 | 折进后续轮微改 |
| — | **T53/T54/T56（owner 指令删「项目介绍」「切块参数栏」+ 公式 `$` 定界提示词）** | owner 08-31 | **✅ 已折进 F12 派发单**（锚点与边界判定细节见 `docs/dispatch/step-F12.md`；登记原文见归档 §4） |
| **T57** | **【P2 孤儿级联 · F10 移交】`resources`/`file_hashes` 项目级联不清**——删课后各残留 1 行（E2E 实证），与 kb_tree 同类孤儿形态 | F10 E2E 实证 | 折入下一轮微改（比照 F9 purge/F10 守卫先例：新增清理+守卫钉死），候选=X-2 抢救包或 10 月窗口 |
| **T59** | **【语义边界 · RA4 登记】独立审核模型与判卷链路完整联动**——合并栏开关 ON=走 research 配置链（测试档 zen:Big Pickle）；**标准档下 research 未配置时判卷回落主模型（与 OFF 同源）**，气泡承诺（Qwen2.5-72B）与实际判卷存在差距 | RA4 owner 反馈③ | 10 月窗口：research 缺省值/判卷链统一设计（含 REVIEW_MODEL 与 REVIEW_MODEL_THINK 的关系厘清） |
| **T60** | **【测试隔离 · RA5 登记】跑序敏感**：	est_ra_s1_review_follow_main 先于 	est_f14_zen_* 跑时 6 红（REVIEW_FOLLOW_MAIN 配置跨文件泄漏），stash 实证基线同序同红=非 RA5 引入；字母序全量门（CI 采集序）不受影响 | RA5 执行会话上报+总领 stash 复核 | 10 月：跨文件 config monkeypatch 隔离（autouse 重置 fixture），非 9-5 关键路径 |
| **T58** | **【死视图 · F12 发现】KnowledgeView 无入口组件**（假编辑已修、渲染已统一，但全应用无导航可达） | F12 交接 | **✅ owner 拍板（09-01）：删除** → **F15 直发微轮**（删组件+全部引用+路由残链；tsc 0+vitest 全绿+CI 徽章；一笔 commit；提示词总领出，可并入任意间隙） |
| **T61** | **【测试档独立构造残留 · FIXAUX 上报】三处不走 _make_llm 的 LLM 构造**：memory_edit.py:53、chat_context.py:33（requests.post 直打 DEEPSEEK 公式）、outline_service.py:266（自带判档但 go/zai 档回落 req key）——测试档下仍有 standard 公式路径；owner LS 正确时经 req key 实际可用，LS 错配时复现 401 类故障 | FIXAUX 连带核查上报（不扩纪律） | 10 月窗口「req 无 key 时按档位取注册表格 key」统一收口；**若提交演示涉及 go 档下记忆编辑/大纲生成则提前微修** |
| **T62** | **【口径矛盾 · FIXDEMO 上报】水平分范围两处表述不一致**：assess.py coerce_score 实现=[0,1] float（权威），resource_branches.py:301 既有提示词标注（-1~1）；FIXDEMO 新【难度适配】条款沿用 -1~1 标注（沿袭既有文案） | FIXDEMO 执行会话口径观察上报（未动钦定文本，合规） | 后续微修统一为 0~1（两处一行文案）；10 月口径梳理一并 |
| **T63** | **【记忆机制对账 · 总领 09-05 审计】设计稿（《（跨）会话记忆》《总述》）vs 实现逐项对账**：主干已实现（预算制压缩/游标/五站并行学情/三层记忆表/克制传递/level_score 四事件）；缺口 6 项=四件套 schema（现状五段式语义近似）/15% 预提醒/跨会话按需读取/薄弱点翻转消除/时效四类分治/新开对话禁发降级语义。逐项对账全文：docs/progress/memory-audit-20260905.md | 总领会话审计（owner 问"两条记忆机制实现了吗"触发） | 10 月完善窗口（长对话个性化深度；均不影响今晚三硬指标） |
| **T64** | **【同类地雷 · FIXASSESS 连带清点】think_then_json 空 user_prompt 调用点**：assess.py:24 已修（FIXASSESS）；**retrieve.py:264（知识检索 LLM 改写，llm_fast 同通道）与 review.py:58/63（审核，zhipu 通道当前容忍）仍传空串**——同型 400 地雷，当前流水线未触发（近 30 分钟日志零 400）；修 retrieve 会改变现行为（LLM 改写从静默失败转正常工作→检索结果可能漂移），deadline 前不扩面 | FIXASSESS 排障连带清点（owner 直令"修"仅限 assess） | 10 月窗口统一收口（修 retrieve 须连评测回归；review 通道迁移前必修） |
| **E-46** | **【外部依赖行为变更 · 全量跑数排障】Console Go 上游收紧空 user content 校验**：00:42 Run 2 学情评估尚正常（level 0.3/0.25），06:53 起同代码 400 "message content cannot be empty"——网关侧变更非我方回归；表现=assess 重试 3 败→兜底 level_score:null→适配列全 None。**教训：凡 chat 调用 user 消息必须非空**（对话生成天然合规故未暴露）；全量 54 例 P1 批 6/18 中途叫停止损 | owner 直令"修"→FIXASSESS（b72c164，673 全绿） | 全弧：修复→三批全量 54 例重跑完成（并行）→判卷（断言幻觉 0 ✓/陷阱 0/18 ✓/适配 34/49=69.4% ✗/覆盖 79/112=70.5% ✗）→P1 适配 2/17 崩塌取证→存量缺陷 prev_score 只读缓存→FIXPIPE（a8a1204）→P1 二轮 18/18 零错误（11:21）→**终判三指标见「WAVE2 终判」行**（复算列=独立复算权威） |
| **E-45** | **【数据安全 · FIXEVAL 复盘】评测副本库（Windows bind mount + WAL）禁止宿主侧 SQLite 直连读写**：宿主 Win 原生 SQLite 与容器 Linux SQLite（Docker FUSE 层）的 WAL/-shm 锁语义不同——总领钥匙迁移曾直连副本库写入，BUMP-4 容器重建触发跨 OS WAL 恢复 → `disk I/O error` → KB 写连接全灭（后台入库失败）→ 检索探针全空 → 闸门正确拦停。修复=停容器 → 宿主 `PRAGMA wal_checkpoint(TRUNCATE)` → 重启（干净初态）。**钥匙注入正解=.env**（runner/后端钦定路径：env_file→容器 env→config，重建自动播种）；宿主侧直连读取亦有 WAL 快照可见性陷阱（读陈旧态） | 副本库的一切宿主侧 SQLite 操作；钥匙注入只走 .env | FIXEVAL 复盘实录（eval_P1.log + evbe.log disk I/O 链） |

---

## 5. 评估环节（对照官方比赛方案 XH-202630，2026-08-31 总领登记）

**时间账**：作品提交截止 **2026-09-05**；初审 09-20；**10 月官方完善窗口**；11 月终审。验收主体变化 ⇒ 序列重排。

**待拍板项 D-01（提交窗口技术批次规模）**：**✅ owner 拍板（08-31）：A——五轮全跑不缩减**；附加裁定：①「协同决策中间数据导出」折进 F11（S5，验收通过后追加——已闭环）；②「降维解释/进阶挑战」动态迭代机制核实与补齐放 10 月完善窗口。

**评估环节工作清单（并行启动，不占实现会话）**：
1. 10 分钟演示视频——**脚本 v1.1 终稿 ✅**（占位全按落地形态替换：思维链六段/子代理五要素/审核在链内，P1-01 smoke 实拍锚点已写入；仅镜 10 指标数字待跑数回填）；**录制前置全就绪 ✅**：F12 收口验收 + bundle 终态对齐（总领重建 `CwQ0gpfd→kTVgGCK3`，`--no-deps` backend 零扰动）；待 owner 录制
2. 测试数据包：kb-slice 清单（**09-04 决策 39 改版**：AI-Agents 移除→线代讲义替补，9 份全仓库内/参数快照/评委复现指引；块数待重测回填）；≥3 组学情数据源 ✅（3 画像 JSON 在 test-data 骨架）；IO 示例组装待跑数后回填
3. 三项硬指标实测：幻觉率<5%、画像-资源适配准确率≥85%、核心知识点覆盖率≥90%（实验设计+跑数，用例 ≥50 组）
4. 作品设计实现方案文档 + 作品介绍；部署说明核对（T48 微改收尾）
5. **owner 澄清（08-31）：「答题正确率→降维解释/进阶挑战」动态迭代机制已在代码中隐式实现，非缺失**——答题情况（`quiz_answers` 含 kp_tag/correct）→ 流内学情评估写回画像缓存（`assess.py` S3）→ 学情画像合成注入生成链（`memory_service.py:185-192`；`_business_tables.py:125`）→ 学情管理 Agent 依画像驱动生成内容。**10 月窗口的活 = 显式化呈现**（决策路径界面/报告/演示可见），非补机制；EVAL-1 材料按此口径，勿再写「机制缺失」

**EVAL-1 评估与提交材料会话（2026-08-31 立项，与实现批次并行）**：不写产品代码；Wave 1（✅ 已验收）=评估方案/用例矩阵/方案文档+介绍/视频脚本 v1/README 核对清单；Wave 2（解锁词已交付）=副本栈跑数+指标实测报告+测试数据包组装+脚本终稿。产出存 `docs/submission/`（本地不入 git）。材料源：赛题原文 `D:\desktop\挂帅\0、全局性要求相关——开发时查阅\官方原文——给ai读.md`。
**Wave 1 ✅ 总领验收通过（08-31）**：12 产物亲证在盘（评估方案 24KB/设计方案/介绍/视频脚本 v1/README 核对清单/test-data 骨架含 3 画像 JSON）；用例亲测 54 P + 6 IF = **60 ≥ 50**；四层判定规程（L0 系统审核/L1 引用核验/L2 异厂商复判/L3 人工抽查 ≥10%）方法可复现。**新发现 D1（P1）已亲证**（README 三死链→并入 T48）。**Wave 2 保持 PENDING**（解锁词已交付 owner）；已授权补 `tests/eval/eval_runner.py` 骨架（零产品代码）。

**看板维护规则（2026-08-31 文档结构审计后生效）**：
1. **写作纪律**：T/E 行单行 ≤200 字、只留事实与编号指针，叙事细节一律进交接文档/派发单。
2. **拆分排期**：**✅ 已执行（2026-08-31）**——全量快照 `docs/progress/archive/board-2026-08.md`（拆分前 751 行/147KB），主看板精简至 ≤200 行/40KB；再超 250 行/60KB 触发下一轮归档。归档=移动非删除，证据链保持。
3. **过时声明**：SINGLE_STEP_EXECUTION.md 声明「当前轮次以 docs/dispatch/ 单页为准」；.omo/plans 17 个历史 plan 已归档至 `.omo/plans/archive/`。
4. **手册同步义务**：**✅ 已同步（2026-08-31）**——5（4）乙-1 增补「归档机制」小节，手册与实物不分叉。

---

## 6. 交接文档归档

| Step | 归档路径 | 验收结论 |
|:----:|---------|:--------:|
| **F11** | `docs/progress/step-F11.md` | ✅ 通过（`7aa70bf..9506cbb`，pytest 418 / vitest 117 / tsc 0 总领亲证；含 S5 trace-export 冒烟 200；E-36 发现） |
| **F7** | `docs/progress/step-F7.md` | ✅ 关闭（owner 选 1：缺陷环境依赖不可复现，评委路径全链 200 实证；T50 序列交代 + d3687a0 套件非破坏实证；T48/P3 守卫 2 条 pytest 435/vitest 133/tsc 0） |
| — | 其余 20 行（C1…F8）见归档 §6；后续完成后按 `step-<id>.md` 归档 | — |

---

## 7. 下一轮衔接（owner 亲用产品 → 体验问题包；详版 → 归档 §7）

> owner 于 2026-08-29 提出：本轮完成后亲自使用产品，按使用体验整理问题包交回总领。

- 会话提示词已生成：`docs/dispatch/next-round-experience-intake.md`
- 交付：使用体验问题包，**必须记录采集时 commit sha**（否则无法对齐代码状态）
- 该会话职责边界：**只读**——记录观察/追问复现路径/区分事实与感受/按体验分区/记录代码线索（标注待复核）；不做技术决策、方案设计、优先级排序
- 分区按体验维度不按代码模块：`A 等待与反馈 / B 内容质量 / C 交互与操作 / D 稳定性与容错 / E 理解与引导 / F 其他`，编号 `X-A1` 前缀
- 去重过滤器：滤掉已修/待修项；富矿=本轮明确不做的领域（检索质量、内容质量、产品流程、提示引导、等待体感）
- 收到问题包后：①核对包内 commit 与 HEAD；②体验分区→代码模块归属需重新勘察，**勿直接按分区拆步骤**；③PROGRESS/dispatch/progress 是主要上下文；④沿用两条经验——分发前自查方案前提、守卫必须变异验证
