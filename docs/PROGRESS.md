# CoAgent-Learn 优化进度看板

> 总领会话唯一状态载体。由总领维护，实现性会话只读不写。
> 配套：`LEAD_SESSION_PROMPT.md`（流程）、`SINGLE_STEP_EXECUTION.md`（分发来源）、`OPTIMIZATION_PLAN.md`（问题证据）

## 0. 元信息

| 项 | 值 |
|----|-----|
| 基线 commit | `4a1a7cf`（2026-08-29，分支 `master`，工作区干净） |
| 看板初始化 | 2026-08-29 |
| 回归基线 | 后端 pytest **241 / 241**（基线 commit `4a1a7cf`）；前端 vitest **26 / 26** + `tsc` 0 错误 |
| **当前实测规模** | 后端 pytest **364 passed**（N3 收口，commit `db55a28`）；前端 vitest **90**（原 32）。演进：`241` →C1/C2/N1/C3 各步守卫→ `251` →F1 +9 条→ `260` →C4 +6 条→ `266` →F2 +5 条→ `271` →P1 +7 条守卫→ `278` →F3 +9→ `287` →F5 +8→ `295` →F6 +5→ `300` →F4′ +14→ `314` →D 组 +22→ `336` →A 组 +20→ `356` →**B 组 +1 → `357`**（T38 1 条，后端；其余 B1/B3/B2/B4 均为前端）。前端 vitest `26` →A2 +4→ `30` →A3 +2→ `32` →**B 组 +58 → `90`**（B1 8 / B3 38 / B2 8 / B4 4）；**N3 +7 → `364`**（T17 声明守卫 1 / N3 发布守卫 6） |
| **全量回归耗时** | **49.73s**（B 组验收复测，总领实测）。演进：`302.01s`（F2 后实测）/ `122.28s`（P1 会话同机实测，快状态）→ P1 后 `30.61s`（P1 会话）/ `38.40–39.17s`（总领复测）→ F4′ 验收 `41.80s` → D 组验收 `44.30s` → A 组验收 `47.58s` → B 组验收 `49.73s`（总领实测，容器运行态）。绝对值随机状态波动较大（跨机观测差约 3 倍），以同时段中位数与 A/B 比值为准。 |
| **代码规模** | 后端 68 个 Python 文件 / 9678 行，最大文件 `pipeline_v2.py` 628 行；前端 57 个 TS/TSX 文件 / 10878 行 |

---

## 1. 步骤序列与状态

状态取值：`待分发` / `进行中` / `已完成` / `受阻`

| Step | 内容 | 前置 | 风险 | 改动文件（文件表面） | commit | 状态 |
|:----:|------|:----:|:----:|---------------------|:------:|:----:|
| C1 | 依赖固化进镜像 | — | 低 | ✅ 实际改动：`deploy/docker-compose.yml` + `tests/test_c1_runtime_deps.py`(新) | `9c8378a` | **✅ 已完成** |
| C2 | 移除死依赖 | C1 | 中 | ✅ 实际改动：`backend/requirements.txt`(-3 行) + `tests/test_c2_dead_deps.py`(新) | `e2ca50b` | **✅ 已完成** |
| **A1** | SSE 合批与心跳收敛 | C1 | 中 | ✅ 实际改动：`backend/engine/sse_pump.py`(新，108 行)、`backend/engine/pipeline_v2.py`(仅 `stream()` 体)、`tests/test_a1_sse_pump.py`(新，7 条) | `dc9d101` | **✅ 已完成**（answer 帧 394→64；心跳 83→0；帧间隔 median 47ms；`drop_pending()` 已为 A2 预留） |
| **A2** | answer_reset 帧 | A1 | **高** | ✅ 实际改动：`backend/engine/pipeline_v2.py`、`backend/engine/sse_pump.py`、`frontend/src/hooks/useChatStream.ts`、**经批准越界** `frontend/src/sse.ts`(+2)、`frontend/src/answerReset.test.ts`(新，4 条)、`tests/test_a2_answer_reset.py`(新，4 条)、`tests/golden/sse_frames_v2.json`(随协议再生) | `6e18b3c` | **✅ 已完成**（前后端同一笔 commit；E2E mock judge 三段断言 + Playwright 真实 UI 验证） |
| **A3** | 删除打字机降级路径 | A2 | 中 | ✅ 实际改动：`frontend/src/hooks/useChatStream.ts`(-34/+32)、`frontend/src/noTypewriter.test.ts`(新，2 条) | `ba0f01a` | **✅ 已完成**（两分支内容相同 → 合并为一次无条件同步写入；`setInterval`/`typingOn` 均清零） |
| **B1** | memo 化 + props 稳定化 | — | 中 | ✅ 实际改动：`frontend/src/components/CenterPanel.tsx`(+160/-51)、`frontend/src/components/chat/AssistantMessage.tsx`(+43/-…)、`frontend/src/components/chat/assistantMessageProps.test.ts`(新，8 条) | `b31d198` | **✅ 已完成**（三组件 memo + 16 props 稳定化；流式期重渲染 **delta 恒 =1**；30 条滚动 164 fps） |
| **B3** | Markdown 分片缓存 | B1 | **高** | ✅ 实际改动：`frontend/src/components/chat/AssistantMessage.tsx`(+170/-15)、`frontend/src/components/chat/mdChunkEquality.test.ts`(新，38 条) | `7f4cc58` | **✅ 已完成**（**只缓存已闭合块 + 尾段整文**；38 条一致性语料逐字节相等；1500 字与 100 字耗时持平 9–15µs vs 旧路径 69–111µs） |
| **B2** | 列表窗口化 | B1 | 中 | ✅ 实际改动：`frontend/src/components/CenterPanel.tsx`(+68/-3)、`frontend/src/components/centerPanelWindow.test.ts`(新，8 条) | `441a5e9` | **✅ 已完成**（窗口 12 + 等高占位 + **追加冻结**；粘底流式期底部距离最大 1px 零抖动；长任务 0） |
| **B4** | 断线轮询收敛 | **A1** | 低 | ✅ 实际改动：`frontend/src/hooks/useChatStream.ts`(+98/-12)、`frontend/src/hooks/chatPolling.test.ts`(新，4 条) | `4947558` | **✅ 已完成**（抽 `startPollRecovery`，20 次上限 ≈61s；stop/卸载/新一轮三处清理） |
| **D1** | 消除反向依赖 | — | 低 | ✅ 实际改动：`backend/services/chat_context.py`(新，+156)、`backend/main.py`(-143)、`backend/engine/pipeline_v2.py`(3 行 import) | `8990587` | **✅ 已完成**（三个函数搬迁**源码逐字节 + AST 双重相同**，总领脚本复核） |
| **D2** | LLM client 复用 | — | 低 | ✅ 实际改动：`backend/engine/pipeline_v2.py`(+55/-11)、`tests/test_d2_llm_client_cache.py`(新，8 条) | `8d44499` | **✅ 已完成**（思考档单轮 OpenAI 构造 4→2；sha256 摘要 key + 双检锁） |
| **D3** | 清理 `_strip_thinking` | — | 低 | ✅ 实际改动：`backend/core/base_llm.py`(+11/-6)、`tests/test_d3_strip_thinking_removed.py`(新，4 条) | `d531717` | **✅ 已完成**（实证双样本：思考走独立 `reasoning_content` → 按决策 3 删除；`chat()` 保留 `.strip()` 行为等价） |
| **D4** | 重试幂等 | — | 中 | ✅ 实际改动：`backend/engine/pipeline_v2.py`、`backend/core/db/_business_tables.py`、`backend/main.py`(:108 ChatRequest +1)、`frontend/src/hooks/useChatStream.ts`、`backend/core/db/rollback_d4_client_msg_id.sql`(新，反向脚本)、`tests/test_d4_retry_idempotency.py`(新，7 条) | `3ee3a36` | **✅ 已完成**（部分唯一索引 + 历史数据零迁移 + 冲突跳过） |
| C3 | 前端生产化 | C4 之前（部署链内） | 中 | ✅ 实际改动：`frontend/Dockerfile`(多阶段)、`frontend/nginx.conf`(新)、`deploy/docker-compose.yml`(frontend 块)、`tests/test_c3_nginx_config.py`(新)、`frontend/public/favicon.ico`(新)；**经批准越界**：`frontend/src/App.tsx`(1 行 profilePending 修复) | `fad1feb`→`0534e3c`（4 个） | **✅ 已完成** |
| **F1** | **修复知识库图片上传链路**（新增，C3 发现） | C3 | **高（P0 功能完全失效）** | ✅ 实际改动：`backend/routers/knowledge.py`（`knowledge_upload_file` 重构 + `_process_file_bg` 图片分支补终态）、`tests/test_f1_image_upload.py`(新，9 条) | `3dd5424` | **✅ 已完成** |
| **F2** | **非图片上传解析回归 + 重复上传进度终态**（新增，F1 引入 / F1 发现） | F1 | 中 | ✅ 实际改动：`backend/routers/knowledge.py`(+11/-1)、`tests/test_f1_image_upload.py`(+78) | `19806af` | **✅ 已完成** |
| **P1** | **测试基础设施提速（T25）**（新增，进度成本根因诊断导出） | F2 | **中（动 DB 层生产代码）** | ✅ 实际改动：`backend/core/db/_sqlite_core.py`(+75/-20)、`_business_tables.py`(+48/-32)、`tests/conftest.py`(+56)、`tests/test_p1_db_perf.py`(新，7 条守卫) | `8bfa582`→`d52169e`（3 个） | **✅ 已完成** |

> **P 组**（Performance）是继 F 组之后新开的第二组外挂步骤，规则同 F 组：
> 实施/诊断中发现 → 上报总领 → 总领复核定性 → 单开一步，不在原步骤内顺手做。
> **P1 的两个子步骤**：P1.1 把 `PRAGMA journal_mode=WAL` 移出 `_new_conn`（零风险档）；
> P1.2 `execute()` 走缓存连接但**保留 `_new_conn()` 给显式调用者**（收益主体，8.2x）。
> 一笔 commit 一个子步骤，各跑一次全量回归（决策 20 批次规范）。
| C4 | healthcheck + restart | F1 | 低 | ✅ 实际改动：`backend/main.py`(+`/healthz` 8 行)、`deploy/docker-compose.yml`(+18 行 healthcheck/restart/depends_on)、`tests/test_c4_healthcheck.py`(新，6 条)、`README.md`(FAQ +10 行) | `531ba17`→`f3d21f3`（3 个） | **✅ 已完成** |
| **N1** | **部署就绪**（新增） | C2 | 低 | ✅ 实际改动：`deploy/docker-compose.yml`、`.env.example`、`README.md`、`pyproject.toml`(-3)、`main.py`(:3)、`tests/test_n1_deploy_readiness.py`(新)、**经批准越界**：`backend/requirements.txt`(+openai、torch 索引切阿里云)、`tests/test_c1_runtime_deps.py` | `899afae`→`9f82ee2`（7 个） | **✅ 已完成** |
| **N2** | **端到端部署验收**（新增） | P1 | 低 | ✅ **零代码改动**（第 1 次，build 路径，从 GitHub clone 验评委真实路径） | —（纯验证） | **✅ 已完成**（6 过 1 败） |
| **F3** | **上传入口约束 + frontend healthcheck**（新增，N2 撞出） | N2 | **中（跨层：后端常量 + 前端）** | `backend/routers/knowledge.py`（`UPLOAD_CONSTRAINTS` 补图片扩展名）、`frontend/src/components/resource/UploadPanel.tsx`（`.catch(() => {})` 静默吞失败）、`deploy/docker-compose.yml`（frontend healthcheck） | — | 待分发 |
| **F4′** | **双 Key 引导 + 入库异常可见化 + 剔除 bmp + mime 改对**（F4 的 F5 后修订版；owner 2026-08-30 拍板并入 ④⑤） | F5 / F6 | **中（改异常传播语义，波及 `_process_upload` 全部 7 个调用点）** | ✅ 实际改动：`backend/routers/knowledge.py`（内层吞错改外传 + 3 处同步结构化错误 + 新增 `_process_upload_bg` 包装）、`backend/engine/pipeline_v2.py`（`_sniff_image_mime` 魔数推断）、`README.md`（双 Key 对照表）、`frontend/src/components/settings/ServiceSettings.tsx`（未配置琥珀色告警）、`frontend/src/components/resource/UploadPanel.tsx`（轮询原因透传 + `FALLBACK_ACCEPT` 去 `.bmp`）、`tests/test_f4_upload_error_visibility.py`(新，14 条)、`tests/test_f3_upload_constraints.py`（`BASELINE_IMG_EXTS` 同步 6→5） | `e48e67d`→`2855fc9`（5 个） | **✅ 已完成**（314 passed） |
| **F5** | **移除本地模型，全部走 API**（owner 2026-08-30 拍板） | F3 | **中（改依赖构成 + 行为变更）** | `backend/core/embeddings.py`、`backend/core/knowledge_service.py`、`backend/core/config.py`、`backend/requirements.txt`（删 torch / sentence-transformers / 阿里云 find-links） | `a79f6d9`→`3395670`（4 个） | **✅ 已完成** |
| **F6** | **聊天输入框图片白名单**（新增，F3 复核发现） | F3 | **低**（CenterPanel 一处 accept） | ✅ 实际改动：`frontend/src/components/CenterPanel.tsx:427`（accept +1 行）、`tests/test_f6_chat_image_accept.py`(新，5 条守卫)；**`DragDropInput.tsx` 未动（方案 A 固化进守卫）** | `542caf3` | **✅ 已完成** |

> **F6 实测成果**（2026-08-30）：聊天附件点选图片端到端走通——选择器可选 PNG →
> 附件挂载 `isImage:true` → 后端 vision 调用 200 → 模型准确描述测试图（白底红圆）。
> pytest **295 → 300 passed**（+5 守卫）；tsc 0 错 / vitest 26 零回归；变异验证
> （accept 去 jpeg → 恰 1 条红 → 还原全绿）。**清单来源决策**：accept 用静态串 =
> `:140` 下游分支 + 双向守卫，**不沿用** upload-constraints（后者含 bmp，VL 拒收 E-31，
> 两场景允许格式本就不同）。**DragDropInput 方案 A**：下游无图片分支且使用方未传
> `onFile`，加 accept 只会更差；守卫反向固化。新发现 4 项（KnowledgeView「上传资源」
> 区块确认失效等）详见 `docs/progress/step-F6.md`（本地归档）。<br>

> **F5 实测成果**：镜像 **3.25GB → 1.67GB**、冷构建 **433s → 207.9s**、
> pytest **287 → 295 passed**（+8 守卫）。实际释放 1.58GB > 预估 1.13GB
> （torch 链的 `tokenizers`/`huggingface-hub`/`joblib`/`threadpoolctl` 等传递依赖一并消失）。
> **经批准越界**：`backend/routers/settings.py` 最小编辑——不改则评委全新 clone 的
> `GET /api/settings` 直接 `AttributeError` 500。<br>
> ⚠️ **总领失误已认领**：F5 提示词里我写「`EMBEDDING_BACKEND` 仅 2 处引用，删除安全」——
> **实际 4 处**（`git grep` 复核：config.py:20 / embeddings.py:67 / **settings.py:83** /
> **settings.py:133**）。我用 `grep | head -4` 查爆炸半径，被 RERANK 的命中占满而截断。
> → 导致实施会话中途必须报批扩边界。已固化为**决策 27**。
> ⚠️ **新发现 1 定性上调**：`knowledge.py:105-109` 的 `_process_upload` 吞异常
> （异常只进日志，`n` 保持 0 → 返回 `chunks:0`）。这**削弱了 owner 拍板的 A1**——
> 评委看不到「要配 Key」，只看到 `chunks:0`。→ **从「上报不修」上调为 F4′ 必办**。

> ⚠️ **F3 只修了 3 个文件入口中的 1 个**（总领全前端扫描实证）：
> `UploadPanel.tsx:191` 已改为动态 accept ✅；但 **`CenterPanel.tsx:427` 与
> `DragDropInput.tsx:85` 仍是静态 accept 字符串，不含任何图片扩展名**。
> → 评委若在**聊天界面**点附件按钮传图，**仍然选不了**。
> 但聊天协议层本身支持：`useChatStream.ts:214` 有 `image:` 字段——缺的只是那个 accept。
> 已登记 **F6**。
> 注：这**不是** F3 的疏漏——F3 的文件边界就是 `UploadPanel.tsx`，实施会话据实上报，
> 处置正确。
>
> ⚠️ **F6 的两处入口下游能力不同，已核实，不可一刀切**（2026-08-30 总领逐行核实）：
>
> | 入口 | 下游 | 结论 |
> |---|---|:--:|
> | `CenterPanel.tsx:427` | `:128-150` 的 `processFile` **已支持** `png/jpg/jpeg/gif/webp`（读 data URL、base64、`isImage: true`） | ✅ **可安全加 accept**——缺的只有 accept |
> | `DragDropInput.tsx:85` | `:20-36` 只处理文本，其余委托 `onFile`；**唯一使用方 `KnowledgeView.tsx:105/110` 均未传 `onFile`** | ❌ **不建议加**——选中图片会弹「该格式暂不支持」，比现在更差 |
>
> **另发现**：`KnowledgeView.tsx:105`「上传资源」区块的 `onChange={() => {}}` 是**空函数**
> 且未传 `onFile` → **连文本文件读出来也会被丢弃，该区块疑似完全失效**（已写入 F6 交接要求）。
> 另注意 `CenterPanel.tsx:130` 有 **2MB 大小限制**、`:140` 图片列表**不含 bmp**（与 E-31 一致）。

> ✅ **F5 四项决策 owner 已拍板（2026-08-30）**：① **A1 无 Key 硬失败**；
> ② **`EMBEDDING_BACKEND` 删除**；③ **接受「必须有硅基流动 Key 才能用知识库」**；
> ④ **F4 后续缩减为「仅双 Key 引导」**（归后续，不在 F5 范围）。
> **`RERANK_BACKEND` 按总领判断处理**：删除 `local` 分支，保留字段（收敛为 `api | none`，
> `none` 是合法用户选项）。
> **正式提示词已生成**：`docs/dispatch/step-F5.md`（计划稿见 `step-F5-plan.md`）。
> **行为规格关键区分**：embedding **硬失败**（无它检索不存在）vs rerank **优雅降级 +
> 可见日志**（无它检索仍可用，只是未排序）——两者不可混为一谈。
> **爆炸半径已核实**：`EMBEDDING_BACKEND` 全仓仅 2 处引用（定义 + 一处判定），
> 不在 `.env.example` / README / `deploy/` / 前端，删除安全。
> **实测收益**：backend 镜像 **3.25GB → ≈1.4GB**；可移除 torch 750M + transformers 113M +
> scikit-learn 49M + scipy 139M + sympy 74M ≈ **1.13GB**（全链路 `Required-by` 仅
> `sentence-transformers`）。**须保留** `onnxruntime`（`magika`/`pymupdf-layout`，markitdown 链）
> 与 `pymupdf`（PDF）。<br>
> ⚠️ **F5 与 F4 有重叠需裁定**：F4 的「降级告警」以保留本地兜底为前提；
> F5 移除本地通道后降级不复存在 → **建议 F5 执行后 F4 缩减为「仅双 Key 引导」**（待 owner 确认）。<br>
> ⚠️ **F5 与 F3 文件零重叠**，但两者都要重建镜像/起容器，**建议串行**（F3 完成后再做 F5）。

> 💡 **F3 与 F4 可合并在一个会话跑**（文件不重叠，各出各自 commit，遵循决策 20）。
> 若合并：先完成 F3 的提交，再做 F4 的。

