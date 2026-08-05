# CoAgent-Learn

> 领域知识个性化生成与多智能体协同决策系统。8 个 AI Agent 协同，输入问题 → 多Agent思考 → 审核 → 输出个性化学习内容。

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

```bash
docker compose -f deploy/docker-compose.yml up -d
```

首次启动会拉取镜像并构建（5-10 分钟，取决于网络）。之后每次启动只需几秒。

启动完成后，浏览器打开 **http://localhost:5173**。

---

## 配置 API Key

页面首次打开会自动弹出配置弹窗：

1. 前往 https://platform.deepseek.com/ 注册并获取 API Key
2. 在弹窗中输入 Key，点击确认
3. 看到 "✓ 已保存" 即可

> 也可随时点击左下角齿轮图标修改 API Key。
> 如果你习惯用配置文件，编辑 `.env` 填入 Key 重启 Docker 也支持。

---

## 使用

1. 左侧点击 "+ 新建项目"，可选知识诊断（完成后生成用户画像）
2. 在底部输入框输入问题，点击发送
3. 观察：
   - **画布区域**：Agent 节点逐个出现，活跃节点放大
   - **思考气泡**：Agent 思考内容实时流式展示，完成后折叠
   - **最终回复**：多Agent协同生成的学习内容
4. 左侧 Agent 列表可点击查看/修改每个 Agent 的提示词和 Skill

---

## 停止

```bash
docker compose -f deploy/docker-compose.yml down
```

---

## 常见问题

**Q: Docker 启动失败？**
确保 Docker Desktop 右下角图标为绿色。如果报端口占用，关闭占用 5173/8000/6379/8001 端口的程序。

**Q: 发送消息后回复"处理完成"但没有内容？**
检查 API Key 是否有效。可在设置面板重新输入。

**Q: 如何更新到最新版？**
```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

---

## 系统架构

```
用户浏览器(5173) → React 前端 → FastAPI(8000) → LangGraph → DeepSeek LLM
                            ↓
         8 Agent 协同：调度 → 诊断/知识库/搜索/记忆 → 生成 → 审核 → 输出
```

| 服务 | 端口 | 作用 |
|------|:----:|------|
| frontend | 5173 | React 19 前端 |
| backend | 8000 | FastAPI + LangGraph |
| redis | 6379 | 缓存队列 |
| chroma | 8001 | 向量数据库 |

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS |
| 多智能体 | LangGraph（8 Agent A2A 协同） |
| LLM | DeepSeek（OpenAI 兼容协议） |
| 部署 | Docker Compose（4 服务一键启动） |

## 项目结构

```
CoAgent-Learn/
├── frontend/src/components/  # 三栏布局、AgentFlow画布、消息区
├── backend/core/             # BaseLLM封装、config配置
├── agents/                   # LangGraph工作流 + Agent提示词
├── deploy/                   # Docker Compose
├── docs/                     # 开发文档
└── .env.example              # 环境变量模板
```

## 文档

| 文档 | 内容 |
|------|------|
| [界面搭建](docs/二、界面搭建.md) | 前端全部功能模块说明 |
| [多智能体系统](docs/三（1）、多智能体系统与展示.md) | Agent 架构、工作流、思考链 |
| [启动方式](docs/零、项目启动方式.md) | 启动原理与故障排查 |

---

## 🚀 协作者快速上手（clone 后必读）

### 第 1 步：拉取代码
```bash
git clone https://github.com/tpys11/CoAgent-Learn.git
cd CoAgent-Learn
```

### 第 2 步：创建 .env（**必须**，否则 AI 对话不可用）
```bash
# 复制模板
cp .env.template .env
```
然后编辑 `.env`，填入**你自己的** DeepSeek API Key：
```
DEEPSEEK_API_KEY=sk-你的key
```
> `.env` 已被 gitignore，不会提交，每人填自己的。

### 第 3 步：启动（首次约 5-10 分钟拉镜像）
```bash
docker compose -f deploy/docker-compose.yml up -d
```
等所有容器变绿后，浏览器打开 `http://localhost:5173`。

### 第 4 步：填 API Key（或已在 .env 配置）
首次打开界面会提示填 Key（存浏览器），或直接用 .env 的配置。

---

## ✅ 已实现功能一览

| 功能 | 说明 |
|------|------|
| 多智能体协同 | LangGraph 9 节点：输入→调度→[诊断/知识库/搜索/记忆]→生成→**3审核+仲裁**→输出 |
| 个性化资源 | 生成【定制讲义 / 实操指南 / 分阶测试题】3 种形态 + 溯源 |
| 三级画像 | 个人/项目/对话画像 + 新建项目/对话弹窗向导 |
| 知识库 | 上传 txt/md/PDF/Word/PPT；P1上下文前缀 + P2向量+BM25混合检索 + P3重排序 |
| 知识图谱 | 上传文档自动抽实体关系 → Neo4j → ECharts 展示，点击节点看详情 |
| 记忆 | 对话记忆 + 个人/情景记忆，刷新保留 |
| 评估 | 项目配置→评估 tab，一键测【幻觉率/适配准确率/覆盖率】 |
| 反馈闭环 | 资源反馈 → 更新画像 → 影响下次生成 |
| 第二对话窗口 | 右侧独立会话，不干扰主对话，支持知识库/自由模式 |
| 资源区 | 左侧保存资料，知识库上传可从资源选 |
| 统计栏 | 顶部实时显示对话数/Tokens/三率指标 |

---

## ⚠️ 注意事项（协作者必看）

1. **.env 必须自己建**——仓库里没有（含密钥不提交），不建则 AI 无法对话
2. **首次用知识库会下载模型**：ONNX MiniLM（79MB）+ bge-reranker（1.1GB），需联网，慢属正常
3. **新依赖要进 `backend/requirements.txt`**：容器重建后手动 `pip install` 的包会丢
4. **数据库自动建表**：空库启动自动创建，无需手动初始化
5. **`.env` 和 `deploy/data/`（数据库数据）不会提交**：别人拿到的是干净代码
6. **改了后端代码**：`docker compose restart backend`（Python 可能需清 `__pycache__`）

---

## 项目结构

```
CoAgent-Learn/
├── frontend/src/           # React 前端
│   └── components/         # 三栏布局、AgentFlow、ProfileWizard、GuideModal...
├── backend/
│   ├── main.py             # FastAPI 全部接口
│   └── core/               # base_llm、config、knowledge_service、evaluator、graph_service...
├── agents/                 # LangGraph 工作流 + Agent 提示词
├── skills/                 # 可插拔 Skill（知识检索/记忆/诊断/搜索）
├── deploy/                 # Docker Compose + 数据目录
└── docs（已开发内容记录）/ # 开发文档 + 错误记录
```
