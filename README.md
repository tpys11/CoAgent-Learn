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
