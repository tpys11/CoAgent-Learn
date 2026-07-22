export interface Project {
  id: string
  name: string
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
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

/** 预设 Agent 配置 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'diagnose',
    name: '学情诊断 Agent',
    icon: '🔍',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '深思', promptOverride: '请进行更深入的多维度分析，考虑学生的隐性知识盲区。' },
      { label: '快速', promptOverride: '请快速给出核心诊断结论，不超过300字。' },
    ],
    systemPrompt: '你是一个学情诊断 Agent。分析用户的知识背景和技能水平，输出结构化诊断结果。',
    defaultPrompt: '你是一个学情诊断 Agent。分析用户的知识背景和技能水平，输出结构化诊断结果。',
    skill: '调用知识诊断题库，自适应出题（10→5→5），统计熟悉/了解/未知分类。',
    defaultSkill: '调用知识诊断题库，自适应出题（10→5→5），统计熟悉/了解/未知分类。',
    skillEditable: false,
  },
  {
    id: 'generate',
    name: '知识生成 Agent',
    icon: '📝',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '深入', promptOverride: '请生成更深入的内容，包含原理推导和实践案例。' },
    ],
    systemPrompt: '你是一个领域知识生成 Agent。基于知识库检索结果，生成高质量、零幻觉的学习内容。',
    defaultPrompt: '你是一个领域知识生成 Agent。基于知识库检索结果，生成高质量、零幻觉的学习内容。',
    skill: 'RAG检索增强生成：从Chroma向量库检索相关文档片段，拼接上下文后交由LLM生成。',
    defaultSkill: 'RAG检索增强生成：从Chroma向量库检索相关文档片段，拼接上下文后交由LLM生成。',
    skillEditable: true,
  },
  {
    id: 'review',
    name: '审核裁判 Agent',
    icon: '⚖️',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '严格', promptOverride: '请进行严格的事实核查，对每个论断要求引用来源，幻觉率目标<3%。' },
    ],
    systemPrompt: '你是一个内容审核 Agent。交叉验证生成内容的准确性，标注可疑点，确保幻觉率低于5%。',
    defaultPrompt: '你是一个内容审核 Agent。交叉验证生成内容的准确性，标注可疑点，确保幻觉率低于5%。',
    skill: '交叉验证：比对知识库原文与生成内容，标注不匹配项，输出审核报告和置信度评分。',
    defaultSkill: '交叉验证：比对知识库原文与生成内容，标注不匹配项，输出审核报告和置信度评分。',
    skillEditable: true,
  },
]