> **N2 第 1 次结果（2026-08-30）**：**7 项中 6 过 1 败**，附加第 ⑧ 项发现伪向量降级。
> ① 无 Key 启动 ✅｜② 冷构建 **433s** + 启动 8s ≈ 7m21s ✅（README「10 分钟以内」承诺成立）
> ③ 双服务 healthy ❌ **frontend 根本没有 healthcheck**｜④ 首屏 16 请求全 200、console 0 错误 ✅
> ⑤ 界面填 Key 免重启 ✅（机制实为 localStorage + 请求体，不落 settings 表）｜⑥ 流式 SSE 逐 token、首包 0.1s ✅
> ⑦ 图片上传 ✅（**仅拖拽可达**，点击选文件被前端白名单拒收）｜⑧ **伪向量降级实锤**（T20）
> **③ 判失败正确，但判据错在总领**：C4 的 6 条守卫从未要求 frontend 有 healthcheck，
> 却是我在 N2 验收项里写了「双服务 healthy」——要了 C4 从未被要求交付的东西。
> 详见 `docs/progress/step-N2.md` 批注 §B/§C。
| **N3** | **发布封装** | 全部 17 步完成 | 中 | ✅ 实际改动：`backend/Dockerfile`（方案 A 显式 COPY）、`.dockerignore`(新)、`deploy/docker-compose.yml`（image: 钉 sha + 移除 3 代码挂载）、`.github/workflows/build-push.yml`(新)、`README.md`（拉取口径）、`backend/requirements.txt`(+requests，T17)、`tests/test_n3_release_packaging.py`(新，7 守卫)、`deploy/docker-compose.override.yml`(新，不入库) | `c417022`→`db55a28`（8 笔） | **✅ 已完成**（2026-08-31；364 passed / tsc 0 / vitest 90；GHCR 双包 Public 匿名可拉；新 clone 照 README 走查通过；总领独立变异抽查咬合） |
| **N2②** | **端到端验收 · pull 路径**（第 2 次） | N3 | 低 | ✅ **零代码改动**（冷缓存+登出态匿名拉取 67.2s——save→rmi→重拉严谨取证；7/7+⑧ 全过：无 Key 明确报错 / 有 Key 真模型向量 0.01 整数倍=0；FCP 1.38s / console 0 错；新发现 T47/T48 见 §4） | —（纯验证） | **✅ 已完成**（2026-08-31；M7 收官，M1–M7 全 ✅） |

> 步骤总数由 15 增至 **24**（新增 N1、N2、N3，C3 实施中发现 **F1**，F1 验收中发现 **F2**，
> 进度成本根因诊断后新增 **P1**，N2 端到端验收撞出 **F3、F4**，owner 拍板 **F5**，
> F3 复核发现 **F6**）。
> **会话数**取决于合并方式，见 §1.3 执行路径。
> `LEAD_SESSION_PROMPT.md` 与 `SINGLE_STEP_EXECUTION.md` 中的「15 步」表述已过时，以本表为准。
>
> **F1 是新开的 `F` 组**（Functional bug fix）。它不属于原 15 步，也不属于部署链/体验链，
> 而是「部署验证过程中撞出来的功能性缺陷」。F 组保持开放，后续步骤再撞出同类缺陷可续编 F2、F3。
> **F 组的处置规则**：实施会话发现 → 上报总领 → 总领复核定性 → 单开一步，不在原步骤内顺手修。

### 1.1 分发记录

| Step | 提示词位置 | 生成时间 | 会话状态 |
|:----:|-----------|---------|:--------:|
| C1 | `docs/dispatch/step-C1.md` | 2026-08-29 | **✅ 已完成**（commit `9c8378a`，交接文档 `docs/progress/step-C1.md`） |
| C2 | `docs/dispatch/step-C2.md` | 2026-08-29 | **✅ 已完成**（commit `e2ca50b`，交接文档 `docs/progress/step-C2.md`） |
| N1 | `docs/dispatch/step-N1.md` | 2026-08-29 | **✅ 已完成**（commit `899afae`→`9f82ee2`，交接文档 `docs/progress/step-N1.md`） |
| C3 | `docs/dispatch/step-C3.md` | 2026-08-29 | **✅ 已完成**（commit `fad1feb`→`0534e3c`，交接文档 `docs/progress/step-C3.md`） |
| F1 | `docs/dispatch/step-F1.md` | 2026-08-29 | **✅ 已完成**（commit `3dd5424`，交接文档 `docs/progress/step-F1.md`） |
| C4 | `docs/dispatch/step-C4.md` | 2026-08-29 | **✅ 已完成**（commit `531ba17`→`f3d21f3`，交接文档 `docs/progress/step-C4.md`） |
| F2 | `docs/dispatch/step-F2.md` | 2026-08-29 | **✅ 已完成**（commit `19806af`，交接文档 `docs/progress/step-F2.md`） |
| P1 | `docs/dispatch/step-P1.md` | 2026-08-29 | **✅ 已完成**（commit `8bfa582`→`d52169e`，交接文档 `docs/progress/step-P1.md`） |
| N2 | `docs/dispatch/step-N2.md` | 2026-08-30 | **✅ 已完成**（第 1 次，build 路径；交接文档 `docs/progress/step-N2.md`） |
| F3 | `docs/dispatch/step-F3.md` | 2026-08-30 | **✅ 已完成**（commit `87cf570`/`a8e95a4`/`2b951f7`，287 passed；交接文档 `docs/progress/step-F3.md`） |
| F4 | `docs/dispatch/step-F4.md` | 2026-08-30 | ⚠️ **已被 F4′ 取代**（F5 移除本地通道后「降级告警」前提消失） |
| **F4′** | `docs/dispatch/step-F4.md`（F5 后修订版） | 2026-08-30 | **✅ 已完成**（commit `e48e67d`→`2855fc9`，314 passed；交接文档 `docs/progress/step-F4prime.md`） |
| **D 组** | `docs/dispatch/step-D.md` | 2026-08-30 | **✅ 已完成**（commit `3ee3a36`/`d531717`/`8d44499`/`8990587`/`56ebfc6`，336 passed，已推送；交接文档 `docs/progress/step-D.md`，本地归档不入库——见 E-24） |
| **A 组** | `docs/dispatch/step-A.md` | 2026-08-30 | **✅ 已完成**（commit `eb0e4ab`/`ab43d3a`/`dc9d101`/`6e18b3c`/`ba0f01a`，356 passed / vitest 32，已推送；交接文档 `docs/progress/step-A.md`，本地归档不入库——见 E-24） |
| **B 组** | `docs/dispatch/step-B.md` | 2026-08-30 | **✅ 已完成**（commit `98946e2`/`b31d198`/`7f4cc58`/`441a5e9`/`4947558`，357 passed / vitest 90，已推送；交接文档 `docs/progress/step-B.md`，本地归档不入库——见 E-24） |
| F5 | `docs/dispatch/step-F5.md` | 2026-08-30 | **✅ 已完成**（commit `a79f6d9`→`3395670`，295 passed；交接文档 `docs/progress/step-F5.md` 由总领补建） |
| F6 | `docs/dispatch/step-F6.md` | 2026-08-30 | **待执行**（聊天输入框 accept 补图片） |
| F4′ | `docs/dispatch/step-F4.md` | 2026-08-30 | **已修订待执行**（F5 后缩减为「双 Key 引导 + 入库异常可见化」） |
| **N3** | `docs/dispatch/step-N3.md`（2026-08-31 修补版） | 2026-08-31 | **✅ 已完成**（commit `c417022`→`db55a28` 共 8 笔，364 passed；交接 `docs/progress/step-N3.md`；总领独立复测全绿） |
| **N2②** | `docs/dispatch/step-N2-pull.md`（2026-08-31 校准版） | 2026-08-31 | **✅ 已完成**（7/7+⑧，零改动 0 push；交接 `docs/progress/step-N2-pull.md`；新发现 T47/T48 上报） |
| **F7** | `docs/dispatch/step-F7.md`（2026-08-31） | 2026-08-31 | **🔶 实证完成，未动代码**（缺陷当前不可复现=环境依赖；总领三处取证被其推翻；但其窗口 bracket 出 **T50 数据丢失事件**——待交代操作序列后改判调查） |
| **F8** | `docs/dispatch/step-F8.md`（2026-08-31） | 2026-08-31 | **✅ 已完成并经总领验收**（7 commit `24266f5..224f90c` 已 push 两行一致；总领亲证三绿：pytest 409 / vitest 96 / tsc 0；实验全程副本库，真实库 10946 行零接触；纠错记录：「INFO 进不了容器日志」前提不成立，S2 收敛为 engine 透传；交接 `docs/progress/step-F8.md`，遗留 T51/T52 登记） |

> 分发提示词统一存放于 `docs/dispatch/step-<id>.md`，交接文档归档于 `docs/progress/step-<id>.md`。

### 1.2 文件冲突矩阵（并行可行性判据）

「可并行」不能只看逻辑依赖，必须看**文件表面是否重叠**。共享同一文件的步骤，若分发到并行会话，会产生覆盖式冲突。

| 文件 | 涉及步骤 |
|------|---------|
| `backend/engine/pipeline_v2.py` | **A1、A2、D1、D2、D4**（5 步共享） |
| `frontend/src/hooks/useChatStream.ts` | **A2、A3、B4、D4**（4 步共享） |
| `frontend/src/components/CenterPanel.tsx` | B1、B2 |
| `frontend/src/components/chat/AssistantMessage.tsx` | B1、B3 |
| `deploy/docker-compose.yml` | C1、C3、C4 |
| `backend/main.py` | D1、C4（+`/healthz` 一行）、N1（:3 docstring，已完成） |
| `backend/routers/knowledge.py` | **F1、F2、F3**（其余步骤不涉及） |
| `frontend/src/components/resource/UploadPanel.tsx` | **F3**（独占） |
| `frontend/Dockerfile` | C3、F3（若 healthcheck 走 Dockerfile 而非 compose） |
| `backend/core/db/_sqlite_core.py` | **P1**（独占，生产 DB 层，高风险） |
| `tests/conftest.py` | **P1**（必要时；若被改，影响全部测试，需重点复核） |

**结论**：标为「可并行」的 D1/D2/D4 与 A 组在 `pipeline_v2.py` 上重叠；B4 与 A2/A3 在 `useChatStream.ts` 上重叠。

### 1.2.1 第二维度：运行时资源冲突（比文件冲突更硬，2026-08-29 新增）

> **文件不重叠 ≠ 可并行。** 以下资源在本项目里是**全局单例**，两个会话同时验证会互相破坏。
> 本条是回答「F1 与 C4 能否并行」时补上的——**答案是不能，主因不是文件，是运行时资源。**

| 资源 | 单例形态 | 冲突后果 |
|---|---|---|
| git 工作区 | 唯一 `D:\desktop\coAgent-Learn`，**决策 1 明确不启用 worktree 隔离** | 交错 commit；A 跑全量回归时 B 有未提交改动 → A 的结果被污染 |
| 容器名 | `container_name: guashuai-backend` / `guashuai-frontend` **硬编码**（`docker-compose.yml:8/20`） | 后者 `up` 直接顶掉前者的容器。**改 `COMPOSE_PROJECT_NAME` 无效**——container_name 是全局唯一的，不随 project 变化 |
| 镜像 tag | `deploy-backend:latest` / `deploy-frontend:latest` | 后构建的覆盖前者，前者的验证结论当场作废 |
| 端口 | `8000`、`5173:80` 硬编码 | 无法起第二套实例 |
| SQLite 数据目录 | `../data:/app-data` bind mount（`docker-compose.yml:38`） | **8 个测试文件会触碰 DB**（`test_db_path`、`test_engine_modes`、`test_engine_trace`、`test_engine_v2_golden`、`test_match_report`、`test_memory_repo`、`test_quiz_feedback`、`test_resource_edit`）。两会话并发跑全量回归 → `database is locked`，且互相污染数据 |

**→ 判据修正**：判断能否并行要看两层。第一层「文件表面」，第二层「运行时资源」。
第二层在本项目（单工作区 + 硬编码容器名 + 固定端口 + bind mount 数据目录）下**几乎总是不满足**，
所以全串行是正确的默认策略——决策 1 当初只论证了文件层，这里是补上的第二层依据。

### 1.2.2 一条对验证成本很重要的结构事实

**`../backend:/app` 是 bind mount**（`docker-compose.yml:35`），backend 容器**直接跑宿主工作区的 Python 代码**，
镜像里 `COPY . .` 的那一份在运行时被完全遮蔽。

两条推论：

1. **改 Python 代码后不需要重建镜像**，只需重启 backend 容器
   （uvicorn 未开 `--reload`，必须显式 restart；只有**依赖**变化才需要真正 `--build`）。
   → 后续步骤的验证迭代成本比想象中低。F1、C4 都不改依赖，**都不需要 `--build`**。

   ⚠️ **重启命令必须带 `-f`（2026-08-30 实测修正，原文档此处有误）**：
   仓库**根目录没有 compose 文件**，唯一的 compose 是 `deploy/docker-compose.yml`。
   在仓库根直接执行 `docker compose restart backend` 会报
   `no configuration file provided: not found`（CWD 下无 compose 文件，属预期行为，非异常）。
   **正确写法**（仓库根目录执行，已实测通过）：
   ```bash
   docker compose -f deploy/docker-compose.yml restart backend
   ```
   等价替代：`docker restart guashuai-backend`（F2 会话用的这条，效果相同）。
   > 来源：F2 会话上报「`docker compose restart` 报 no configuration file provided，
   > 根目录确有 docker-compose.yml，原因未深究」——**后半句有误**：根目录并无该文件。
   > 总领复核时定位到真实原因并实测确认正确命令。
2. **「容器级冒烟」（T16）的准确定性**：它验证的是「镜像里的**依赖**齐全 + 宿主代码可 import」，
   **不验证镜像内 `COPY` 的代码副本**（那份在运行时不生效）。
   T16 可捕捉「依赖缺失」型缺陷（如 N1 的 `openai`）。
   但「镜像代码副本与工作区不一致」这类问题 T16 抓不到。记录在此，避免后续误读 T16 的证明力。

### 1.3 已定执行序列（全串行，一次一个实现会话）

> **v3（2026-08-29 修订）**：owner 确认为竞赛项目、验收主体是「从零 clone 的评委」，
> 故部署链全部前置；并加入批次合并（决策 20）与提速步骤 P1（决策 22）。

## ⭐ 当前执行路径（v4，10 个会话）

```
会话 1  F2   ✅ 19806af
会话 2  P1   ✅ 8bfa582→d52169e（测试提速，122–302s → 30–39s）
会话 3  N2   ✅ 第 1 次验收（build 路径，6 过 1 败）
会话 4  F3   ✅ 87cf570/a8e95a4/2b951f7（上传约束单一事实源 + frontend healthcheck）
会话 5  F5   ✅ a79f6d9→3395670（镜像 3.25→1.67GB，冷构建 433→207.9s）
会话 6  **F4′** ✅ `e48e67d`→`2855fc9`（314 passed）
         ① 双 Key 引导 ② **修 `_process_upload` 吞异常**（否则 A1 形同虚设）
         ③ 守卫 ④ **剔除 bmp（5 处）** ⑤ **`pipeline_v2.py:389` mime 改对**
         ~~F6 聊天输入框图片白名单~~ ✅ 已完成（`542caf3`/`0036da0`）
会话 7  D 组  ✅ `3ee3a36`→`56ebfc6`（336 passed，已推送）
        执行顺序 **D4 → D3 → D2 → D1**（风险降序，非文档列出的 D1→D2→D3→D4）
        **+ T26 修复（P1 引入的 WAL flag 回归）**
会话 8  A 组  ✅ `eb0e4ab`→`ba0f01a`（356 passed / vitest 32，已推送）
        子步骤 1 D1 守卫 → 2 judge 收编（决策 33 两项收尾）→ 3 A1 → 4 A2 → 5 A3
会话 9  B 组  ✅ `98946e2`→`4947558`（357 passed / vitest 90，已推送）
        子步骤 1 **T38 补 A2 emit 守卫**（决策 34，已关闭）→ 2 B1 → 3 B3 → 4 B2 → 5 B4
会话 10 N3  推预构建镜像（含决策 19 的 bind mount 处置）→ 紧接 N2 第 2 次验收（pull 路径）
```

**排序依据**：
- **F5 在 F4 之前**——F4 的「降级告警」以保留本地兜底为前提；F5 移除本地通道后
  降级不复存在，F4 需相应缩减。**先定 F5 再定 F4，可避免 F4 做无用功。**
- **F6 与 F4′ 合并**——两者都是小改动（F6 仅两处 accept 字符串），
  合并省一个会话，符合决策 20 精神。
- **F5 单独一个会话**——它改动依赖构成 + 有行为变更（无 Key 硬失败），
  与 F6 的小改动混在一起会让验收判据变模糊。

> **会话数由 8 增至 9**（新增 F3）。理由见决策 25。

**P1 为什么插在 F2 与 N2 之间（决策 22）**：
1. owner 明确要求「F2 完成后马上执行」。
2. **N2 顺带成为 P1 的运行时验证**——P1 动的是 DB 层生产代码，宿主 pytest 绿不等于
   容器能跑；P1 之后紧跟 N2（fresh clone + 真实部署 + 7 项验收），
   等于用真实部署路径复验 P1，**不增加额外会话**。
3. 会话 3–8 全部受益于提速，越早做省得越多。

---

### 1.3.1 逻辑分组（与上面的会话划分是两条线，别混淆）

```
【部署链 —— 目标：评委能跑起来】
C1 ✅ → C2 ✅ → N1 ✅ → C3 ✅ → F1 ✅ → C4 ✅ → F2 → P1 → N2（第 1 次，build 路径）

【体验链 —— 目标：评委用得顺】
D1 → D2 → D3 → D4 → A1 → A2 → A3 → B1 → B3 → B2 → B4

【发布封装 —— 目标：评委不必本地构建】
N3（推预构建镜像）→ N2（第 2 次，按 pull 路径复验）
```

### 1.3.2 ⚠️ 批次合并规范（决策 20，owner 2026-08-29 拍板）

体验链 11 步**不再一步一会话**，按组合并为 **3 个会话**。**P1 同理，2 个子步骤 1 个会话。**
**合并的三条硬约束**：
1. **一笔 commit 一个子步骤** —— 保住精确回滚能力
2. **每完成一个子步骤立即跑一次全量回归** —— 组内共享文件
   （`pipeline_v2.py` 被 D1/D2/D4 共享、`useChatStream.ts` 被 A2/A3/B4 共享），
   子步骤间会互相影响，**不能只在会话末尾跑一次**
3. **交接文档按子步骤分节** —— 便于总领逐段验收

箭头仍是**会话内的执行顺序**，依赖关系不变。

### 1.3.3 各组的预期验证成本（写提示词时要算进去）

| 会话 | 是否需 Docker 重建 | 说明 |
|---|---|---|
| F2 / P1 / D 组 | **否** | 后端代码，`../backend:/app` bind mount → 只 `restart`（§1.2.2） |
| A 组 A2/A3 | **是** | 触及 `useChatStream.ts`（前端） |
| B 组（全前端） | **是** | C3 已移除前端全部 8 条 HMR bind mount → 改前端必须 `build` |
| N2 / N3 / N2 重跑 | **是** | 部署形态验证本身 |

