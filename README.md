# CoAgent-Learn

> 领域知识个性化生成与多智能体协同决策系统。输入学习问题 → 后端多阶段管线
> （规划 → 检索 → 学情评估 → 生成 → 审核）→ 流式输出个性化学习内容
> （思维链 + 正文 + 追问）。

---

## 环境要求

| 工具 | 最低版本 | 下载 |
|------|:------:|------|
| Git | 2.30+ | https://git-scm.com/downloads/win |
| Docker Desktop | 24.0+ | https://www.docker.com/products/docker-desktop/ |

> **不需要**安装 Python、Node.js 或任何其他依赖——全部运行在 Docker 容器里。

---

## 安装与环境检查

### 1. 安装 Git

1. 打开 https://git-scm.com/downloads/win ，下载 64-bit 版本
2. 运行安装程序，一路默认（Next → Next → Install）
3. 安装完成后，**右键任意文件夹** → "Open Git Bash here" 确认能打开终端

检查是否安装成功：
```bash
git --version
# 应输出类似: git version 2.47.0
```

### 2. 安装 Docker Desktop

1. 打开 https://www.docker.com/products/docker-desktop/ ，下载 Windows 版本
2. 运行安装程序，一路默认
3. 安装完成后**重启电脑**
4. Docker Desktop 会自动启动，等待右下角任务栏鲸鱼图标变绿（首次启动需 1-2 分钟）

检查是否安装成功：
```bash
docker --version
# 应输出类似: Docker version 27.0.0
docker compose version
# 应输出版本号
```

### 3. (可选) 配置 Git SSH

