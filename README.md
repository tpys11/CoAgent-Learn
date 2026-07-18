# CoAgent-Learn · 领域知识个性化生成与多智能体协同决策系统

## 项目简介
面向AI垂直领域的技能培训系统，通过多智能体协同决策实现个性化知识生成。支持学情画像构建、多Agent协同调度（诊断/生成/审核）、领域知识个性化生成、交互反馈与动态决策更新的全流程闭环。

## 技术栈
- **全栈**: Python 3.12+
- **后端**: FastAPI + NiceGUI（Python生态前端，WebSocket双向通信，内置于FastAPI之上）
- **多智能体**: LangGraph 编排框架 + Function Calling 工具调用
- **模型接入**: BaseLLM 统一基类封装，首个实现为 DeepSeek（对话 + Function Calling + 文本嵌入）
- **数据库**: SQLite（业务存储）+ Chroma（向量检索）+ Redis（缓存/临时存储）
- **部署**: Git + Docker + Docker Compose

## 目录结构
```
CoAgent-Learn/
├── backend/      # FastAPI主服务 + NiceGUI前端（统一Python进程）
├── agents/       # 多智能体调度、角色逻辑、LangGraph工作流
├── rag/          # 向量检索、文档预处理、RAG全链路
├── db/           # 数据库模型、初始化脚本
├── tests/        # 单元测试、自动化评测
├── deploy/       # Docker配置、部署脚本
├── docs/         # 本地开发文档（不提交Git）
├── scripts/      # 启动/停止/格式化脚本
└── .env.template # 环境变量模板
```

## 阶段规划
- 阶段0: 工程地基搭建 ← 当前阶段
- 阶段1: RAG与知识图谱
- 阶段2: 多智能体调度（LangGraph编排三Agent协同）
- 阶段3: 前端可视化（NiceGUI + 后续升级独立前端）
- 阶段4: 联调与测试（三项准确率指标验证）
