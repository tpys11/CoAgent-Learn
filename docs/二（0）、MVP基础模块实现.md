# CoAgent-Learn MVP 开发路线图

## 目标与约束

**总目标**：2026年7月31日前，做出一个能跑通的Web应用——用户输入学情，系统通过三Agent协同生成个性化AI领域学习资源。

| 约束项 | 决策 |
|--------|------|
| 知识领域 | 多智能体系统开发（Agent协同、LangGraph、向量检索、RAG） |
| 模式 | 仅默认学习模式（学情诊断→知识生成→审核输出） |
| 前端 | NiceGUI最简UI，能输入能展示即可 |
| 知识图谱可视化 | V1不做 |
| 第二对话窗口 | V1不做 |
| 开发人力 | 单人 |
| 截止日期 | 2026年7月31日 |

---

## 一、MVP系统架构

```
用户浏览器 ──→ NiceGUI页面（端口8000）
                    │
            FastAPI 后端（同进程）
                    │
        ┌───────────┼───────────┐
        │           │           │
   学情诊断Agent  生成Agent  审核Agent
        │           │           │
        └───────────┼───────────┘
                    │
            LangGraph 编排器
                    │
        ┌───────────┼───────────┐
        │           │           │
    知识库RAG    用户画像存储   LLM调用
    (Chroma)     (SQLite)    (DeepSeek)
```

**数据流**：用户在NiceGUI页面输入背景 → 学情诊断Agent分析画像 → 生成Agent从知识库检索+生成个性化内容 → 审核Agent交叉验证降幻觉 → 页面展示结果。

---

## 二、当前阶段：地基能力搭建（第1-3天）

先打牢三个底层能力，后面建Agent和前端才有基础。

### 第1天（7/19）：BaseLLM + DeepSeek对接

**目标**：能调用DeepSeek，能处理思考标签、json模式、异常重试。

新建 `backend/core/base_llm.py`：

```
backend/
  core/
    __init__.py
    base_llm.py      ← 本次新建
    config.py         ← 从.env读取全部配置
```

**实现内容**：
- `chat(messages)` — 普通对话，自动过滤DeepSeek的思考标签
- `chat_with_json(messages, output_schema)` — 返回结构化JSON（Agent间传数据用）
- 超时重试（最多3次，间隔递增）
- 每次调用记录token消耗到日志

**验证标准**：写一个临时测试脚本，分别调用 `chat` 和 `chat_with_json`，确认正常返回。

---

### 第2天（7/20）：知识库准备 + 文档处理

**目标**：准备AI多智能体领域的知识文档，完成切片→向量化→存入Chroma。

准备 5-8 篇 markdown 知识文档：

| 文档主题 | 内容概要 |
|----------|----------|
| 多智能体系统概述 | Agent定义、多Agent协同意义、常见架构模式 |
| LangGraph入门 | StateGraph、Node、Edge、条件路由 |
| RAG技术原理 | 文档切片→向量嵌入→语义检索→拼接生成 |
| Function Calling | 大模型工具调用机制、JSON Schema定义 |
| 向量数据库选型 | Chroma/Milvus/FAISS对比 |
| Prompt Engineering | 角色设定、约束声明、Few-shot示例 |

来源：本项目已有的参考文档（DeepTutor/OpenMAIC解读）+ 自己写简短摘要。

新建 `rag/document_loader.py`：
- 加载 `data/documents/` 下的md文件
- 按 `##` 标题切分chunk（500-800字/块）
- 调用DeepSeek Embedding生成向量
- 存入Chroma collection `ai_knowledge`

**验证标准**：输入"LangGraph怎么用"，检索返回3条相关知识片段。

---

### 第3天（7/21）：SQLite用户画像存储

**目标**：用户画像可持久化，每次对话能读取历史。

新建 `db/models.py`（SQLAlchemy模型）和 `db/user_profile.py`（CRUD操作）。

**UserProfile 表**：session_id、background（文本）、knowledge_map（JSON，每项含concept/level）、learning_goal、时间戳

**InteractionLog 表**：session_id、agent_name、input_summary、output_summary、tokens_used、时间戳

**CRUD操作**：create_profile、get_profile、update_knowledge_map、log_interaction

**验证标准**：SQLite文件创建成功，写入/读取profile正常。

---

## 三、后续待定（第4天起）

前三天的地基能力做完后，再根据实际效果决定后续的具体实现方式。大致方向如下：

- **Agent层**：学情诊断Agent（第4天）、知识生成Agent（第5天）、审核Agent + LangGraph编排（第6天）
- **前端层**：NiceGUI学情输入页（第7天）、结果展示页（第8天）
- **收尾**：端到端联调（第9天）、测试数据+反馈闭环（第10天）、缓冲+验收（第11-13天）

具体每个Agent的输入输出格式、页面交互细节，等三天地基做完后再细化。

---

## 四、技术注意事项

**开发期运行方式**：直接用 `python -m backend.main` 本地跑，Docker只用来启动Chroma和Redis两个依赖服务。最终提交前再验证Docker Compose一键启动。

**LangGraph State 结构**（Agent间数据传递）：
```python
class AgentState(TypedDict):
    user_input: str
    profile: dict        # 诊断Agent写入
    generated: dict      # 生成Agent写入
    reviewed: dict       # 审核Agent写入
    retry_count: int     # 条件路由：幻觉>5%时重试
```

**NiceGUI注意**：长耗时Agent调用要放后台线程，否则WebSocket会超时断连。

**知识库质量优先**：MVP阶段文档不需要多（5-8篇即可），但每篇概念要准确。这直接决定生成内容的可靠性和审核Agent的参照质量。

---

## 五、MVP明确不做

| 不做 | 原因 |
|------|------|
| 知识图谱可视化 | 前端复杂，先保核心链路 |
| 第二对话窗口 | NiceGUI异步窗口实现复杂 |
| 企业培训/应试模式 | V1只做默认学习模式 |
| MCP工具接入 | Function Calling够用 |
| 用户登录/注册 | session_id代用 |
| 前端独立部署 | NiceGUI内嵌FastAPI |
| 流式输出 | V1同步返回，V2再加 |