> ⚠️ **B 组的性能验证不可在开发模式做**：B 组是渲染性能优化（memo 化 / 分片缓存 / 窗口化），
> 若用 HMR dev server 测量，会因无压缩、React dev 开销而得到**错误结论**。
> 可用 `docker-compose.override.yml`（**已在 `.gitignore:35`**）挂回 HMR 做**快速迭代**，
> 但**最终性能数据必须取自生产构建产物**。此项由 B 组会话自行决定并说明理由。

- **部署链前置**：原序列把 C3/C4 排在倒数，是按「体验优化」排的。评委视角下「能否跑起来」是 0/1 问题，优先级高于体验的「好/更好」。
- **额外收益**：C1 落地后每次重启不再联网装包，后续 A/B 组需反复重启验证时快得多。
- **B4 排在 A1 之后**：心跳频率变化直接改变 B4 改动对象（`useChatStream.ts:391-406`）的触发条件。
- **无并行批次**：不启用 git worktree 隔离。理由见 §3.3 决策 1。
- **F1 插在 C3 与 C4 之间**（2026-08-29 总领决定）：C3 实施中发现知识库图片上传是 **P0 功能完全失效**（视觉 LLM 白调用、响应 `null`、图片什么都不进），而它直接让 N2 的验收第 ⑦ 项必然失败。F1 是「修一个已坏的功能」，C4 是「运维可观测性打磨」——**时间被压缩时应优先保 F1**。F1 与 C4 的文件表面不重叠（`knowledge.py` vs `compose`+`main.py`），两者顺序可交换。
- **F2 排在 C4 之后、N2 之前**（2026-08-29 总领决定）：F1 验收时总领通读代码发现，F1 的重构把非图片解析从「后台」提到了「HTTP 请求内」，导致 PDF 等文档在前端默认路径（`wait=0`）下**同步阻塞解析且解析两遍**。它与 F1 上报的「非图片重复上传进度卡 parsing」同处一个文件一个函数，合并为一步。**不阻塞 C4**（文件表面不重叠），但应在 N2 之前完成。

### 1.4 新增步骤说明（不在原 15 步内）

| Step | 闭环定义 | 成功判据 |
|:----:|---------|---------|
| **N1** | 输入：`git clone` 后的全新工作副本。输出：评委按 README 一次跑通。做什么：① `env_file` 改 `required: false`（已验证 v5.1.3 支持）；② **`.env.example` 去 BOM**（T14）并修正「全量对齐 config.py」的误导注释（T15）；③ 重写 README 部署章节（修 T10 事实错误、补 `cp` 步骤、写 10 分钟构建预期）；④ **清理 `pyproject.toml:9-11` 的 lang 系死声明**（E-3，总领决定并入本步）；⑤ 可选：修 `backend/main.py:3` 过时 docstring（仅注释一行）。**不做**：不动 `.gitignore` 的密钥忽略策略、不改任何逻辑代码。**预告**：N3 会把 README 的「构建」改为「拉取」，本步产出不是终稿。 | 删除 `.env` 后 `docker compose up` 仍能启动；`cp` 后环境变量真被加载（BOM 不导致首变量失效）；README 步骤可被第三方照做成功 |
| **N2** | 输入：临时目录下的干净 `git clone`。输出：一次完整部署的实证记录。**不改任何代码**，纯验证。验证项：① `cp .env.example .env`；② `docker compose up -d`；③ `docker compose ps` 双服务 healthy；④ 打开 `localhost:5173` 首屏加载完成；⑤ 界面填写 API Key；⑥ 完成一轮对话并收到流式输出；⑦ 知识库上传一张图片并确认 `/uploads` 回显正常（验证 T7）。**本步设计为可重复执行**：N3 之后需按 pull 路径重跑一次。<br>⚠️ **第 ⑦ 项的演示文件选型**：须用「**文件体积大、文本量中小**」的 PDF。大文本 PDF（2.24MB 文本 ≈ 4400+ 块）入库会撞前端 10 分钟轮询窗，UI 误报「处理失败或超时」（后台实际会完成）——F2 实测，会误导评委判定系统损坏。F2 的 UI E2E 用 2.99MB / 4,540 字符的构造件，全链数秒走完。<br>⚠️ **compose 命令须带 `-f`**：见 §1.2.2。 | 七项全部通过，附截图/日志 |
| **F1** | 输入：`backend/routers/knowledge.py:490-548` 的 `knowledge_upload_file` 图片分支结构性损坏。输出：图片能进文本索引、进图片向量库、落 `data/uploads/`、前端 `/uploads/<file>` 可回显。做什么：① **先写会红的 TDD 测试**（8 条断言，含「响应是 JSON 对象不为 null」「`source` 等于文件名」「前后台入库文本一致」「不得重复调用 `_store_image_vector`」「PDF 对照组不变」）；② 把 `source`/`_ch` 提到分支外，让图片分支与非图片分支汇合到同一尾部，同时覆盖 `wait=1` 与 `wait=0`；③ 删除 `:533`/`:538`/`:546` 三处恒假死分支；④ 变异验证。**不做**：不改前端、不改 `_process_upload`/`_store_image_vector` 实现、不改 `UPLOAD_CONSTRAINTS`、默认不动 GZip 中间件（除非实测到它造成可复现问题）。 | 浏览器走前端上传一张 PNG → 进度条走完 → 知识库列表出现该条 → `<img src="/uploads/...">` HTTP 200；且容器级冒烟复验通过 |
| **N3** | 输入：全部 17 步完成后的稳定代码。输出：推送到公共 registry 的预构建镜像，compose 从 `build:` 改为 `image:`。做什么：① 选定 registry（GHCR 或 Docker Hub，待 owner 决断）；② 构建 frontend/backend 两个镜像并打版本标签；③ 推送并设为公开可匿名拉取；④ 改 compose 为 `image:` 形式；⑤ 改 README 部署章节为 `pull` 而非 `build`。**不做**：不改任何业务代码、不动 `.env` 策略。 | 评委在临时目录 `git clone` 后，无需本地构建即可 `docker compose up` 跑通 N2 的全部七项 |

> **N3 对 N1/N2 的返工影响（已接受）**：N3 会把 compose 从 `build:` 改为 `image:`、
> 并把 README 的部署步骤从「构建」改为「拉取」，这两处正是 N1 的产出。
> 处置方式：N1 仍按 build 路径实施（此时镜像尚未定版，build 是唯一可用路径），
> N3 切换后重跑 N2 复验。N2 本身就定义为可重复执行的验收，重跑成本可控。
> **N1 的提示词需预告这一点**，避免实现会话误以为 README 是终稿。

---

## 2. 待核实事项（来自 OPTIMIZATION_PLAN §5，执行前必须落实）

| # | 事项 | 影响步骤 | 状态 |
|:-:|------|---------|:----:|
| 1 | `core/db/base.py` 的 `get_db()` 是否在 import 时建立连接（`postgres_client.py:11` 是模块级调用） | D1 | 未核实 |
| 2 | `_attic_20260825/`、`data_backup_20260814/` 是否可归档 | 全局（检索范围） | 未核实 |
| 3 | 是否存在 compose 之外的 redis / chroma 部署 | C1、C3 | **已核实** |
| 4 | `CHAT_ENGINE=v1` 回退路径是否仍可用（`pipeline_v2.py:34-37` 声明可回退，v1 文件是否存在） | **A1 的回滚预案依赖此项** | **已核实（结论：不存在）** |
| 5 | 后端是否有中间层（Nginx / 反代）缓冲 SSE | A1、A3 | **已核实** |

> 第 4 项必须在 A1 分发前核实：A1 的回滚预案写的是「`git revert` + 若 v1 已移除则用 `FLUSH_MS=0` 直通开关」，两种路径的验收方式不同。

### 2.1 已核实结论（总领实测，commit `4a1a7cf`）

| # | 结论 | 证据 |
|:-:|------|------|
| 3 | **无 redis / chroma**。但存在 4 个本地非 Docker 启动脚本：`start.bat`、`start-all.bat`、`start-backend.bat`、`start-frontend.bat`。前端本地起 `npm run dev`（自带热重载），后端本地起 `.venv\Scripts\python run.py`。 | 根目录文件列表 + `.bat` 内容 |
| 5 | **Docker 模式下 backend 无中间层**（`8000` 端口直出，无 nginx）。**本地开发模式下经 Vite dev proxy** 转发（见 T7）。 | `deploy/docker-compose.yml`、`frontend/vite.config.ts:35-43` |
| 4' | **`CHAT_ENGINE=v1` 回退路径不存在**：`engine_mode()`（`pipeline_v2.py:33-37`）**只有定义、零调用点**（全库 grep `engine_mode` 仅命中定义行），`backend/` 下无任何 v1 引擎文件。所谓「环境变量回退开关」是死代码。 | 总领实测 grep | 
| 4'' | **→ A1 回滚预案必须改为**：在 `sse_pump.py` 内保留 `FLUSH_MS=0` 的直通模式开关（环境变量控制），不得依赖 `CHAT_ENGINE`。 | 由 4' 直接推导 |

### 2.2 部署就绪性（owner 于 2026-08-29 确认为最高优先级目标）

> **owner 原话**：「这是竞赛项目，我发到 github 上评委能部署下来即可」。
> 即：验收主体是**从零 clone 的第三方**，而非开发者本机。所有决策以「第三方一次跑通」为准。

**阻塞清单**（按严重度，均为 `git clone` 后的真实失败路径）：

| # | 阻塞点 | 失败表现 | 状态 |
|:-:|--------|---------|:----:|
| B-1 | `.env` 被 gitignore，但 compose 强制 `env_file: ../.env` | `docker compose up` 报 `env file not found`，**容器根本起不来** | **✅ 已修**（N1，`899afae`）。`required: false` 生效；BOM 隐患（T14）经实测**证伪**（v5.1.3 剥离 BOM）但仍去 BOM + 立守卫，不把正确性押在未文档化的宽容行为上 |
| B-6 | **容器缺 `openai` 包**：`base_llm.py` import openai，镜像无此包 | Docker 形态下**对话功能必挂**（`No module named 'openai'`）；宿主 venv 有包 → pytest 244 全绿完全掩盖 | **✅ 已修**（N1，`9b3827d`，经批准越界）。由模拟评委实测撞出 |
| B-7 | `download-r2.pytorch.org` 当日实测 95 KB/s，buildkit 连续 3 次在 torch 191.8 MB 处停摆 | 镜像构建**无法完成** | **✅ 已修**（N1，`9f82ee2`，经批准越界）。切 `--find-links mirrors.aliyun.com/pytorch-wheels/cpu/`，实测 1.97 MB/s。总领已独立复核：该目录确有 `torch-2.13.0+cpu-cp312-cp312-manylinux_2_28_x86_64.whl` |
| B-2 | 每次启动运行时 `pip install` 13 个包 | 慢 + 强依赖清华镜像源可达，源不可用则起不来 | C1 覆盖 |
| B-3 | 前端跑 Vite dev server（无构建产物） | 首屏需等按需编译，HMR WebSocket 常驻，评委体感差 | **✅ 已修**（C3，`fad1feb`）。多阶段构建 + nginx 托管，首屏 3835ms/92 请求 → **293ms/26 请求（≈13×）** |
| **B-8** | **知识库图片上传完全失效**（C3 实施中发现，总领复核定性升级为 P0） | 上传 PNG → 视觉 LLM 被真实调用（**产生费用**）→ 描述结果被丢弃 → 响应 `null` → 图片不进文本索引、不进图片向量库、不落 `data/uploads/`。**直接让 N2 验收第 ⑦ 项必然失败** | **未修（F1）**。见 §2.5 专节 |
| B-4 | README:75「首次 5-10 分钟，之后每次几秒」与实现不符 | 评委预期错配 | T10 |
| B-5 | C3 改 nginx 后 `/uploads` 需反代，否则知识库图片 404 | 功能局部失效 | T7 |

**缺失环节**：15 步中**没有任何一步做端到端部署验收**（即「干净 clone → up → 页面可用」）。需新增一步或扩展 C4。

| B-2 状态 | **已修**（commit `9c8378a`）：compose command 移除运行时 pip install，冷启动 11.3s → 6.3s，断源不再阻塞启动 | — | **✅ 已修** |

### 2.3 依赖实测事实（由 Step C1 导出，直接影响 C2 的删除清单）

| 包 | 实测结论 | 证据 |
|---|---------|------|
| **llama-index-core** | **在用，不得删** | `core/knowledge_service.py:174-175`：`from llama_index.core.node_parser import MarkdownNodeParser` / `from llama_index.core.schema import Document` |
| **sentence-transformers** | **在用，不得删** | `core/embeddings.py:19-20`（SentenceTransformer）、`core/knowledge_service.py:483`（CrossEncoder） |
| **torch** | **间接在用，不得删** | 无直接 import，但是 sentence-transformers 的传递依赖 |
| langgraph | 零 import，可删 | `grep -rn "langgraph" backend/ skills/ --include=*.py` 无命中 |
| langchain / langchain-deepseek | 零 import，可删 | 同上，无命中 |
| **openai** | **在用，N1 前未声明 → 容器必挂** | `core/base_llm.py` import openai。N1 补入 `requirements.txt`（B-6） |
| **requests** | **在用但未声明**，靠 markitdown 传递提供 | 5 处惰性 import：`embeddings.py:45`/`:87`、`followups.py:42`、`knowledge_service.py:453`、`memory_analysis.py:45`。markitdown 0.1.7 的 hard deps 含 requests，但 `markitdown>=0.0.1a2` 下界极松（见 T17） |

> **静态扫描的已知盲区**：`backend/core/embeddings.py:45` 等处是**函数内惰性 import**，只在运行到该分支时才触发。
> 因此「AST 静态扫描导入 vs requirements.txt」只能发现候选，不能证明容器可用——**真正的判据是容器级冒烟**（见 T16）。

- **→ C2 的删除清单由 4 个缩减为 3 个**：`langgraph`、`langchain`、`langchain-deepseek`。原方案把 `llama-index-core` 归入死依赖是**推断错误**。
- **→ 镜像体积无法显著下降**：3.31 GB 的大头是 `torch` + `sentence-transformers`（本地 embedding 方案的必然代价）。除非改为 API embedding——属架构级变更，不在本次范围。**C2 的收益应定位为「构建时间下降」，而非「体积下降」**。

### 2.4 环境与工具事实（传导到后续所有步骤）

