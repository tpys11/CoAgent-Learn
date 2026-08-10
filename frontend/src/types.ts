export interface Project {
  id: string
  name: string
  initialized?: boolean
  simple?: boolean
}

export interface Dialogue {
  id: string
  name: string
  projectId: string
  createdAt: string
  archived: boolean
}

export interface AgentMode {
  label: string
  promptOverride: string
}

export interface AgentConfig {
  id: string
  name: string
  icon: string
  mode: string
  modes: AgentMode[]
  systemPrompt: string
  defaultPrompt: string
  skill: string
  defaultSkill: string
  skillEditable: boolean
  /** 模型选择：global=跟随全局(节点默认) / main=强模型 / fast=快模型 */
  model?: 'global' | 'main' | 'fast'
  /** 重试上限（审核不通过时的重试次数，默认 2） */
  retryMax?: number
  /** 记忆注入开关（false 时不读取/注入记忆与学情） */
  memoryEnabled?: boolean
  /** 启用/禁用（false 时工作流跳过该 Agent） */
  enabled?: boolean
  /** 职责说明（只读展示） */
  role?: string
  /** 输入输出 JSON 示例（few-shot，可选） */
  example?: string
  /** 子 Agent：该 Agent 可调用的专项子 Agent（不同模板下被调用产出特定形式内容） */
  subAgents?: Array<{ id: string; name: string; subPrompt: string; form: string }>
}

export interface Message {
  role: 'user' | 'assistant' | 'thinking'
  content: string
  steps?: ChatStep[]
  think?: string[]
}

export interface ChatStep {
  agent: string
  status: string
  detail?: string
}

