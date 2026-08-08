import { useState, useEffect, useRef } from 'react'
import { Settings, Square, Upload, Folder, Activity, Download, Layers, Wrench, Store, ExternalLink, FileCode, Plus, Trash2, LayoutTemplate, X, Workflow, Brain, Database, Scale, CheckCircle2 } from 'lucide-react'
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

const MODEL_OPTIONS = [
  { key: 'global', label: '跟随全局' },
  { key: 'main', label: '强模型' },
  { key: 'fast', label: '快模型' },
] as const

/** Agent id → 其工作流节点（运行监控按节点过滤） */
const NODE_BY_AGENT: Record<string, string[]> = {
  main: ['plan', 'generate'], study: ['study_memory'], kb: ['kb'], review: ['review'],
}

/** 预设模板库 */
const PRESET_TEMPLATES: Array<{ name: string; desc: string; agents: AgentConfig[] }> = [
  { name: '标准 4-Agent 团队', desc: '与默认一致', agents: DEFAULT_AGENTS },
  {
    name: '质量优先', desc: '审核更严格（重试 3 次、严格模式）',
    agents: DEFAULT_AGENTS.map(a => a.id === 'review' ? { ...a, retryMax: 3, mode: '严格' } : { ...a }),
  },
  {
    name: '响应更快', desc: '主 Agent 生成也使用快模型',
    agents: DEFAULT_AGENTS.map(a => a.id === 'main' ? { ...a, model: 'fast' } : { ...a }),
  },
]

const SKILL_ENABLED_KEY = 'coagent-skill-enabled'
const CUSTOM_TEMPLATES_KEY = 'coagent-custom-templates'

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
  { key: 'templates', icon: LayoutTemplate, label: '模板与编排' },
]

/** 编排节点图：节点 + 箭头 */
function FlowNode({ icon: Icon, name, sub, active, onClick }: { icon: any; name: string; sub?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`card-surface rounded-xl px-4 py-3 flex flex-col items-center gap-1.5 min-w-[96px] border-2 transition-all ${
        onClick ? 'cursor-pointer hover:border-[var(--accent)]' : ''
      } ${active ? 'border-[var(--accent)] shadow-soft' : 'border-[var(--border-color)]'}`}>
      {Icon && <Icon size={18} className={active ? 'text-[var(--accent)]' : 'text-dim'} />}
      <span className="text-xs font-bold">{name}</span>
      {sub && <span className="text-[10px] text-dim text-center leading-snug">{sub}</span>}
    </button>
  )
}
const FlowArrow = () => <span className="text-dim flex-shrink-0 text-base">→</span>

