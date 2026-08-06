# CoAgent-Learn 项目全景文档

> 本文档供新开发者/AI 快速理解整个项目。请先通读本文，再深入具体文件。
> 最近更新：2026-08-06（三服务轻量架构改造完成：PostgreSQL+Redis+Chroma → SQLite(sqlite-vec)）

---

## 一、项目是什么

**CoAgent-Learn** 是一个**面向领域知识生成的多智能体协同学习系统**（大学生挑战杯比赛项目）。

**核心理念**：用户输入一个想学的领域/问题，系统不是直接给一个答案，而是通过**多个各司其职的 AI Agent 协同工作**——诊断用户水平、检索知识库、联网搜索、生成定制化学习资源（讲义/实操指南/分阶测试题）、交叉审核质量——最终输出个性化学习内容，并持续记忆用户画像、构建知识图谱。

**一句话流程**：输入问题 → 信息输入处理 → 调度 Agent 决定调用哪些子 Agent → 信息整理与生成 → 三个审核 Agent 交叉验证 + 仲裁 → 输出。

**项目定位**：前端由 React 搭建，后端由 FastAPI + LangGraph 驱动多智能体工作流，数据层使用 **SQLite(sqlite-vec) 单文件 + Neo4j**（三服务轻量架构）。

---

## 二、技术栈总览

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | React 19 + TypeScript + Vite + TailwindCSS | 三栏布局 Web UI |
| 前端绘图 | @xyflow/react (React Flow) | 多智能体工作流画布 |
| 前端图表 | echarts | 知识图谱力导向图 |
| 后端 | FastAPI + uvicorn | REST API + SSE 流式 |
| 智能体编排 | LangGraph (StateGraph) | 9 节点有向图工作流 |
| LLM | DeepSeek (langchain-deepseek / OpenAI 兼容) | chat + streaming |
| 业务数据 | SQLite | 12 张业务表（对话/项目/画像/统计） |
| 向量存储 | sqlite-vec（SQLite 内嵌扩展） | 知识库/记忆向量，HNSW 索引 |
| 中文 embedding | bge-small-zh-v1.5 (sentence-transformers) | 512 维，hf-mirror 下载 |
| 混合检索 | 向量 + BM25 → RRF 融合 → bge-reranker P3 精排 | P1 上下文前缀增强 |
| 图数据库 | Neo4j | 实体关系知识图谱 |
| 技能框架 | 自研 Skill 注册中心（MCP 前身思想） | 功能模块插件化 |

> ✅ 2026-08-06 已实施：PostgreSQL+Redis+Chroma → SQLite(sqlite-vec) 单文件 app.db，6 容器精简为 3 服务（frontend/backend/neo4j）。

---

## 三、目录结构

```
D:\desktop\coAgent-Learn\
├── agents/                  # 多智能体核心
│   ├── graph.py             # LangGraph 工作流（9节点+条件路由）
│   └── prompts.py           # 全部 Agent 的 System Prompt 定义
├── backend/
│   ├── main.py              # FastAPI 入口（全部 API 路由 + SSE /api/chat）
│   ├── requirements.txt
│   ├── Dockerfile
│   └── core/                # 核心服务层
│       ├── config.py        # 环境变量配置（SQLITE_DIR / NEO4J_* / API key）
│       ├── base_llm.py      # DeepSeekLLM 统一封装（流式）
│       ├── sqlite_client.py # ✅ SQLite 统一数据层（14张表 + sqlite-vec 向量表）
│       ├── postgres_client.py  # 兼容层（pg_client = get_db()，业务代码零改动）
│       ├── neo4j_client.py  # Neo4j 单例
│       ├── memory_store.py  # 三层记忆存储（文本/向量/图）
│       ├── knowledge_service.py # 知识库：切块/向量化/混合检索
│       ├── graph_service.py # 实体关系抽取→Neo4j
│       ├── evaluator.py     # 三指标评估引擎
│       ├── file_parser.py   # PDF/DOCX/PPTX/文本解析
│       └── memory_analysis.py   # 后台记忆提炼线程
├── frontend/
│   └── src/
│       ├── App.tsx          # 全局状态 + 弹窗路由
│       ├── types.ts         # 全部 TS 类型定义
│       ├── index.css        # 主题系统（默认/夜间/柔和）
│       └── components/
│           ├── CenterPanel.tsx       # 主对话区（消息/控制栏/输入框）
│           ├── Sidebar.tsx           # 左侧栏（项目树/对话/资源）
│           ├── RightPanel.tsx        # 右侧栏（知识图谱/第二对话窗口）
│           ├── AgentFlow.tsx         # 多智能体流程画布
│           ├── InfoModals.tsx        # 记忆系统 + 项目知识库弹窗
│           ├── SettingsModal.tsx     # 设置（字体/主题/API key）
│           ├── AgentSettingsModal.tsx # 单 Agent 配置（模式/提示词/Skills）
│           ├── ProfileWizard.tsx     # 画像向导
│           ├── GuideModal.tsx        # 使用指南
│           ├── DiagnosisModal.tsx    # 学情诊断问卷
│           └── DragDropInput.tsx     # 拖拽上传+文本输入组件
├── skills/                  # Skill 插件目录（MCP 风格）
│   ├── registry.py          # 自动发现 + 注册 + execute
│   ├── knowledge_retrieval/ # 知识库检索（✅真实，调 sqlite-vec）
│   ├── memory_ops/          # 记忆读写（✅已修复：改查 messages 表）
│   ├── user_diagnosis/      # 学情诊断（模拟占位）
│   └── web_search/          # 联网搜索（模拟占位）
├── deploy/
│   └── docker-compose.yml   # 3 服务编排（frontend/backend/neo4j）
├── data/                    # 运行时数据（app.db 单文件 + 上传文件）
├── docs（已开发内容记录）/   # 开发文档（gitignore，本地）
├── .env                     # 环境变量（不提交 git）
└── start.bat / start-backend.bat / start-frontend.bat  # 启动脚本
```

