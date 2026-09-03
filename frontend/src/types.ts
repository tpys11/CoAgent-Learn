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

interface AgentMode {
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
  /** 条目4：该条目关联的子agent运行档案 id（前端渲染按钮，点开子agent窗口） */
  run_ids?: string[]
}

/** 条目4：子agent实时 SSE 载荷（信封 type='subagent'，event 为内部阶段） */
export interface SubAgentSse {
  type: 'subagent'
  event: 'start' | 'input' | 'delta' | 'end'
  run_id: string
  agent?: string
  title?: string
  /** input 事件：主agent发给子的指令（截断版，完整看档案接口） */
  content?: string
  /** delta 事件：增量片段（v1 预留） */
  text?: string
  status?: 'ok' | 'error'
  summary?: string
}

/** 条目4：子agent运行档案（GET /api/chat/subagent/{run_id} 返回 {run}） */
export interface SubAgentRun {
  id: string
  project_id: string
  dialogue_id: string
  agent: string
  title: string
  /** 主agent发给子的完整指令 */
  input: string
  status: 'running' | 'ok' | 'error'
  /** 最终报告/整理结果 */
  output: string
  events: Array<Record<string, unknown>>
  created_at: string
  finished_at: string | null
}

interface ReviewIssue {
  problem: string
  fix?: string
}

/** 断言级核查单条（研究档）：issues 即其中 unsupported 子集的映射视图 */
interface ReviewClaim {
  claim: string
  label: 'supported' | 'unsupported'
  confidence?: number
  reason?: string
  diag?: 'hallucination' | 'retrieval_gap' | 'no_evidence'
}

export interface ReviewResult {
  passed: boolean
  score: number
  issues?: ReviewIssue[]
  suggestion?: string
  verdict?: string
  /** 断言级核查全表（研究档审核），随 done.review 透传 */
  claims?: ReviewClaim[]
  /** fail-open 跳过标记：审核器异常/不可解析时 true（当轮视为通过） */
  skipped?: boolean
}

export interface Message {
  role: 'user' | 'assistant' | 'thinking'
  content: string
  steps?: ChatStep[]
  think?: MindchainItem[] | string[]
  /** 资源生成建议（模型判断）：{key, label} 列表，消息完成时由 done 事件注入 */
  special?: Array<{ key: string; label: string }>
  /** 跨模态检索命中的图片（知识库图片向量命中）：随 done 事件注入 */
  retrievedImages?: Array<{ source: string; content: string; file_path: string; mime: string }>
  /** 审核报告（三维度审查结果）：随 done 事件注入 */
  review?: ReviewResult
}

export interface ChatStep {
  agent: string
  status: string
  detail?: string
}

// ===== 后端响应包装类型（api.ts 返回类型用） =====

export interface ProjectList {
  projects: Project[]
}

export interface DialogueList {
  dialogues: Dialogue[]
}

export interface MessagesData {
  messages: Message[]
}

/** 画像类接口（个人全局 / 项目记忆 / 对话画像）返回的松散结构。 */
export type ProfileData = Record<string, any>

interface ResourceItem {
  id: string
  name: string
  content?: string
  type?: string
  file_ext?: string
  file_size?: number
  file_path?: string
  project_id?: string
  project_name?: string
  created_at?: string
}

export interface ResourceList {
  resources: ResourceItem[]
}

export interface StatsData {
  dialogue_count: number
  tokens_estimate: number
  total_duration_seconds: number
  metrics: any
  [key: string]: any
}

export interface SettingsData {
  kb_mode?: string
  embedding?: { api_key_set?: boolean; api_key_hint?: string; model?: string; base_url?: string }
  review?: { enabled?: boolean; model?: string; model_research?: string; effective_model?: string; follow_main?: boolean }
  [key: string]: any
}

export interface CapabilityList {
  capabilities: Array<{ key: string; label: string; desc: string; output: string }>
}

export interface SkillList {
  skills: Array<{ name: string; description: string; folder: string }>
}