如果 clone 时遇到权限问题或想用 SSH 免密：
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
cat ~/.ssh/id_ed25519.pub
```
复制输出的公钥，粘贴到 https://github.com/settings/keys → "New SSH Key"。

---

## 获取项目

```bash
git clone https://github.com/tpys11/CoAgent-Learn.git
cd CoAgent-Learn
```

> HTTPS 慢的话用 SSH：`git clone git@github.com:tpys11/CoAgent-Learn.git`

---

## 启动

### 1. （可选）配置环境变量

```bash
cp .env.example .env
```
Windows PowerShell 用 `copy .env.example .env`。

**这一步可以跳过**：全部配置项在代码里都有默认值，不建 `.env` 也能正常启动。
只有想覆盖默认配置（例如给容器配联网代理 `PROXY_URL`）时才需要。
API Key 推荐启动后在界面里填（见下文「配置 API Key」），不写在 `.env` 里也可以。

### 2. 拉取镜像并启动

```bash
docker compose -f deploy/docker-compose.yml up -d
```

首次启动会自动从 GitHub Container Registry（GHCR）拉取两个**预构建镜像**，
取决于网速通常几分钟内完成，**无需在本地构建**。之后再次启动镜像已缓存，秒级即可。

> **开发者路径（确需本地构建时）**：在 `deploy/` 下新建 `docker-compose.override.yml`
> （已被 git 忽略、不会进仓库），为需要的服务补上 `build:` 段（backend 的构建上下文是
> **仓库根**、Dockerfile 是 `backend/Dockerfile`；frontend 上下文是 `frontend/`），然后：
> `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.override.yml up -d --build`
> ⚠️ 只加 `--build` 而没有 `build:` 配置**不会触发构建**——compose 会直接拉取 GHCR 镜像。

> **本地开发者注意**：交付镜像已钉定在固定 sha 版本，本地开发重启须带 override（双 `-f`）加载本地构建配置；
> 裸执行 `up -d` 会直接使用交付钉版镜像（评委按上方标准流程启动，无此问题）。

### 3. 确认服务就绪

```bash
docker compose -f deploy/docker-compose.yml ps
# 两个容器（guashuai-frontend / guashuai-backend）状态应为 Up
curl http://localhost:8000/api/settings
# 返回一段 JSON 配置信息，说明后端就绪
```

然后浏览器打开 **http://localhost:5173** 即可使用。

---

## 配置 API Key

本系统需要**两把相互独立的 Key**，缺一不可：

| | 用途 | 在哪里配 |
|---|---|---|
| **对话 Key**（DeepSeek） | 驱动对话、生成、审核等全部聊天能力 | 界面「设置 → 基础 → 模型与 API Key」 |
| **检索 Key**（硅基流动） | 知识库向量化与重排（上传文档/图片入库必用） | 界面「设置 → AI 服务 → 硅基流动 API Key」 |

1. 前往 https://platform.deepseek.com/ 注册并获取 API Key
2. 在页面顶部点击 **「设置」→ 左侧「基础」→「模型与 API Key」**
3. 在 **DeepSeek API Key** 输入框填入你的 Key，点击 **「保存」**
4. **再配第二把检索 Key**：前往 https://siliconflow.cn 注册并获取 API Key，
   在 **「设置」→ 左侧「AI 服务」→「硅基流动 API Key」** 填入并保存
   （一把硅基流动 Key 同时驱动向量化与重排，无需再配其他）

> ⚠️ **只填对话 Key 的后果**：聊天能用，但**知识库检索完全不可用**——
> 上传文档/图片会报「未配置 EMBEDDING_API_KEY，无法向量化」，已上传内容也检索不到。
> 两把 Key 互不通用，必须分别配置。

> 对话使用的是**界面上保存的 Key**（随每次请求发送给后端），这是必填项；
> `.env` 中的 `DEEPSEEK_API_KEY` 仅作为后端部分后台功能的兜底，可配可不配。
> 检索 Key 同理：界面「AI 服务」里配置优先，`.env` 中的 `EMBEDDING_API_KEY=sk-...`
> 可作为兜底（二选一即可，界面配置无需重启即时生效）。
>
> ⚠️ **界面保存会永久压过 `.env`**（D5/E-22 语义说明）：配置的生效优先级是
> 「界面（settings 表）> `.env` > 代码默认值」，且**一旦在界面「AI 服务」里保存过某项
> 配置，该键就写入 settings 表并从此覆盖 `.env` 中的同名键**——此后再怎么改 `.env`
> 都不会生效（除非清空数据库）。只想用 `.env` 管配置的话，就不要在界面里保存同名项。

### 预设档（F14 新增）

系统提供三种预设档，快速切换不同使用场景的配置组合：

| 预设档 | 说明 | 对话模型 | 审核模型 |
|--------|------|----------|----------|
| **标准档**（默认） | 使用 DeepSeek 对话 Key，审核可配 | DeepSeek V4 | 可配置独立审核模型 |
| **免费档** | 使用 OpenCode Zen 免费通道，无需额外付费 | Zen 免费模型 | Zen 通道审核 |
| **自定义** | 手动调整各项配置 | 自选 | 自选 |

**切换预设档**：「设置 → AI 服务 → 预设档」，点击对应按钮即可切换。

**免费档说明**：
- 使用 OpenCode Zen 免费通道（OpenAI 兼容网关），免费模型限时轮换
- 对话与审核共用 Zen 通道，embedding 仍走硅基流动（需配置检索 Key）
- 免费期内部分模型数据可能被用于模型改进（界面上有明确提示）

**配置 Zen Key（免费档必填）**：
1. 在「设置 → AI 服务 → OpenCode Zen（免费通道）」中填入 Zen API Key
2. 选择研究档判卷模型（自动带 `zen:` 前缀路由）
3. 保存后即时生效

> ⚠️ 免费模型限时轮换（模型可能被替换或下线），官方说明以提交时为准。

---

## 使用

1. 首页点击 **「新建课程」** 创建一个学习课程（如「线性代数」）；也可直接使用自动创建的「默认项目」
2. 点击课程卡片进入学习工作台，在左侧 **「对话」栏点「＋ 新建」** 创建一个对话
   （首次会弹出「对话画像向导」，可按需填写本次学习目标，或点 **「跳过」**）

   > 注意：不新建对话时发送按钮不可用（显示"学情画像生成中"），这是正常设计

3. 在底部输入框输入问题并发送
4. 回答以流式输出：先展示**思维链**（各阶段推理过程实时呈现），随后给出
   **正文**与**追问**，可继续在右侧「第二对话」里追问
5. 左侧栏可查看「记忆与进程」「资源」与历史对话；上传教材/文档构建个人知识库的
   **真实入口**：课程工作台左侧栏「资源」→「查看更多」→ 上传面板（拖入或选择文件，
   点「确认上传」）。列表中显示「未向量化」的条目说明处理未完成，删除后重新上传即可

---

## 停止

```bash
docker compose -f deploy/docker-compose.yml down
```

---

## 常见问题

**Q: Docker 启动失败？**
确保 Docker Desktop 右下角图标为绿色。如果报端口占用，关闭占用 5173/8000 端口的程序。

**Q: 发送消息后回复"处理完成"但没有内容？**
检查 API Key 是否有效。可在「设置 → 基础 → 模型与 API Key」重新输入。

**Q: 拉取镜像失败或超时？**
网络抖动所致，重新执行 `docker compose -f deploy/docker-compose.yml pull` 再
`docker compose -f deploy/docker-compose.yml up -d` 即可。

**Q: 如何更新到最新版？**
```bash
git pull
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
```

**Q: `docker compose -f deploy/docker-compose.yml ps` 里的 `(healthy)` 是什么意思？服务会自动重启吗？**
backend 每 30 秒做一次健康探测（访问容器内的 `/healthz`），通过后状态显示
`Up (healthy)`——这是「部署成功」的明确信号，启动后约 1 分钟内出现属正常；
想手动验证可以 `curl http://localhost:8000/healthz`（返回 `{"status":"ok"}`）。
服务异常退出后 Docker 会自动重启（`restart: unless-stopped`），无需人工干预；
但如果你执行了 `docker compose -f deploy/docker-compose.yml down`（或 `stop`），服务**不会**被自动拉起——
这是预期行为，重新执行 `docker compose -f deploy/docker-compose.yml up -d` 即可。
若发现容器反复重启（重启循环），用 `docker compose -f deploy/docker-compose.yml logs backend --tail 100`
查看最后一次报错定位原因。

---

## 系统架构

```
用户浏览器(5173) → React 前端 → FastAPI(8000) → 多阶段管线 → DeepSeek LLM
                                     │
                规划 → 检索 → 学情评估 → 生成 → 审核
                                     │
                     SQLite + sqlite-vec（课程/记忆/知识库向量，单机文件存储）
```

| 服务 | 端口 | 作用 |
|------|:----:|------|
| frontend | 5173 | React 19 前端 |
| backend | 8000 | FastAPI + 自研多阶段管线 + RAG 检索 |

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS |
| 后端 | FastAPI + 自研多阶段管线（规划/检索/学情评估/生成/审核） |
| LLM | DeepSeek（OpenAI 兼容协议） |
| 数据 | SQLite + sqlite-vec（单文件存储，无外部数据库服务） |
| 部署 | Docker Compose（frontend + backend，共 2 个服务） |

## 项目结构

```
CoAgent-Learn/
├── frontend/                 # React 前端（三栏学习工作台、思维链流式展示）
├── backend/                  # FastAPI 后端（core 管线引擎 / routers API）
├── deploy/                   # Docker Compose 部署配置
├── tests/                    # 后端 pytest 测试
└── .env.example              # 环境变量模板（可选配置）
```
