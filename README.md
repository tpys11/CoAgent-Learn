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

### 2. 构建并启动（本地构建镜像）

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

首次启动需要**在本地构建两个镜像，10 分钟以内**（大头是 PyTorch CPU 依赖的
下载，约 190 MB，取决于网速）。之后再次启动会复用构建缓存，几十秒即可。

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

1. 前往 https://platform.deepseek.com/ 注册并获取 API Key
2. 在页面顶部点击 **「设置」→ 左侧「基础」→「模型与 API Key」**
3. 在 **DeepSeek API Key** 输入框填入你的 Key，点击 **「保存」**

> 对话使用的是**界面上保存的 Key**（随每次请求发送给后端），这是必填项；
> `.env` 中的 `DEEPSEEK_API_KEY` 仅作为后端部分后台功能的兜底，可配可不配。

---

## 使用

1. 首页点击 **「新建课程」** 创建一个学习课程（如「线性代数」）；也可直接使用自动创建的「默认项目」
2. 点击课程卡片进入学习工作台，在左侧 **「对话」栏点「＋ 新建」** 创建一个对话
   （首次会弹出「对话画像向导」，可按需填写本次学习目标，或点 **「跳过」**）

   > 注意：不新建对话时发送按钮不可用（显示"学情画像生成中"），这是正常设计

3. 在底部输入框输入问题并发送
4. 回答以流式输出：先展示**思维链**（各阶段推理过程实时呈现），随后给出
   **正文**与**追问**，可继续在右侧「第二对话」里追问
5. 左侧栏可查看「记忆与进程」「资源」与历史对话；顶部「资源」页可上传
   教材/文档构建个人知识库

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

**Q: 构建时下载依赖失败（npm ECONNRESET / pip 超时）？**
网络抖动所致，重新执行 `docker compose -f deploy/docker-compose.yml up -d --build` 即可，已完成的层会走缓存。

**Q: 如何更新到最新版？**
```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

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

## 文档

| 文档 | 内容 |
|------|------|
| [界面搭建](docs/二、界面搭建.md) | 前端全部功能模块说明 |
| [多智能体系统](docs/三（1）、多智能体系统与展示.md) | Agent 架构、工作流、思考链 |
| [启动方式](docs/零、项目启动方式.md) | 启动原理与故障排查 |