| # | 事实 | 影响范围 |
|:-:|------|---------|
| E-1 | 后端测试必须 `PYTHONPATH=backend`。裸跑 `.venv\Scripts\python -m pytest tests -q` 会因 `ModuleNotFoundError: No module named 'core'` 收集中断 | **所有涉及后端测试的步骤**。C1 提示词给的示例命令是错的，已修正 |
| E-2 | `backend/requirements.txt` **带 UTF-8 BOM**，首行实为 `\ufefffastapi`。按行解析必须用 `utf-8-sig` | C2 及任何解析该文件的脚本/测试 |
| E-3 | `pyproject.toml` 的 dependencies 与 `backend/requirements.txt` 是**两套并行声明**。~~chromadb / mcp / sqlalchemy 只在前者~~ → **表述不完整，已修正**：`pyproject.toml:9-11` **同样声明了 langgraph / langchain / langchain-deepseek**。C2 只删了 `requirements.txt` 里的三行，**两套声明现已不一致**。 | 容器路径不受影响（Dockerfile 走 `pip install -r requirements.txt`），但 `pip install -e .` 路径会装回死依赖。**总领决定并入 N1 一并清理** |
| E-7 | **`backend/requirements.txt` 是 CRLF 行尾**（非 LF），且带 BOM | 任何按行解析的脚本要注意；`splitlines()` 可自动处理 `\r\n`，pip 亦可，故当前守卫测试不受影响 |
| E-8 | **`agents/` 目录并非空目录**——无任何 `.py` 源码，但 `agents/__pycache__/` 留有 3 个 LangGraph 时代的 `.pyc`（`graph.cpython-312.pyc` 48 KB、`prompts.cpython-312.pyc`、`__init__.cpython-312.pyc`） | 无对应 `.py` 源码，Python 3 下**不可 import**，功能上等价于空。但项目介绍里「agents/ 是空目录」的表述须修正为「无任何 .py 源码，仅 3 个遗留 .pyc」 |
| E-4 | pytest 及其依赖已不进容器，容器内跑测试的能力不再存在 | 回归测试一律在宿主 `.venv` 跑 |
| E-5 | **`env_file` 的 `required: false` 语法在本机 compose v5.1.3 上可用**（总领用临时 compose 文件实测 `docker compose config` 解析通过，EXIT=0）。 | N1 方案成立 |
| E-6 | **`backend/core/config.py` 全部 30+ 个 `os.getenv` 均带默认值**（如 `DEEPSEEK_BASE_URL` 默认 `https://api.deepseek.com/v1`、`REVIEW_ENABLED` 默认 `0`）。因此**无 `.env` 时服务能正常启动**，不会崩溃；`.env` 只是覆盖配置的手段，不是必需品。 | N1 的处置保留 `env_file` + `required: false`（而非删掉 `env_file`），以便评委仍能通过 `.env` 配代理等可选项 |
| E-9 | **`backend/Dockerfile` 硬编码清华源**：`RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt`。主索引不是 PyPI 官方源。 | 国内评委无影响；境外或受限网络会慢/失败。**N3 推预构建镜像后此风险消失**（评委不再执行构建） |
| E-10 | 后端基镜像是 **`python:3.12-slim`** → 需要 `cp312` wheel；前端基镜像是 **`node:22-alpine`** | 任何按 Python/Node 版本判断 wheel 标签、npm 行为的场景 |
| E-11 | **阿里云 `mirrors.aliyun.com/pytorch-wheels/cpu/` 是 flat 目录**（阿里云自建 HTML 索引页，约 1.1 MB，URL 中 `+` 被转义为 `&#43;`），不是 PEP 503 simple index | 必须用 `--find-links`，用 `--extra-index-url` 不被接受（N1 实测）。解析其 HTML 时须先做实体解码 |
| E-12 | **torch CPU 版压过 CUDA 版的机制是 PEP 440 本地版本号**：`2.13.0+cpu` > `2.13.0`。**触发条件**：一旦阿里云该目录滞后于 PyPI（如 PyPI 出 2.14.0、镜像仍停在 2.13.0），pip 会**静默改拉 CUDA 大包**，镜像从 3.23 GB 涨到约 10 GB 且不报错 | 当前两者同为 2.13.0，风险未触发。N3 推预构建镜像后对评委永久失效。监控方式：比对阿里云目录最高版本与 PyPI 最高版本 |
| E-13 | **`frontend/src/api.ts` 是唯一 API 封装，全部路径为相对路径**（`/api/...`）；`useChatStream.ts:212` 的 `/api/chat` 也是相对路径。前端**零硬编码** `localhost:8000` / `guashuai-backend` | **C3 的 nginx 反代方案成立**，无需改任何前端代码即可把 `/api` 指向后端 |
| E-14 | 前端**未使用 react-router**（`package.json` 无 router 依赖，`src/` 下零 `Routes`/`useNavigate`） | C3 的 nginx 可不配 SPA fallback；配了也无害（保险起见建议保留 `try_files $uri /index.html`） |
| E-15 | **`frontend/package.json` 的 `build` 脚本是 `tsc -b && vite build`** —— 生产构建会跑完整 TypeScript 编译 | C3 改生产构建后，**任何 `tsc` 类型错误都会导致 Docker 构建失败**。C3 必须先实测 `npm run build` 是否干净 |
| E-16 | ~~后端无上传体积限制~~ → **表述错误，已修正**：业务层有显式校验 `knowledge.py:473` `UPLOAD_CONSTRAINTS["max_file_size_bytes"] = 50*1024*1024`，`:503-504` 拦截返回「超过 50MB」。（总领当初只查了 `UploadFile = File(...)` 而漏了业务层校验。） | 正确表述：**nginx 默认 1m 远小于后端 50MB 上限，会成为事实上的瓶颈**。C3 已配 `client_max_body_size 100m`（>50m），nginx 不再是瓶颈 ✅ |
| E-17 | **C3 改 nginx 后 SSE 帧粒度变了约 22 倍**：dev 时代 15.10s/1366 chunk（≈11ms/帧）→ nginx 后 26.76s/107 chunk（≈249ms/帧）。不是降级（直方图每 2s 桶均有 chunk），但**基线口径变了** | **A1（SSE 合批与心跳收敛）必须以 nginx 之后的口径（约 4 帧/s）为基线**，不能用 dev 时代测到的 20 帧/s，否则收益评估错误。<br>**2026-08-30 总领追加核实（A 组派发前）**：**nginx 已排除**是缓冲来源——`frontend/nginx.conf:42 proxy_buffering off`、`:44 gzip off`、`:45 proxy_read_timeout 3600s` 全部到位。链路上**唯一的缓冲环节是后端自己的 `GZipMiddleware`**（`main.py:62-64`，`minimum_size=1024`，T21 已登记为脆弱组合、默认不改）。→ **A1 必须实测 `Accept-Encoding: identity` 与默认 gzip 两轮的帧数差异**，判断当前低帧数是 gzip 的**偶然效果**还是真实合批；若为前者，A1 的价值是把「偶然」换成「显式可控」。<br>**另注**：心跳由后端泵每 50ms 自发（与 gzip/nginx 无关）→ **20 帧/秒、60 秒约 1200 帧至今未变，这才是 A1 真正的靶子** |
| E-18 | **embedding 模型是懒加载**（`core/embeddings.py:12-22` `_get_embedder()`，首次调用才 `SentenceTransformer("BAAI/bge-small-zh-v1.5")`）。**加载失败时静默降级为确定性伪向量**（`_embed_local` 的 fallback 分支），不抛错、不告警 | ① 启动不下载模型 ✅（C1 的「启动零联网」成立）；② **但首次知识库入库会触发 HuggingFace 下载**；③ 若 HF 不可达 → 检索质量静默崩塌且无人知晓。**N2 必须验证 embedding 走了真模型** |
| E-19 | **`python:3.12-slim` 里没有 curl、没有 wget**；`nginx:alpine` 有 busybox `wget` 也没有 curl | **C4 的 healthcheck 不能用 curl**，必须用容器内的 python（见 C4 提示词 4.3）。这是 healthcheck 最典型的想当然错误 |
| E-20 | **后端无任何健康检查端点**：`backend/main.py` grep `health`/`ping`/`status` **零命中**。现有 GET 端点都带业务依赖/路径参数，不适合当探针 | **C4 必须新增 `/healthz`**。该路径不在 nginx 的 `/api/`、`/uploads/` 匹配范围内，会落入 SPA fallback 返回 index.html——**不影响 Docker healthcheck（容器内直连 127.0.0.1:8000）**，且 8000 已映射到宿主机可供手验 |
| E-21 | **全量 pytest 耗时随步骤增长**：251 时 5m33s → **260 时 6m24s**（总领实测）。超过多数工具/终端的默认超时 | **必须后台跑或显式放宽超时**。否则会看到「退出码 1、无 traceback、停在某百分比」的**假失败**——那是进程被超时杀掉。总领踩过一次，误判为测试挂了。**后续步骤基线还会涨，务必后台跑** |
| E-22 | **settings 表覆盖 env 是设计如此，不是 bug**：`config.py:19` 注释明写「配置源唯一：前端设置界面（settings 表）优先，`.env` 仅作首次默认」。生效键包括 `KB_MODE`、`EMBEDDING_*`、`RERANK_*`、`VECTOR_MODEL` | 评委新 clone 时 settings 表为空 → `.env` 有效；一旦在界面改过 → `.env` 对该键**永久失效**（除非清库）。**N1 的 README 未写明这层优先级**，N3 改 README 时应补一句 |
| E-23 | **`KB_MODE` 只影响图片向量，不影响 `/uploads` 回显**。代码默认值是 **full**（`config.py:39`）；light 时 `add_image` 直接 return 0（`knowledge_service.py:300`），但 `_store_image_vector` 的**写盘在调用 add_image 之前**（`knowledge.py:166-175`） | **N2 验收第 ⑦ 项在 full（含/不含 VL key）与 light 三种配置下均可通过**，不受 owner 本机 `KB_MODE=light` 影响。已写入 F1 验收批注 B2 |
| E-24 | **`docs/` 整个目录被 gitignore**（`.gitignore:32`），包含 `docs/PROGRESS.md`（唯一状态载体）、`docs/dispatch/*`（全部派发提示词）、`docs/progress/*`（全部交接文档）、`docs/LEAD_SESSION_PROMPT.md` | **已实施（2026-08-30 提交）**：`.gitignore:32` 由 `docs/` 改为 `docs/*` + `!docs/PROGRESS.md`，仅放行唯一状态载体；`dispatch/*` 与 `progress/*` 维持忽略（`git check-ignore` 已验证）。**本文件入库的是客观状态版**（步骤、风险、决策结论）；含过程分析与判断依据的完整版保留在本地 `docs/PROGRESS.internal.md`，不入库 |
| E-25 | **`data/` 的入库边界**：`data/app.db`(143M)、`data/app.db.backup-premigration`(129M)、`data/uploads/` **均被忽略**；`data/documents/` 下 **7 个种子 .md 是有意入库的内容**（大语言模型基础概念 / Prompt工程 / RAG技术原理 / 向量数据库与Embedding / Agent基础 / Agent记忆系统 / 多Agent协同） | N3 推 GitHub **无数据库隐私泄漏**，但会带上这 7 个种子文档与 `SQLITE_DIR` 的默认数据。若评委不需要预置知识库，可考虑清理（待定） |
| **E-26** | **`data/` 目录在 fresh clone 中的存在性，依赖于 `data/documents/` 下那 7 个种子 .md**。`deploy/docker-compose.yml:54` 有 `../data:/app-data` bind mount；若源目录在 clone 中不存在，Docker 会**自动创建为 root 属主目录** → SQLite 写入失败，评委部署当场翻车。实测 4 个挂载源目录当前均安全（`backend` 72 / `skills` 36 / `tests` 43 个 tracked 文件；`data` 因 documents 被跟踪而存在） | **隐藏耦合**：E-25 讨论的「清理预置知识库」若真的删掉 `data/documents/`，`data/` 目录将从 clone 消失，**连带打断 `../data:/app-data` 挂载**。N3 若动种子文档，必须同步处置（改挂载路径 / 加 `.gitkeep` / 或改由容器 entrypoint 建目录） |
| **E-27** | ~~**【交付阻塞级】本地大幅领先远端 62 笔**~~ | ✅ **已解决（2026-08-30）**：owner 安排推送后，总领核实 `git ls-remote` —— **远端 `master` == 本地 `master` == `051d471`，0 领先 / 0 落后**，62 笔（含 C1/C2/N1/C3/F1/C4/F2/P1 全部成果）已全部上远端。<br>**总领已核实远端树关键路径**：`docs/PROGRESS.md` ✓、`.gitignore` 白名单 ✓、`data/` 7 个种子文档 ✓（E-26 安全）、`deploy/docker-compose.yml` ✓、`tests/test_p1_db_perf.py` ✓；**且 `docs/PROGRESS.internal.md` 与 `docs/dispatch/` 均未上远端**（无内部内容泄漏）。<br>**→ N2 改走方案 B**：直接从 GitHub clone，验评委真实路径（原默认方案 A 已不再必要）。<br>另注：远端除 `master` 外还有 `analysis/merge-master`、`feature/memory`、`iwfawf` 三个分支；本地 `master` **仍无上游跟踪**（`git branch -r` 为空），后续若需常规同步建议补 `-u` |
| **E-28** | **【探活陷阱 · 实测】healthcheck 的 host 必须写 `127.0.0.1`，写 `localhost` 会静默永久失败**。`frontend/nginx.conf:7` 是 `listen 80;`（纯 IPv4，容器实际监听 `0.0.0.0:80`）。`localhost` 解析到 `::1`（IPv6），nginx 不在 IPv6 上监听 → **curl 有 IPv6→IPv4 回退所以成功，busybox wget 没有所以失败** | 总领在真实前端容器内实测退出码：`wget --spider -q http://127.0.0.1/` → **0**；`curl -sf -o /dev/null http://127.0.0.1/` → **0**；`wget --spider -q http://localhost/` → **1（Connection refused）**。<br>**→ 这是 E-19 的同类坑**：E-19 是「`python:3.12-slim` 里没有 curl/wget」，本条是「有工具但 host 写法导致静默失败」。两者的共同点是**healthcheck 失败没人看日志**。<br>前端镜像（基于 `nginx:alpine`，运行时阶段无 `apk add`）自带 `wget`/`curl`/`nc` 三者，任选其一即可 |
| **E-29** | **【部署耦合 · 实测】前端容器无法独立启动**：`nginx.conf:33` 的 upstream 写死了 `guashuai-backend`，而 nginx 在**启动时**就解析 upstream 主机名 | 单独 `docker run deploy-frontend:latest` 实测失败：`nginx: [emerg] host not found in upstream "guashuai-backend"`（exit 1）。**这比 compose 的 `depends_on: condition: service_healthy` 更硬**——`depends_on` 只控制启动顺序，而 nginx 是解析不到就直接拒绝启动。<br>**→ 影响**：① 验证 frontend 的 healthcheck **必须把整栈起起来**；② N3 改 `image:` 拉取路径时，容器名仍硬编码（`guashuai-backend`）故可正常工作，**但若改服务名或改用 `COMPOSE_PROJECT_NAME` 隔离会当场炸**；③ 后续任何改服务名的重构必须先处理 `nginx.conf:33` |
| **E-32** | **【第四份手写副本 · F6 复核发现】`knowledge.py:137` 仍是一份硬编码的图片扩展名字面量** `{"png","jpg","jpeg","gif","webp","bmp"}`，**未引用模块级的 `_IMG_EXTS`** | F3 只归一了 `UPLOAD_CONSTRAINTS`（`:489`）与 `_ALLOWED_EXTS`（`:521`），并删除了 `:530` 那份，**但漏了 `:137` 这一份**。与 N2-2 **同一类**漂移风险。<br>**处置**：并入 F4′ —— 剔除 bmp 时**顺便把它改为引用 `_IMG_EXTS`**，既删 bmp 又根治漂移。<br>**教训**：「单一事实源化」这类重构，**收尾必须全仓穷举字面量**，不能只改在视线内的几处。已与决策 27（禁止 `head` 截断）合并为同一类流程约束。**✅ 已闭（F4′，`20a73a4`）：`:137` 的字面量集合已改为 `if ext in _IMG_EXTS`，反向守卫钉死「必须引用 `_IMG_EXTS` + 禁止字面量集合回归」** |
| **E-33** | **【契约缺陷 · F6 复核发现】`pipeline_v2.py:389` 把 image 的 mime 硬编码为 `image/png`**：`"url": "data:image/png;base64," + req.image`，**不随实际格式变化** | 前端 `CenterPanel` 存的是**裸 base64**（`:144`），后端无条件拼 `data:image/png;`。→ 传 JPEG/GIF/WebP 时**声明是 png、字节是别的格式**。<br>**今天能工作只因 DeepSeek vision 忽略了声明的 mime**（F6 实测用的是 PNG，未暴露）。<br>⚠️ **F6 让这条变为可达**：F6 之前聊天 accept 不含图片，之后 `jpg/jpeg/gif/webp` 均为官方可选路径。<br>✅ **owner 2026-08-30 拍板：改对，并入 F4′**。两种改法：A 后端从 base64 魔数推断（自包含、不改契约，倾向）；B 前端用附件 `name` 的扩展名传真实 mime（需动契约、依赖文件名可信度）。<br>**验收**：修完须用**非 PNG 图真实跑一次**上游。**✅ 已闭（F4′，`2855fc9`）：选方案 A（后端 base64 魔数推断，`_sniff_image_mime`）；真实 JPEG 上游实测通过（vision 回复「这张图片是蓝色的，中间有一个白色的圆形。」）；总领变异复现：改回恒拼 `data:image/png` → 恰 1 条红 → 还原全绿** |
| **E-31** | **【上游约束 · F3 实证】上游 VL（视觉 LLM）服务只收 `webp/png/jpeg/gif`，**拒收 `bmp`**；而我们的 `_IMG_EXTS` 含 `bmp`** | F3 实测（总领**无可用 VL Key，无法独立复验，属采信**）。性质判定：**与 N2-2 完全同型**——「**我们声称支持** vs **上游实际支持**」的不一致。bmp 经点选与后端准入均正常，失败发生在视觉描述阶段。<br>**两选一，待 owner 决策**：① **剔除** `bmp`（最简单，用户传 bmp 会被明确拒绝）；② **转码** bmp→png（保留能力，但需引入图像库依赖，**与 C1「不新增构建期依赖」方向相悖**）。<br>**总领倾向①剔除**——bmp 在今天已属边缘格式，为它引入依赖不划算。<br>✅ **owner 2026-08-30 拍板：剔除，并入 F4′**。⚠️ **改动面共 5 处**（总领全仓核实，缺一即不一致）：`knowledge.py:486`（`_IMG_EXTS`）、**`knowledge.py:137`（字面量，且须改为引用 `_IMG_EXTS`）**、`knowledge.py:28`（`_IMG_MIME`，可选）、`UploadPanel.tsx:14`（`FALLBACK_ACCEPT`）、`tests/test_f3_upload_constraints.py:24`（`BASELINE_IMG_EXTS`）。**✅ 已闭（F4′，`20a73a4`）：5 处全改 + 3 条反向守卫（`test_bmp_must_not_reenter_backend` / `_frontend_fallback` / `_f3_baseline`）；总领变异复现：把 bmp 加回 `_IMG_EXTS` → 恰 1 条红 → 还原全绿** |
| **E-30** | **【双重静默降级 · 实测】未配置 `EMBEDDING_API_KEY` 时，embedding 与 rerank **同时**静默失效**。<br>**① embedding**：`_embed()` 的路由条件是 `EMBEDDING_BACKEND=="api" and EMBEDDING_API_KEY`（`embeddings.py:67`）。默认 `EMBEDDING_BACKEND="api"`、`EMBEDDING_BASE_URL` 已是硅基流动，**但 key 为空 → 判定 False → 落 `_embed_local`** → `EMBEDDING_LOCAL_MODEL=""`（`config.py:24`，本地通道已废弃）→ `SentenceTransformer("")` 抛 `AttributeError` → 被裸 `except Exception` 吞掉 → **伪向量 `ord(ch)%100/100`**。<br>**② rerank**：`_get_reranker()`（`knowledge_service.py:473-487`）同理——`RERANK_BACKEND="api"` 但 `RERANK_API_KEY` 与 `EMBEDDING_API_KEY` 皆空 → 落本地 `CrossEncoder("BAAI/bge-reranker-base")` → 需从 HF 下载 → 失败 → `_reranker_local=False` → 返回 None，**重排被静默关闭** | **只需配置一个硅基流动 Key（`EMBEDDING_API_KEY`），两条路径同时走 API，问题消失**：rerank 的判定是 `RERANK_API_KEY or EMBEDDING_API_KEY`，会复用同一把 key。<br>⚠️ **对 N3 的连带影响（重要）**：配置 key 后，torch / sentence-transformers 的**全部引用点**（`embeddings.py:19` 与 `knowledge_service.py:483`）均不可达 → 成为**死依赖**。而它们正是 backend 镜像 **3.25GB** 的主因（torch 2.13 + transformers 5.14 + sentence-transformers 5.6）。**→ 若决定「API 为唯一路径、移除本地兜底」，可大幅缩小镜像并显著缩短冷构建（现 433s，README 称大头是 torch 下载 ~190MB）。这是一个独立的新选项，须 owner 决策**。<br>**注**：未配置 key 时本地兜底**仍会尝试加载模型**，故 torch 当前并非完全无用——是否移除取决于是否保留离线能力 |
| **E-34** | **【compose 行为 · N3 实测】显式 `-f` 下 compose v2 不自动加载 `docker-compose.override.yml`**（单 -f 带/不带该文件，config 输出相同；`--project-directory` 亦不加载）。本地开发 canonical 命令：`docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml up -d --build`（双 -f 合并验证 exit 0）；README 开发者路径已按此口径书写，且有守卫钉住 README 全部项目 compose 命令带 `-f` | 本地开发验证 / README 维护 |
| **E-35** | **【取重视角 · F7 实证】①bind mount 不同步 mmap 写——`-shm` 宿主视图冻结 3B、`-wal` 视图滞后，宿主侧 sidecar 取证不可作为缺陷证据（须 `docker exec` 容器内视图）；②环境依赖 CANTOPEN 备案：N2② 实测一次 query 500（_new_conn CANTOPEN），Docker 29.4.1 版本前后一致、F7 全矩阵复现阴性——机制已消失，若复发按 F7 实验矩阵重查；③临时栈必须 `-p` 独立项目名**（F7 会话临时栈与开发栈同名 `deploy`，down 连带带下开发栈——数据无损但已构成事故条件） | F7 会话 + 总领采信 |

---

### 2.5 B-8 专节：知识库图片上传 P0 缺陷（C3 发现，F1 处置）

> 总领通读 `knowledge.py:118-178`、`:490-548` 并对全库调用点 grep 后确认。
> 三条独立证据，说明这不是「少写一行 return」。

**证据 1 — 图片分支落空**：`knowledge_upload_file` 的图片分支（`:513-528`）算完
`desc` 后没有 `return`、没有定义 `source`/`_ch`、没有 `submit`，控制流落到函数末尾
→ 隐式 `return None` → FastAPI 序列化为 `null` → 前端 `api.ts` 的 `apiFetch`
调 `res.json()` 抛异常。

**证据 2 — 整条图片向量链路是死代码**：
- `_process_file_bg`（`:130`，图片处理主逻辑在 `:137-140`）**全库只有一个调用点**
  `:544`，而 `:544` 位于 `else`（非图片）分支内 → 永远传不进图片 → `:137-140` 不可达。
- `_store_image_vector` 全库 3 个调用点（`:139`、`:539`、`:547`）**全部不可达**：
  `:539`/`:547` 在 `else` 分支内却被 `if _ext in _IMG_EXTS` 恒假守卫；
  唯一可达的 `:139` 位于只能被非图片路径调用的 `_process_file_bg` 内。
- `:533`/`:538`/`:546` 三处 `if _ext in _IMG_EXTS` 位于 `else` 分支内部，**条件恒假**，
  属结构性死代码。

**证据 3 — 原设计意图是支持图片的**：`_process_file_bg` 的签名末尾带
`desc: str = ""` 参数，且 `:137-140` 明确写了图片分支。
→ 这不是「没做功能」，是**功能写了但调用方从未接上**。修复方向是「把调用方接对」。

**前端契约**（`api.ts:158` 是唯一入口；`UploadPanel.tsx:88-100` 是唯一消费点）：
1. 响应必须是 JSON 对象（不能是 `null`）且含 `status`
2. 后台模式（`wait=0`，前端默认）必须返回 `{"status": "processing", ...}`
3. **`source` 必须等于文件名** —— 前端用 `it.name`（文件名）去轮询
   `/api/knowledge/upload-progress?...&source=<文件名>`。错一个字符就轮询到
   一个永不存在的键，直到 10 分钟超时弹「处理失败或超时」。