/** 4-Agent 编排节点图：节点可点击选中 Agent（无 agents 参数时静态展示） */
const FlowGraph = ({ agents, templateAgentId, onSelect }: { agents?: AgentConfig[]; templateAgentId?: string; onSelect?: (id: string) => void }) => {
  const act = (id: string) => templateAgentId === id
  const pick = (id: string) => onSelect ? () => onSelect(id) : undefined
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <FlowNode icon={Workflow} name="规划" sub="输入处理·调度" active={act('main')} onClick={pick('main')} />
      <FlowArrow />
      <div className="flex flex-col gap-1 items-center">
        <FlowNode icon={Brain} name="学情与记忆" sub="画像·记忆" active={act('study')} onClick={pick('study')} />
        <span className="text-[9px] text-dim">∥ 并行</span>
        <FlowNode icon={Database} name="知识库" sub="检索·搜索" active={act('kb')} onClick={pick('kb')} />
      </div>
      <FlowArrow />
      <FlowNode icon={Workflow} name="生成" sub="讲义·指南·测试" active={act('main')} onClick={pick('main')} />
      <FlowArrow />
      <FlowNode icon={Scale} name="审核" sub="符实·难度·规范" active={act('review')} onClick={pick('review')} />
      <FlowArrow />
      <FlowNode icon={CheckCircle2} name="输出" sub="最终结果" />
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
  const [mode, setMode] = useState(agent?.mode || '标准')
  const [prompt, setPrompt] = useState(agent?.systemPrompt || '')
  const [example, setExample] = useState(agent?.example || '')
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([])
  const [linkedSkills, setLinkedSkills] = useState<string[]>([])
  // Skill 全局启用开关（localStorage）
  const [skillEnabled, setSkillEnabled] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(SKILL_ENABLED_KEY) || '{}') } catch { return {} }
  })
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  // Skill 详情弹窗（独立小窗口）
  const [skillDetail, setSkillDetail] = useState<{ name: string; description: string; folder: string; category: string } | null>(null)
  // 模板与编排：Agent 自定义选中的 Agent
  const [templateAgentId, setTemplateAgentId] = useState(agents[0]?.id || '')
  // 模板与编排：选中模板（展开详情）、自定义模板、保存名称
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null)
  const [customTemplates, setCustomTemplates] = useState<Array<{ name: string; desc: string; agents: AgentConfig[] }>>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]') } catch { return [] }
  })
  const [saveTplName, setSaveTplName] = useState('')
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
  // 该 Agent 的运行监控（最近任务中其节点的耗时/调用）
  const [agentRuns, setAgentRuns] = useState<Array<{ created_at: string; ms: number; calls: number }>>([])
  // 模板 / 导入导出
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMode(agent?.mode || '标准')
    setPrompt(agent?.systemPrompt || '')
    setExample(agent?.example || '')
    fetch('/api/skills').then(r => r.json()).then(d => {
      setAllSkills(d.skills || [])
      const names = (agent?.skill || '').match(/[a-z_]+/g) || []
      setLinkedSkills(names.filter((n: string) => (d.skills || []).some((s: SkillInfo) => s.name === n)))
    })
  }, [selectedId])

  // 运行监控：该 Agent 最近任务统计（按节点过滤）
  useEffect(() => {
    if (block !== 'agents' || !agent || !projectId) return
    const nodes = NODE_BY_AGENT[agent.id] || []
    fetch('/api/task-stats?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => {
        const runs = (d.tasks || []).map((t: any): { created_at: string; ms: number; calls: number } => {
          const data = t.data || {}
          let ms = 0, calls = 0
          for (const n of nodes) { const v = data[n]; if (v) { ms += v.ms || 0; calls += v.llm_calls || 0 } }
          return { created_at: t.created_at || '', ms, calls }
        }).filter((r: { created_at: string; ms: number; calls: number }) => r.ms > 0).slice(0, 5)
        setAgentRuns(runs)
      }).catch(() => setAgentRuns([]))
  }, [block, agent?.id, projectId])

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

  // ---------- 导出 / 导入 ----------
  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(agents, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'coagent-agents.json'; a.click()
    URL.revokeObjectURL(url)
  }
  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result))
        if (Array.isArray(arr) && arr.length && arr.every((x: any) => x && x.id && x.name)) {
          if (window.confirm(`导入 ${arr.length} 个 Agent 配置？将覆盖当前全部配置。`)) onReplace(arr)
        } else {
          window.alert('配置文件格式不正确（需为 AgentConfig 数组）')
        }
      } catch {
        window.alert('解析失败：不是有效的 JSON')
      }
    }
    reader.readAsText(f)
    e.target.value = ''
  }

  const fieldLabel = 'text-xs font-semibold text-dim uppercase tracking-wider mb-2 block'
  // 模板与编排：当前自定义 Agent + 保存
  const tplAgent = agents.find(a => a.id === templateAgentId) || agents[0]
  const commitTpl = (patch: Partial<AgentConfig>) => { if (tplAgent) onSave({ ...tplAgent, ...patch }) }
  // 模板与编排：模板集合（预设 + 自定义）、应用、保存自定义
  const allTemplates = [...PRESET_TEMPLATES, ...customTemplates]
  const applyTemplate = (t: { name: string; agents: AgentConfig[] }) => {
    if (window.confirm(`应用模板「${t.name}」？将覆盖当前全部 Agent 配置。`)) {
      onReplace(t.agents); setSelectedId(t.agents[0]?.id || ''); setTemplateAgentId(t.agents[0]?.id || '')
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
          <div className="max-w-2xl flex flex-col gap-5">
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

                {/* 职责说明 */}
                {agent.role && (
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">{agent.role}</p>
                  </div>
                )}

                {/* 网格：全局性提示词 + Skill 模块 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>全局性提示词</label>
                    <textarea value={prompt} onChange={e => { setPrompt(e.target.value); commit({ systemPrompt: e.target.value }) }} rows={10}
                      className="flex-1 w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`${fieldLabel} flex items-center gap-1`}><Folder size={13} /> Skill 模块</label>
                    <div className="flex flex-wrap gap-3">
                      {allSkills.map(s => {
                        const linked = linkedSkills.includes(s.name)
                        const disabled = skillEnabled[s.name] === false
                        return (
                          <button key={s.name} onClick={() => toggleSkill(s.name)}
                            title={s.description}
                            className={`relative w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                              disabled ? 'opacity-30 cursor-not-allowed' :
                              linked ? 'border-[#1a1a1a] bg-[var(--bg-hover)]' : 'border-dashed border-[var(--border-color)] hover:border-[var(--border-strong)]'
                            }`}>
                            <Square size={16} className={linked ? 'text-[#1a1a1a]' : 'text-dim'} />
                            <span className="text-[10px] font-medium leading-tight text-center px-1 truncate w-full">{s.name}</span>
                            {/* 右下角 radio：选中实心、未选中空心 */}
                            <span className={`absolute right-1.5 bottom-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              linked ? 'border-[#1a1a1a]' : 'border-[var(--border-color)]'
                            }`}>
                              {linked && <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />}
                            </span>
                          </button>
                        )
                      })}
                      <button className="w-20 h-20 rounded-xl border-2 border-dashed border-[var(--border-color)] flex flex-col items-center justify-center gap-1 hover:border-[var(--border-strong)] transition-colors"
                        onClick={() => document.getElementById('agent-skill-upload')?.click()}>
                        <Upload size={16} className="text-dim" />
                        <span className="text-[10px] text-dim">上传</span>
                        <input id="agent-skill-upload" type="file" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 输入输出示例（few-shot） */}
                <div>
                  <label className={fieldLabel}>输入输出示例（few-shot）</label>
                  <textarea value={example} onChange={e => { setExample(e.target.value); commit({ example: e.target.value }) }} rows={4}
                    placeholder="可选：粘贴一段 输入→输出 的 JSON 示例，帮助该 Agent 稳定输出格式"
                    className="w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                </div>

                {/* 该 Agent 运行监控 */}
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                  <p className={`${fieldLabel} flex items-center gap-1`}><Activity size={13} /> 运行监控（该 Agent 最近任务）</p>
                  {agentRuns.length === 0 ? (
                    <p className="text-[11px] text-dim">暂无运行记录，发送消息后自动统计</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {agentRuns.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="text-dim flex-1 truncate">{r.created_at || '—'}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                            <div className="h-full rounded-full bg-[#1a1a1a]" style={{ width: Math.max(4, Math.min(100, r.ms / 20)) + '%' }} />
                          </div>
                          <span className="text-dim w-24 text-right">{r.ms}ms{r.calls ? ` ×${r.calls}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========== Skill 管理 ========== */}
        {block === 'skills' && (
          <div className="max-w-3xl flex flex-col gap-4">
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
                              className="card-surface rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                              <div className="flex items-start justify-between">
                                <span className="w-10 h-10 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center"><Wrench size={17} /></span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim">{SKILL_CAT_MAP[s.name] || '其他'}</span>
                              </div>
                              <p className="text-sm font-semibold truncate">{s.name}</p>
                              <p className="text-[11px] text-dim truncate">{s.description}</p>
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
                        className="card-surface rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1">
                        <div className="flex items-start justify-between">
                          <span className="w-10 h-10 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center"><Store size={17} /></span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim">{s.category}</span>
                            {installed && <span className="text-[10px] text-green-600">已安装</span>}
                          </div>
                        </div>
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        <p className="text-[11px] text-dim truncate">{s.desc}</p>
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

        {/* ========== 模板与编排 ========== */}
        {block === 'templates' && (
          <div className="max-w-3xl flex flex-col gap-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><LayoutTemplate size={18} /> 模板与编排</h2>

            {/* 预设模板：点击展开详情 */}
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 flex-wrap">
                {allTemplates.map(t => (
                  <div key={t.name} className="relative group flex-shrink-0">
                    <button onClick={() => setSelectedTpl(selectedTpl === t.name ? null : t.name)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-all ${
                        selectedTpl === t.name ? 'border-[var(--border-strong)] bg-[#1a1a1a] text-white shadow-soft' : 'border hairline bg-[var(--bg-panel)] text-dim hover:bg-[var(--bg-hover)]'
                      }`}>
                      <LayoutTemplate size={13} /> {t.name}
                    </button>
                    {customTemplates.some(c => c.name === t.name) && (
                      <button onClick={(e) => { e.stopPropagation(); removeCustomTemplate(t.name) }}
                        className="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center shadow" title="删除模板">
                        <X size={9} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(() => { const t = allTemplates.find(x => x.name === selectedTpl); if (!t) return null; return (
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{t.name}</p>
                    <span className="text-[11px] text-dim">{t.desc}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => applyTemplate(t)}
                      className="px-3.5 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
                      应用此模板
                    </button>
                    <button onClick={() => { applyTemplate(t); setSelectedTpl(t.name) }}
                      className="px-3.5 py-2 text-xs border hairline text-dim hover:bg-[var(--bg-hover)] rounded-xl transition-colors">
                      以此为基础自定义
                    </button>
                  </div>
                </div>
              ) })()}
            </div>

            {/* 编排框架设定（伴随编排，节点图内直接点击 Agent 展开设定） */}
            <div className="flex flex-col gap-4">
              <p className="text-xs font-semibold text-dim uppercase tracking-wider">编排框架设定</p>
              <div className="flex gap-4 items-stretch">
                {/* 左：节点图 */}
                <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex items-center justify-center flex-1">
                  <FlowGraph agents={agents} templateAgentId={templateAgentId} onSelect={(id) => setTemplateAgentId(id)} />
                </div>
                {/* 右：选中 Agent 设定栏（淡边框 + 色块） */}
                <div className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-hover)] flex-1 flex flex-col gap-4">
                  {tplAgent ? (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">{tplAgent.name}</p>
                        {tplAgent.id === 'review' && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-dim">重试上限</span>
                            <input type="number" min={1} max={5} value={tplAgent.retryMax ?? 2}
                              onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1 && n <= 5) commitTpl({ retryMax: n }) }}
                              className="w-16 px-2 py-1.5 text-xs input-surface rounded-lg outline-none text-center" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">模型选择</p>
                        <div className="flex gap-2">
                          {MODEL_OPTIONS.map(o => (
                            <button key={o.key} onClick={() => commitTpl({ model: o.key })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                (tplAgent.model || 'global') === o.key ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-panel)] text-dim hover:bg-[var(--bg-active)]'
                              }`}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">模式</p>
                        <div className="flex gap-2">
                          {tplAgent.modes.map(m => (
                            <button key={m.label} onClick={() => commitTpl({ mode: m.label })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                tplAgent.mode === m.label ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-panel)] text-dim hover:bg-[var(--bg-active)]'
                              }`}>{m.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">全局性提示词</p>
                        <textarea value={tplAgent.systemPrompt} onChange={e => commitTpl({ systemPrompt: e.target.value })} rows={4}
                          className="w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">输入输出示例（few-shot）</p>
                        <textarea value={tplAgent.example || ''} onChange={e => commitTpl({ example: e.target.value })} rows={3}
                          placeholder="可选：粘贴 输入→输出 JSON 示例"
                          className="w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-dim text-center py-10">点击左侧节点选择 Agent</p>
                  )}
                </div>
              </div>
              {/* 保存为自定义模板 */}
              <div className="flex gap-2 items-center">
                <input value={saveTplName} onChange={e => setSaveTplName(e.target.value)} placeholder="自定义模板名称"
                  className="flex-1 px-3 py-2 text-xs input-surface rounded-lg outline-none" />
                <button onClick={saveCustomTemplate}
                  className="px-3.5 py-2 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors flex-shrink-0">
                  保存为自定义模板
                </button>
              </div>
            </div>

            {/* 导入导出 */}
            <div className="flex gap-2">
              <button onClick={exportConfig}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                <Download size={13} /> 导出配置
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
                <Upload size={13} /> 导入配置
              </button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
            </div>
          </div>
        )}
      </div>
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