/** 预设 Agent 配置（4-Agent 结构） */
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'main',
    name: '学习助手',
    icon: '🎯',
    mode: '均衡',
    modes: [
      { label: '均衡', promptOverride: '' },
      { label: '深思', promptOverride: '请进行更深入的分析，考虑更多背景与细节。' },
      { label: '快速', promptOverride: '请快速给出核心内容，减少冗余。' },
    ],
    systemPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划（按需调用：知识库管理检索 / 搜索增强联网）→ 汇总画像文档与检索/搜索结果 → 生成定制学习内容（知识讲解等）→ 提交审核。\n**基础能力**\n- 输入解析与规划：意图分类（chat/qa/learn）与需求澄清；按需规划调用知识库管理（用户指出库内有未检索到 / 研究档详细查阅 / 要求基于资料）与搜索增强（时效性 / 外部信息 / 知识库无命中需联网）\n- 内容生成：基于画像文档（后台注入）与检索/搜索结果生成定制学习内容（按需包含知识讲解、测试题等）\n- 输出形式：用户要求特定形式（表格/清单/树状/流程图/时间线/FAQ 等）时直接按该形式组织（已融入，无需额外 Agent）\n- 汇总输出：整合各 Agent 产出，组织为完整回答并提交审核\n**档位时间期望**（按用户所选档位注入生成提示词）\n- 极速：必须快速生成——直奔主题、只给核心结论，不要冗长思考与展开\n- 思考：可快可慢，视情况而定——简单问题简洁作答，复杂问题充分分析，按问题本身需要决定深度\n- 研究：必须花时间深入研究，至少思考半分钟再作答——多角度分析、逐层论证、充分考虑边界情况后再输出结论\n**Skill 调用**：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    defaultPrompt: '基础职责概述：全局调度与最终生成。解析用户输入 → 一次规划（按需调用：知识库管理检索 / 搜索增强联网）→ 汇总画像文档与检索/搜索结果 → 生成定制学习内容（知识讲解等）→ 提交审核。\n**基础能力**\n- 输入解析与规划：意图分类（chat/qa/learn）与需求澄清；按需规划调用知识库管理（用户指出库内有未检索到 / 研究档详细查阅 / 要求基于资料）与搜索增强（时效性 / 外部信息 / 知识库无命中需联网）\n- 内容生成：基于画像文档（后台注入）与检索/搜索结果生成定制学习内容（按需包含知识讲解、测试题等）\n- 输出形式：用户要求特定形式（表格/清单/树状/流程图/时间线/FAQ 等）时直接按该形式组织（已融入，无需额外 Agent）\n- 汇总输出：整合各 Agent 产出，组织为完整回答并提交审核\n**档位时间期望**（按用户所选档位注入生成提示词）\n- 极速：必须快速生成——直奔主题、只给核心结论，不要冗长思考与展开\n- 思考：可快可慢，视情况而定——简单问题简洁作答，复杂问题充分分析，按问题本身需要决定深度\n- 研究：必须花时间深入研究，至少思考半分钟再作答——多角度分析、逐层论证、充分考虑边界情况后再输出结论\n**Skill 调用**：触发条件——任务需要外部能力时；执行方式——从运行时可用 Skill 列表（知识库检索、联网搜索、记忆读写、视觉分析等）中按需调用',
    skill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核与输出。',
    defaultSkill: '工作流：输入处理→一次规划→并行调用子Agent→汇总生成→提交审核与输出。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '负责全局调度与最终生成：解析输入 → 一次规划（按需调用知识库管理/搜索增强）→ 汇总画像文档与检索/搜索结果 → 生成定制学习内容（知识讲解等） → 提交审核。',
    example: '',
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
    systemPrompt: '基础职责概述：知识库管理——后台负责资料入库（切片、向量化、标题树），对话流程中只做知识库检索（纯工具调用），为生成提供可溯源的参考资料。\n**基础能力**\n- 后台管理：上传资料→切片→向量化→入库（含来源与标题层级）\n- 对话中检索：从向量库检索相关片段（含来源），未命中必须申明\n**拓展能力**\n- 联网搜索：由学习助手判定需要时派发搜索子 Agent 执行（本节点不做联网搜索）\n- 检索增强整理：触发条件——思考/研究档；执行方式——子 Agent 整理检索结果为「来源→核心观点→关键数据」条目',
    defaultPrompt: '基础职责概述：知识库管理——后台负责资料入库（切片、向量化、标题树），对话流程中只做知识库检索（纯工具调用），为生成提供可溯源的参考资料。\n**基础能力**\n- 后台管理：上传资料→切片→向量化→入库（含来源与标题层级）\n- 对话中检索：从向量库检索相关片段（含来源），未命中必须申明\n**拓展能力**\n- 联网搜索：由学习助手判定需要时派发搜索子 Agent 执行（本节点不做联网搜索）\n- 检索增强整理：触发条件——思考/研究档；执行方式——子 Agent 整理检索结果为「来源→核心观点→关键数据」条目',
    skill: '知识库管理：文档切片→向量化→语义检索（联网搜索由学习助手派发搜索子 Agent）。',
    defaultSkill: '知识库管理：文档切片→向量化→语义检索（联网搜索由学习助手派发搜索子 Agent）。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: true,
    enabled: true,
    role: '知识库管理：后台负责资料入库（切片/向量化/标题树），对话流程中按学习助手规划按需执行知识库检索（纯工具调用，0 LLM 推理）；联网搜索由学习助手派发搜索子 Agent。',
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
    systemPrompt: '基础职责概述：对学习助手生成内容进行三维度综合审查（符实性、难度适配、规范性），输出综合裁定（passed / score / issues / suggestion），把关输出质量。\n**基础能力**\n- 对照式符实性审查：逐条对照领域知识库/常识核查生成内容，关键论断需有依据——有依据通过、无依据标记幻觉、依据不足标记存疑\n- 学情适配审查：对照学情画像判断难度与深度是否匹配（太难打击信心、太简单无收获），给出调整建议\n- 规范性与专业性：术语是否准确、实操步骤是否符合领域规范\n- 综合裁定：汇总三维度结论，输出 passed、score、具体 issues（问题+修改建议）与总体 suggestion\n**拓展能力**\n- 审核结果沉淀：触发条件——审核发现明显的薄弱点或易错点；执行方式——将发现的问题合并到项目记忆的薄弱点/难点字段，供后续生成参考\n- 重试驱动：触发条件——裁定不通过且重试未达上限（默认 2 次）；执行方式——输出具体 issue 与修改建议作为修正要求，驱动学习助手针对性重做',
    defaultPrompt: '基础职责概述：对学习助手生成内容进行三维度综合审查（符实性、难度适配、规范性），输出综合裁定（passed / score / issues / suggestion），把关输出质量。\n**基础能力**\n- 对照式符实性审查：逐条对照领域知识库/常识核查生成内容，关键论断需有依据——有依据通过、无依据标记幻觉、依据不足标记存疑\n- 学情适配审查：对照学情画像判断难度与深度是否匹配（太难打击信心、太简单无收获），给出调整建议\n- 规范性与专业性：术语是否准确、实操步骤是否符合领域规范\n- 综合裁定：汇总三维度结论，输出 passed、score、具体 issues（问题+修改建议）与总体 suggestion\n**拓展能力**\n- 审核结果沉淀：触发条件——审核发现明显的薄弱点或易错点；执行方式——将发现的问题合并到项目记忆的薄弱点/难点字段，供后续生成参考\n- 重试驱动：触发条件——裁定不通过且重试未达上限（默认 2 次）；执行方式——输出具体 issue 与修改建议作为修正要求，驱动学习助手针对性重做',
    skill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    defaultSkill: '交叉审核：比对知识库原文与生成内容，标注不匹配项，输出审核报告与综合 verdict。',
    skillEditable: true,
    model: 'global',
    retryMax: 2,
    memoryEnabled: false,
    enabled: true,
    role: '对生成内容做符实性 / 难度适配 / 规范性三维审查并给出综合裁定；不通过时打回学习助手修改（重试上限可配）。',
    example: '',
  },
]

/** 学情匹配度报告（GET /api/report/match，评估体系 §五 v1） */
export interface MatchReportData {
  overall: { score: number | null; label: string; basis: 'quiz' | 'level_score' | 'empty' }
  level_now: { score: number | null; evidence?: string; updated_at?: string }
  trend: Array<{ t: string | null; score: number }>
  kp_accuracy: Array<{ kp: string; total: number; correct: number; accuracy: number }>
  weak_points: string[]
  strong_points: string[]
  path_tree: Array<{ name: string; status: 'blind' | 'learning' | 'mastered' | 'untouched'; prereq?: string[]; children: MatchReportData['path_tree'] }>
  thresholds: { blind: number; master: number }
}
