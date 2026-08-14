import { useState, useEffect } from 'react'
import { Settings, Upload, Folder, Download, Layers, Wrench, ExternalLink, Plus, Trash2, LayoutTemplate, X, Workflow, Brain, Database, Scale, Code2 } from 'lucide-react'
import type { AgentConfig } from '../types'
import { DEFAULT_AGENTS } from '../types'

interface SkillInfo { name: string; description: string; folder: string }

interface Props {
  agents: AgentConfig[]
  onSave: (updated: AgentConfig) => void
  onReplace: (next: AgentConfig[]) => void
  projectId: string | null
}

type Block = 'agents' | 'skills' | 'templates'

/** 预设档位库（极速 / 思考 / 研究），intro=档位概述，detail=预设内部细节（只读展示） */
const PRESET_TEMPLATES: Array<{ name: string; desc: string; intro: string; detail: Array<[string, string]>; agents: AgentConfig[] }> = [
  {
    name: '极速', desc: '最短响应（1 秒内首字）',
    intro: '档位概述：面向一般对话环节——概念确认、即兴提问、碎片化学习，用户希望时间尽可能短。\n**效果**\n- 时间：绝大多数时候 1 秒内输出首字，最长不超过 3 秒\n- 内容总量：字数偏少，大多数 500-800 字，最多不超过 1000 字',
    detail: [
      ['编排流程', '主 Agent（快模型）→ 输出（跳过审核；不做知识库检索）'],
      ['知识库检索', '按需：用户要求基于资料回答时由主 Agent 规划调用'],
      ['生成模型', '快模型（flash，保 1 秒内首字）'],
      ['检测机制', '无（跳过审核保秒回）'],
    ],
    agents: DEFAULT_AGENTS.map(a => a.id === 'main' ? { ...a, model: 'fast' } : { ...a }),
  },
  {
    name: '思考', desc: '完整流程 + 轻量单审',
    intro: '档位概述：面向需要认真一点的回答——知识库无对应内容但对精确度要求不高。\n**效果**\n- 内容增强：联网搜索一轮（搜索机制见全局设定）\n- 内容总量：大部分 800-1200 字，最多不超过 1500 字\n- 检测机制：flash 轻量单审',
    detail: [
      ['编排流程', '规划（按需调用知识库管理）→ 生成 → flash 单审 → 输出（学情画像：后台文档注入）'],
      ['内容增强', '按需联网搜索（主 Agent 判定并派发搜索子 Agent）+ 子 Agent 整理（来源→核心观点→关键数据）'],
      ['生成模型', '强模型（质量优先）'],
      ['检测机制', 'flash 轻量单审（三维度：符实性/难度适配/规范性）'],
    ],
    agents: DEFAULT_AGENTS,
  },
  {
    name: '研究', desc: '完整流程 + 严格检测',
    intro: '档位概述：面向对内容精确度要求极高的任务——知识库无对应内容且需要严谨。\n**效果**\n- 内容增强：联网搜索可多轮（1-5 轮，每轮总结、不足续搜；多轮待实现当前一轮）\n- 内容总量：不做限制\n- 独立检测机制：用其他模型厂商的模型作为独立检测阶段（待实现，当前为 flash 单审）',
    detail: [
      ['编排流程', '与思考档一致：规划（研究档需详细查阅时必调知识库管理）→ 生成 → 单审 → 输出（学情画像：后台文档注入）'],
      ['内容增强', '联网搜索一轮（多轮搜索待实现：1-5 轮，每轮总结、不足续搜）'],
      ['生成模型', '强模型（质量优先）'],
      ['检测机制', 'flash 单审（其他模型厂商独立检测待实现）'],
    ],
    agents: DEFAULT_AGENTS,
  },
]

const SKILL_ENABLED_KEY = 'coagent-skill-enabled'
const CUSTOM_TEMPLATES_KEY = 'coagent-custom-templates'

/** 各模板的节点颜色深浅分布：按模板编排的基础逻辑标注各节点职责负载（0-5，越深负载越高） */
const TEMPLATE_LEVELS: Record<string, Record<string, number>> = {
  '极速': { plan: 1, study_memory: 1, kb: 1, generate: 2, review: 1 },
  '思考': { plan: 1, study_memory: 2, kb: 3, generate: 4, review: 3 },
  '研究': { plan: 1, study_memory: 2, kb: 4, generate: 5, review: 5 },
}

/** 模型选择中文标签 */
const MODEL_LABEL: Record<string, string> = { global: '跟随全局', main: '强模型', fast: '快模型' }

/** 推荐 Skill 市场（内置，后端已实现，勾选即在该 Agent 的 Skill 卡片中可选） */
const MARKET_SKILLS = [
  { name: 'fetch_web', desc: '抓取指定网页内容并提取正文文本', category: '信息获取' },
  { name: 'calculator', desc: '安全计算数学表达式（幂/根/三角等）', category: '计算工具' },
  { name: 'execute_code', desc: '在受限 Python 沙箱中执行代码并返回输出', category: '开发工具' },
  { name: 'pdf_parse', desc: '解析 PDF 文件提取文本（按页）', category: '文档处理' },
  { name: 'doc_parse', desc: '解析 Word 文档提取文本（段落+表格）', category: '文档处理' },
]

/** MCP 聚合平台 */
const MCP_PLATFORMS = [
  { name: 'mcp.so', url: 'https://mcp.so', desc: 'MCP 服务器搜索引擎' },
  { name: 'Smithery', url: 'https://smithery.ai', desc: 'MCP 服务器注册与发现平台' },
  { name: 'PulseMCP', url: 'https://www.pulsemcp.com', desc: 'MCP 服务器列表与评测' },
  { name: 'Glama', url: 'https://glama.ai/mcp/servers', desc: 'MCP 服务器目录' },
]

