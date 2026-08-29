# CoAgent-Learn 优化进度看板

> 总领会话唯一状态载体。由总领维护，实现性会话只读不写。
> 配套：`LEAD_SESSION_PROMPT.md`（流程）、`SINGLE_STEP_EXECUTION.md`（分发来源）、`OPTIMIZATION_PLAN.md`（问题证据）

## 0. 元信息

| 项 | 值 |
|----|-----|
| 基线 commit | `4a1a7cf`（2026-08-29，分支 `master`，工作区干净） |
| 看板初始化 | 2026-08-29 |
| 回归基线 | 后端 pytest **241 / 241**（基线 commit `4a1a7cf`）；前端 vitest **26 / 26** + `tsc` 0 错误 |
| **当前实测规模** | 后端 pytest **278 passed**（P1 收口，commit `d52169e`）；前端 vitest **26** 不变。演进：`241` →C1/C2/N1/C3 各步守卫→ `251` →F1 +9 条→ `260` →C4 +6 条→ `266` →F2 +5 条→ `271` →P1 +7 条守卫→ **`278`** |
| **全量回归耗时** | **30–39s**（P1 后）。演进：`302.01s`（F2 后实测）/ `122.28s`（P1 会话同机实测，快状态）→ P1 后 `30.61s`（P1 会话）/ `38.40–39.17s`（总领复测）。绝对值随机状态波动较大（跨机观测差约 3 倍），以同时段中位数与 A/B 比值为准。 |
| **代码规模** | 后端 68 个 Python 文件 / 9678 行，最大文件 `pipeline_v2.py` 628 行；前端 57 个 TS/TSX 文件 / 10878 行 |

---

## 1. 步骤序列与状态

状态取值：`待分发` / `进行中` / `已完成` / `受阻`

| Step | 内容 | 前置 | 风险 | 改动文件（文件表面） | commit | 状态 |
|:----:|------|:----:|:----:|---------------------|:------:|:----:|
| C1 | 依赖固化进镜像 | — | 低 | ✅ 实际改动：`deploy/docker-compose.yml` + `tests/test_c1_runtime_deps.py`(新) | `9c8378a` | **✅ 已完成** |
| C2 | 移除死依赖 | C1 | 中 | ✅ 实际改动：`backend/requirements.txt`(-3 行) + `tests/test_c2_dead_deps.py`(新) | `e2ca50b` | **✅ 已完成** |
| A1 | SSE 合批与心跳收敛 | C1 | 中 | `backend/engine/sse_pump.py`(新)、`pipeline_v2.py` 的 `stream_response` + 测试 | — | 待分发 |
| A2 | answer_reset 帧 | A1 | **高** | `pipeline_v2.py`(重试环/`_frame`)、`useChatStream.ts` + 集成测试 | — | 待分发 |
| A3 | 删除打字机降级路径 | A2 | 中 | `useChatStream.ts` + 测试 | — | 待分发 |
| B1 | memo 化 + props 稳定化 | — | 中 | `AssistantMessage.tsx`、`CenterPanel.tsx` + 测试 | — | 待分发 |
| B3 | Markdown 分片缓存 | B1 | **高** | `AssistantMessage.tsx` + 测试 | — | 待分发 |
| B2 | 列表窗口化 | B1 | 中 | `CenterPanel.tsx` + 测试 | — | 待分发 |
| B4 | 断线轮询收敛 | **A1**（心跳频率影响其改动对象，序列中排在 A3 之后） | 低 | `useChatStream.ts` + 测试 | — | 待分发 |
| D1 | 消除反向依赖 | — | 低 | `services/chat_context.py`(新)、`main.py`、`pipeline_v2.py`(仅 import 行) | — | 待分发 |
| D2 | LLM client 复用 | — | 低 | `pipeline_v2.py` 的 `_make_llm`/`_make_fast_llm` + 测试 | — | 待分发 |
| D3 | 清理 `_strip_thinking` | — | 低 | `base_llm.py`（**两轮交互**：先调研后执行） | — | 待分发 |
| D4 | 重试幂等 | — | 中 | `pipeline_v2.py` 的 `_persist_user_message` 和/或 `useChatStream.ts`（**两轮交互**：先分析后执行） | — | 待分发 |
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
| **F4** | **embedding / rerank 降级显式告警 + 双 Key 引导**（新增，N2 第 ⑧ 项） | N2 | 低（只加告警与引导，不改降级行为） | `backend/core/embeddings.py`、`backend/core/knowledge_service.py`、`README.md`（+ 可选前端设置界面提示 / 启动日志 warning）、`tests/test_f4_embedding_degradation.py`(新) | — | 待分发 |
| **F5** | **移除本地模型，全部走 API**（owner 2026-08-30 拍板） | F3 | **中（改依赖构成 + 行为变更）** | `backend/core/embeddings.py`、`backend/core/knowledge_service.py`、`backend/core/config.py`、`backend/requirements.txt`（删 torch / sentence-transformers / 阿里云 find-links） | — | **计划阶段** |
| **F6** | **聊天输入框图片白名单**（新增，F3 复核发现） | F3 | 低（两处 accept 字符串） | `frontend/src/components/CenterPanel.tsx:427`、`frontend/src/components/DragDropInput.tsx:85` | — | 待定边界 |