---

## 四、多智能体系统（项目核心）

### 4.1 Agent 清单（agents/prompts.py）

| Agent | 职责 | 输出 |
|-------|------|------|
| 输入信息处理 Agent | 识别输入格式并统一成结构化文本（PDF→opendataloader，非PDF→markitdown，文本→原样） | `{"processed", "format"}` |
| 调度 Agent | 编排工作流，判断调哪个子 Agent 或结束 | `{"action": call_agent/enough, "agent", "query"}` |
| 学情诊断 Agent | 分析用户知识水平 | `{"level", "strengths", "gaps", "suggestion"}` |
| 知识库管理 Agent | 从知识库（sqlite-vec 向量检索）检索相关知识 | `{"results", "summary"}` |
| 搜索 Agent | 联网搜索（优质信息四条件） | `{"results", "summary"}` |
| 记忆管理 Agent | 三层记忆读写（L1事件/L2事实/L3画像） | `{"action": read/write, "data"}` |
| 信息整理与生成 Agent | 生成三形态资源：定制讲义+实操指南+分阶测试题(3道,带答案+溯源) | `{"讲义", "实操指南", "测试题", "溯源"}` |
| 审核 Agent A·符实性 | 对照知识库检查事实/幻觉 | `{"passed", "score", "issues"}` |
| 审核 Agent B·难度适配 | 对照学情画像检查难度 | 同上 |
| 审核 Agent C·规范性 | 检查行业规范/术语/实操符合性 | 同上 |
| 仲裁 Agent | 综合三方审核意见最终裁定 | `{"passed", "score", "verdict"}` |

### 4.2 工作流（agents/graph.py，LangGraph StateGraph）

```
input → dispatch ──路由──→ diagnose / kb / search / memory（完成后回 dispatch）
                        └─→ enough → generate → review ──路由──→ output → END
                                              ↑              ↓
                                              └── retry(未通过) ──┘
```

- **9 个节点**：input, dispatch, diagnose, kb, search, memory, generate, review, output
- **条件路由 route_dispatch**：dispatch_count≥3 强制 enough；否则按调度 Agent 的 action 路由
- **条件路由 route_review**：passed→output；未通过且 retry<3→回 generate 重生成；≥3 次→output
- **通信模式 A2A**：子 Agent 只与调度 Agent 通信，输入输出都走调度
- **think_then_json 机制**：每个 Agent 先流式自然语言思考（推 SSE thought_token），再从 ```json``` 块提取结构化结果，失败则降级为纯文本

### 4.3 前端画布展示（AgentFlow.tsx）

- React Flow 实现，8 个静态节点，按阶段渐显
- ✅ 已对齐：后端 SSE 下发 `step` 事件（每个 Agent 首次出现时），画布节点可动态点亮
- 当前活跃 Agent 节点放大高亮，名称缩至左上角
- 画布可拖动/缩放/最小化/刷新

---

## 五、后端 API 全景（backend/main.py）

### 5.1 核心对话
- **`POST /api/chat`**（L542）：SSE 流式。请求体含 `{message, project_id, dialogue_id, mode, settings, api_key}`。后台线程跑 LangGraph，`on_token` 回调塞 queue，主协程 yield。事件 5 种：
  - `start` / `step`（agent 节点激活）/ `thought_token`（agent+chunk，前端拼思考链）/ `done`（携带 reply+steps+mindchain）/ `error`
