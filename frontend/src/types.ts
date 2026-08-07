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
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '深思', promptOverride: '请进行更深入的分析，考虑更多背景与细节。' },
      { label: '快速', promptOverride: '请快速给出核心内容，减少冗余。' },
    ],
    systemPrompt: '你是主 Agent。负责信息输入处理、调度调用子 Agent 与最终内容生成：一次规划调用学情与记忆管理/知识库管理，汇总后生成讲义、实操指南、分阶测试题。',
    defaultPrompt: '你是主 Agent。负责信息输入处理、调度调用子 Agent 与最终内容生成：一次规划调用学情与记忆管理/知识库管理，汇总后生成讲义、实操指南、分阶测试题。',
    skill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核→输出。',
    defaultSkill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核→输出。',
    skillEditable: true,
  },
  {
    id: 'study',
    name: '学情与记忆管理',
    icon: '🧠',
    mode: '标准',
    modes: [{ label: '标准', promptOverride: '' }],
    systemPrompt: '你是学情与记忆管理 Agent。负责用户记忆的读写与学情画像：分析用户知识水平，参考已有记忆输出结构化画像。',
    defaultPrompt: '你是学情与记忆管理 Agent。负责用户记忆的读写与学情画像：分析用户知识水平，参考已有记忆输出结构化画像。',
    skill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像；学情诊断输出 level/strengths/gaps/suggestion。',
    defaultSkill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像；学情诊断输出 level/strengths/gaps/suggestion。',
    skillEditable: true,
  },
  {
    id: 'kb',
    name: '知识库管理',
    icon: '📚',
    mode: '标准',
    modes: [{ label: '标准', promptOverride: '' }],
    systemPrompt: '你是知识库管理 Agent。负责知识库检索与联网搜索：从知识库向量库检索相关片段，必要时联网补充信息。',
    defaultPrompt: '你是知识库管理 Agent。负责知识库检索与联网搜索：从知识库向量库检索相关片段，必要时联网补充信息。',
    skill: '知识库管理：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    defaultSkill: '知识库管理：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    skillEditable: true,
  },
  {
    id: 'review',
    name: '审核',
    icon: '⚖️',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '严格', promptOverride: '请进行严格的事实核查，对每个论断要求引用来源，幻觉率目标<3%。' },
    ],
    systemPrompt: '你是审核 Agent。对生成内容进行三维度综合审查：符实性、难度适配、规范性与专业性，输出综合裁定。',
    defaultPrompt: '你是审核 Agent。对生成内容进行三维度综合审查：符实性、难度适配、规范性与专业性，输出综合裁定。',
    skill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    defaultSkill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    skillEditable: true,
  },
]

