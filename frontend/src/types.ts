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

/** 思维链单条：Agent 名 + 思考内容（reasonix 风格：Agent 小标题 + 正文） */
export interface MindchainItem {
  agent: string
  content: string
  /** 需求澄清条目（reasonix 式）：在思维链内直接提问，用户选择后同一轮流程内继续 */
  clarify?: { question: string; options: string[] }
}

export interface Message {
  role: 'user' | 'assistant' | 'thinking'
  content: string
  steps?: ChatStep[]
  think?: MindchainItem[] | string[]
  /** 特殊形式输出建议（模型判断）：{key, label} 列表，消息完成时由 done 事件注入 */
  special?: Array<{ key: string; label: string }>
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
    systemPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划调度（学情与记忆管理 ∥ 知识库管理）→ 汇总学情画像与检索结果 → 生成定制学习内容（知识讲解等）→ 提交审核。\n**基础能力**\n- 输入解析与规划：判断问题是否需要学情画像、知识库检索，一次规划并行调度相关 Agent\n- 内容生成：基于画像与检索结果生成定制学习内容（按需包含知识讲解、测试题等）\n- 汇总输出：整合各 Agent 产出，组织为完整回答\n**拓展能力**\n- 输出增强：触发条件——选择「输出增强」模板；执行方式——调用「输出增强」子 Agent 产出结构化内容后，再基于其组织最终回答\n- Skill 调用：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    defaultPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划调度（学情与记忆管理 ∥ 知识库管理）→ 汇总学情画像与检索结果 → 生成定制学习内容（知识讲解等）→ 提交审核。\n**基础能力**\n- 输入解析与规划：判断问题是否需要学情画像、知识库检索，一次规划并行调度相关 Agent\n- 内容生成：基于画像与检索结果生成定制学习内容（按需包含知识讲解、测试题等）\n- 汇总输出：整合各 Agent 产出，组织为完整回答\n**拓展能力**\n- 输出增强：触发条件——选择「输出增强」模板；执行方式——调用「输出增强」子 Agent 产出结构化内容后，再基于其组织最终回答\n- Skill 调用：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    skill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核与输出。',
    defaultSkill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核与输出。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '负责全局调度与最终生成：解析输入 → 一次规划调用学情/知识库子 Agent → 汇总学情画像与检索结果 → 生成定制学习内容（知识讲解等） → 提交审核。',
    example: '',
    subAgents: [
      { id: 'output-enhance', name: '输出增强', subPrompt: '你是输出增强助手。根据给定材料与用户要求，生成 1-3 种形式的专项内容，从以下能力中选择最合适的：树状结构、要点卡片、思维导图、对比表格、流程图/时序图、时间线、FAQ 问答对、清单。直接输出所选形式的内容本身（mermaid 流程图 / Markdown 表格 / 层级列表等），不要解释、不要输出 JSON。', form: '多形式' },
    ],
  },
  {
    id: 'study',
    name: '学情与记忆管理',
    icon: '🧠',
    mode: '均衡',
    modes: [{ label: '均衡', promptOverride: '' }],
    systemPrompt: '基础职责概述：后台学情分析 Agent——不占用对话时间，每次回答后在后台持续吸收原始学情信息（对话表现、理解程度、测试题作答、用户反馈），提炼并更新三层记忆与个人画像文档。\n**基础能力**\n- 后台提炼：对话后自动分析，把新事实（进度、偏好、难点、理解程度）合并进课程记忆与个人全局画像\n- 画像文档：维护「个人画像」文档（基本情况/学习情况/阅读偏好），供生成节点直接注入\n- 学情实证：吸收测试题作答等行为数据，使画像从对话推断升级为行为实证\n**与对话流程的关系**\n- 不在对话流程中调度（生成节点直接读画像文档注入）；对话后后台执行，用户无感知',
    defaultPrompt: '基础职责概述：后台学情分析 Agent——不占用对话时间，每次回答后在后台持续吸收原始学情信息（对话表现、理解程度、测试题作答、用户反馈），提炼并更新三层记忆与个人画像文档。\n**基础能力**\n- 后台提炼：对话后自动分析，把新事实（进度、偏好、难点、理解程度）合并进课程记忆与个人全局画像\n- 画像文档：维护「个人画像」文档（基本情况/学习情况/阅读偏好），供生成节点直接注入\n- 学情实证：吸收测试题作答等行为数据，使画像从对话推断升级为行为实证\n**与对话流程的关系**\n- 不在对话流程中调度（生成节点直接读画像文档注入）；对话后后台执行，用户无感知',
    skill: '后台学情分析：吸收对话表现/测试题作答/反馈，提炼三层记忆与个人画像文档（基本情况/学习情况/阅读偏好）。',
    defaultSkill: '后台学情分析：吸收对话表现/测试题作答/反馈，提炼三层记忆与个人画像文档（基本情况/学习情况/阅读偏好）。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '后台学情分析：吸收原始学情信息（对话表现/测试题作答/反馈），提炼三层记忆与个人画像文档，供生成节点直接注入；不占用对话时间。',
    example: '',
  },
  {
    id: 'kb',
    name: '知识库管理',
    icon: '📚',
    mode: '均衡',
    modes: [{ label: '均衡', promptOverride: '' }],
    systemPrompt: '基础职责概述：知识库管理——后台负责资料入库（切片、向量化、标题树），对话流程中只做检索与联网搜索（纯工具调用），为生成提供可溯源的参考资料。\n**基础能力**\n- 后台管理：上传资料→切片→向量化→入库（含来源与标题层级）\n- 对话中检索：从向量库检索相关片段（含来源），联网搜索补充外部信息（两者并行执行）\n**拓展能力**\n- 检索增强整理：触发条件——思考/研究档；执行方式——子 Agent（知识库管理/搜索）整理检索结果为「来源→核心观点→关键数据」条目',
    defaultPrompt: '基础职责概述：知识库管理——后台负责资料入库（切片、向量化、标题树），对话流程中只做检索与联网搜索（纯工具调用），为生成提供可溯源的参考资料。\n**基础能力**\n- 后台管理：上传资料→切片→向量化→入库（含来源与标题层级）\n- 对话中检索：从向量库检索相关片段（含来源），联网搜索补充外部信息（两者并行执行）\n**拓展能力**\n- 检索增强整理：触发条件——思考/研究档；执行方式——子 Agent（知识库管理/搜索）整理检索结果为「来源→核心观点→关键数据」条目',
    skill: '知识库管理：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    defaultSkill: '知识库管理：文档切片→向量化→语义检索；联网搜索聚合多源权威信息。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '知识库管理：后台负责资料入库（切片/向量化/标题树），对话流程中并行执行知识库检索与联网搜索（纯工具调用，0 LLM 推理）。',
    example: '',
    subAgents: [
      { id: 'kb-manage', name: '知识库管理', subPrompt: '你是知识库检索整理助手。把检索到的知识库片段整理为「来源→核心观点→关键数据」的条目，只输出整理结果本身。', form: '检索' },
      { id: 'search', name: '搜索增强', subPrompt: '你是搜索增强整理助手。把联网搜索到的资料整理为「来源→核心观点→关键数据」的条目并标注来源网址，只输出整理结果本身。', form: '搜索' },
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
    systemPrompt: '基础职责概述：对主 Agent 的生成内容进行三维度综合审查（符实性、难度适配、规范性），输出综合裁定（passed / score / issues / suggestion），把关输出质量。\n**基础能力**\n- 对照式符实性审查：逐条对照领域知识库/常识核查生成内容，关键论断需有依据——有依据通过、无依据标记幻觉、依据不足标记存疑\n- 学情适配审查：对照学情画像判断难度与深度是否匹配（太难打击信心、太简单无收获），给出调整建议\n- 规范性与专业性：术语是否准确、实操步骤是否符合领域规范\n- 综合裁定：汇总三维度结论，输出 passed、score、具体 issues（问题+修改建议）与总体 suggestion\n**拓展能力**\n- 审核结果沉淀：触发条件——审核发现明显的薄弱点或易错点；执行方式——将发现的问题合并到项目记忆的薄弱点/难点字段，供后续生成参考\n- 重试驱动：触发条件——裁定不通过且重试未达上限（默认 2 次）；执行方式——输出具体 issue 与修改建议作为修正要求，驱动主 Agent 针对性重做',
    defaultPrompt: '基础职责概述：对主 Agent 的生成内容进行三维度综合审查（符实性、难度适配、规范性），输出综合裁定（passed / score / issues / suggestion），把关输出质量。\n**基础能力**\n- 对照式符实性审查：逐条对照领域知识库/常识核查生成内容，关键论断需有依据——有依据通过、无依据标记幻觉、依据不足标记存疑\n- 学情适配审查：对照学情画像判断难度与深度是否匹配（太难打击信心、太简单无收获），给出调整建议\n- 规范性与专业性：术语是否准确、实操步骤是否符合领域规范\n- 综合裁定：汇总三维度结论，输出 passed、score、具体 issues（问题+修改建议）与总体 suggestion\n**拓展能力**\n- 审核结果沉淀：触发条件——审核发现明显的薄弱点或易错点；执行方式——将发现的问题合并到项目记忆的薄弱点/难点字段，供后续生成参考\n- 重试驱动：触发条件——裁定不通过且重试未达上限（默认 2 次）；执行方式——输出具体 issue 与修改建议作为修正要求，驱动主 Agent 针对性重做',
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