/** Skill 开发模板（下载用） */
const SKILL_TEMPLATE = `# Skill 开发模板（Python）

将你的 Skill 文件夹放入后端 skills/ 目录（或上传目录）后刷新即自动注册。

skills/your_skill_name/__init__.py:

from skills import Skill

class YourSkill(Skill):
    name = "your_skill"           # 唯一标识（小写+下划线）
    description = "技能的一句话说明"  # 展示给用户与模型
    input_schema = {               # 入参说明（可选）
        "keyword": {"type": "string", "description": "参数说明"}
    }

    def execute(self, keyword="", **kwargs) -> dict:
        # 在这里实现你的能力，返回 dict
        return {"results": [{"content": f"处理 {keyword} 的结果"}], "total": 1}
`

const SKILL_TABS: Array<{ key: string; label: string }> = [
  { key: 'installed', label: '已安装' },
  { key: 'market', label: '推荐市场' },
  { key: 'mcp', label: 'MCP 市场' },
  { key: 'dev', label: '开发者' },
]

/** 系统预设 Skill 封面图（public/skill-covers/） */
const SKILL_COVER: Record<string, string> = {
  fetch_web: '/skill-covers/fetch-web.jpg',
  calculator: '/skill-covers/calculator.jpg',
  execute_code: '/skill-covers/execute-code.jpg',
  pdf_parse: '/skill-covers/pdf-parse.jpg',
  doc_parse: '/skill-covers/doc-parse.jpg',
}
const coverOf = (name: string) => SKILL_COVER[name] || '/skill-covers/generic.jpg'

/** Skill 分类（已安装视图左侧栏） */
const SKILL_CATS = [
  { key: 'all', label: '全部' },
  { key: '检索', label: '检索与信息' },
  { key: '记忆', label: '记忆与画像' },
  { key: '视觉', label: '视觉理解' },
  { key: '计算', label: '计算与执行' },
  { key: '文档', label: '文档处理' },
]
const SKILL_CAT_MAP: Record<string, string> = {
  knowledge_retrieval: '检索', web_search: '检索', fetch_web: '检索',
  memory_ops: '记忆', user_diagnosis: '记忆',
  vision: '视觉',
  calculator: '计算', execute_code: '计算',
  pdf_parse: '文档', doc_parse: '文档',
}

const BLOCKS: Array<{ key: Block; icon: any; label: string }> = [
  { key: 'agents', icon: Settings, label: 'Agent 管理' },
  { key: 'skills', icon: Layers, label: 'Skill 管理' },
  { key: 'templates', icon: LayoutTemplate, label: '对话' },
]

/** 格式化文本：**标题** → 主题色加粗标题；「- 名称：内容」→ 加粗名称 + 正文；普通行 → 正文段落（与 Agent 提示词展示一致） */
function FormattedText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {text.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => {
        const mh = line.match(/^\*\*(.+?)\*\*$/)
        if (mh) return <p key={i} className="text-[13px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{mh[1]}</p>
        const m = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/)
        if (m) return (
          <div key={i} className="flex flex-col gap-1.5">
            <p className="text-[13px] font-bold text-[var(--text)]">{m[1]}</p>
            <p className="text-xs text-[var(--text-muted)] leading-loose">{m[2]}</p>
          </div>
        )
        return <p key={i} className="text-xs leading-loose text-[var(--text-muted)]">{line}</p>
      })}
    </div>
  )
}

/** 编排节点图：节点 + 箭头；节点背景色深浅按模板编排的基础逻辑标注（节点在流程中的职责负载，与内部运行数据无关） */
function FlowNode({ icon: Icon, name, level = 0, active, onClick }: { icon: any; name: string; level?: number; active?: boolean; onClick?: () => void }) {
  const pct = [10, 22, 38, 56, 76, 100][Math.min(Math.max(level, 0), 5)]
  const dark = level >= 3
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{ backgroundColor: `color-mix(in srgb, var(--accent) ${pct}%, var(--bg-panel))` }}
      className={`card-surface rounded-xl px-4 py-3 flex flex-col items-center gap-1.5 min-w-[96px] border-2 transition-all ${
        onClick ? 'cursor-pointer hover:border-[var(--accent)]' : ''
      } ${active ? 'border-[var(--accent)] shadow-soft' : 'border-[var(--border-color)]'} ${dark ? 'text-white' : 'text-[var(--text)]'}`}>
      {Icon && <Icon size={18} className={dark ? 'text-white' : active ? 'text-[var(--accent)]' : 'text-dim'} />}
      <span className="text-xs font-bold">{name}</span>
    </button>
  )
}
/** 子 Agent 独立矩形节点 */
function SubNode({ name, active, onClick }: { name: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`min-w-[96px] min-h-[64px] max-w-[160px] truncate flex items-center justify-center px-4 py-3 rounded-xl border-2 text-xs font-bold whitespace-nowrap transition-colors ${
        onClick ? 'cursor-pointer hover:border-[var(--accent)]' : ''
      } ${active ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-[var(--bg-panel)] text-dim border-[var(--border-color)]'}`}>
      {name}
    </button>
  )
}

/** 4-Agent 编排节点图：节点可点击选中 Agent（无 agents 参数时静态展示）；
 *  节点颜色深浅按当前模板的基础逻辑标注（各模板一套分布，不依赖运行数据） */
