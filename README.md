# 领域知识个性化生成与多智能体协同决策系统

## 项目简介
面向AI垂直领域的技能培训系统，通过多智能体协同决策实现个性化知识生成。
GitHub仓库地址：待填写

## 技术栈
- **后端**: Python 3.12+ / FastAPI / LangGraph
- **前端**: NiceGUI（初期） → Vue 3（后续升级）
- **数据库**: SQLite（业务）+ Chroma（向量）+ Redis（缓存/队列）
- **部署**: Docker + Docker Compose

## 目录结构
```
guashuai-project/
├── frontend/     # Vue3前端代码
├── backend/      # FastAPI主服务入口、路由、中间件
├── agents/       # 多智能体调度、角色逻辑
├── rag/          # 向量检索、文档预处理
├── db/           # 数据库模型、初始化脚本
├── tests/        # 单元测试、自动化评测
├── deploy/       # Docker配置、部署脚本
├── docs/         # 项目方案、接口文档
├── scripts/      # 启动/停止/格式化脚本
└── .env.template # 环境变量模板
```

## 阶段规划
- 阶段0: 工程地基搭建 ← 当前阶段
- 阶段1: RAG与知识图谱
- 阶段2: 多智能体调度
- 阶段3: 前端可视化
- 阶段4: 联调与测试