**修复后费用模型的变化（owner 需知悉）**：此前视觉 LLM 调用是**白花钱**
（结果被丢弃）。修复后每张上传的图片都会**实打实消耗一次视觉 LLM 额度**。

**顺带修正 C3 的一条验收表述**：C3 的 `/uploads` 回显返回 200 image/jpeg 是
**有效**的（验证 nginx 反代静态目录），但命中的是 `data/uploads/` 下**既有文件**，
**不能证明图片上传功能可用**。两者不可混为一谈。

---

## 3. 全局决策记录

### 3.1 待拍板项（来自 SINGLE_STEP_EXECUTION 附录）

| # | Step | 决策内容 | 状态 |
|:-:|:----:|---------|:----:|
| 1 | C3 | 改生产构建后源码不热更新，是否保留 `docker-compose.dev.yml` | **已决**（见 §3.3） |
| 2 | D3 | `_strip_thinking` 是修正正则还是直接删除 | **已决**（见 §3.3） |
| 3 | D4 | 幂等方案选前端 `client_msg_id` 还是后端短时间窗查重 | **已决**（见 §3.3） |

### 3.2 待拍板项（总领新增，源于文档间的结构冲突）

| # | 冲突描述 | 状态 |
|:-:|---------|:----:|
| 4 | **B4 的前置依赖**：`SINGLE_STEP_EXECUTION` 标 B4 为「独立、可并行」，但 A1 的提示词「特别注意」明确写道「心跳频率改变会影响 `useChatStream.ts:391-406` 的断线取回触发时机，以及 `:202-204` 的超时逻辑」——而 391-406 正是 B4 的改动对象。A1 把心跳从 20/s 降到 0.5/s 后，前端 `resetTimer` 不再被高频重置，超时逻辑将从「形同虚设」变为「真会触发」。若先做 B4 再做 A1，B4 的实测结论失效。 | **已决**（见 §3.3） |
| 5 | **并行会话的隔离机制**：多个实现性会话若操作同一个 git 工作区（`D:\desktop\coAgent-Learn`），后提交者会覆盖前者的文件级改动，`pipeline_v2.py` 与 `useChatStream.ts` 尤其危险。文档未定义隔离方式。 | **已决**（见 §3.3，取全串行，不启用隔离） |
| 6 | **B 组与 A 组的顺序**：`OPTIMIZATION_PLAN` §4 建议 `A1+A2+A3 → B1+B2+B3`（B 在 A 后）；`SINGLE_STEP_EXECUTION` §0.3 让 B1 无前置（可与 A 组并行）。两者不一致。 | **已决**（见 §3.3） |
| 7 | **D 组的位置**：`OPTIMIZATION_PLAN` §4 把 D 放最后；`SINGLE_STEP_EXECUTION` §0.3 标 D 全程可并行。两者不一致。 | **已决**（见 §3.3，D 组前置） |

### 3.3 已决事项

| # | 决策 | 结论 | 依据 |
|:-:|------|------|------|
| 1+6+7 | 执行顺序与批次划分 | **全串行，不启用并行与 git worktree**。~~初始方案为 D 组前置，序列 `C1→C2→D…→A…→B…→C3→C4`~~ → **已被决策 9 覆盖，现行序列以 §1.3 为准**。 | `pipeline_v2.py` 被 5 步共享、`useChatStream.ts` 被 4 步共享，并行收益低于冲突成本；且本工作流由 owner 手动开会话，多会话并行的协调成本高于节省时间 |
| 2+4 | B4 前置依赖 | **B4 排在 A1 之后**（序列中位于 A3 之后）。不采纳「B4 独立可并行」。 | A1 心跳降频会改变 B4 改动对象的触发条件，先做 B4 会导致其实测结论失效 |
| 3 | D3 `_strip_thinking` | **选项 B：删除，但执行会话必须先实证**。实证动作：抓一次 `thinking=True` 的真实 DeepSeek 响应，确认思考内容走 `reasoning_content` 独立字段还是混入 `content`。走独立字段 → 删除；混入 `content` → 改选修正并接受测试变红。 | 原文档「死代码」判断有误（见 T6），有 2 个真实调用点；未经实证不得拍死 |
| 5 | D4 幂等方案 | **选项 A：前端 `client_msg_id` + `messages` 表加可空列 + 部分唯一索引**（`CREATE UNIQUE INDEX ... WHERE client_msg_id IS NOT NULL`）。必须附反向脚本。 | 选项 B 的「5 秒窗查重」会误伤学习场景中高概率的连发相同消息；A 方案的部分唯一索引让历史数据零迁移 |
| — | 各步文件清单补测试路径 | **由总领在分发提示词中直接修正**，不占用 owner 决策 | 见 T1；测试文件属本步允许范围，不视为越界 |
| 8 | **项目验收主体**（owner 2026-08-29 补充） | **竞赛项目，验收主体是从零 clone 的评委，而非开发者本机**。所有后续决策以「第三方一次跑通」为准。 | owner 原话：「这是竞赛项目，我发到 github 上评委能部署下来即可」 |
| 9 | 序列重排：部署链前置 + 新增 N1/N2 | **采纳**。序列改为 `C1→C2→N1→C3→C4→N2`（部署链）→ `D1→D2→D3→D4→A1→A2→A3→B1→B3→B2→B4`（体验链）。步骤总数 15 → 17。 | 「能否跑起来」是 0/1 问题，优先于体验的「好/更好」；且 C1 落地后反复重启验证更快 |
| 10 | README 重写（范围扩张） | **同意，作为 N1 的一部分**。修正 T10 的事实错误，补 `cp .env.example .env` 步骤。 | 代码修好但 README 指引错误，评委照样失败 |
| 11 | C3 实施方案 | **不新建 `docker-compose.dev.yml`**；端口保持外部 `5173`（`5173:80`）；nginx 反代 `/api` 与 `/uploads`；`/ws` 前端零引用，暂不配。 | 多一份 compose 就多一个评委踩坑点；外部端口不变可避开 Windows 80 端口占用且 README 不用改 |
| 12 | `.env` 阻塞（B-1）处置 | ① `env_file` 改 `required: false`（本机 compose v5.1.3，支持 v2.24+ 语法）；② `.env.example` 保留占位符并补注释；③ README 写明 `cp` 步骤。**不动 `.gitignore` 的密钥忽略策略**。 | API Key 不阻塞启动（`base_llm.py:189` 构造时才 raise，文案已引导用户去界面填），故无需提供真 Key |
| 13 | **预构建镜像的时机** | **放到全部 17 步完成后的最终封装（N3）**，不在中途引入。N3 之后重跑 N2 按 pull 路径复验。 | owner 2026-08-29 决断：「等项目完全做好了把构建好的镜像推到 Docker Hub 或 GitHub Container Registry，这一步当作最终的封装」。中途镜像会随 C2/C3 反复变更，提前推送只会反复重推 |
| 14 | **registry 选型** | **GHCR**（`ghcr.io/<owner>/<repo>`），不用 Docker Hub。 | owner 2026-08-29 选定。理由：与 GitHub 仓库同源、无匿名 pull 限流（Docker Hub 有限流，多评委并发拉取可能触发）、`GITHUB_TOKEN` 天然可推送。代价：包须在仓库设置里显式设为 Public |
| 15 | **N1 的 `.env` 处置方案**（已可行性验证） | 保留 `env_file` 并加 `required: false`，**不直接删除 `env_file`**。 | 见 §2.4 的 E-5、E-6 |
| 16 | **torch CPU wheel 索引源**（N1 执行中提出，owner 批准「改仓库」） | **阿里云 `--find-links https://mirrors.aliyun.com/pytorch-wheels/cpu/`** 写入仓库，不由本地临时改动；不做「用后还原」。 | ① `download-r2.pytorch.org` 在中国大陆长期不稳定，不是偶发抖动；② 评委在国内同样会被卡；③ `--find-links` 不锁定版本、不破坏依赖解析，镜像不可用时 pip 自动回退官方源；④ 属于部署就绪的一部分而非 hack。**owner 2026-08-29 批准** |
| 17 | **越界修复的审批范式** | 实现会话发现超出「允许改动文件」边界的**阻断性缺陷**时，先报批 → 修复 → 在交接文档第 2 节显式标注「经批准越界」并说明「为什么不做只验证不交付」。 | N1 的两处越界（补 `openai`、切镜像源）树立了正确范例，予以认可并沿用 |
| 18 | **守卫测试的编写范式统一**（C4 确立） | 后续步骤新增守卫**沿用 C4 的「存在性守卫 + 属性守卫 skip 兜底」模式**：先写 1 条「配置块/路由必须存在」，再写属性类守卫，属性守卫在块缺失时 `pytest.skip` 交由存在性守卫兜底。读取配置文件统一用 `utf-8-sig`（compose 带 BOM）。 | C4 的 6 条守卫用此模式，实现「一处坏掉只红对应那一条」，是其能完成 6 轮逐条变异验证的前提。此前 C1/C2/N1/C3 的守卫无此约束，变异定位精度较低。仅约束**新增**守卫，不返工旧守卫 |
| 19 | **N3 的 bind mount 处置：方案 ②——移除代码挂载，只保留 `../data:/app-data`**（owner 2026-08-29 拍板） | N3 将 `deploy/docker-compose.yml:50-53` 的 3 条代码 bind mount（`../backend:/app`、`../skills:/app/skills`、`../tests:/app/tests`）**移除**，镜像由「只带依赖」升级为「**带代码 + 依赖**」。本地开发用 `docker-compose.override.yml`（**已在 `.gitignore:35`**，无需改忽略策略）挂回这 3 条，评委 clone 中无此文件 → 自动走纯净镜像路径。 | ① 验收主体是「从零 clone 的评委」，**可复现性 > 开发便利**——评委跑的必须是已验证过的确切制品；② 消除方案①的「依赖静默漂移」（clone 的 requirements 更新但不触发重建 → ImportError）；③ 补偿成本极低，且补偿文件本就已被 gitignore。**连带约束**：见 E-26——保留 `../data:/app-data` 就必须保证 `data/` 在 fresh clone 中存在（当前依赖 `data/documents/` 的 7 个种子 .md；若清理种子需补 `data/.gitkeep` 或改由 entrypoint 建目录）。**另注意**：移除 bind mount 后 §1.2.2 的「改 Python 只 restart 不需 --build」红利**在开发环境消失**（由 override 文件补偿），N3 后的验证迭代成本会上升——写 N3 与 N2 重跑的提示词时必须把这点算进去 |
| 20 | **后续步骤改为「批次合并」执行**（owner 2026-08-29 拍板，源于进度成本反馈） | 体验链 11 步**不再一步一会话**，按组合并为 3 个会话：**D 组**（D1-D4）、**A 组**（A1-A3）、**B 组**（B1-B3-B2-B4）。**14 个会话压缩为 7 个**。**保粒度的三条硬约束**：① **一笔 commit 一个子步骤**（保住精确回滚能力）；② **每完成一个子步骤立即跑一次全量回归**（266 tests ≈ 6m24s；因组内共享文件——`pipeline_v2.py` 被 D1/D2/D4 共享、`useChatStream.ts` 被 A2/A3/B4 共享——子步骤间会互相影响，**不能只在会话末尾跑一次**）；③ 交接文档按**子步骤分节**写，便于总领逐段验收。 | ① 13 个剩余会话按原节奏耗时过长；② 「一步一会话」是**方法论选择不是物理约束**（串行依据是决策 1 的 worktree 与 §1.2.1 运行时资源冲突，两者都不反对同会话内做多步）；③ 组内步骤本就有依赖且顺序固定（A2 依赖 A1、B1 先于 B2/B3），合并后顺序执行即可。**代价**：单会话改动面变大、验收负担变重、中途失败的返工成本更高 |
| 21 | **F2 与 N2 不参与合并**（owner 拍板批次合并时的保留项） | F2 保持单步（部署链内、只动 `backend/routers/knowledge.py`）；N2 保持独立（纯验收、不改代码、必须独立证明部署链端到端可用）。 | N2 是**迄今全部 6 步部署链的唯一端到端证明**，至今未跑——在它跑通前，C1/C2/N1/C3/F1/C4 的成果均属**未验证**。N2 通过后即获得一个「评委可交付」的可交付基线，owner 可随时据此重估后续范围 |
| 22 | **新增提速步骤 P1，插在 F2 与 N2 之间**（owner 2026-08-29 要求「F2 完成后马上执行」） | P1 = 测试基础设施提速（修 T25），目标把全量回归从 **366s 降到 ≤ 60s**。两个子步骤同会话顺序执行：P1.1 把 `PRAGMA journal_mode=WAL` 移出 `_new_conn`（零风险）；P1.2 `execute()` 走缓存连接但**保留 `_new_conn()` 给显式调用者**（收益主体）。 | ① owner 明确要求紧接 F2；② **N2 顺带成为 P1 的运行时验证**——P1 动的是 DB 层生产代码，宿主 pytest 绿 ≠ 容器能跑，而 N2 是 fresh clone + 真实部署 + 7 项验收，**不增加额外会话**就复验了 P1；③ 会话 3–8 全部受益，越早省越多。**净收益**：多 1 个会话，但按剩余 7 会话 × 约 3 次回归 × (6min→45s) 估算，**累计省约 2 小时** |
| 23 | **P1.2 的安全红线：不得让 `_new_conn()` 返回缓存连接** | `_new_conn()` 必须保持「返回全新独立连接」的语义。缓存只用于 `execute()` 内部。 | 总领 A/B 实测：简单连接复用让全量从 366.70s→44.56s（8.2x），但**挂了 4 条**——`_kb_ops.py:280-295` 的 `upsert_kg_edges_bulk` 自己调 `_new_conn()` 并在 `finally` 关闭，缓存连接被它关死（`Cannot operate on a closed database`）。**代码库存在两种用法**，方案必须同时满足。若 P1.2 在约束下无法安全实现，**只交付 P1.1**，不得为提速牺牲正确性 |
| 24 | **分发提示词的三条流程修正**（F2 验收导出，2026-08-30） | ① **不得把「TDD 先红」当无差别铁律**——必须区分「新行为断言」（必须能红）与「**回归控制断言**」（结构上不可能红，需在测试注释中注明定位，沿用 F1 第 8 条「PDF 对照组」先例）。<br>② **耗时/基线数字必须标注「实测条件 + 波动范围」**，或要求实施会话**自建基线**，不得沿用他步数字。<br>③ **所有 `docker compose` 命令必须带 `-f deploy/docker-compose.yml`**，并写明仓库根无 compose 文件。 | ① F2-3/F2-4 属回归控制断言（同步路径本来就只解析一次、图片本来就不走文本解析），修复前即为绿、结构上不可能红，故须区分于新行为断言。<br>② 同一套测试在不同机器状态下实测差约 3 倍（103s / 122s / 302s），故提示词不得沿用他步的耗时数字。<br>③ 仓库根目录无 compose 文件，唯一 compose 为 `deploy/docker-compose.yml`，故 `docker compose` 命令必须带 `-f`；已实测通过（`healthz` 200） |
| 25' | **F5 的四项决策（owner 2026-08-30 拍板）+ 一项总领判断** | ① **A1：无 `EMBEDDING_API_KEY` 时硬失败**（明确报错含「原因/后果/怎么办」三点；API 失败同样直接抛出，不再有任何静默降级）。<br>② **删除 `EMBEDDING_BACKEND` 字段**（爆炸半径已核实：全仓仅 2 处引用，不在 `.env.example`/README/`deploy/`/前端）。<br>③ **接受「必须有硅基流动 Key 才能用知识库」**——A1 的必然结果，已知代价。<br>④ **F4 后续缩减为「仅双 Key 引导」**（降级已不存在，降级告警无意义）。<br>⑤（总领判断）**`RERANK_BACKEND` 删除 `local` 分支但保留字段**，收敛为 `api | none`——`none` 是合法用户选项（用户可能想关重排省调用） | ①② owner 明确拍板。<br>③ 权衡：A2（保留伪向量 + 大声告警）会让「能用但结果是错的」，比「用不了」更糟。<br>④ 因 F4 的降级告警以保留本地兜底为前提，F5 移除本地后前提消失。<br>⑤ **关键区分**：embedding 硬失败（无它检索**不存在**）vs rerank 优雅降级 + 可见日志（无它检索仍返回，只是未排序）——**两者性质不同，不可混为一谈** |
| 25 | **N2 撞出的 3 项分两步走：F3 立即修（N2-1+N2-2），N2-3 待 owner 决策**（2026-08-30） | **F3（新步骤，会话 4）**：① 把图片扩展名补进 `backend/routers/knowledge.py:479-485` 的 `UPLOAD_CONSTRAINTS`（现与同文件 `:522` 的 `_IMG_EXTS` 不一致，导致前端选择器拒收图片）；② 修 `UploadPanel.tsx:29` 的 `.catch(() => {})`（静默吞掉约束拉取失败 → `allowedExts` 为空 → `:40` 的二次过滤被静默关闭）；③ 给 frontend 补 healthcheck（用 busybox `wget`，**不装 curl**，违背 C1 方向）。<br>**N2-3（伪向量）暂不进 F3**：修法涉及架构级取舍，须 owner 定程度 | ① **N2-2 定性为 P1**：它让 F1 的 P0 修复在**最自然的用户路径**（点上传→选文件）上不可达，评委最可能做这个动作；② ①和②同属上传约束链路，一个会话内做完比拆两次省一个会话（决策 20 精神）；③ N2-1 是低风险打磨，顺带做掉，避免再开一个会话；④ **N2-3 不进 F3 是因为它与 F3 不同层**：F3 是确定性 bug fix，N2-3 是「告警 / 预置模型 / 换 API」的架构取舍，混在一起会让 F3 的验收判据变模糊 |
| 27 | **查「某符号有多少处引用 / 爆炸半径」时，禁止用 `head` 截断 grep**（F5 教训，2026-08-30） | 评估完整性时：① 先 `grep ... | wc -l` 计数，② 再完整列出，③ 或直接用 `git grep` 一次性输出。**`head -N` 只能用于「看个大概」，不能用于下完整性结论。** 多 pattern 合并搜索时尤其危险——某个 pattern 的命中会挤占名额，把另一个 pattern 的结果整体挤掉 | **F5 实际教训**：我查 `EMBEDDING_BACKEND` 爆炸半径时执行 `grep -rn "EMBEDDING_BACKEND\|RERANK_BACKEND" backend \| head -4`，前 4 条被 RERANK 的命中占满，`settings.py:83/133` 被截断未显示 → 我据此写下「仅 2 处引用，删除安全」（**实际 4 处**）→ 实施会话执行到 settings.py 才发现必须扩边界 → **中途报批、会话被打断**。代价由实施会话承担了 |
| 26 | **验收清单新增默认项：最自然的用户路径是否可达**（N2 的流程教训） | 后续步骤的验收判据里，除「API 是否返回 200」外，默认加一条：**该功能最自然的用户路径能否走通**（含前端入口、白名单、按钮状态等跨层环节）。 | **跨层缺口是分步验证的结构性盲区**：F1 验后端（图片上传链路修好）、C3 验前端（生产化），各自都绿，**但连接处没人验**——`UPLOAD_CONSTRAINTS` 不含图片，导致 F1 的修复只有拖拽一条路能触达。只有 N2 这种真实端到端才撞得出来。同类风险在 A/B 组同样存在（前端改动 + 后端协议变更） |
| 28 | **F4′ 修复①的方案取舍：选「异常向外传播 + 各调用方就地兜底」，否决「内层自报」与「收窄 catch 类型」**（2026-08-30） | ① **选方案 A（外传）**：让异常成为唯一错误通道——后台文件链路 `_process_file_bg` 的既有 catch（F1 已修好）**零改动自动恢复生效**；同步 3 处各补「异常 → `{"status":"error","msg":…}`」转换。<br>② **否决方案 B（内层自报 + 存错误供同步方取）**：需给 `_process_upload` 增错误传出通道，7 个调用点里 5 个只关心返回值，是纯粹的签名复杂化。<br>③ **否决方案 C（收窄 catch 异常类型）**：无法枚举「预期可容忍」集合——网络错误 / 维度不符 / Key 缺失都该可见，漏一个即复现原缺陷。<br>④ **同步响应形态必须是 HTTP 200 + `status:error`**，不是 HTTPException——后者被前端 `apiFetch` 转成 throw，`msg` 不进 `alert`，等于白改。<br>**连带发现（结构事实）**：`background.submit`（`core/background.py:9`）是**异常黑洞**，只把异常记进 daemon 线程日志。故 `:350`/`:474` 两处后台直投即使去掉内层 catch 也仍不可见，必须在 `knowledge.py` 内新增 `_process_upload_bg` 包装补 `_set_progress_error`（`background.py` 不在允许改动清单，未越界改） | ① 方案 A 复用已存在的正确外层，改动面最小且语义统一；<br>②③ 由实施会话论证、总领复核认可；<br>④ 本路由既有错误约定（`:378`/`:461`/`:523`/`:551` 同款），走 HTTPException 会破坏前端 `alert(d.msg)` 的既有链路；<br>**连带发现的意义**：「去掉内层 catch」本身**不足以**让错误可见——必须逐个确认每个调用点的**异常最终去向**，否则会出现「从日志变成另一个日志」的假修复 |
| 30 | **每个会话执行完自己 push**（owner 2026-08-30 拍板，**总领每次生成派发提示词时必须写进去**） | 会话全部子步骤完成 + 全量回归全绿 + `git status --short` 仅 `?? repomix.config.json` 后执行 `git push origin master`（本地 master 无上游跟踪，须显式写 `origin master`），并核对 `git ls-remote origin master` == `git rev-parse HEAD`，两行输出贴进交接文档。<br>**红线**：禁 `--force`、禁推 master 以外分支（远端另有 `analysis/merge-master`、`feature/memory`、`iwfawf`）、禁把 `repomix.config.json` 加进 commit。<br>**若会话中途被迫中断**：先把已完成的子步骤 commit push 掉再停。 | 在此之前由 owner 手动安排推送，出现过「本地领先远端 62 笔」（E-27）。owner 明确要求改为会话自推送，避免成果因会话中断而滞留本地 |
| 31 | **D 组按风险降序执行：D4 → D3 → D2 → D1**（2026-08-30，总领决定） | §1.3 列出的 `D1→D2→D3→D4` 是**依赖清单**，四步彼此独立（D4=schema+协议 / D3=`base_llm.py` / D2=`_make_llm` / D1=新建模块搬迁）。按「先做最容易失败的部分」重排为风险降序：**D4（唯一动数据库 schema 的步骤，改错影响 owner 真实数据）→ D3（须实证，实证不通即卡住）→ D2 → D1 → T26** | 若按文档顺序，最险的 D4 排在最后——届时会话上下文已消耗大半，一旦卡住返工成本最高；且 D3/D4 的阻塞点暴露得越早，总领越早能重新分发 |
| 35 | **凭据与破坏性操作的两条铁律**（2026-08-30，B 组事故导出） | ① **凭据永不臆造/手拼**——要么完整读取，要么不读，用掩码片段拼出来的 key 必然是假的（本次据此误判「`.env` 的 key 已失效」，实为拼出来的假 key 401；**总领实测 `.env` 真 key `HTTP 200` 有效**）。<br>② **清缓存/删除类操作前先确认归属**——本次排障时 `localStorage.removeItem('coagent-provider-keys')` 把 Playwright 测试 profile 里 owner 此前留下的**有效**凭据清掉了。<br>③ 拿不到凭据时的正确做法：**改用 route 拦截的 SSE 桩**（不落库、不依赖 LLM、渲染路径真实），而不是去找 key | 后果可控（2 次 401 无数据损坏；仅测试用浏览器 profile 的登录态丢失，owner 自己的浏览器不受影响），但两条都是「一次手滑会让后续整轮排查走偏」的高杠杆错误。<br>**另：B 组的自查上报是合格的**——未报批先行动这一点应当批评，但事后如实记录、无掩盖，未造成数据损坏 |
| 34 | **A2 的 emit 守卫折进 B 组；A2 的 `sse.ts` 越界予以追认**（2026-08-30，总领验收时决定） | ① **T38**：A2 的「后端是否真的推了 reset 帧」无守卫（总领变异实证：删掉该行 → 4 条协议守卫全绿）。**折进 B 组补 1 条行为守卫**，不单开会话（沿用 T26 / T34 先例）。<br>② **追认 `frontend/src/sse.ts` 的越界**：`ChatEvent` 判别联合无 `answer_reset` 成员时 TS 必然报错，扩展联合是**结构性必需**（+2 行）。<br>⚠️ **程序提醒**：交接文档写的是「经批准越界」，但本次**并未经过报批**——实施会话未停下询问。内容正当，措辞不准。后续越界应为「先报批」或注明「未报批的必要越界」。 | ① 与 T34 完全同型：行为已被一次性 E2E 证明正确，缺的是永久回归保护；几行代码不值得单开会话，但不能没有。<br>② 对比 D4 的 `main.py:108`——那处是总领**事先预批**的；本次是事后追认。**两者内容都正当，差别在流程** |
| 33 | **两个「几行代码」的收尾折进 A 组会话，不单开会话**（2026-08-30，总领决定） | ① **D1 补 1 条存在性守卫**（T34）：断言 `backend/engine/` 下 `from main import` 恒为 0，防反向依赖回归。<br>② **收编 `review.py:58` 的 `pick_judge_llm`**（T32）：改走 D2 同款 client 缓存，使研究档单轮也落到 ≤2。<br>两笔独立 commit，各带自己的守卫与变异验证。 | 沿用 **T26 的先例**——T26 当初的判断原文：「3 行代码付一次完整会话开销与决策 20 相悖」。这两项同理：合计改动约 10 行，单独开会话不经济；但**不能不做**——D1 无守卫意味着反向依赖可静默回归，judge 未收编意味着 D2 的收益未全覆盖 |
| 32 | **体验链 D / A / B 组 11 步全部执行，不砍**（owner 2026-08-30 拍板） | 总领此前评估「D/A/B 可砍——不影响评委能否部署起来，只影响观感」，owner 明确否决：**全部要做**。执行路径 v4 的会话 7（D 组）/ 会话 8（A 组）/ 会话 9（B 组）保持，其后才是 N3 + N2 第 2 次 | owner 原话：「要做体验链，提到的都要全部做」。<br>**总领保留意见并已陈述**：从「评委能否部署」的 0/1 目标看，N3（推预构建镜像）价值高于观感优化；但 owner 决策优先，序列按此执行 |
| 29 | **派发提示词的基线数字：生成后若被后续步骤改变，总领须在派发前重跑一次**（2026-08-30，总领认领） | `docs/dispatch/step-F4.md` 生成于 `dabb8b0`，写「全量基线 **295 passed**」；其后 F6 落 5 条守卫 → 真实基线 **300**。F4′ 实施会话开工时自行实测并纠正（「提示词 295 + F6 守卫 5」），未造成实际损失。<br>**→ 流程要求**：① 分发文档生成后若中间插入了其他步骤，**总领必须在派发前重跑基线**；② 实施会话开工先实测基线并与提示词核对，不一致以实测为准并上报 | 决策 24 只约束了「不得沿用他步数字」，未覆盖「本步提示词生成后被后续步骤改变」这一方向。本次代价为零（实施会话主动纠正），但属同一类数字失真，须补齐 |

