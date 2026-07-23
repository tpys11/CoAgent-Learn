# CoAgent-Learn

领域知识个性化生成与多智能体协同决策系统。

通过 8 个 AI Agent 协同工作（调度→诊断→知识库→搜索→记忆→生成→审核），为用户提供个性化学习内容。

## 快速开始

### 前提条件
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装并运行
- DeepSeek API Key（[获取地址](https://platform.deepseek.com/)）

### 1. 克隆项目
```bash
git clone git@github.com:tpys11/CoAgent-Learn.git
cd CoAgent-Learn
```

### 2. 配置 API Key
```bash
cp .env.example .env
```
编辑 `.env`，填入你的 DeepSeek API Key：
```
DEEPSEEK_API_KEY=sk-你的真实key
```

### 3. 启动
```bash
docker compose -f deploy/docker-compose.yml up -d
```
浏览器打开 `http://localhost:5173`

### 4. 首次使用
- 页面弹出 API Key 配置弹窗，输入 Key 保存
- 左侧新建项目 → 开始知识诊断（可选跳过）
- 在输入框输入问题，发送
- 观察画布上的 Agent 协作流程和"思考中"气泡

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
| 多智能体 | 8 Agent A2A 协同（调度·诊断·知识库·搜索·记忆·生成·审核·输入处理） |
| LLM | DeepSeek（OpenAI 兼容协议） |
| 向量数据库 | Chroma |
| 缓存 | Redis |
| 部署 | Docker Compose（4 服务） |

## 项目结构

```
CoAgent-Learn/
├── frontend/          # React 19 前端
│   └── src/components/  # 三栏布局、AgentFlow画布、消息区、设置面板
├── backend/           # FastAPI 纯 API
│   └── core/            # BaseLLM封装、config配置
├── agents/            # LangGraph工作流 + Agent提示词
├── deploy/            # Docker Compose 配置
├── docs/              # 开发文档
├── .env.example       # 环境变量模板
└── start-coagent.bat  # Windows 一键启动脚本
```

## 文档

- [界面搭建](docs/二、界面搭建.md)
- [多智能体系统](docs/三（1）、多智能体系统与展示.md)
- [项目启动方式](docs/零、项目启动方式.md)
