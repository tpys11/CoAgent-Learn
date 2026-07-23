# CoAgent-Learn

领域知识个性化生成与多智能体协同决策系统。

## 从零开始（全新电脑环境）

### 1. 安装 Git

[下载 Git](https://git-scm.com/downloads/win)，一路默认安装。

验证：
```bash
git --version
```

### 2. 安装 Docker Desktop

[下载 Docker Desktop](https://www.docker.com/products/docker-desktop/)，安装后启动，等待右下角鲸鱼图标变绿。

验证：
```bash
docker --version
```

### 3. 获取项目

```bash
git clone https://github.com/tpys11/CoAgent-Learn.git
cd CoAgent-Learn
```

> 如果 clone 很慢，可以用 SSH：
> ```bash
> git clone git@github.com:tpys11/CoAgent-Learn.git
> ```

### 4. 启动

```bash
docker compose -f deploy/docker-compose.yml up -d
```

首次启动会自动拉取镜像并构建（5-10 分钟）。之后启动只需几秒。

浏览器打开 **http://localhost:5173**。

### 5. 配置 API Key

页面首次打开会弹出配置弹窗，输入 DeepSeek API Key（[注册获取](https://platform.deepseek.com/)），保存即可使用。

也可以点击左下角齿轮随时修改 API Key。

### 6. 开始使用

- 左侧新建项目，可选知识诊断
- 输入框输入问题，发送
- 观察画布上 Agent 协作流程和思考过程

### 停止

```bash
docker compose -f deploy/docker-compose.yml down
```

## 系统架构

```
用户浏览器(5173) → React 前端 → FastAPI(8000) → LangGraph → DeepSeek LLM
                            ↓
         8 Agent 协同：调度 → 诊断/知识库/搜索/记忆 → 生成 → 审核 → 输出
```

**Docker 服务**：frontend (5173) + backend (8000) + redis (6379) + chroma (8001)

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS |
| 后端 | FastAPI + LangGraph |
| 多智能体 | 8 Agent A2A 协同 |
| LLM | DeepSeek（OpenAI 兼容协议） |
| 向量数据库 | Chroma |
| 部署 | Docker Compose（4 服务） |

## 文档

- [界面搭建](docs/二、界面搭建.md)
- [多智能体系统](docs/三（1）、多智能体系统与展示.md)
- [项目启动方式](docs/零、项目启动方式.md)