### 3.4 被否决的方案（各步交接文档第 3 节回流汇总）

| Step | 被否决方案 | 否决理由 |
|:----:|-----------|---------|
| N1 | 删除 compose 的 `env_file` | 丢失评委用 `.env` 配代理等可选覆盖能力 |
| N1 | 改 `base_llm` 用 httpx 直连替代 openai SDK | 违反「不改业务逻辑」铁律，且工作量远大于补一行依赖 |
| N1 | compose 运行时 `pip install openai` | 直接违反 C1 的断网启动成果，且 `tests/test_c1_runtime_deps.py` 有守卫禁止 |
| N1 | 仅容器内 `pip install` 交差、不改 `requirements.txt` | 只验证不交付，正式镜像路径未闭环——评委重建镜像时缺陷必然复现 |
| N1 | torch 索引只在本地临时改动、用后还原 | 评委在国内同样会被 `download-r2.pytorch.org` 卡住；这是部署就绪问题，不是本地环境问题（见决策 16） |

### 3.5 N3 待决项（分发前需 owner 拍板，不阻塞当前推进）

| # | 待决内容 | 备选 | 建议 |
|:-:|---------|------|---------|
| 1 | ~~**registry 选哪个**：GHCR 还是 Docker Hub~~ | A. GHCR　B. Docker Hub | ✅ **owner 2026-08-30 已选定 GHCR**（`ghcr.io/tpys11/coagent-learn`。注：GHCR 包名必须全小写）。剩余 2、3 两项待定，已向 owner 解释清楚含义后由其拍板 |
| 2 | 是否需要 GitHub Actions 自动构建推送，还是本地手动 `docker push` | A. Actions 自动　B. 手动推送 | 手动推送（一次交付，无需维护 CI） |
| 3 | 镜像标签策略：固定 `latest` 还是带 commit sha / 版本号 | A. `latest`　B. `latest` + sha 双标签 | B（可回溯到具体提交） |
| 4 | ~~**【C4 新增，优先级最高】bind mount 如何处置**~~ | ① 全部保留 / ② 移除代码挂载 / ③ 不做 N3 | ✅ **owner 2026-08-29 已选定 ②**（详见决策 19 与下方展开） |

#### 待决项 4 的展开（C4 验收时升级，2026-08-29）

**当前实质**：镜像提供**依赖**，bind mount 提供**代码**。

**方案 ①（保留全部挂载）**
- 收益仍在：评委从「构建 10 分钟」降到「拉取镜像」，torch 等大依赖不再现场下载。
- **风险**：代码仍来自评委本地 clone。若 clone 的 `requirements.txt` 比镜像内已装的更新，**不会有任何重建动作**，容器起来直接 `ImportError`——**镜像 tag 与代码版本静默漂移**，且只在两边不一致时才爆。

**方案 ②（移除代码挂载，保留 `../data:/app-data`）**
- 镜像提供**代码 + 依赖**，评委跑的是**被实测过的确切制品**，可复现性最强。
- 代价：本地开发失去「改 Python 只 `restart`」的便利（§1.2.2 红利）。
- **补偿现成**：`docker-compose.override.yml` **已在 `.gitignore:35`**（无需改忽略策略）——开发环境用它挂回 3 条代码挂载，评委的 clone 里没有此文件 → 自动走纯净镜像路径。

| 方案 | 镜像承载 | 评委可复现性 | 依赖漂移风险 | 本地开发便利 |
|---|---|---|---|---|
| ① | 仅依赖 | 中 | **有**（静默） | 保持 |
| ② | 代码+依赖 | **高** | 无 | 需 override 补偿 |
| ③ | — | — | — | 保持 |

> **倾向 ② 的理由**：验收主体是「从零 clone 的评委」，可复现性 > 开发便利，且补偿成本只是一个已被 gitignore 的 override 文件。
> 但①也成立——它把 N3 降级为「依赖缓存加速」，仍解决 10 分钟构建的主要痛点，改动面更小、风险更低。**由 owner 定。**

**⚠️ 关联约束（E-26）**：无论选哪个方案，只要还保留 `../data:/app-data`，就必须保证 `data/` 目录在 fresh clone 中存在——它目前**依赖 `data/documents/` 下 7 个种子 .md**。若按 E-25 讨论清理种子文档，`data/` 会从 clone 消失 → Docker 以 root 自动创建 → SQLite 写入失败。处置方式：加 `data/.gitkeep` / 改挂载路径 / 容器 entrypoint 建目录（三选一）。

**倾向 GHCR 的三条理由**（供你参考，不替你决定）：

1. **与 GitHub 仓库同源**：项目本就发在 GitHub 给评委，README 里的仓库地址与镜像地址一致，评委不需要跳转第二个平台。
2. **无匿名拉取限流**：Docker Hub 对匿名 pull 有速率限制（2024 年起执行较严），多个评委同时拉取可能触发；GHCR 的公开包支持匿名拉取且无限流。
3. **权限天然打通**：用仓库的 `GITHUB_TOKEN` 即可推送，不需要额外的账号密钥管理。

**GHCR 的代价**：包必须在仓库设置里显式设为 Public，否则评委拉不到（默认跟随仓库可见性，私有仓库下的包是私有的）。

---

## 4. 技术债清单