> ⚠️ **F3 只修了 3 个文件入口中的 1 个**（总领全前端扫描实证）：
> `UploadPanel.tsx:191` 已改为动态 accept ✅；但 **`CenterPanel.tsx:427` 与
> `DragDropInput.tsx:85` 仍是静态 accept 字符串，不含任何图片扩展名**。
> → 评委若在**聊天界面**点附件按钮传图，**仍然选不了**。
> 但聊天协议层本身支持：`useChatStream.ts:214` 有 `image:` 字段——缺的只是那个 accept。
> 已登记 **F6**。
> 注：这**不是** F3 的疏漏——F3 的文件边界就是 `UploadPanel.tsx`，实施会话据实上报，
> 处置正确。

> **F5 计划已产出**：`docs/dispatch/step-F5-plan.md`（待 owner 反馈后转正式提示词）。
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
| **N3** | **发布封装**（新增） | 全部 17 步完成 | 中 | `deploy/docker-compose.yml`（`build:` → `image:`）、`README.md`、registry 配置 | — | 待分发 |

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
| F4 | `docs/dispatch/step-F4.md` | 2026-08-30 | **待执行**（降级显式告警 + 双 Key 引导）⚠️ 若 F5 先执行，需缩减为「仅双 Key 引导」 |
| F5 | `docs/dispatch/step-F5-plan.md` | 2026-08-30 | **计划已就绪**，待 owner 反馈后转正式提示词 |
| F6 | — | 2026-08-30 | **待生成提示词**（聊天输入框 accept 补图片） |

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
会话 5  **F5  ← 下一个**：移除本地模型，全部走 API（owner 拍板，计划已就绪）
会话 6  F4′  双 Key 引导（F5 后缩减：降级告警已无意义）+ **F6** 聊天输入框图片白名单
会话 7  D 组  D1→D2→D3→D4  **+ T26 修复（P1 引入的 WAL flag 回归，折进来省一个会话）**
会话 8  A 组  A1→A2→A3
会话 9  B 组  B1→B3→B2→B4
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
| E-17 | **C3 改 nginx 后 SSE 帧粒度变了约 22 倍**：dev 时代 15.10s/1366 chunk（≈11ms/帧）→ nginx 后 26.76s/107 chunk（≈249ms/帧）。不是降级（直方图每 2s 桶均有 chunk），但**基线口径变了** | **A1（SSE 合批与心跳收敛）必须以 nginx 之后的口径（约 4 帧/s）为基线**，不能用 dev 时代测到的 20 帧/s，否则收益评估错误 |
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
| **E-31** | **【上游约束 · F3 实证】上游 VL（视觉 LLM）服务只收 `webp/png/jpeg/gif`，**拒收 `bmp`**；而我们的 `_IMG_EXTS` 含 `bmp`** | F3 实测（总领**无可用 VL Key，无法独立复验，属采信**）。性质判定：**与 N2-2 完全同型**——「**我们声称支持** vs **上游实际支持**」的不一致。bmp 经点选与后端准入均正常，失败发生在视觉描述阶段。<br>**两选一，待 owner 决策**：① **剔除** `bmp`（最简单，用户传 bmp 会被明确拒绝）；② **转码** bmp→png（保留能力，但需引入图像库依赖，**与 C1「不新增构建期依赖」方向相悖**）。<br>**总领倾向①剔除**——bmp 在今天已属边缘格式，为它引入依赖不划算 |
| **E-30** | **【双重静默降级 · 实测】未配置 `EMBEDDING_API_KEY` 时，embedding 与 rerank **同时**静默失效**。<br>**① embedding**：`_embed()` 的路由条件是 `EMBEDDING_BACKEND=="api" and EMBEDDING_API_KEY`（`embeddings.py:67`）。默认 `EMBEDDING_BACKEND="api"`、`EMBEDDING_BASE_URL` 已是硅基流动，**但 key 为空 → 判定 False → 落 `_embed_local`** → `EMBEDDING_LOCAL_MODEL=""`（`config.py:24`，本地通道已废弃）→ `SentenceTransformer("")` 抛 `AttributeError` → 被裸 `except Exception` 吞掉 → **伪向量 `ord(ch)%100/100`**。<br>**② rerank**：`_get_reranker()`（`knowledge_service.py:473-487`）同理——`RERANK_BACKEND="api"` 但 `RERANK_API_KEY` 与 `EMBEDDING_API_KEY` 皆空 → 落本地 `CrossEncoder("BAAI/bge-reranker-base")` → 需从 HF 下载 → 失败 → `_reranker_local=False` → 返回 None，**重排被静默关闭** | **只需配置一个硅基流动 Key（`EMBEDDING_API_KEY`），两条路径同时走 API，问题消失**：rerank 的判定是 `RERANK_API_KEY or EMBEDDING_API_KEY`，会复用同一把 key。<br>⚠️ **对 N3 的连带影响（重要）**：配置 key 后，torch / sentence-transformers 的**全部引用点**（`embeddings.py:19` 与 `knowledge_service.py:483`）均不可达 → 成为**死依赖**。而它们正是 backend 镜像 **3.25GB** 的主因（torch 2.13 + transformers 5.14 + sentence-transformers 5.6）。**→ 若决定「API 为唯一路径、移除本地兜底」，可大幅缩小镜像并显著缩短冷构建（现 433s，README 称大头是 torch 下载 ~190MB）。这是一个独立的新选项，须 owner 决策**。<br>**注**：未配置 key 时本地兜底**仍会尝试加载模型**，故 torch 当前并非完全无用——是否移除取决于是否保留离线能力 |

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
| 25 | **N2 撞出的 3 项分两步走：F3 立即修（N2-1+N2-2），N2-3 待 owner 决策**（2026-08-30） | **F3（新步骤，会话 4）**：① 把图片扩展名补进 `backend/routers/knowledge.py:479-485` 的 `UPLOAD_CONSTRAINTS`（现与同文件 `:522` 的 `_IMG_EXTS` 不一致，导致前端选择器拒收图片）；② 修 `UploadPanel.tsx:29` 的 `.catch(() => {})`（静默吞掉约束拉取失败 → `allowedExts` 为空 → `:40` 的二次过滤被静默关闭）；③ 给 frontend 补 healthcheck（用 busybox `wget`，**不装 curl**，违背 C1 方向）。<br>**N2-3（伪向量）暂不进 F3**：修法涉及架构级取舍，须 owner 定程度 | ① **N2-2 定性为 P1**：它让 F1 的 P0 修复在**最自然的用户路径**（点上传→选文件）上不可达，评委最可能做这个动作；② ①和②同属上传约束链路，一个会话内做完比拆两次省一个会话（决策 20 精神）；③ N2-1 是低风险打磨，顺带做掉，避免再开一个会话；④ **N2-3 不进 F3 是因为它与 F3 不同层**：F3 是确定性 bug fix，N2-3 是「告警 / 预置模型 / 换 API」的架构取舍，混在一起会让 F3 的验收判据变模糊 |
| 26 | **验收清单新增默认项：最自然的用户路径是否可达**（N2 的流程教训） | 后续步骤的验收判据里，除「API 是否返回 200」外，默认加一条：**该功能最自然的用户路径能否走通**（含前端入口、白名单、按钮状态等跨层环节）。 | **跨层缺口是分步验证的结构性盲区**：F1 验后端（图片上传链路修好）、C3 验前端（生产化），各自都绿，**但连接处没人验**——`UPLOAD_CONSTRAINTS` 不含图片，导致 F1 的修复只有拖拽一条路能触达。只有 N2 这种真实端到端才撞得出来。同类风险在 A/B 组同样存在（前端改动 + 后端协议变更） |

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
| 1 | **registry 选哪个**：GHCR（`ghcr.io/<owner>/<repo>`）还是 Docker Hub（`<user>/<repo>`） | A. GHCR　B. Docker Hub | **GHCR** |
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