/** 预设 Agent 配置（4-Agent 结构） */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'main',
    name: '主 Agent',
    icon: '🎯',
    mode: '均衡',
    modes: [
      { label: '均衡', promptOverride: '' },
      { label: '深思', promptOverride: '请进行更深入的分析，考虑更多背景与细节。' },
      { label: '快速', promptOverride: '请快速给出核心内容，减少冗余。' },
    ],
    systemPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划调度（学情与记忆管理 ∥ 知识库与搜索）→ 汇总学情画像与检索结果 → 生成讲义、实操指南、分阶测试题等学习内容 → 提交审核。\n**基础能力**\n- 输入解析与规划：判断问题是否需要学情画像、知识库检索，一次规划并行调度相关 Agent\n- 内容生成：基于画像与检索结果生成讲义、实操指南、分阶测试题等学习内容\n- 汇总输出：整合各 Agent 产出，组织为完整回答\n**拓展能力**\n- 输出增强：触发条件——选择「输出增强」模板；执行方式——调用「输出增强」子 Agent 产出结构化内容后，再基于其组织最终回答\n- Skill 调用：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    defaultPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划调度（学情与记忆管理 ∥ 知识库与搜索）→ 汇总学情画像与检索结果 → 生成讲义、实操指南、分阶测试题等学习内容 → 提交审核。\n**基础能力**\n- 输入解析与规划：判断问题是否需要学情画像、知识库检索，一次规划并行调度相关 Agent\n- 内容生成：基于画像与检索结果生成讲义、实操指南、分阶测试题等学习内容\n- 汇总输出：整合各 Agent 产出，组织为完整回答\n**拓展能力**\n- 输出增强：触发条件——选择「输出增强」模板；执行方式——调用「输出增强」子 Agent 产出结构化内容后，再基于其组织最终回答\n- Skill 调用：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    skill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核→输出。',
    defaultSkill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核→输出。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '负责全局调度与最终生成：解析输入 → 一次规划调用学情/知识库子 Agent → 汇总学情画像与检索结果 → 生成讲义、实操指南、分阶测试题 → 提交审核。',
    example: '',
    subAgents: [
      { id: 'tree', name: '树状图生成', subPrompt: '你是树状图生成助手。根据给定材料输出层级缩进的树状结构（每个节点一句话概括，不超过三层），清晰展示内容的组织关系。', form: '树状' },
      { id: 'cards', name: '要点卡片', subPrompt: '你是要点提炼助手。根据给定材料输出 3-6 张要点卡片（要点标题 + 一句话说明 + 关键细节），便于快速记忆。', form: '卡片' },
      { id: 'mindmap', name: '思维导图', subPrompt: '你是思维导图助手。根据给定材料输出中心主题-分支的 mindmap 结构（主题居中，一级/二级分支展开，每支一句话）。', form: '导图' },
      { id: 'table', name: '表格对比', subPrompt: '你是表格对比助手。根据给定材料输出对比表（Markdown 表格，维度行×对象列，含维度说明与结论行），便于多对象对比。', form: '表格' },
      { id: 'flow', name: '流程图/时序图', subPrompt: '你是流程梳理助手。根据给定材料输出步骤流程或时序（可用 mermaid flowchart/sequence 语法或分步编号），展示过程顺序。', form: '流程' },
      { id: 'timeline', name: '时间线', subPrompt: '你是时间线助手。根据给定材料输出发展历程时间线（时间点 + 事件一句话），按时间顺序排列。', form: '时间线' },
      { id: 'faq', name: 'FAQ 问答对', subPrompt: '你是问答整理助手。根据给定材料输出 3-8 个高频问答对（问题 + 简明答案），便于自测复习。', form: '问答' },
      { id: 'checklist', name: '清单/检查单', subPrompt: '你是清单助手。根据给定材料输出可勾选的操作步骤清单（每步一句话，按执行顺序）。', form: '清单' },
    ],
  },
  {
    id: 'study',
    name: '学情与记忆管理',
    icon: '🧠',
    mode: '均衡',
    modes: [{ label: '均衡', promptOverride: '' }],
    systemPrompt: '你是学情与记忆管理 Agent。负责用户记忆的读写与学情画像：分析用户知识水平，参考已有记忆输出结构化画像。',
    defaultPrompt: '你是学情与记忆管理 Agent。负责用户记忆的读写与学情画像：分析用户知识水平，参考已有记忆输出结构化画像。',
    skill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像；学情诊断输出 level/strengths/gaps/suggestion。',
    defaultSkill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像；学情诊断输出 level/strengths/gaps/suggestion。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '读取并维护三层记忆（对话→项目→全局画像），分析用户知识水平，为生成节点提供结构化学情画像（level/strengths/gaps/suggestion）。',
    example: '',
  },
  {
    id: 'kb',
    name: '知识库与搜索',
    icon: '📚',
    mode: '均衡',
    modes: [{ label: '均衡', promptOverride: '' }],
    systemPrompt: '基础职责概述：知识库检索与联网搜索，为生成提供可溯源的参考资料。\n**基础能力**\n- 知识库检索：从知识库向量库检索相关片段（含来源信息）\n- 联网搜索：必要时联网补充信息，聚合多源权威来源\n**拓展能力**\n- 检索增强整理：触发条件——选择「检索增强」模板；执行方式——强制调用子 Agent（知识库管理/搜索）整理检索结果（知识库管理子 Agent 只整理知识库片段，搜索子 Agent 只整理联网结果）',
    defaultPrompt: '基础职责概述：知识库检索与联网搜索，为生成提供可溯源的参考资料。\n**基础能力**\n- 知识库检索：从知识库向量库检索相关片段（含来源信息）\n- 联网搜索：必要时联网补充信息，聚合多源权威来源\n**拓展能力**\n- 检索增强整理：触发条件——选择「检索增强」模板；执行方式——强制调用子 Agent（知识库管理/搜索）整理检索结果（知识库管理子 Agent 只整理知识库片段，搜索子 Agent 只整理联网结果）',
    skill: '知识库与搜索：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    defaultSkill: '知识库与搜索：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '检索知识库向量库中的相关片段并联网补充信息，为生成提供可溯源的参考资料（纯工具调用，不消耗 LLM 推理）；检索增强模板下强制调用子 Agent（知识库管理/搜索）整理结果。',
    example: '',
    subAgents: [
      { id: 'kb-manage', name: '知识库管理', subPrompt: '你是知识库检索整理助手。把检索到的知识库片段整理为「来源→核心观点→关键数据」的条目，只输出整理结果本身。', form: '检索' },
      { id: 'search', name: '搜索', subPrompt: '你是搜索整理助手。把联网搜索到的资料整理为「来源→核心观点→关键数据」的条目并标注来源网址，只输出整理结果本身。', form: '搜索' },
    ],
  },
  {
    id: 'review',
    name: '审核',
    icon: '⚖️',
    mode: '均衡',
    modes: [
      { label: '均衡', promptOverride: '' },
      { label: '严格', promptOverride: '请进行严格的事实核查，对每个论断要求引用来源，幻觉率目标<3%。' },
    ],
    systemPrompt: '你是审核 Agent。对生成内容进行三维度综合审查：符实性、难度适配、规范性与专业性，输出综合裁定。',
    defaultPrompt: '你是审核 Agent。对生成内容进行三维度综合审查：符实性、难度适配、规范性与专业性，输出综合裁定。',
    skill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    defaultSkill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: false,
    enabled: true,
    role: '对生成内容做符实性 / 难度适配 / 规范性三维审查并给出综合裁定；不通过时打回主 Agent 修改（重试上限可配）。',
    example: '',
  },
]