| # | 债务 | 来源 | 处置 |
|:-:|------|------|------|
| T1 | **各步「允许改动文件清单」未包含测试文件，与 TDD 铁律冲突**。C2/A1/A2/A3/B1/B2/B3/B4/D2 的「约束 1」只列了源码文件，但 TDD 路径要求先写测试。实现会话会陷入两难：写测试即违反文件约束，不写测试即违反 TDD。 | 总领核对 | 分发前需在提示词中显式补充测试文件路径 |
| T2 | **D3、D4 需两轮交互**（先调研/分析，回报后再执行），不能按「一次性分发、自动完成」规划批次。 | 总领核对 | 批次划分时单列 |
| T3 | B2 的 TDD 描述不是真正的「红」（文档自述「当前无窗口化时 (a) 是正常的」），实为回归测试。措辞会让实现会话困惑。 | 总领核对 | 分发时改写表述 |
| T4 | `CHAT_ENGINE=v1` 回退路径未知是否存在，A1 回滚预案依赖此项。 | OPTIMIZATION_PLAN §5-4 | 见 §2 第 4 项 |
| T5 | README 与实现严重脱节（声称 LangGraph / 4 服务 / Postgres+Redis+Chroma，实际均无）。不在本次优化范围，但持续误导新会话。 | OPTIMIZATION_PLAN §1.1 | 建议登记，不列入 15 步 |
| T6 | **方案判断错误：`_strip_thinking` 不是死代码**。`OPTIMIZATION_PLAN` §P2-3 称「方法是死代码」，实测它有 **2 个真实调用点**：`base_llm.py:52`（`chat()` 内）与 `:82`（`chat_with_json()` 内）。真实问题是**正则无效**（`█████.*?█████` 非 DeepSeek 的 `<｜end▁of▁thinking｜>`），导致剥离从未生效，而非无人调用。因此「方案 B 删除」会改变 `chat()`/`chat_with_json()` 的既有契约，风险高于文档评估。 | 总领实测 grep | **需修正 D3 的方案描述** |
| T7 | **C3 需求遗漏 `/uploads` 代理**。`OPTIMIZATION_PLAN` §C3 只要求 nginx 配 `/api` 反代，但实测存在第二条在用代理：**`/uploads`**——`backend/main.py:85` 用 `StaticFiles` 挂载，`routers/knowledge.py:174` 返回 `/uploads/<fname>` 给前端 `<img src>` 展示。nginx 漏配会导致知识库图片全部 404。第三条 `/ws`（WebSocket）在 `frontend/src` 下**零引用**，属预留配置，可暂不配（分发时让执行会话再确认一次）。 | 总领实测 | **分发 C3 前必须补进需求** |
| T7b | **C3 需求再遗漏两条 nginx 硬要求**（总领分发前复核发现）：① **流式缓冲**：`/api/chat` 是长连接 SSE（`useChatStream.ts:212` 用 `fetch` + 流式读），nginx 默认 `proxy_buffering on` 会把响应攒到最后一次性吐出，**流式体验完全失效**。必须 `proxy_buffering off` + `gzip off` + 长 `proxy_read_timeout`。② **上传体积**：nginx 默认 `client_max_body_size 1m`，而后端**无上传限制**（E-16），任何 PDF 上传都会 413。必须显式放开。 | 总领实测（E-13/E-15/E-16 + nginx 默认行为） | **已写进 `docs/dispatch/step-C3.md` 第三节** |
| T9 | **【P0 部署阻塞】`.env` 缺失会导致 `docker compose up` 直接失败**。`.gitignore` 第 17 行起忽略 `.env`；而 `deploy/docker-compose.yml` 的 backend 有 `env_file: - ../.env`。评委 `git clone` 后没有该文件，compose 报 `env file not found` 且**不会降级**。仓库内有 `.env.example`(8 键) 与 `.env.template` 两份模板并存，评委无从判断用哪个。README:72 直接让执行 `docker compose -f deploy/docker-compose.yml up -d`。 | 总领实测 | **优先级高于全部 15 步** |
| T10 | **README 部署说明与实现不符**：第 75 行称「首次 5-10 分钟，之后每次几秒」，实际每次启动都联网 `pip install` 13 个包。评委按此预期操作会困惑。 | 总领实测 | 并入部署就绪环节 |
| T11 | `routers/resources.py:157` 硬编码上传目录 `/app/data/uploads`，而 compose 设 `SQLITE_DIR=/app-data` 且挂载 `../data:/app-data`。两处路径口径不一致，容器内外行为可能分叉。 | 总领实测 | 登记，不列入 15 步 |
| T12 | **C1 的原始需求基于未验证的假设**。方案让「新建 `requirements-runtime.txt` 收录 13 个包」，但总领核对发现其中 **12 个已在 `backend/requirements.txt` 中**（构建期已装），仅 pytest 不在（它在 `pyproject.toml:22` 的 dev 分组）。照原需求执行会导致 12 个包被声明两遍、构建时装两遍，并可能引发版本约束冲突。 | 总领实测 | **已写进 C1 提示词第五节**，要求先复核再选路径 A/B |
| T13 | 测试环境事实：Python 虚拟环境在**项目根** `.venv`；测试目录是**项目根**的 `tests/`（含 conftest.py）；`backend/tests/` 是**空目录**。`pyproject.toml:22` 的 dev 分组含 `pytest>=8`、`pytest-asyncio>=0.24`。 | 总领实测 | 已写入各步提示词的「运行环境要点」 |
| T14 | **`.env.example` 同样带 UTF-8 BOM**（首行实为 `\ufeff#`）。评委执行 `cp .env.example .env` 后，compose 用 Go 实现的 env_file 解析**未必能容忍 BOM**——可能导致第一个变量（`DEEPSEEK_API_KEY`）名变为 `\ufeffDEEPSEEK_API_KEY` 而失效，甚至整体解析失败。 | 总领实测 | **✅ 已修**（N1）。**定性由「证实」改为「证伪」**：本机 Compose v5.1.3 实测**会剥离 BOM**（容器内锚定 `grep ^DEEPSEEK_API_KEY=` 命中、变量名 17 字节无前缀、值正确加载）。仍去 BOM + 立守卫，理由：解析器宽容是**未文档化行为**，评委 Docker 版本不可控，正确性不押注在它上面 |
| T16 | **系统性验证缺口：宿主 pytest 全绿 ≠ 容器能跑**。根因是宿主 `.venv` 的已装包集合**宽于**镜像的 `requirements.txt`，前者的富余会掩盖后者的缺失。`openai` 缺陷被 244 全绿掩盖至评委实测才暴露；`requests` 至今仍被掩盖。 | 总领复核 N1 时发现 | **后续所有步骤的门禁，除 pytest 外必须补容器级冒烟**：在真实镜像里 `import` 全部 backend 模块 + 打一次 `/api/settings` + 一次 `/api/chat`。已写进 C3 提示词验收标准。**注意**：AST 静态扫描只能发现候选，不能证明容器可用（`embeddings.py:45` 等是函数内惰性 import） |
| T17 | **`requests` 未在 `requirements.txt` 声明**，当前靠 `markitdown` 的硬依赖传递提供，而声明写的是 `markitdown[...]>=0.0.1a2`，下界极松。与 `openai` 完全同型（宿主有 → 测试绿 → 掩盖；容器缺 → 运行到分支才炸）。 | 总领复核 N1（AST 静态扫描 + PyPI 元数据核对） | 建议与 T18 合并为一步轻量清理，在 **N3 之前**做掉（N3 冻结镜像后改动成本变高）。**不阻塞 C3** |
| T18 | `backend/requirements.txt` 与 `deploy/docker-compose.yml` **仍带 UTF-8 BOM**（pip 与 gopkg.in/yaml 均容忍）。另有 `pyproject.toml:12` 的 `chromadb>=0.5` 仍为失实声明（实际 SQLite + sqlite-vec）。 | N1 遗留 | 与 T17 合并清理。低优先——当前解析器全部容忍，无实际故障 |
| T19 | ~~`frontend/Dockerfile` 用裸 `npm install` 且无镜像源~~ | N1 实测 | **✅ 已解决**（C3）：改为 `npm ci`（按 lockfile 精确安装）。实测默认 npmjs 源可用，**未加 npmmirror**——真正的慢点是 Docker Hub 拉 `nginx:alpine`（20.5MB 用了 191s），加 npm 镜像源无济于事。N3 推预构建镜像后此风险对评委消失 |
| T20 | **embedding 静默降级为伪向量**（E-18）：`_embed_local` 在模型加载失败时走确定性伪向量分支，不抛错、不告警。评委若在网络受限环境部署，检索质量会**静默崩塌**且无任何提示——他只会觉得「这个检索怎么这么不准」。 | **N2 第 ⑧ 项已实证确认**（2026-08-30 真实冷部署）：1024 维向量**全部是 0.01 的整数倍**、值域 [0, 0.99]——与 `embeddings.py:38` 的 `ord(ch)%100/100` 精确匹配，且**静默无告警**。<br>⚠️ **2026-08-30 总领订正根因**：不是「容器无 HF 缓存拉不到 `bge-small-zh-v1.5`」——**`EMBEDDING_LOCAL_MODEL` 默认值是空字符串**（`config.py:24`，注释「已废弃本地通道，字段保留兼容旧调用」），本地通道**根本没有配置任何模型**。实测 `SentenceTransformer("")` 抛 `AttributeError`，被 `embeddings.py:21` 的裸 `except Exception` 吞掉 → 伪向量。<br>**→ 真正的触发条件是「`EMBEDDING_API_KEY` 未配置」，不是网络受限** | 见 **E-30**（含同源的 rerank 静默降级）。**处置**：新增 **Step F4**（embedding + rerank 降级显式告警 + 双 Key 引导）。<br>**不需要**预置模型进镜像（原三选项中的 ③ 已否定——本地通道本就废弃） |
| T21 | **`GZipMiddleware` 会压缩 SSE 响应**（`main.py:62`，`minimum_size=1024`）。C3 实测流式未被破坏（Starlette 逐块 flush），但「SSE 被 gzip」依赖客户端透明解压，属脆弱组合。 | C3 实测 | **默认不改**——没有测到坏，改它有引入新问题的风险而收益为零。F1 提示词已写明：除非实测到可复现问题，否则跳过并说明理由 |
| T22 | **`.dockerignore` 依赖**：C3 的多阶段构建依赖 `frontend/.dockerignore` 排除 `node_modules`/`dist`/`.vite`，否则宿主 Windows 原生二进制会混入 alpine builder | C3 交接 | 已确认存在且生效。后续若有人整理 `.dockerignore` 需知悉这条依赖 |
| **T23** | **【F1 引入的回归】非图片后台上传变成「同步解析 + 解析两遍」**。F1 把 `_parse_for_upload` 从 `if wait:` 内提到了 `else` 分支（在 `wait` 判断之前），导致 PDF 等文档在**前端默认路径 `wait=0`** 下：① HTTP 请求阻塞到解析完成（3MB PDF 数十秒，50MB 可达数分钟）；② 后台 `_process_file_bg:149` **再解析一遍**；③ 同步解析的结果被丢弃（`submit` 传的 `desc` 对非图片恒为 `""`）。**函数自己的 docstring（`knowledge.py:134`）写着「解析从 HTTP 请求内移出（wait=false 时 HTTP 立即返回）」，现已被自己违反**；注释中的「上传提速·单步2」是此前专门做过的优化 | 总领验收 F1 时通读代码发现 | **登记 F2 修复**。9 条 F1 测试覆盖不到，因为 `test_pdf_control_unchanged` 用 `parse_document` 打桩（瞬间返回），只断言状态与入库、不断言解析的**时序与次数**——这是打桩的固有盲区，不是测试质量问题 |
| **T24** | **【分发提示词的基线数字与配置引用】`docs/dispatch/step-C4.md` 有 4 处写回归基线 `251 passed`，而 C4 启动时真实基线已是 260**（F1 在 C3 之后合入了 9 条测试）。同一文档 §4.1 给出的 compose 是**示意图**，省略了 `volumes:` 全节（真实有 4 条 bind mount：`../backend:/app`、`../skills:/app/skills`、`../tests:/app/tests`、`../data:/app-data`），却标注为「compose 现在的形态」，读起来像原文摘录 | C4 实测 | 已定为流程约束（决策 24）：写分发文档时基线须以当时 `pytest` 实测数为准，不得沿用上一步记录；引用配置文件形态须原文摘录或显式标注「示意图/已省略」 |
| **T25** | **【测试基础设施缺陷 · 实测】全量回归 366s 里绝大部分是 DB 连接开销，不是测试逻辑**。`core/db/_sqlite_core.py:38-60` 的 `_new_conn()` 让**每次 `execute()` 都新建一条连接**，并执行 `sqlite_vec.load` + `PRAGMA busy_timeout` + **`PRAGMA journal_mode=WAL`（实测 33ms，而 WAL 是数据库文件的持久属性，只需在建库时设一次）** + `PRAGMA foreign_keys`。后果：`init_tables()`（24 条语句）实测 **3.60s**，且它是**函数级 fixture，每个测试重建一次全库 schema**。全量 271 条中 **82 条触碰 DB** | 2026-08-29 诊断实测：① 3 个 DB 密集文件 18 条：**85.49s → 8.33s（10.3x）**；② 全量：**366.70s → 44.56s（8.2x）**，但 **4 条失败**（绝对值随机负载波动约 3 倍，比值可靠、绝对值只作参考）——`_kb_ops.py:280-295` 的 `upsert_kg_edges_bulk` 自己调 `_new_conn()` 并在 `finally` 关闭，连接复用后缓存连接被它关死（`Cannot operate on a closed database`）。**→ 说明「每操作短命连接」是承重设计，不能无脑替换**。**安全的两档修复**：小档把 `PRAGMA journal_mode=WAL` 移出 `_new_conn`（每条 execute 省 33ms，零风险）；大档 `execute()` 走线程级缓存连接但**必须保留 `_new_conn()` 给显式调用者**。收益：剩余 7 个会话 × 每会话约 3 次回归 × 6min → 约 45s，**累计省约 2 小时** |
| **T26** | **【P1.1 引入的回归 · 实测】`_ensure_wal` 的实例级 flag `_wal_ensured` 在「库文件被删后复用同一 client」场景失效**。实测：建库 → `journal_mode=wal`；`_discard_shared_conn()` + `os.remove` → 复用同一 client 再 `init_tables()` → **`journal_mode=delete`（不是 wal）**。原因：文件删了但 flag 仍为 True，`_ensure_wal` 直接 return，新文件从未被设 WAL。**原实现每条连接都设 WAL，所以这是 P1.1 引入的，不是历史债** | **生产可达性 ≈ 0**：评委不会在容器运行时删 `data/app.db`；`docker compose down -v` 会重建容器 → 新 client 实例 → WAL 正常设置；全库唯一的测试中删除点（`test_engine_finalize.py:128`）已被 P1 的 conftest 桥接覆盖且删完即测试结束。**定性：给未来测试的潜在陷阱，非现网缺陷**。**修复方案（成本实测 0ms）**：去掉 flag 改为查询后按需设置——`row = conn.execute("PRAGMA journal_mode").fetchone(); if row and row[0].lower() != "wal": conn.execute("PRAGMA journal_mode=WAL")`，自校验、无状态可陈旧。**处置：不单开会话（3 行代码付一次完整会话开销与决策 20 相悖），折进 D 组（会话 4），单独一笔 commit + 一条守卫** |
| T15 | `.env.example` 的文件头注释声称「字段全量对齐 `backend/core/config.py`」，**实际只含 8 个键**，而 config.py 有 30+ 个变量。好在后者全部带默认值（E-6），不影响启动，但注释是误导性描述。 | 总领实测 | N1 重写模板时一并修正 |
| T8 | `vite.config.ts:8` 的 `proxyTarget` 默认为 `http://guashuai-backend:8000`（Docker 容器名）。本地 `start-frontend.bat` 以非 Docker 方式启动时该主机名不可解析，需 `VITE_PROXY_TARGET=http://127.0.0.1:8000`。本地开发路径可能已处于半失效状态。 | 总领实测 | 影响 C3 决策（见 §3.1 决策 1） |
| **T27** | **`main.py` 的 lifespan 启动检查只覆盖 `DEEPSEEK_API_KEY`，不检查 `EMBEDDING_API_KEY`**。F4′ 修复②的第 3 条（启动日志 warning）落点在此，**超出 F4′ 允许文件边界，按「先报批」原则未做**（前两条已满足「三选二」） | F4′ 上报（交接文档 §4/§8） | 待 owner 决定是否单开一步；优先级低——评委更可能在界面看到琥珀色告警 |
| **T28** | **settings 表残留 F5 已删字段的孤儿行**（`EMBEDDING_BACKEND="api"` 等）。`_apply_dynamic_settings` 有 `hasattr` 守卫，不生效、无害 | F4′ 上报（交接文档 §8） | F5 清理残余。可并入 D 组 D3（清理死代码）一并处理 |
| **T29** | **后台错误文案的 150 字符截断余量偏小**：`_process_file_bg` / `_process_upload_bg` 用 `str(e)[:150]`。F5 硬失败文案实测 **126 字符**（总领实测值，交接文档记为「约 112」，以 126 为准），**余量仅 24 字符**；`_set_progress_error` 再截到 200（余量 69）。文案一旦加长，「怎么办」那句会被切掉 | F4′ 上报 + 总领实测复核 | 提示性风险，当前不触发。若未来改写 F5 文案，须同步核算 |
| **T30** | `ServiceSettings.saveService` 成功后 flash 文案是「解析设置已保存」——保存硅基流动 Key 时语义不符 | F4′ 上报（交接文档 §8） | 既有文案瑕疵。1 行改动，可并入下一轮体验问题包 |
| **T31** | **同步 URL 入库路径（`knowledge.py:469`）无容器级实测、无行为守卫**，只有存在性守卫（`test_sync_routes_must_convert_ingest_failure_to_structured_error` 断言转换点恰 3 处）与 URL 链路的单测覆盖。原因是容器级 URL 实测需真实外网抓取 | F4′ 如实说明（交接文档 §2 表格 :469/:474 行） | 接受现状。风险已被存在性守卫压到「重构时才会暴露」，且 `:469`/`:474` 与已实测的 `:346`/`:350` 逐字同构 |
| **T32** | **`backend/engine/review.py:58` `pick_judge_llm` 直接 `DeepSeekLLM(...)`，绕过 D2 的 `_make_llm` 缓存**（其 fallback 分支 `:60-61` 反而走 `_make_llm`）。调用点 `pipeline_v2.py:493` 与 `resource_branches.py:358` → **研究档单轮 = seam 2 + judge 1 = 3 个 client**，未达 D2 的「≤2」（思考档 4→2 ✅、极速 2→2 ✅） | D2 上报（交接文档 §8-1）+ **总领已独立核实**（`git grep` 确认构造点与调用点） | **折进 A 组会话**，预批 1 行改动（走同款缓存 helper）。**不算 D2 不达标**——judge 用的是**不同 model/base_url**，本就需要独立 client；且 `review.py` 不在 D2 允许文件内，实施会话按决策 17 未越界，处置正确 |
| **T33** | **【测试基建陷阱 · 影响所有后续新增测试】新测试文件若在 collection 期模块级 `import engine.pipeline_v2` / `main`，会触发 `core.config.load_dotenv()` 把 `.env` 的 `SQLITE_DIR` 注入进程环境**，污染 `tests/test_db_path.py` 的「导入期快照」→ 该守卫假失败（按字母序排在其前者才会触发） | D2/D4 首轮实测踩中并修复（交接文档 §8-3） | **所有后续新增测试文件必须遵守：`pipeline_v2` / `main` 延迟到 fixture 执行期导入**，并在文件头写明原因。`test_d4_retry_idempotency.py` 与 `test_d2_llm_client_cache.py` 已示范。**A 组/B 组派发提示词必须把这条写进去** |
| **T34** | **D1 的搬迁结果没有任何守卫钉住**：`grep -rn "from main import" backend/engine/` 归零这件事全仓零测试覆盖（D1 的 commit 不含测试文件，其校验是一次性脚本）。后续若有人从 engine 反向 import main，不会有任何一条测试变红 | 总领 D 组验收时发现（`git grep -l "chat_context\|from main import" tests/` 零命中） | **折进 A 组补 1 条存在性守卫**（决策 33）。与 T26 同理：几行代码不值得单开会话，但**不能没有** |
| **T35** | `_LLM_CACHE`（`pipeline_v2.py`）是**无上限、无淘汰**的进程级字典，value 是常驻的 OpenAI client（含连接池）。条目数随「用户 key × model × base_url」组合增长 | 总领 D 组验收时复核代码发现 | 当前规模（单用户/少数组合）无害；若未来多用户长期运行，需加 `maxsize` 或 LRU。登记观察，暂不处理 |
| **T36** | `backend/main.py` 的 `extract_json_obj` 导入在 D1 搬迁后**已无直接使用者**（为保持最小 diff 而保留） | D1 上报（交接文档 §8-4） | 可并入 D3 遗留清理或下一轮。零危害 |
| **T37** | D4 缺**浏览器级**「mock 500 → 前端重试 → 库里只 1 条」的 E2E 自动化；现有证明是 API/单元级（含强制竞态的 `test_concurrent_race_backstop_skips_on_unique_conflict`） | D4 上报（交接文档 §8-2） | 接受现状。核心幂等语义已被单元级钉死，浏览器级属「最自然用户路径」的加分项；若 N2 第 2 次验收有时间可补手工验证 |
| **T38** | 🔴 **A2 的「后端推 reset 帧」这件事没有守卫**。`tests/test_a2_answer_reset.py` 的 4 条全部只测 `_frame()` 对**手工构造元组**的序列化 + `SSEBatcher.add/flush` 的 attempt 透传，**没有任何一条断言「重试环真的入队了 `("answer_reset", …)`」**。总领变异实测：把 `token_queue.put(("answer_reset", attempt - 1, "审核未通过"))` 换成 `pass` → **4 条全绿**。A2 的正确性目前只由一次性 E2E（mock judge + `a2_events3.json`，产物在系统临时目录）证明 | 总领 A 组验收时发现（变异抽查） | **折进 B 组补 1 条行为守卫**（决策 34）→ ✅ **已于 `98946e2` 关闭**：新增 `tests/test_a2_reset_emitted.py`（1 条），经真实 HTTP+SSE 通道收帧，断言「恰一帧 reset 且先于下一稿 token」。<br>**总领变异复核（层差实证）**：删掉 `token_queue.put(("answer_reset",…))` → **新守卫红**，而**既有 4 条序列化守卫仍全绿**——与 A 组诊断完全吻合，证明新守卫确实钉在行为层 |
| **T39** | **`resource_branches.py` 的两个旧泵（约 `:147` / `:421`）仍是 50ms 轮询 + 旧心跳**，未合批。资源生成/编辑分支的心跳行为与 A1 前一致 | A1 上报（在允许文件边界外） | 后续批次收编到 `SSEBatcher`（它是纯模块可直接复用）。注意 resource 分支的帧协议有自己的 `token/answer` 形状，收编前需先对齐 `_frame` |
| **T40** | `useChatStream.ts` 的 `streamedRef` 在 A3 删除打字机后**成了纯写入、无读者** | A3 上报 | 按最小改动纪律未顺手删。下个前端批次清理 |
| **T41** | **T33 的运行期变体**：`load_dotenv()` 会把**仓库根 `.env`** 注入宿主 pytest 进程。A 组实测踩中一次——T32 后跑测试时因临时 `.env` 出现 `test_pick_judge_llm_by_mode` 假失败，还原后消失 | A 组上报（交接文档遗留 6） | **跑后端全量回归前，`.env` 必须处于真实状态**（临时注入过 mock 值的尤其要还原后重跑）。已写进派发提示词的环境事实 |
| **T42** | UI 实测在**真实课程对话里**留下了测试消息（色彩量化 / RAG对比 / 熵 / A3验证×2 等，均真实调用 LLM 并正常落库） | A 组上报（交接文档遗留 5） | 后续 UI/E2E 测试**先新建一次性课程**，测完删课。SSE 桩测试（被 route 拦截）不落库，无此问题。**B 组已遵守**（三个一次性课程均已删） |
| **T43** | **B2 的窗口「批量重灌」**：进入对话后历史消息异步到达的瞬间，会把此前约 2 秒内的手动展开覆盖回「末尾 12 条」；另占位高度是常数估算，物化瞬间有被锚定吸收的残差 | B 组上报（遗留 1） | 历史消息单次全量加载的设计使然，影响窗口极小。若要根治需改为分批加载（属新步骤，不在本轮） |
| **T44** | **B3 的「纯列表流」退化**：整段都是 `- ` 块且仍在增长时，最后一个列表组作为尾段每帧整文重解析，成本随该组长度线性 | B 组上报（遗留 2） | **正确性优先的主动取舍**——列表终止性静态不可判定，宁可慢也不能切错。一旦出现非列表块即冻结缓存，恢复正常。低端设备长列表回答时可能可见 |
| **T45** | `buildMessageProps` 的 `ctx` 对象每次渲染新建（仅作入参，不进 props，故不破坏 memo） | B 组上报（遗留 3） | 无害。若未来引入 React Compiler 可整体简化 |
| **T46** | **B4 的触发机制已随 A1 改变**（事实记录，非缺陷）：A1 收敛心跳后，断线判定 =「首字节前空闲超时（`resetTimer` 15s/60s）」或「连心跳在内的字节流彻底停止 60s」或「fetch 层异常」。**HTTP ≥500 与用户主动停止不走轮询**（各有独立文案） | B 组实测取证（交接文档 §5） | 后续改轮询相关逻辑前必读。判定口径与派发文档「心跳没了就是断线」的旧假设不同 |
| **T47** | **【P1 功能缺陷 · N2② 发现】`GET /api/knowledge/query` 在「容器新建 DB + 项目已有向量数据」时稳定 500**：traceback `knowledge.py:668 → knowledge_service.py:365 search → kb_repo.py:142 → _kb_ops.py:233 search_kb_vectors → _new_conn → _sqlite_core.py:49 _ensure_wal → sqlite3.OperationalError: unable to open database file`。空 KB 项目 200（无 docs 提前返回）。**总领复核（2026-08-31）**：①开发栈（长存 DB + 同镜像 99cfe7c）**复现阴性**——ai Agent 项目查询 200 且返回真实语义结果，缺陷指向「容器新建库」场景；②**chat 主链路不受影响**（engine 无 `.search(` 调用，retrieve.py 只用 `fetch_section_texts`/`list_docs`；写入走缓存连接正常）；③**真实影响面 = 前端知识库查询（`api.ts:179`）+ `knowledge_retrieval` 技能（`:11`）——恰落在评委 fresh 部署场景**。根因假设：容器在 bind mount 上新建的 WAL 库，第二连接 `_ensure_wal` 触碰 -wal/-shm 失败（gRPC-FUSE/virtiofs 共享内存限制类；宿主 NTFS 与长存库均阴性） | N2② 上报 + 总领复核 | **F7 实证完成（2026-08-31）：当前环境不可复现（Docker 版本前后一致），三处关键取证被推翻（sidecar 宿主视错觉等），修复形态关闭并入 T50 调查** |
| **T48** | **README 知识库上传入口指引含糊**：「顶部『资源』页可上传」实为系统预置资源库（无上传按钮）；真实入口 = 课程工作台左侧「资源」→「查看更多」→ 上传面板。随记两个吹毛求疵：项目资源面板双「确认上传」按钮（外层易误点）；⑧-A 报错文案「。，」连排 + 「请稍后在知识库查看」易误导（实际该条保持未向量化需删传） | N2② 上报 | README 微改 + 前端文案，折进下一会话/下一轮体验包 |
| **T49** | **【测试基建 · F7 会话登记】宿主 pytest 与开发栈共用 `data/app.db`（conftest 无 DB 隔离，`:42` 触达 `db_path`）**——测试写操作直达真实库，364 测试 × 16 轮未出事故属侥幸面 | F7 会话上报，总领核验 conftest 触达点属实 | 待专项核实与隔离方案（勿与 T50 混同） |
| **T50** | **🔴【数据丢失事件 · 总领取证】「ai Agent」课程知识库向量在 F7 会话窗口内消失**：总领 02:13 查询该库返回 3 条真实向量结果（AI-Agents-in-Depth-zh-CN.pdf chunk 108/192/287）→ F7 会话后同查询 `results:[]`，只读直查 `kb_vectors` 该项目 **0 行**（现库仅存 F7 会话写入的 smoke-web1 10136 行 + smoke-web3 371 行，且**两项目无 projects 表行 = 孤儿向量**）；`kb_tree` 残留 8 行（文档树在、向量无）。时间括号铁证：数据在 F7 窗口内消失。**疑似触发**：F7 会话向开发栈上传 smoke-web1（10136 块）的写入/重建路径存在跨项目清除，或其 pytest 基线——待会话交代完整操作序列。**恢复**：owner 重传源 PDF 即可重建向量，课程/聊天记录不受影响 | 总领只读直查取证（mode=ro）；**补充证据（08-31 体验期复查）**：projects 表现存 2 行（新课程/默认项目），kb_tree 残留孤儿——ai_agent 8 行 + smoke 3 行（projects 已无对应行）→ 删除路径级联疑点，归 T50 调查 |
| **T51** | **【P1 API 契约 · F8 实证】部分字段 PUT /api/settings 会以 pydantic 默认值覆写未提交配置**（副本实证：EMBEDDING_MODEL→bge-m3 + dimensions=400，siliconflow code 20015）；前端全字段提交则无恙，API 层是坑——建议「空串/缺省不覆写」语义（改 routers/settings.py） | F8 会话 E4 实验 | 待派发（可折进 F11/F12 微改） |
| **T52** | **【P3 体验 · F8 遗留】CJK-CJK 段内空格保守保留**（pymupdf4llm 硬换行拼接产物，如「难以 还原」）——扩规则删除 vs 伤及有意分词，**待 owner 拍板** | F8 会话上报 | owner 决策后折进微改 |
| **T53** | **【P2 UI 移除 · owner 指令 08-31】删除「项目介绍」按钮与点开后全部内容**：ActivityBar 两处按钮（`ActivityBar.tsx:69/:82`，`onChange('tutorial')`）+ tutorial 视图（`TutorialView.tsx`）+ 首次进入自动弹窗（`App.tsx:147/:523` showIntro/introSeen）+ `IntroPanel.tsx` 组件。**边界点（实施时判定）**：项目介绍 Agent 设定持久化（`App.tsx:76/:379`）与 `AgentsView.tsx:179` 对话设定共用——若仅服务 IntroPanel 则一并删，AgentsView 共用则保留持久化逻辑 | owner 指令 + 总领锚点 | **折进 F12 派发单**（纯前端，与 F11 文件无交集） |
| **T54** | **【P2 UI 移除 · owner 指令 08-31】删除设置→AI 服务的「切块与检索参数」栏**：`ServiceSettings.tsx:224` 起整节（KB_CHUNK_SIZE/MODE/OVERLAP/RRF_K/FETCH_MULT 的 UI 呈现）。**后端 API 契约不动**——键保留走默认值，仅删 UI 栏；设置保存往返测试同步收缩 | owner 指令 + 总领锚点 | **折进 F12 派发单** |

