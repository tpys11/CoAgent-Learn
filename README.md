# CoAgent-Learn

> 领域知识个性化生成与多智能体协同决策系统。输入学习问题 → 后端多阶段管线
> （规划 → 检索 → 学情评估 → 生成 → 审核）→ 流式输出个性化学习内容
> （思维链 + 正文 + 追问）。

***

## 环境要求

| 工具             |  最低版本 | 下载                                              |
| -------------- | :---: | ----------------------------------------------- |
| Git            | 2.30+ | https://git-scm.com/downloads/win               |
| Docker Desktop | 24.0+ | https://www.docker.com/products/docker-desktop/ |

## 获取项目

```bash
git clone https://github.com/tpys11/CoAgent-Learn.git
cd CoAgent-Learn
```

***

## 启动

### 1. 拉取镜像并启动

```bash
docker compose -f deploy/docker-compose.yml up -d
```

首次启动会自动从 GitHub Container Registry（GHCR）拉取两个**预构建镜像**，无需在本地构建。

### 2. 确认服务就绪

```bash
docker compose -f deploy/docker-compose.yml ps
# 两个容器（guashuai-frontend / guashuai-backend）状态应为 Up
curl http://localhost:8000/api/settings
# 返回一段 JSON 配置信息，说明后端就绪
```

然后浏览器打开 **http://localhost:5173** 即可使用。

***

## 配置 API Key

本系统需要两把相互独立的 Key（缺一不可）：

|                      | 用途                     | 在哪里配                          |
| -------------------- | ---------------------- | ----------------------------- |
| **对话 Key**（DeepSeek） | 驱动对话、生成、审核等全部聊天能力      | 界面「设置 → 基础 → 模型与 API Key」     |
| **检索 Key**（硅基流动）     | 知识库向量化与重排（上传文档/图片入库必用） | 界面「设置 → AI 服务 → 硅基流动 API Key」 |

## 系统架构

```
用户浏览器(5173) → React 前端 → FastAPI(8000) → 多阶段管线 → DeepSeek LLM
                                     │
                规划 → 检索 → 学情评估 → 生成 → 审核
                                     │
                     SQLite + sqlite-vec（课程/记忆/知识库向量，单机文件存储）
```

| 服务       |  端口  | 作用                         |
| -------- | :--: | -------------------------- |
| frontend | 5173 | React 19 前端                |
| backend  | 8000 | FastAPI + 自研多阶段管线 + RAG 检索 |

## 技术栈

| 层次  | 技术                                            |
| --- | --------------------------------------------- |
| 前端  | React 19 + TypeScript + Vite 6 + Tailwind CSS |
| 后端  | FastAPI + 自研多阶段管线（规划/检索/学情评估/生成/审核）           |
| LLM | DeepSeek（OpenAI 兼容协议）                         |
| 数据  | SQLite + sqlite-vec（单文件存储，无外部数据库服务）           |
| 部署  | Docker Compose（frontend + backend，共 2 个服务）    |

## 项目结构

```
CoAgent-Learn/
├── frontend/                 # React 前端（三栏学习工作台、思维链流式展示）
├── backend/                  # FastAPI 后端（core 管线引擎 / routers API）
├── deploy/                   # Docker Compose 部署配置
├── tests/                    # 后端 pytest 测试
└── .env.example              # 环境变量模板（可选配置）
```