- 对话前后直接写 SQLite `messages` 表；结束后台线程跑 `update_memories` 提炼记忆

### 5.2 知识库
- `POST /api/knowledge/upload`（文本入库，后台线程）、`POST /api/knowledge/upload-file`（文件上传）、`GET /api/knowledge/list`、`DELETE /api/knowledge/delete`、`POST /api/file-to-text`（文件解析）
- `GET /api/graph`（知识图谱节点连线）、`GET /api/graph/node`（节点详情）、`GET /api/knowledge/query`（检索）

### 5.3 画像与评估
- `GET /api/global-profile`、`GET /api/project-memory/{project_id}`
- `POST/GET /api/projects/{pid}/profile`、`POST/GET /api/dialogues/{did}/profile`
- `POST /api/feedback`（太难/太简单→自动调整对话画像水平）
- `POST /api/evaluate`（幻觉率/适配率/覆盖率三指标）

### 5.4 资源/统计/项目
- `GET/POST /api/resources`、`DELETE /api/resources/{rid}`（左侧栏资源 CRUD）
- `GET /api/stats`（专注时长/token 用量统计）
- `GET/POST /api/projects`、`PATCH /api/projects/{pid}`、`DELETE /api/projects/{pid}`（级联删除）、`GET /api/projects/{pid}/dialogues`、`DELETE /api/dialogues/{did}`
- `GET/POST/DELETE /api/skills`（Skill 管理，后两个为占位）

### 5.5 关键机制
- **API key 存前端 localStorage**（`coagent-apikey`），随请求体 `api_key` 字段传给后端；**没有后端 settings 接口**
- 前端设置（检索模式/输出形式/输出内容/输入优化/时间范围）组装成 `settings` 对象随请求发送，graph.py 拼进各 Agent Prompt
- 数据库初始化：模块导入时 `init_tables()` 自动建表 + lifespan 创建默认项目
- **SQLite 14 张表**：12 张业务表（projects, dialogues, messages, dialogue_memories, project_memories, global_profile, user_profiles, feedback, stats, resources, entities, relations）+ 2 张 sqlite-vec 向量表（kb_vectors, memory_vectors）
- ✅ schema 迁移：`global_profile`/`project_memories` 表含 `session_id` 列（兼容旧查询）

---

## 六、记忆系统（三层）

由记忆管理 Agent 负责自动更新，用户可手动管理：

| 层 | 存储 | 内容 |
|----|------|------|
| L1 文本层 | SQLite (MemoryStore) | 结构化文本记忆，带 created_at/updated_at 时间戳 |
| L2 向量层 | sqlite-vec (memory_vectors 表) | 语义检索，Agent 回答前检索相关记忆 |
| L3 图层 | Neo4j 三元组 | (主体, 谓词, 客体) 实体关系，驱动右侧知识图谱 |

**作用域**：全局记忆（global，个人画像/学习偏好）vs 项目记忆（project:<id>，项目上下文）。
**前端入口**：输入框上方"记忆"按钮 → 记忆系统弹窗（自动管理开关+三层展示+时间戳+删除）。
**后台提炼**：`memory_analysis.py` 对话结束后读 messages，LLM 提炼情景记忆写 project_memories、个人画像写 global_profile。

---

## 七、知识库系统

- **入库**：文本或文件 → 段落切块（400字）→ LLM 生成上下文前缀（P1）→ bge-small-zh 向量化 → SQLite kb_vectors 表（按 project_id 隔离）
- **检索**：混合检索 = 向量 + BM25 → RRF 融合 → bge-reranker 重排（P3）
- **图谱**：LLM 抽取实体关系三元组 → Neo4j MERGE 入库 → 前端 echarts 力导向图展示，节点可点击看详情（relations + kb_refs）

---

## 八、Skill 机制（MCP 风格插件化）

**设计思想**：每个 Skill = 一个独立文件夹 = 一个功能模块，LLM 通过统一接口调用——这是 MCP 的前身思想，后续可升级为独立 MCP Server（HTTP/SSE）。

- `skills/registry.py`：单例注册中心，启动时 `_auto_discover()` 自动扫描子目录注册
- 接口：`register / unregister / list_all / list_for_llm / execute`
- 实际生效 4 个 Skill：
  - `knowledge_retrieval` ✅ 真实（调 sqlite-vec 混合检索）
  - `memory_ops` ✅ 已修复（读写 SQLite user_profiles + messages JOIN dialogues）
  - `user_diagnosis` ⚠️ 纯模拟（固定返回 intermediate）
  - `web_search` ⚠️ 纯模拟（SearXNG 未接入）
- 前端 AgentSettingsModal 可从 `/api/skills` 勾选绑定 Skills 到单个 Agent

---

## 九、前端界面功能

