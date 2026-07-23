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
  role: 'user' | 'assistant' | 'thinking'
  content: string
  steps?: ChatStep[]
}

export interface ChatStep {
  agent: string
  status: string
  detail?: string
}

/** 预设 Agent 配置 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'dispatch',
    name: '调度 Agent',
    icon: '🎯',
    mode: '标准',
    modes: [{ label: '标准', promptOverride: '' }],
    systemPrompt: '你是调度 Agent。负责多智能体工作流编排：读取记忆→分配任务→协调执行→汇总结果。',
    defaultPrompt: '你是调度 Agent。负责多智能体工作流编排：读取记忆→分配任务→协调执行→汇总结果。',
    skill: '工作流编排：接收输入→调用学情诊断/搜索/记忆管理→协调生成→提交审核→整理输出。',
    defaultSkill: '工作流编排：接收输入→调用学情诊断/搜索/记忆管理→协调生成→提交审核→整理输出。',
    skillEditable: false,
  },
  {
    id: 'memory',
    name: '记忆管理 Agent',
    icon: '🧠',
    mode: '标准',
    modes: [{ label: '标准', promptOverride: '' }],
    systemPrompt: '你是记忆管理 Agent。负责用户记忆的读写：每次交互后自动更新记忆，支持分层存储（短期/长期/项目级）。',
    defaultPrompt: '你是记忆管理 Agent。负责用户记忆的读写：每次交互后自动更新记忆，支持分层存储（短期/长期/项目级）。',
    skill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像。参考DeepTutor三层体系，支持文件化持久存储。',
    defaultSkill: '记忆分层：L1事件追踪→L2精选事实→L3综合画像。参考DeepTutor三层体系，支持文件化持久存储。',
    skillEditable: true,
  },
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
  {
    id: 'input',
    name: '输入信息处理 Agent',
    icon: '📥',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
    ],
    systemPrompt: '你是输入信息处理 Agent。尽可能将输入转化为文本格式（含OCR识别），若文本不足以承载全部内容，识别并标注非文本形式的处理方式。',
    defaultPrompt: '你是输入信息处理 Agent。尽可能将输入转化为文本格式（含OCR识别），若文本不足以承载全部内容，识别并标注非文本形式的处理方式。',
    skill: '格式处理：先识别输入形式 → PDF用opendataloader-project解析 → 非PDF用markitdown转换 → 统一为Markdown文本。',
    defaultSkill: '格式处理：先识别输入形式 → PDF用opendataloader-project解析 → 非PDF用markitdown转换 → 统一为Markdown文本。',
    skillEditable: true,
  },
  {
    id: 'output',
    name: '信息整理与生成 Agent',
    icon: '📤',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '详细', promptOverride: '输出更详细的解释，包含背景知识和延伸阅读。' },
    ],
    systemPrompt: '你是信息整理与生成 Agent。将多智能体协同生成的结果格式化为用户友好的最终输出，确保内容结构清晰、语言流畅。',
    defaultPrompt: '你是信息整理与生成 Agent。将多智能体协同生成的结果格式化为用户友好的最终输出，确保内容结构清晰、语言流畅。',
    skill: '输出格式化：Markdown渲染、结构化呈现、内容难度自适应、任务驱动引导、开放性问题生成。',
    defaultSkill: '输出格式化：Markdown渲染、结构化呈现、内容难度自适应、任务驱动引导、开放性问题生成。',
    skillEditable: true,
  },
  {
    id: 'search',
    name: '搜索 Agent',
    icon: '🔎',
    mode: '标准',
    modes: [
      { label: '标准', promptOverride: '' },
      { label: '增强', promptOverride: '执行多轮深度搜索，交叉验证信息来源，优先使用官方文档和学术论文。' },
    ],
    systemPrompt: '你是搜索 Agent。基于 SearXNG 元搜索引擎，聚合多源信息，优先返回权威来源的具体数据和可验证信息。',
    defaultPrompt: '你是搜索 Agent。基于 SearXNG 元搜索引擎，聚合多源信息，优先返回权威来源的具体数据和可验证信息。',
    skill: `#### 一、搜索与检索

##### 1、知识库检索

默认模式：无额外设定，大模型自己决定

默认增强：倾向于搜索优质信息——真实反馈，官方文档，多轮搜索，自我检测

私有检索：纯粹检索上传的信息

##### 2、联网搜索

默认模式：ai自己决定

增强模式：寻找优质信息`,
    defaultSkill: `#### 一、搜索与检索

##### 1、知识库检索

默认模式：无额外设定，大模型自己决定

默认增强：倾向于搜索优质信息——真实反馈，官方文档，多轮搜索，自我检测

私有检索：纯粹检索上传的信息

##### 2、联网搜索

默认模式：ai自己决定

增强模式：寻找优质信息`,
    skillEditable: true,
  },
  {
    id: 'kb',
    name: '知识库管理 Agent',
    icon: '📚',
    mode: '标准',
    modes: [{ label: '标准', promptOverride: '' }],
    systemPrompt: '你是知识库管理 Agent。负责知识库的创建、维护和检索调度。引导用户建立知识库，管理文档切片和向量存储，处理检索请求。',
    defaultPrompt: '你是知识库管理 Agent。负责知识库的创建、维护和检索调度。引导用户建立知识库，管理文档切片和向量存储，处理检索请求。',
    skill: '知识库管理：引导建立知识库→文档切片(200-800字/chunk)→向量化→Chroma存储→语义检索(Small-to-Big/两阶段重排)→强制引用来源。',
    defaultSkill: '知识库管理：引导建立知识库→文档切片(200-800字/chunk)→向量化→Chroma存储→语义检索(Small-to-Big/两阶段重排)→强制引用来源。',
    skillEditable: true,
  },
]