## 6 评估环节（对照官方比赛方案 XH-202630，2026-08-31 总领登记）

**时间账**：作品提交截止 **2026-09-05**（5 天）；初审 09-20；**10 月官方完善窗口**；11 月终审。验收主体变化 ⇒ 序列重排。

**待拍板项 D-01（提交窗口技术批次规模）**：A 五轮全跑 / B（原建议）F11+F13+T53/T54 微缩 F12，F9/F10 顺延 10 月窗口 / C 现状直提。**✅ owner 拍板（08-31）：A——五轮全跑不缩减**；附加裁定：①「协同决策中间数据导出」折进 F11（S5；**执行时机改为 F11 验收通过后追加**，不打断在跑会话——owner 08-31）；②「降维解释/进阶挑战」动态迭代机制核实与补齐放 **10 月完善窗口**。依据：10 月有官方完善窗口可继续完善，9-5 交完整作品。

**评估环节工作清单（并行启动，不占实现会话）**：
1. 10 分钟演示视频（脚本→录制：差异化画像输入→协同调度可视化→资源生成闭环）——按 F11 完成后形态录
2. 测试数据包：≥1 领域知识库切片（F13）+ ≥3 组差异化学习者学情数据源 + 完整输入输出示例（含协同决策中间数据）
3. 三项硬指标实测：幻觉率<5%、画像-资源适配准确率≥85%、核心知识点覆盖率≥90%（实验设计+跑数，用例宜 ≥50 组）
4. 作品设计实现方案文档 + 作品介绍；部署说明核对（T48 微改收尾）
5. 支撑微功能：「协同决策中间数据导出」（折 F11 交接）；「降维解释/进阶挑战」动态迭代机制核实与补齐（10 月窗口）

**EVAL-1 评估与提交材料会话（2026-08-31 立项，与实现批次并行）**：不写产品代码；Wave 1（立即）=评估方案/用例矩阵 ≥50/作品设计方案+介绍/视频脚本 v1/README 核对清单；Wave 2（F11+S5 与 F13 落地后）=副本栈跑数+指标实测报告+测试数据包组装。产出存 `docs/submission/`（本地不入 git）。材料源：赛题原文 `D:\desktop\挂帅\0、全局性要求相关——开发时查阅\官方原文——给ai读.md`。 **F7 改判 T50 调查（P0）** |

---

## 5. 交接文档归档

| Step | 归档路径 | 验收结论 |
|:----:|---------|:--------:|
| C1 | `docs/progress/step-C1.md` | ✅ 通过（commit `9c8378a`） |
| C2 | `docs/progress/step-C2.md` | ✅ 通过（commit `e2ca50b`） |
| N1 | `docs/progress/step-N1.md` | ✅ 通过（commit `899afae`→`9f82ee2`，7 个）。新登记风险 2 条（E-12、T17） |
| C3 | `docs/progress/step-C3.md` | ✅ 通过（commit `fad1feb`→`0534e3c`，4 个）。知识库图片上传定性为 P0 功能完全失效，据此新增 Step F1 |
| F1 | `docs/progress/step-F1.md` | ✅ 通过（commit `3dd5424`）。新增 Step F2 处置其引入的解析回归（T23） |
| C4 | `docs/progress/step-C4.md` | ✅ 通过（commit `531ba17` / `78cd198` / `f3d21f3`，pytest 266 passed）。bind mount 处置升级为 N3 决策点（决策 19） |
| F2 | `docs/progress/step-F2.md` | ✅ 通过（commit `19806af`，pytest 271 passed）。容器内真实 3MB PDF 的 HTTP 耗时 **111.25s → 0.22s**；非图片重复上传进度 0.3s 直达终态 |
| P1 | `docs/progress/step-P1.md` | ✅ 通过（commit `8bfa582` / `b44cc17` / `d52169e`，278 passed）。全量回归降至 **30–39s**；新增 T26 待折进 D 组 |
| N2 | `docs/progress/step-N2.md` | ✅ 通过（第 1 次，零代码改动，**7 项 6 过 1 败**）。含总领独立复核 5 项、**总领认领 2 处自身失误**（③ 判据要了 C4 未交付之物；F1 把「不改 `UPLOAD_CONSTRAINTS`」划入「不做」→ 造成跨层缺口）、**定性上调 1 处**（N2-2 由 UX 瑕疵上调为 P1）。核心成果：冷构建 **433s**（README「10 分钟以内」承诺成立）、**伪向量降级在真实冷部署中实锤**（T20 由推测升级为事实） |
| F3 | `docs/progress/step-F3.md` | ✅ 通过（commit `87cf570` / `a8e95a4` / `2b951f7`，**287 passed**）。含总领独立复核 6 项、全前端扫描发现**范围事实**「**3 个文件入口只修了 1 个**」（→ 衍生 **F6**）、认领 bmp 属**与 N2-2 同型**的「声称支持 vs 上游实际支持」不一致（→ E-31，待 owner 决策剔除/转码）。核心成果：三份手写清单归一为单一事实源（全链派生，无手写副本）、双服务 `Up (healthy)`、拉取失败不再留空失效。**E-28 陷阱复现吻合**：实施会话独立实测的 `127.0.0.1 exit=0` / `localhost exit=1` 与总领记录一致——说明该登记有效 |
| F5 | `docs/progress/step-F5.md` | ✅ 通过（commit `a79f6d9` / `172960a` / `0251a56` / `3395670`，**295 passed**）。含总领独立复核 5 项、**总领认领 1 处自身失误**（`grep \| head -4` 截断导致爆炸半径误判「2 处」实为「4 处」→ 造成实施会话中途报批，已固化为**决策 27**）、**定性上调 1 处**（`_process_upload` 吞异常削弱 owner 拍板的 A1 → 从「上报不修」上调为 F4′ 必办）。核心成果：镜像 **3.25→1.67GB**、冷构建 **433→207.9s**、本地模型通道全移除、无 Key 硬失败 + rerank 优雅降级不刷屏 |
| F6 | `docs/progress/step-F6.md` | ✅ 通过（commit `542caf3` / `0036da0`，**300 passed**）。含总领独立复核 6 项（含 **BOM 字节级检查通过**）、**总领认领 1 处判断不如实施会话**——提示词倾向「沿用后端 `upload-constraints`」，实施会话选择静态串 + 双向守卫，理由是后端清单含 `bmp` 而 VL 拒收（E-31）、两场景允许集本就不同，**该判断比总领默认倾向正确**。**教训**：F3 的「以后端为准」有适用边界——只在「前端 accept 与后端能力同源」时成立，**聊天走 VL、知识库走 embedding，不是同一条链路，不能无差别复用**。核心成果：聊天点选图片打通，**真实 vision 端到端验证通过**（非 mock）；最终 diff 仅 accept 1 行 |
| **F4′** | `docs/progress/step-F4prime.md` | ✅ 通过（commit `e48e67d` / `023553b` / `1da93e7` / `20a73a4` / `2855fc9`，**314 passed**，总领独立复测 `41.80s`；tsc exit 0 / vitest 26 总领复测）。含总领独立复核 **8 项**、**独立变异抽查 2 组**（bmp 回流 / mime 硬编码回归，均「恰 1 条红 → 还原全绿」）、**总领认领 1 处自身疏漏**（派发文档基线 295 未随 F6 同步为 300 → 决策 29）、**认定 1 处程序性瑕疵**（修复①改动 `UploadPanel.tsx` 的 `pollProgress` 超出「仅 `:14`」的行范围，虽内容正确且为达成验收项 2 所必需，但交接文档未标注，与决策 17 的报批范式不符）。核心成果：A1 意图真正落地——无 Key 时同步/后台两条路径均返回**含「怎么办」的完整 F5 文案**（三份响应原文见交接文档 §3，三个前缀分别对应三个代码落点）；`_process_upload` 7 个调用点逐个核对，其中 `:350`/`:474` 经 `background.submit` 直投的**异常黑洞**是本次核实出的补充事实；bmp 5 处全剔除 + 3 条反向守卫；mime 魔数推断经**真实 JPEG 上游实测**通过。**E-31 / E-32 / E-33 三项全部关闭** |
| **D 组** | `docs/progress/step-D.md`（本地归档，**不入库**——`.gitignore:31-33` 的 E-24 决策 A：过程记录类文档不提交，唯一状态源是 `PROGRESS.md`） | ✅ 通过（commit `3ee3a36`/`d531717`/`8d44499`/`8990587`/`56ebfc6`，**336 passed**，总领独立复测 `44.30s`；tsc exit 0 / vitest 26 总领复测）。含总领独立复核 **7 项**、**独立变异抽查 4 组**（D4 去重失效 / T26 退回陈旧 flag / D2 缓存禁用 / D3 死代码回流，均「恰该条红 → 还原全绿」）、**总领认领 1 处自身疏漏**（派发提示词写「交接文档随 commit 入库」，与 E-24 决策 A 冲突，由实施会话据 `.gitignore:31-33` 纠正）、**总领采纳 1 处预判修正**（我预判的 2 处「包装型用例」实为 fixture 已整体替换 `_make_llm`，不经过缓存——对方实测 21 passed 为证）、**新登记 6 项技术债**（T32–T37）。核心成果：D4 幂等（部分唯一索引 + 历史零迁移 + 冲突跳过 + 反向脚本齐全）、D3 实证删除死代码、D2 思考档 4→2、D1 字节级纯搬迁（`from main import` 3→0）、T26 WAL 自校验 |
| **A 组** | `docs/progress/step-A.md`（本地归档，**不入库**——E-24 决策 A） | ✅ 通过（commit `eb0e4ab`/`ab43d3a`/`dc9d101`/`6e18b3c`/`ba0f01a`，**356 passed**，总领独立复测 `47.58s`；tsc 0 / vitest **32** 总领复测）。含总领独立复核 **7 项**、**独立变异抽查 4 组**（A2 删 reset 推帧 / T32 judge 改回裸构造 / D1 反向 import / A3 塞回 `setInterval`）、**总领采纳 1 处对自身提示词的纠正**（我说「审核默认关闭」不准确——实际 `review_enabled` 是**极速恒关 / 研究恒开 / 思考档由 settings 控制**，实施会话用研究档直接进审核环，是对的）、**新登记 5 项技术债**（T38–T42）。核心成果：A1 answer 帧 **394→64**、心跳 **83→0**、帧间隔 median 47ms，`drop_pending()` 按预留被 A2 用上；A2 修掉两稿拼接（E2E 协议级三段断言 + Playwright 真实 UI），并**自行抓出且修掉一个真 bug**（达重试上限时也推 reset → 气泡闪断）；A3 两分支合并为一次无条件写入。**唯一实质缺口：T38——A2 的 emit 无守卫，已折进 B 组** |
| **B 组** | `docs/progress/step-B.md`（本地归档，**不入库**——E-24 决策 A） | ✅ 通过（commit `98946e2`/`b31d198`/`7f4cc58`/`441a5e9`/`4947558`，**357 passed**，总领独立复测 `49.73s`；tsc 0 / vitest **90** 总领复测）。含总领独立复核 **6 项**、**独立变异抽查 5 组全部咬合**（T38 删 reset 推帧 / B1 摘 memo / B3 松列表边界放宽 / B2 去窗口冻结 / B4 去次数上限）、**总领订正 1 处会话的错误结论**（会话称「`.env` 的 key 已失效」，实为其**手拼的假 key** 401；总领实测 `.env` 真 key `HTTP 200` 有效）、**新登记 4 项技术债**（T43–T46）。核心成果：T38 关闭且**经层差实证**；B1 流式期重渲染 **delta 恒 =1**；B3 采用「**只缓存已闭合块**」的安全设计，38 条一致性语料逐字节相等，1500 字耗时与 100 字持平；B2 **追加冻结**方案使粘底零抖动（底部距离最大 1px）、`idx` 全量下标语义验证通过；B4 轮询收敛到 ≈61s 且三处清理。**⚠️ 一起凭据事故已记录（决策 35）**：会话臆造 API key 并清掉了 Playwright profile 里的有效凭据，无数据损坏，但需 owner 在该测试浏览器重新填 key |
| — | 其余步骤完成后按 `step-<id>.md` 归档 | — |

---

## 5. 下一轮衔接

> owner 于 2026-08-29 提出：本轮 18 步完成后，他要**亲自使用产品**，
> 按使用体验分区整理一批问题，打包交回总领处理。他需要新开会话做这件事。

### 5.1 下一轮的输入物

| 项 | 内容 |
|---|------|
| 会话提示词 | `docs/dispatch/next-round-experience-intake.md`（已生成） |
| 产出物 | **使用体验问题包** |
| 交付方式 | 用户把问题包发回给（下一任）总领会话 |
| 关键锚点 | 问题包必须记录**采集时的 commit sha**，否则无法对齐代码状态 |

### 5.2 该会话的职责边界（已在提示词中固化）

- **只读**：不改代码、不改配置、不启停服务、不执行改变系统状态的命令
- 只做：记录观察、追问复现路径、区分事实与感受、按体验分区、记录用户调研所得的代码线索（标注待复核）
- 不做：技术决策、方案设计、优先级排序——那是下一轮总领的事

### 5.3 分区方式按体验维度，不按代码模块

`A 等待与反馈` / `B 内容质量` / `C 交互与操作` / `D 稳定性与容错` /
`E 理解与引导` / `F 其他`。条目编号用 `X-A1` 前缀，与本轮步骤号（C1/A1/B1）区分。

### 5.4 去重过滤器（写进会话提示词的内置清单）

- **过滤**：本轮已修（2 项）+ 本轮待修（10 项，见提示词 §2.2）——避免重复记录
- **重点记录**：本轮明确不做的领域——检索质量、内容质量、产品流程、
  提示与引导、等待体感。这些是下一轮的富矿。

### 5.5 给下一任总领的提示

收到体验问题包后：
1. 先核对问题包里的 commit 与当前 HEAD 是否一致，不一致先对齐
2. 体验分区（X-A1 等）需转化为代码模块归属，这需要重新勘察，
   **不要直接按体验分区拆步骤**——一个体验问题可能横跨多个模块
3. 本轮的 `PROGRESS.md`、`docs/progress/`、`docs/dispatch/` 是下一轮的主要上下文
4. 本轮的两条经验值得沿用：**①** 分发前先自查方案前提是否成立（C1、C2、C3、
   D3 各修正了一处原方案的错误判断）；**②** 守卫测试必须做变异验证