const FlowGraph = ({ agents, templateName, templateAgentId, onSelect }: { agents?: AgentConfig[]; templateName?: string; templateAgentId?: string; onSelect?: (id: string) => void }) => {
  const act = (id: string) => templateAgentId === id
  const pick = (id: string) => onSelect ? () => onSelect(id) : undefined
  // 当前模板对应的节点职责负载分布（未选中模板时按基础模板）
  const levels = TEMPLATE_LEVELS[templateName || '思考'] || TEMPLATE_LEVELS['思考']
  const lv = (n: string) => levels[n] || 0
  // 子 Agent：按模板差异化展示——检索增强只显示知识库与搜索的子 Agent，输出增强只显示主 Agent 的子 Agent，其余模板不显示子 Agent
  const subOf = (id: string) => ((agents || []).find(a => a.id === id)?.subAgents || []).map(s => s.name)
  const nameOf = (id: string, fallback: string) => (agents || []).find(a => a.id === id)?.name || fallback
  const kbSubs = templateName === '思考' ? subOf('kb') : []
  // 输出增强模板：生成节点只连接一个「输出增强」节点（规划节点不展示子 Agent）
  const mainSubs: string[] = []
  // 极速档实际流程：知识库检索（全局在线）→ 主 Agent（快模型）→ 输出（跳过审核）
  if (templateName === '极速') {
    return (
      <div className="flex flex-col items-center gap-1 py-6">
        <FlowNode icon={Database} name="知识库检索" level={lv('kb')} active={act('kb')} onClick={pick('kb')} />
        <DownArrow />
        <FlowNode icon={Workflow} name="主 Agent" level={lv('generate')} active={act('main')} onClick={pick('main')} />
        <DownArrow />
        <FlowNode icon={Scale} name="输出" level={lv('review')} />
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      {/* 学情与记忆管理：后台 Agent（不占对话流程，虚线展示） */}
      <div className="flex items-center gap-2 border border-dashed border-[var(--border-color)] rounded-lg px-2.5 py-1.5">
        <Brain size={12} className="text-dim" />
        <span className="text-[10px] text-dim">学情与记忆管理（后台）</span>
        <span className="text-[9px] text-dim/70">对话后提炼画像文档 → 注入生成</span>
      </div>
      <DownArrow />
      {/* 规划节点：不展示子 Agent（规划职责不调用输出子 Agent） */}
      <FlowNode icon={Workflow} name="规划" level={lv('plan')} active={act('main')} onClick={pick('main')} />
      <DownArrow />
      {/* 知识库管理（后台入库 + 对话中检索∥搜索并行） */}
      <AgentRow node={<FlowNode icon={Database} name={nameOf('kb', '知识库管理')} level={lv('kb')} active={act('kb')} onClick={pick('kb')} />} subs={kbSubs} />
      <DownArrow />
      {/* 生成（输出增强 子 Agent 右侧连接） */}
      <AgentRow node={<FlowNode icon={Workflow} name="生成" level={lv('generate')} active={act('main')} onClick={pick('main')} />} subs={mainSubs} />
      <DownArrow />
      <FlowNode icon={Scale} name="审核与输出" level={lv('review')} active={act('review')} onClick={pick('review')} />
      {templateName === '研究' && (
        <p className="text-[9px] text-dim mt-1">多轮搜索 · 其他厂商独立检测（待实现，当前与思考档一致）</p>
      )}
    </div>
  )
}

/** 向下箭头 */
const DownArrow = () => (
  <svg width="14" height="22" viewBox="0 0 14 22" className="flex-shrink-0">
    <path d="M 7 0 L 7 15 M 7 15 L 2.5 10.5 M 7 15 L 11.5 10.5" stroke="#d4d4d4" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** 父节点 + 左右两侧子 Agent 横向连接（≥2 个子 Agent 左右平分；1 个放右侧） */
function AgentRow({ node, subs }: { node: React.ReactNode; subs?: string[] }) {
  if (!subs || subs.length === 0) return <>{node}</>
  // 子 Agent 全部放在父节点右侧，整列以父节点横向中线为轴对称分布（上下对称）；绝对定位不参与布局，不撑高主干
  return (
    <div className="relative">
      {node}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 flex flex-col gap-4 items-start">
        {subs.map((s, i) => (
          <div key={s} className="flex items-center">
            {/* 弯曲曲线：父节点水平引出 → 拱起 → 回落子 Agent（上下交替拱向，更美观） */}
            <svg width="50" height="48" viewBox="0 0 50 48" className="flex-shrink-0">
              {i % 2 === 0
                ? <path d="M 0 24 C 15 24, 35 8, 50 24" stroke="#d4d4d4" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />
                : <path d="M 0 24 C 15 24, 35 40, 50 24" stroke="#d4d4d4" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />}
            </svg>
            <SubNode name={s} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 开关 */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onChange}
      className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${
        checked ? 'bg-[#1a1a1a] justify-end' : 'bg-[var(--bg-active)] justify-start'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      <span className="w-4 h-4 rounded-full bg-white shadow" />
    </button>
  )
}

/** Agent 管理：横向按钮展开 + 单个设置与运行监控 */
export default function AgentsView({ agents, onSave, onReplace, projectId }: Props) {
  const [block, setBlock] = useState<Block>('agents')
  const [selectedId, setSelectedId] = useState(agents[0]?.id || '')
  const agent = agents.find(a => a.id === selectedId) || agents[0]
  const [mode, setMode] = useState(agent?.mode || '均衡')
  const [prompt, setPrompt] = useState(agent?.systemPrompt || '')
  // 全局性提示词：默认模块化渲染展示，可切换编辑
  const [editPrompt, setEditPrompt] = useState(false)
  // 子 Agent 介绍弹窗
  const [subIntroOpen, setSubIntroOpen] = useState(false)
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([])
  const [linkedSkills, setLinkedSkills] = useState<string[]>([])
  // Skill 全局启用开关（localStorage）
  const [skillEnabled, setSkillEnabled] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(SKILL_ENABLED_KEY) || '{}') } catch { return {} }
  })
  // Skill 详情弹窗（独立小窗口）
  const [skillDetail, setSkillDetail] = useState<{ name: string; description: string; folder: string; category: string } | null>(null)
  // Skill 实现源码（点开详情→查看实现）
  const [skillSource, setSkillSource] = useState<string | null>(null)
  const [skillSrcLoading, setSkillSrcLoading] = useState(false)
  // 对话流程：Agent 自定义选中的 Agent
  const [templateAgentId, setTemplateAgentId] = useState(agents[0]?.id || '')
  // 对话流程：选中模板（展开详情）、自定义模板、保存名称
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null)
  const [customTemplates, setCustomTemplates] = useState<Array<{ name: string; desc: string; agents: AgentConfig[] }>>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]') } catch { return [] }
  })
  const [saveTplName, setSaveTplName] = useState('')
  const [showNewTplModal, setShowNewTplModal] = useState(false)
  // 子 Agent 添加弹窗
  const [showSubAdd, setShowSubAdd] = useState(false)
  const [subName, setSubName] = useState('')
  const [subForm, setSubForm] = useState('')
  const [subPrompt, setSubPrompt] = useState('')
  // 子 Agent 编辑弹窗（点击图中节点进入设定）
  const [subEditing, setSubEditing] = useState<{ id: string; name: string; form: string; subPrompt: string } | null>(null)
  // 中间层 Agent（输出增强/检索增强）设定弹窗
  const [showMidAgent, setShowMidAgent] = useState(false)
  const [midName, setMidName] = useState('')
  // Skill 管理四区
  const [skillTab, setSkillTab] = useState('installed')
  const [skillCat, setSkillCat] = useState('all')
  const [mcpStep, setMcpStep] = useState(1)
  const [mcpName, setMcpName] = useState('')
  const [mcpType, setMcpType] = useState<'stdio' | 'http' | 'sse'>('http')
  const [mcpTarget, setMcpTarget] = useState('')
  const [mcpList, setMcpList] = useState<Array<{ id: string; name: string; type: string; target: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('coagent-mcp-servers') || '[]') } catch { return [] }
  })

  useEffect(() => {
    setMode(agent?.mode || '均衡')
    setPrompt(agent?.systemPrompt || '')
    setSubIntroOpen(false)
    fetch('/api/skills').then(r => r.json()).then(d => {
      setAllSkills(d.skills || [])
      const names = (agent?.skill || '').match(/[a-z_]+/g) || []
      setLinkedSkills(names.filter((n: string) => (d.skills || []).some((s: SkillInfo) => s.name === n)))
    })
  }, [selectedId])

  /** 自动保存：任何修改立即持久化 */
  const commit = (patch: Partial<AgentConfig>) => {
    if (!agent) return
    onSave({ ...agent, ...patch })
  }

  const toggleSkill = (name: string) => {
    const next = linkedSkills.includes(name) ? linkedSkills.filter(s => s !== name) : [...linkedSkills, name]
    setLinkedSkills(next)
    const linked = next.map(n => {
      const s = allSkills.find(x => x.name === n)
      return s ? `${s.name}: ${s.description}` : n
    }).join('\n')
    commit({ skill: linked || agent.skill })
  }

  /** 删除 Skill：直接从此处消失（卡片移除 + 若已链接则解除链接） */
  const removeSkillFromAgent = (name: string) => {
    setAllSkills(prev => prev.filter(s => s.name !== name))
    if (linkedSkills.includes(name)) toggleSkill(name)
  }

  const toggleSkillEnabled = (name: string) => {
    const next = { ...skillEnabled, [name]: !(skillEnabled[name] ?? true) }
    setSkillEnabled(next)
    localStorage.setItem(SKILL_ENABLED_KEY, JSON.stringify(next))
  }

  const addMcpServer = () => {
    if (!mcpName.trim() || !mcpTarget.trim()) return
    const next = [...mcpList, { id: 'mcp-' + Date.now(), name: mcpName.trim(), type: mcpType, target: mcpTarget.trim() }]
    setMcpList(next)
    localStorage.setItem('coagent-mcp-servers', JSON.stringify(next))
    setMcpName(''); setMcpTarget(''); setMcpStep(1)
  }
  const removeMcpServer = (id: string) => {
    const next = mcpList.filter(s => s.id !== id)
    setMcpList(next)
    localStorage.setItem('coagent-mcp-servers', JSON.stringify(next))
  }
  const downloadTemplate = () => {
    const blob = new Blob([SKILL_TEMPLATE], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'skill-template.md'; a.click()
    URL.revokeObjectURL(url)
  }

  const fieldLabel = 'text-xs font-semibold text-dim uppercase tracking-wider mb-2 block'
  // 对话流程：模板集合（预设 + 自定义）、保存自定义
  const allTemplates = [...PRESET_TEMPLATES, ...customTemplates]
  // 模板介绍：自定义模板无内置文案时，从 Agent 团队配置推导细节
  const tplInfo = (t: { name: string; intro?: string; detail?: Array<[string, string]>; agents: AgentConfig[] }) => {
    if (t.intro && t.detail) return { intro: t.intro, detail: t.detail }
    const main = t.agents.find(a => a.id === 'main')
    const kb = t.agents.find(a => a.id === 'kb')
    const review = t.agents.find(a => a.id === 'review')
    const mainSubs = main?.subAgents?.map(s => s.name) || []
    const kbSubs = kb?.subAgents?.map(s => s.name) || []
    return {
      intro: '自定义模板：基于你保存的 Agent 团队配置，含自定义的 Agent 设定与子 Agent，编排流程与默认一致。',
      detail: [
        ['编排流程', '规划 → 学情与记忆 ∥ 知识库与搜索 → 生成 → 审核 → 输出'],
        ['生成模型', main?.model === 'fast' ? '快模型（速度优先）' : '强模型（质量优先）'],
        ['知识库子 Agent', kbSubs.length ? kbSubs.join('、') : '无'],
        ['主 Agent 子 Agent', mainSubs.length ? `${mainSubs.length} 个（${mainSubs.join('、')}）` : '无'],
        ['审核重试上限', String(review?.retryMax ?? 2)],
      ],
    }
  }
  const saveCustomTemplate = () => {
    const name = saveTplName.trim()
    if (!name) return
    const next = [...customTemplates, { name, desc: '自定义模板', agents }]
    setCustomTemplates(next)
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next))
    setSelectedTpl(name)
    setSaveTplName('')
    setShowNewTplModal(false)
  }
  const removeCustomTemplate = (name: string) => {
    const next = customTemplates.filter(t => t.name !== name)
    setCustomTemplates(next)
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(next))
    if (selectedTpl === name) setSelectedTpl(null)
  }

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左侧栏：仅两个区块导航 + 模板/导入导出 */}
      <div className="w-44 bg-[var(--bg-sidebar)] border-r hairline flex flex-col flex-shrink-0">
        <div className="p-2 flex flex-col gap-1">
          {BLOCKS.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setBlock(key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                block === key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ========== Agent 管理 ========== */}
        {block === 'agents' && (
          <div className="flex items-start gap-5">
          <div className="max-w-2xl flex flex-col gap-5 flex-1 min-w-0">
            {/* 横向 Agent 按钮 */}
            <div className="flex gap-2 flex-wrap">
              {agents.map(a => (
                <button key={a.id} onClick={() => setSelectedId(a.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-all ${
                    a.id === selectedId
                      ? 'border-[var(--border-strong)] bg-[#1a1a1a] text-white shadow-soft'
                      : 'border hairline bg-[var(--bg-panel)] text-dim hover:bg-[var(--bg-hover)]'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${a.enabled === false ? 'bg-red-400' : 'bg-green-500'}`} title={a.enabled === false ? '已禁用' : '启用中'} />
                  {a.name}
                </button>
              ))}
            </div>

            {agent && (
              <>
                {/* 标题行 */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{agent.name}</h2>
                  </div>
                  {agent.id === 'review' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-dim">审核重试上限</span>
                      <input type="number" min={1} max={5}
                        value={agent.retryMax ?? 2}
                        onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1 && n <= 5) commit({ retryMax: n }) }}
                        className="w-16 px-2 py-1.5 text-xs input-surface rounded-lg outline-none text-center" />
                    </div>
                  )}
                </div>

                {/* 上下结构：全局性提示词 + Skill 模块 */}
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className={fieldLabel}>全局性提示词</label>
                      <button onClick={() => setEditPrompt(!editPrompt)}
                        className="text-[10px] px-2 py-1 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                        {editPrompt ? '完成' : '编辑'}
                      </button>
                    </div>
                    {editPrompt ? (
                      <textarea value={prompt} onChange={e => { setPrompt(e.target.value); commit({ systemPrompt: e.target.value }) }} rows={10}
                        className="flex-1 w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                    ) : (
                      <div className="flex-1 w-full border hairline rounded-xl px-4 py-3.5 bg-[var(--bg-input)] overflow-y-auto">
                        <FormattedText text={prompt} />
                      </div>
                    )}
                  </div>

                </div>
              </>
            )}
          </div>
          {/* 右侧：Skill 模块（上）+ 子 Agent（下） */}
          <div className="w-[520px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
            {/* Skill 模块：一排放三个 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1"><Folder size={13} /> Skill 模块</label>
                <button onClick={() => document.getElementById('agent-skill-upload')?.click()}
                  className="text-[10px] px-2 py-1 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">上传 Skill</button>
                <input id="agent-skill-upload" type="file" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {allSkills.map(s => {
                  const linked = linkedSkills.includes(s.name)
                  const disabled = skillEnabled[s.name] === false
                  return (
                    <button key={s.name} onClick={() => toggleSkill(s.name)}
                      title={s.description}
                      className={`relative rounded-xl border-2 flex flex-col transition-all ${
                        disabled ? 'opacity-30 cursor-not-allowed' :
                        linked ? 'border-[#1a1a1a] bg-[var(--bg-hover)]' : 'border-dashed border-[var(--border-color)] hover:border-[var(--border-strong)]'
                      }`}>
                      <img src={coverOf(s.name)} alt="" className="w-full h-16 object-cover rounded-t-[10px]" />
                      <span className="flex items-center justify-center gap-1.5 px-1 py-2">
                        <span className="text-[10px] font-medium leading-tight text-center truncate">{s.name}</span>
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); removeSkillFromAgent(s.name) }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600 transition-colors"
                        title="删除该 Skill">
                        <X size={9} />
                      </button>
                      <span className={`absolute right-1.5 bottom-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        linked ? 'border-[#1a1a1a]' : 'border-[var(--border-color)]'
                      }`}>
                        {linked && <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          {agent && agent.subAgents && agent.subAgents.length > 0 && (
            <div className="w-full flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-dim uppercase tracking-wider">子 Agent</p>
                <button onClick={() => { setSubName(''); setSubForm(''); setSubPrompt(''); setShowSubAdd(true) }}
                  className="text-[10px] px-2 py-1 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 添加能力</button>
              </div>
              {agent.id === 'main' ? (
                /* 主 Agent：保持单个「输出增强」卡片样式 */
                <div className="border hairline rounded-xl bg-[var(--bg-panel)] overflow-hidden">
                  <button onClick={() => setSubIntroOpen(true)}
                    className="w-full flex flex-col items-stretch gap-2.5 px-3.5 py-9 hover:bg-[var(--bg-hover)] transition-colors">
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-bold">输出增强</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim flex-shrink-0">子 Agent</span>
                      <span className="flex-1" />
                      <span className="text-[10px] text-dim">查看介绍</span>
                    </span>
                    <span className="text-[10px] text-dim leading-relaxed text-left">按需调用输出增强子 Agent 产出结构化内容，选择「输出增强」模板后才会调用。</span>
                  </button>
                </div>
              ) : (
              <div className="flex flex-col gap-2">
                {/* 子 Agent 卡片：每个子 Agent 独立一张（知识库管理 / 搜索增强），整块点击弹出介绍弹窗 */}
                {(agent.subAgents || []).map(s => (
                  <div key={s.id} className="border hairline rounded-xl bg-[var(--bg-panel)] overflow-hidden">
                    <button onClick={() => setSubIntroOpen(true)}
                      className="w-full flex flex-col items-stretch gap-2 px-3.5 py-4 hover:bg-[var(--bg-hover)] transition-colors">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-bold">{s.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim flex-shrink-0">{s.form}</span>
                        <span className="flex-1" />
                        <span className="text-[10px] text-dim">查看介绍</span>
                      </span>
                      <span className="text-[10px] text-dim leading-relaxed text-left line-clamp-2">{s.subPrompt}</span>
                    </button>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
          </div>
          {/* 子 Agent 介绍弹窗（点击卡片弹出，较小） */}
          {subIntroOpen && agent && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSubIntroOpen(false)}>
              <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md p-5 mx-4 flex flex-col gap-3.5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <p className="text-base font-bold">{agent.name} · 子 Agent</p>
                  <button onClick={() => setSubIntroOpen(false)} className="p-1 hover:bg-[var(--bg-hover)] rounded"><X size={16} /></button>
                </div>
                {/* 介绍 */}
                <p className="text-xs text-[var(--text-muted)] leading-loose">该 Agent 可自行调用特定功能性 Agent（子 Agent），完成对应形式的内容产出；当选择了输出增强选项后，才会调用这些能力。</p>
                {/* 能力列表 */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider">能力</p>
                  {(agent.subAgents || []).map(s => (
                    <div key={s.id} className="border hairline rounded-lg px-3 py-2.5 bg-[var(--bg-input)] flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold truncate">{s.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-panel)] text-dim flex-shrink-0">{s.form}</span>
                        <span className="flex-1" />
                        <button onClick={() => setSubEditing({ id: s.id, name: s.name, form: s.form, subPrompt: s.subPrompt })}
                          className="text-[10px] text-[var(--accent)]">编辑</button>
                        <button onClick={() => commit({ subAgents: (agent.subAgents || []).filter(x => x.id !== s.id) })}
                          className="text-[10px] text-red-500">删除</button>
                      </div>
                      <p className="text-[10px] text-dim leading-loose">- 职责：{s.subPrompt}</p>
                    </div>
                  ))}
                  <button onClick={() => { setSubIntroOpen(false); setSubName(''); setSubForm(''); setSubPrompt(''); setShowSubAdd(true) }}
                    className="py-2 rounded-xl border hairline text-xs text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 添加能力</button>
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        {/* ========== Skill 管理 ========== */}
        {block === 'skills' && (
          <div className="max-w-5xl flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2"><Layers size={16} /> Skill 管理</h2>
            </div>
            {/* 四个接入区 tab */}
            <div className="flex gap-1.5 flex-wrap">
              {SKILL_TABS.map(t => (
                <button key={t.key} onClick={() => setSkillTab(t.key)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    skillTab === t.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
                  }`}>{t.label}</button>
              ))}
            </div>

            {/* 已安装：分类栏 + 卡片网格（点击展开详情，无启用开关） */}
            {skillTab === 'installed' && (
              <div className="flex min-h-0">
                <div className="w-36 flex-shrink-0 border-r hairline p-2 flex flex-col gap-1 overflow-y-auto">
                  {SKILL_CATS.map(c => (
                    <button key={c.key} onClick={() => setSkillCat(c.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                        skillCat === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
                      }`}>
                      <Wrench size={13} /> {c.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1">
                  {(() => {
                    const filtered = skillCat === 'all' ? allSkills : allSkills.filter(s => (SKILL_CAT_MAP[s.name] || '其他') === skillCat)
                    if (filtered.length === 0) return <p className="text-xs text-dim text-center py-10">该分类暂无 Skill</p>
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.map(s => {
                          return (
                            <div key={s.name} onClick={() => setSkillDetail({ name: s.name, description: s.description, folder: s.folder, category: SKILL_CAT_MAP[s.name] || '其他' })}
                              className="card-surface rounded-2xl flex flex-col cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 overflow-hidden">
                              <img src={coverOf(s.name)} alt="" className="w-full h-20 object-cover" />
                              <div className="p-4 flex flex-col gap-2">
                                <div className="flex items-start justify-between">
                                  <span className="text-sm font-semibold truncate">{s.name}</span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim flex-shrink-0">{SKILL_CAT_MAP[s.name] || '其他'}</span>
                                </div>
                                <p className="text-[11px] text-dim truncate">{s.description}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* 推荐市场：卡片网格（点击弹出详情） */}
            {skillTab === 'market' && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {MARKET_SKILLS.map(s => {
                    const installed = allSkills.some(x => x.name === s.name)
                    return (
                      <div key={s.name} onClick={() => setSkillDetail({ name: s.name, description: s.desc, folder: '内置', category: s.category })}
                        className="card-surface rounded-2xl flex flex-col cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 overflow-hidden">
                        <img src={coverOf(s.name)} alt="" className="w-full h-20 object-cover" />
                        <div className="p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-semibold truncate">{s.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim">{s.category}</span>
                              {installed && <span className="text-[10px] text-green-600">已安装</span>}
                            </div>
                          </div>
                          <p className="text-[11px] text-dim truncate">{s.desc}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* MCP 市场：三步引导从聚合平台接入 */}
            {skillTab === 'mcp' && (
              <div className="flex flex-col gap-3">
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] text-xs text-dim leading-relaxed">
                  <p className="font-semibold text-[var(--text)] mb-1.5">三步接入外部 Skill（MCP 标准协议）</p>
                  <p className="mb-1">1. 在聚合平台搜索所需 MCP Server（如 filesystem / github / fetch）</p>
                  <p className="mb-1">2. 复制其安装命令（stdio：npx xxx）或连接地址（http/sse：URL）</p>
                  <p className="mb-1">3. 粘贴到下方「我的 MCP Server」完成登记（后端连接与调用能力开发中）</p>
                </div>
                {/* 平台链接 */}
                <div className="flex flex-wrap gap-2">
                  {MCP_PLATFORMS.map(p => (
                    <a key={p.name} href={p.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border hairline text-xs text-dim hover:bg-[var(--bg-hover)] transition-colors">
                      <ExternalLink size={12} /> {p.name}
                      <span className="text-[10px] text-dim">{p.desc}</span>
                    </a>
                  ))}
                </div>
                {/* 我的 MCP Server 列表 */}
                {mcpList.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {mcpList.map(s => (
                      <div key={s.id} className="flex items-center gap-2 border hairline rounded-lg px-3 py-2 bg-[var(--bg-panel)]">
                        <span className="text-[11px] font-semibold flex-shrink-0">{s.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-dim flex-shrink-0">{s.type}</span>
                        <span className="text-[10px] text-dim truncate flex-1 font-mono">{s.target}</span>
                        <button onClick={() => removeMcpServer(s.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {/* 添加表单 */}
                {mcpStep === 1 ? (
                  <button onClick={() => setMcpStep(2)}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-dim hover:bg-[var(--bg-hover)] rounded-xl self-start transition-colors">
                    <Plus size={12} /> 添加我的 MCP Server
                  </button>
                ) : (
                  <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
                    <input autoFocus value={mcpName} onChange={e => setMcpName(e.target.value)} placeholder="名称（如 github-tools）"
                      className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
                    <div className="flex gap-1.5">
                      {(['stdio', 'http', 'sse'] as const).map(t => (
                        <button key={t} onClick={() => setMcpType(t)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${mcpType === t ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim'}`}>{t.toUpperCase()}</button>
                      ))}
                    </div>
                    <input value={mcpTarget} onChange={e => setMcpTarget(e.target.value)} placeholder={mcpType === 'stdio' ? '命令（如 npx @modelcontextprotocol/server-github）' : 'URL（如 http://localhost:8080/mcp）'}
                      className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setMcpStep(1)} className="px-3 py-1.5 text-[11px] text-dim row-hover rounded-lg">取消</button>
                      <button onClick={addMcpServer} className="px-3 py-1.5 text-[11px] bg-[#1a1a1a] text-white rounded-lg font-semibold">保存</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 开发者：模板下载 + 接入说明 */}
            {skillTab === 'dev' && (
              <div className="flex flex-col gap-3">
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] text-xs text-dim leading-relaxed">
                  <p className="font-semibold text-[var(--text)] mb-1.5">开发自己的 Skill</p>
                  <p className="mb-1">1. 下载下方模板，按示例实现 <span className="font-mono">execute</span> 方法</p>
                  <p className="mb-1">2. 将文件夹放入后端 <span className="font-mono">skills/</span> 目录（或上传目录）</p>
                  <p className="mb-1">3. 重启后端容器，Skill 自动注册，即可在「已安装」中查看并启用</p>
                </div>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11px] border hairline rounded-xl text-dim hover:bg-[var(--bg-hover)] self-start transition-colors">
                  <Download size={12} /> 下载 Skill 开发模板
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========== 对话 ========== */}
        {block === 'templates' && (
          <div className="max-w-3xl flex flex-col gap-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><LayoutTemplate size={18} /> 对话</h2>

            {/* 全局性基础设定（独立界面：所有模式共有，先介绍再选模式） */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-dim uppercase tracking-wider">全局性基础设定（所有模式共有）</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['搜索机制', '固定搜索规则：优质信息源（优质社区、官方信息），并行搜索 agent 返回 10-20 条优质内容（思考/研究档共享）'],
                  ['知识库管理', '后台入库（切片/向量化）；对话中按主 Agent 判定按需检索；联网搜索由主 Agent 派发搜索子 Agent 执行'],
                  ['学情画像', '后台提炼画像文档（基本情况/学习情况/阅读偏好），生成时直接注入（0 对话时间）'],
                  ['上下文自动压缩', '每满 30 条后台压缩最早 30% 为会话摘要；历史细节可向量召回'],
                  ['特殊形式输出', '回答完成后模型判断适合的形式并建议（与档位无关）'],
                ].map(([t, d]) => (
                  <div key={t} className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-1">
                    <span className="text-[11px] font-semibold">{t}</span>
                    <span className="text-[10px] text-dim leading-snug">{d}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-dim leading-relaxed">以下机制对所有对话模式生效：搜索、知识库、学情、压缩、特殊形式输出在后台或按需运行，不随档位变化。模式之间的差异（响应速度、内容量、检测强度）由下方模式按钮决定。</p>
            </div>

            {/* 具体模式：三个按钮，点击展示详情 */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-dim uppercase tracking-wider">具体模式</p>
              <div className="flex gap-2 flex-wrap items-center">
                {PRESET_TEMPLATES.map(t => (
                  <button key={t.name} onClick={() => setSelectedTpl(selectedTpl === t.name ? null : t.name)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-all ${
                      selectedTpl === t.name
                        ? 'border-[var(--border-strong)] bg-[#1a1a1a] text-white shadow-soft'
                        : 'border hairline bg-[var(--bg-panel)] text-dim hover:bg-[var(--bg-hover)]'
                    }`}>
                    <LayoutTemplate size={13} /> {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 选中模式详情（按钮下方展示） */}
            {selectedTpl && (() => {
              const tpl = PRESET_TEMPLATES.find(t => t.name === selectedTpl)
              if (!tpl) return null
              const info = tplInfo(tpl)
              return (
                <div className="flex flex-col gap-4">
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider">{tpl.name} 模式详情</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-semibold text-dim uppercase tracking-wider">适用场景</p>
                      <FormattedText text={info.intro} />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <p className="text-xs font-semibold text-dim uppercase tracking-wider">内部细节设定<span className="ml-1 text-[9px] font-normal text-dim/70">（预设，仅展示）</span></p>
                      {info.detail.map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-dim uppercase tracking-wider">{k}</span>
                          <span className="text-[11px] leading-relaxed text-[var(--text-muted)]">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>
      {/* 中间层 Agent 设定弹窗（点击图中圆心节点打开） */}
      {showMidAgent && agent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowMidAgent(false)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md p-5 mx-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <p className="text-base font-bold">{midName}</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">该 Agent 可自行调用特定功能性 Agent（子 Agent），完成对应形式的内容产出。</p>
            <div className="flex flex-col gap-2">
              {(agent.subAgents || []).map(s => (
                <div key={s.id} className="flex items-center gap-2 border hairline rounded-xl px-3 py-2 bg-[var(--bg-input)]">
                  <span className="text-xs font-medium truncate">{s.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--bg-panel)] text-dim flex-shrink-0">{s.form}</span>
                  <button onClick={() => { setShowMidAgent(false); setSubEditing({ id: s.id, name: s.name, form: s.form, subPrompt: s.subPrompt }) }}
                    className="ml-auto text-[10px] text-[var(--accent)] hover:underline">编辑</button>
                </div>
              ))}
            </div>
            <button onClick={() => { setShowMidAgent(false); setSubName(''); setSubForm(''); setSubPrompt(''); setShowSubAdd(true) }}
              className="py-2 rounded-xl border hairline text-xs text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 添加子 Agent</button>
            <button onClick={() => setShowMidAgent(false)} className="py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-medium">关闭</button>
          </div>
        </div>
      )}
      {/* 子 Agent 编辑弹窗（点击图中节点进入设定） */}
      {subEditing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSubEditing(null)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md p-5 mx-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <p className="text-base font-bold">编辑子 Agent</p>
            <input autoFocus value={subEditing.name} onChange={e => setSubEditing({ ...subEditing, name: e.target.value })} placeholder="名称"
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
            <input value={subEditing.form} onChange={e => setSubEditing({ ...subEditing, form: e.target.value })} placeholder="输出形式"
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
            <textarea value={subEditing.subPrompt} onChange={e => setSubEditing({ ...subEditing, subPrompt: e.target.value })} rows={4}
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none resize-none" />
            <div className="flex gap-2 justify-between items-center">
              <button onClick={() => { if (agent) commit({ subAgents: (agent.subAgents || []).filter(x => x.id !== subEditing.id) }); setSubEditing(null) }}
                className="px-4 py-2 text-xs text-red-500 row-hover rounded-lg">删除</button>
              <div className="flex gap-2">
                <button onClick={() => setSubEditing(null)} className="px-4 py-2 text-xs text-dim row-hover rounded-lg">取消</button>
                <button onClick={() => {
                  if (!agent) return
                  if (!subEditing.name.trim() || !subEditing.subPrompt.trim()) return
                  commit({ subAgents: (agent.subAgents || []).map(x => x.id === subEditing.id ? { ...x, name: subEditing.name.trim(), form: subEditing.form.trim(), subPrompt: subEditing.subPrompt.trim() } : x) })
                  setSubEditing(null)
                }} className="px-4 py-2 text-xs bg-[#1a1a1a] text-white rounded-lg font-semibold">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 子 Agent 添加弹窗 */}
      {showSubAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowSubAdd(false)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-md p-5 mx-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <p className="text-base font-bold">添加子 Agent</p>
            <input autoFocus value={subName} onChange={e => setSubName(e.target.value)} placeholder="名称（如：树状结构）"
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
            <input value={subForm} onChange={e => setSubForm(e.target.value)} placeholder="输出形式（如：树状 / 卡片 / 解析）"
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
            <textarea value={subPrompt} onChange={e => setSubPrompt(e.target.value)} placeholder="职责提示词（子 Agent 被调用时执行的专项任务）" rows={4}
              className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none resize-none" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSubAdd(false)} className="px-4 py-2 text-xs text-dim row-hover rounded-lg">取消</button>
              <button onClick={() => {
                if (!subName.trim() || !subPrompt.trim()) return
                if (block !== 'agents' || !agent) return
                const next = [...(agent.subAgents || []), { id: 'sub-' + Date.now(), name: subName.trim(), subPrompt: subPrompt.trim(), form: subForm.trim() }]
                commit({ subAgents: next })
                setShowSubAdd(false)
              }} className="px-4 py-2 text-xs bg-[#1a1a1a] text-white rounded-lg font-semibold">添加</button>
            </div>
          </div>
        </div>
      )}
      {/* 新建模板弹窗 */}
      {showNewTplModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowNewTplModal(false)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-sm p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2">新建模板</h3>
            <p className="text-[11px] text-dim mb-4">将当前 Agent 团队配置保存为自定义模板。</p>
            <input autoFocus value={saveTplName} onChange={e => setSaveTplName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveCustomTemplate() }}
              placeholder="模板名称" className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewTplModal(false)} className="px-4 py-2 text-xs text-dim row-hover rounded-lg">取消</button>
              <button onClick={saveCustomTemplate} className="px-4 py-2 text-xs bg-[#1a1a1a] text-white rounded-lg font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}
      {/* Skill 详情弹窗（独立小窗口） */}
      {skillDetail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSkillDetail(null)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b hairline flex-shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2"><Wrench size={16} /> {skillDetail.name}</h3>
              <button onClick={() => setSkillDetail(null)} className="p-1 hover:bg-[var(--bg-hover)] rounded"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim">{skillDetail.category}</span>
                <span className="text-[10px] text-dim font-mono">{skillDetail.folder}</span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{skillDetail.description}</p>
              <button
                onClick={() => {
                  if (skillSource !== null) { setSkillSource(null); return }
                  setSkillSrcLoading(true)
                  fetch('/api/skills/' + encodeURIComponent(skillDetail.name) + '/source', { cache: 'no-store' })
                    .then(r => r.json()).then(d => { setSkillSource(d.source || '（无源码）') })
                    .catch(() => setSkillSource('（加载失败）'))
                    .finally(() => setSkillSrcLoading(false))
                }}
                className="w-fit text-[10px] px-2.5 py-1.5 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1">
                <Code2 size={11} /> {skillSource !== null ? '收起实现' : '查看实现'}
              </button>
              {skillSrcLoading && <p className="text-[11px] text-dim">加载中…</p>}
              {skillSource !== null && (
                <pre className="text-[11px] font-mono leading-relaxed bg-[var(--bg-input)] border hairline rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{skillSource}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