### 9.1 三栏布局
- **左侧栏 Sidebar**：项目树（新建/重命名/删除确认弹窗/三点菜单→项目配置窗口）+ 对话管理（新建/重命名/归档）+ 资源列表（书籍/百科等，点击开独立窗口）+ 底部设置入口
- **中部 CenterPanel**：消息流（附件内联/PDF解析）+ 统计条 + 控制栏（检索模式/输出形式/输出内容/输入优化/时间范围下拉）+ 输入框（居中，下方有上传/模型/设置功能栏）+ 思考过程折叠展示 + AgentFlow 画布
- **右侧栏 RightPanel**：知识图谱（占1/3高度）+ 第二独立对话窗口（独立会话，自动生成 3 条追问建议）

### 9.2 弹窗
- 设置：字体大小滑块 / 四主题（默认·夜间·柔和·随系统）/ API key 配置；首次进入弹 API key 引导
- 记忆系统弹窗、项目知识库弹窗（上传+图谱+评估）、Agent 设置弹窗、画像向导、使用指南、学情诊断问卷

### 9.3 主题系统
- CSS 变量驱动三主题：默认（黑白灰）/ 夜间 / 柔和（淡黄暖色，默认）
- `data-theme` 属性 + Tailwind 静态类覆盖，localStorage 持久化

---

## 十、部署与启动

### Docker 方式（推荐）
```bash
cd D:\desktop\coAgent-Learn\deploy
docker compose up -d --build
```
| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 5173 | Vite dev，挂载 src 热更新 |
| backend | 8000 | uvicorn，挂载 backend/agents/skills/data |
| neo4j | 7474/7687 | neo4j/neo4j123 |

（PostgreSQL/Redis/Chroma 已移除：业务+向量统一 SQLite app.db，位于 data/ 目录）

### 本地直跑
```bash
.venv\Scripts\python run.py        # 后端
cd frontend && npm run dev         # 前端
```

### 环境变量（.env）
`DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `SQLITE_DIR` / `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` / `UPLOAD_DIR` / `LLM_MAX_CONCURRENCY` / `LLM_REQUEST_TIMEOUT`

> ⚠️ Docker 内 Neo4j 主机名用服务名 `neo4j`，不是 localhost。

---

## 十一、⚠️ 已知问题与缺陷（2026-08-06 三服务改造后状态）

### ✅ 已修复
1. ~~schema 漂移~~ → `global_profile`/`project_memories` 含 `session_id` 列，记忆接口不再 500
2. ~~SSE 事件前后端不一致~~ → 后端新增 `step` 事件下发，`done` 携带 `steps`+`mindchain`
3. ~~builtins.py 死代码~~ → 已删除
4. ~~memory_ops 查不存在的 conversations 表~~ → 改为 `messages JOIN dialogues` 查询
5. ~~PostgreSQL+Redis+Chroma 三服务冗余~~ → SQLite(sqlite-vec) 单文件，6 容器精简为 3 服务

### ⚠️ 仍存在（待处理）
6. **web_search / user_diagnosis 是模拟占位**：SearXNG 未接入，比赛演示搜索为假数据
7. **思考链展示**：靠拼接 thought_token 流式还原，可能卡顿
8. **Docker 依赖重装慢**：sentence-transformers 拖 torch，容器重建需重新安装（建议依赖卷挂载）
9. **embedding 模型首次下载**：bge-small-zh-v1.5 约 100MB，需网络；无网时降级为哈希伪向量
10. **审核重试是白生成**：route_review 回 generate 重试时未携带审核意见
11. **子 Agent 串行执行**：diagnose/kb/search/memory 逐个跑，可改并行（LangGraph Send）
12. **工作流不可回放**：steps/mindchain 未持久化

---

## 十二、开发铁律（REASONIX.md 摘要）

1. 动手前必读 `docs（已开发内容记录）/错误记录.md`
2. `\n` 转义用十六进制验证，AI 输出提取 JSON 用 `_extract_json`
3. 改动前备份，依赖必须进 requirements.txt
4. 数据库迁移幂等
5. 容器内主机名用服务名，API key 存浏览器 localStorage
6. 每次 commit 一次，docs 文档 1000-2000 字只说"实现了什么功能"
7. 按 session 隔离记忆，挑战杯比赛目标

---

## 十三、快速上手建议

1. 先跑通 `docker compose up -d --build`，浏览器打开 localhost:5173
2. 在设置里填入 DeepSeek API key
3. 新建项目 → 初始化 → 输入问题 → 观察多智能体工作流画布
4. 读代码顺序：`agents/prompts.py` → `agents/graph.py` → `backend/main.py`(/api/chat) → `frontend/src/App.tsx` → 各组件
