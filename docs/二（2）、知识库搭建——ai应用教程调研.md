# 二（2）、知识库搭建——AI应用教程调研

你要构建的知识库目标是：**教会用户从零理解并使用AI**——从大模型基础概念开始，覆盖 Prompt 工程、上下文与记忆、RAG 检索增强、工具调用、Agent 架构、多 Agent 协同、AI 工作流编排等全局知识体系。

筛选标准：仅收录 GitHub 1万 Star 以上且内容直接可转为知识文档的项目。

***

## 一、hello-agents — Datawhale《从零开始构建智能体》⭐ 最匹配 ⭐

| 维度    | 详情                                                                          |
| ----- | --------------------------------------------------------------------------- |
| 地址    | https://github.com/datawhalechina/hello-agents                              |
| Stars | **约 5 万+**                                                                  |
| 组织    | Datawhale（国内最大的开源 AI 学习社区）                                                  |
| 形式    | 系统化中文教程，按章节编排，全书结构                                                          |
| 内容覆盖  | **LLM基础 → Prompt → Agent原理 → 工具调用 → 记忆系统 → RAG检索 → 多Agent协同 → 从头构建Agent框架** |
| 复用难度  | ⭐ 极低——已是完整中文教程，直接取章节为知识文档                                                   |
| 授权    | 开源                                                                          |

## 二、微软 AI Agents for Beginners — Agent入门

| 维度    | 详情                                                   |
| ----- | ---------------------------------------------------- |
| 地址    | https://github.com/microsoft/ai-agents-for-beginners |
| Stars | **约 5 万+**                                           |
| 课时    | 12 课                                                 |
| 内容覆盖  | **Agent架构 → 工具调用 → 记忆系统 → 多Agent编排 → MCP → 生产部署**    |
| 复用难度  | ⭐ 极低——12课讲义 + 代码                                     |
| 授权    | MIT                                                  |

**可取用**：第1-2课（Agent基础）、第3-5课（工具调用/MCP）、第6-8课（记忆系统）。

## 三、LangGraph 官方文档

| 维度     | 详情                                                         |
| ------ | ---------------------------------------------------------- |
| GitHub | https://github.com/langchain-ai/langgraph（**1.5 万+ Star**） |
| 中文     | https://langgraph.com.cn                                   |
| 内容     | StateGraph / Agentic RAG / 多Agent模式 / Human-in-the-Loop    |
| 取用     | 多Agent编排模式 + Agentic RAG 章节                                |

## 四、DeepTutor — 2.4万星，论文架构参考

| 维度     | 详情                                                  |
| ------ | --------------------------------------------------- |
| GitHub | https://github.com/HKUDS/DeepTutor（**2.4 万+ Star**） |
| 论文     | arXiv 2604.26962                                    |
| 取用     | 引用溯源降幻觉、三层记忆体系、知识缺口诊断——理论基础不直接当文档用                  |

## 五、执行计划

按用户学习路径组织知识文档：

| 阶段          | 知识站点                | 素材来源                                | 文档数 |
| ----------- | ------------------- | ----------------------------------- | --- |
| 阶段1：基础概念    | LLM是什么、Token、上下文、温度 | hello-agents 前几章 + 微软GenAI第1-3课     | 3篇  |
| 阶段2：Prompt  | 怎么写提示词、结构化Prompt    | hello-agents Prompt章 + 微软GenAI第4-8课 | 3篇  |
| 阶段3：RAG     | 切片→向量化→检索→生成        | hello-agents RAG章 + 微软GenAI第9-12课   | 4篇  |
| 阶段4：Agent核心 | 循环、工具调用、记忆系统        | hello-agents 核心章节(主体) + 微软AI Agents | 5篇  |
| 阶段5：多Agent  | 编排模式、辩论交叉验证         | hello-agents多Agent章 + LangGraph文档   | 3篇  |
| 阶段6：理论基础    | 降幻觉、知识追踪            | DeepTutor论文摘要                       | 1篇  |

