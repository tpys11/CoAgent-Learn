import { useState, useEffect, useRef } from 'react'
import { Settings, Square, Upload, Folder, Activity, Download, Layers, Trash2, Wrench } from 'lucide-react'
import type { AgentConfig } from '../types'
import { DEFAULT_AGENTS } from '../types'

interface SkillInfo { name: string; description: string; folder: string }

interface Props {
  agents: AgentConfig[]
  onSave: (updated: AgentConfig) => void
  onReplace: (next: AgentConfig[]) => void
  projectId: string | null
}

type Block = 'agents' | 'skills' | 'monitor'

const MODEL_OPTIONS = [
  { key: 'global', label: '跟随全局' },
  { key: 'main', label: '强模型' },
  { key: 'fast', label: '快模型' },
] as const

/** 节点名 → 中文标签（运行监控展示） */
const NODE_LABEL: Record<string, string> = {
  plan: '规划', study_memory: '学情与记忆', kb: '知识库', generate: '生成', review: '审核',
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

const BLOCKS: Array<{ key: Block; icon: any; label: string }> = [
  { key: 'agents', icon: Settings, label: 'Agent 设置' },
  { key: 'skills', icon: Layers, label: 'Skill 管理' },
  { key: 'monitor', icon: Activity, label: '运行监控' },
]

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

/** Agent 系统：完整界面（设置 / Skill 管理 / 运行监控 三个区块） */
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
  // 运行监控
  const [tasks, setTasks] = useState<Array<{ dialogue_id: string; created_at: string; data: any }>>([])
  // 模板 / 导入导出
  const [showTemplates, setShowTemplates] = useState(false)
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

  // 运行监控：加载最近任务统计
  useEffect(() => {
    if (block !== 'monitor' || !projectId) return
    fetch('/api/task-stats?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setTasks(d.tasks || [])).catch(() => setTasks([]))
  }, [block, projectId])

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
  const inputCls = 'w-full px-3 py-2 text-xs input-surface rounded-xl outline-none'

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左侧栏：区块导航 + Agent 列表 + 模板/导入导出 */}
      <div className="w-52 bg-[var(--bg-sidebar)] border-r hairline flex flex-col flex-shrink-0">
        <div className="p-3 border-b hairline">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><Settings size={15} /> Agent 系统</h2>
        </div>
        <div className="p-2 flex flex-col gap-1 border-b hairline">
          {BLOCKS.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setBlock(key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
                block === key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {block === 'agents' && (
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {agents.map(a => (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  a.id === selectedId ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm' : 'hover:bg-white/60 text-dim'
                }`}>
                <span>{a.icon}</span>
                <span className="truncate flex-1">{a.name}</span>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.enabled === false ? 'bg-red-400' : 'bg-green-500'}`} title={a.enabled === false ? '已禁用' : '启用中'} />
              </button>
            ))}
          </div>
        )}
        {block !== 'agents' && <div className="flex-1" />}
        {/* 底部：模板 + 导入导出 */}
        <div className="p-2 border-t hairline flex flex-col gap-1.5">
          <div className="relative">
            <button onClick={() => setShowTemplates(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-dim hover:bg-[var(--bg-hover)] transition-colors">
              <Layers size={13} /> 预设模板
            </button>
            {showTemplates && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-panel)] border hairline rounded-xl shadow-xl z-10 p-1.5 flex flex-col gap-1">
                {PRESET_TEMPLATES.map(t => (
                  <button key={t.name}
                    onClick={() => {
                      if (window.confirm(`应用模板「${t.name}」？将覆盖当前全部 Agent 配置。`)) {
                        onReplace(t.agents); setShowTemplates(false); setSelectedId(t.agents[0]?.id || '')
                      }
                    }}
                    className="px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] text-left transition-colors">
                    <span className="block text-[11px] font-semibold">{t.name}</span>
                    <span className="block text-[10px] text-dim">{t.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button onClick={exportConfig} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
              <Download size={12} /> 导出
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">
              <Upload size={12} /> 导入
            </button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importConfig} />
          </div>
        </div>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* ========== Agent 设置 ========== */}
        {block === 'agents' && agent && (
          <div className="max-w-2xl flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{agent.icon}</span>
              <div>
                <h2 className="text-base font-bold">{agent.name}</h2>
                <p className="text-[11px] text-dim">id: {agent.id} · 改动即时自动保存</p>
              </div>
            </div>

            {/* 职责说明卡 */}
            {agent.role && (
              <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
                <p className={fieldLabel}>职责说明</p>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">{agent.role}</p>
              </div>
            )}

            {/* 启用 / 禁用 */}
            <div className="flex items-center justify-between border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
              <div>
                <p className="text-xs font-semibold">启用该 Agent</p>
                <p className="text-[10px] text-dim mt-0.5">
                  {agent.id === 'main' ? '主 Agent 为工作流核心，不可禁用' : '关闭后工作流将自动跳过该 Agent（如审核关闭则直接通过）'}
                </p>
              </div>
              <Toggle checked={agent.enabled !== false} disabled={agent.id === 'main'}
                onChange={() => commit({ enabled: !(agent.enabled !== false) })} />
            </div>

            {/* 模型选择 */}
            <div>
              <label className={fieldLabel}>模型选择</label>
              <div className="flex gap-2">
                {MODEL_OPTIONS.map(o => (
                  <button key={o.key} onClick={() => commit({ model: o.key })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      (agent.model || 'global') === o.key ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
                    }`}>{o.label}</button>
                ))}
              </div>
              <p className="text-[10px] text-dim mt-1.5">跟随全局 = 节点默认（生成用强模型、决策用快模型）；强/快模型可单独覆盖。</p>
            </div>

            {/* 记忆注入（主 Agent / 学情） */}
            {(agent.id === 'main' || agent.id === 'study') && (
              <div className="flex items-center justify-between border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
                <div>
                  <p className="text-xs font-semibold">记忆注入</p>
                  <p className="text-[10px] text-dim mt-0.5">
                    {agent.id === 'study' ? '关闭后不读取已有记忆（仍做学情分析）' : '关闭后生成时不注入学情画像'}
                  </p>
                </div>
                <Toggle checked={agent.memoryEnabled !== false}
                  onChange={() => commit({ memoryEnabled: !(agent.memoryEnabled !== false) })} />
              </div>
            )}

            {/* 审核重试上限 */}
            {agent.id === 'review' && (
              <div className="flex items-center justify-between border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
                <div>
                  <p className="text-xs font-semibold">审核重试上限</p>
                  <p className="text-[10px] text-dim mt-0.5">生成未通过审核时，最多重试并重新生成的次数</p>
                </div>
                <input type="number" min={1} max={5}
                  value={agent.retryMax ?? 2}
                  onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1 && n <= 5) commit({ retryMax: n }) }}
                  className="w-16 px-2 py-1.5 text-xs input-surface rounded-lg outline-none text-center" />
              </div>
            )}

            {/* 模式 */}
            <div>
              <label className={fieldLabel}>模式</label>
              <div className="flex gap-2">
                {agent.modes.map(m => (
                  <button key={m.label} onClick={() => { setMode(m.label); commit({ mode: m.label }) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      mode === m.label ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'
                    }`}>{m.label}</button>
                ))}
              </div>
            </div>

            {/* 全局性提示词 */}
            <div>
              <label className={fieldLabel}>全局性提示词</label>
              <textarea value={prompt} onChange={e => { setPrompt(e.target.value); commit({ systemPrompt: e.target.value }) }} rows={5}
                className="w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
            </div>

            {/* 输入输出示例（few-shot） */}
            <div>
              <label className={fieldLabel}>输入输出示例（few-shot）</label>
              <textarea value={example} onChange={e => { setExample(e.target.value); commit({ example: e.target.value }) }} rows={4}
                placeholder="可选：粘贴一段 输入→输出 的 JSON 示例，帮助该 Agent 稳定输出格式，例如：输入 level=beginner，输出 plan 数组调用学情与记忆管理"
                className="w-full px-3 py-2 border hairline rounded-xl text-xs font-mono outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
            </div>

            {/* Skill 卡片 */}
            <div>
              <label className={`${fieldLabel} flex items-center gap-1`}><Folder size={13} /> Skill 模块</label>
              <div className="flex flex-wrap gap-3">
                {allSkills.map(s => {
                  const linked = linkedSkills.includes(s.name)
                  const disabled = skillEnabled[s.name] === false
                  return (
                    <button key={s.name} onClick={() => toggleSkill(s.name)}
                      title={s.description}
                      className={`w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                        disabled ? 'opacity-30 cursor-not-allowed' :
                        linked ? 'border-[#1a1a1a] bg-[var(--bg-hover)]' : 'border-dashed border-[var(--border-color)] hover:border-[var(--border-strong)]'
                      }`}>
                      <Square size={16} className={linked ? 'text-[#1a1a1a]' : 'text-dim'} />
                      <span className="text-[10px] font-medium leading-tight text-center px-1 truncate w-full">{s.name}</span>
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
              <p className="text-[10px] text-dim mt-2">在「Skill 管理」中可查看详情与全局启用/停用</p>
            </div>
          </div>
        )}

        {/* ========== Skill 管理 ========== */}
        {block === 'skills' && (
          <div className="max-w-3xl flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2"><Layers size={16} /> Skill 管理</h2>
              <p className="text-[11px] text-dim mt-1">已注册的 Skill 模块：可查看详情、全局启用/停用</p>
            </div>
            <div className="flex flex-col gap-2">
              {allSkills.map(s => {
                const enabled = skillEnabled[s.name] !== false
                return (
                  <div key={s.name} className="card-surface rounded-xl p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center flex-shrink-0"><Wrench size={14} className="text-dim" /></span>
                      <button className="flex-1 text-left" onClick={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}>
                        <span className="block text-xs font-semibold">{s.name}</span>
                        <span className="block text-[10px] text-dim truncate">{s.description}</span>
                      </button>
                      <span className="text-[10px] text-dim font-mono flex-shrink-0">{s.folder}</span>
                      <Toggle checked={enabled} onChange={() => toggleSkillEnabled(s.name)} />
                    </div>
                    {expandedSkill === s.name && (
                      <div className="mt-2.5 pt-2.5 border-t hairline">
                        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{s.description}</p>
                        <p className="text-[10px] text-dim mt-1">目录：{s.folder}</p>
                      </div>
                    )}
                  </div>
                )
              })}
              {allSkills.length === 0 && <p className="text-xs text-dim text-center py-8">暂无已注册 Skill</p>}
            </div>
            {/* MCP 安装入口 */}
            <div className="border hairline rounded-xl p-4 text-xs text-dim bg-[var(--bg-panel)]">
              <p className="font-semibold text-[var(--text)] mb-1 flex items-center gap-1.5"><Wrench size={13} /> 从 MCP 安装 Skill</p>
              <p className="leading-relaxed">MCP 标准协议（HTTP/SSE）已列入项目技术选型。当前版本可通过「上传 Skill 目录」或将 Skill 放入 <span className="font-mono">skills/</span> 文件夹后刷新自动注册；独立 MCP Server 安装入口正在开发中。</p>
            </div>
          </div>
        )}

        {/* ========== 运行监控 ========== */}
        {block === 'monitor' && (
          <div className="max-w-3xl flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2"><Activity size={16} /> 运行监控</h2>
                <p className="text-[11px] text-dim mt-1">最近任务的各 Agent 耗时 / LLM 调用次数 / token 估算</p>
              </div>
              <button onClick={() => { if (projectId) fetch('/api/task-stats?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' }).then(r => r.json()).then(d => setTasks(d.tasks || [])).catch(() => setTasks([])) }}
                className="px-3 py-1.5 text-[11px] border hairline rounded-xl text-dim hover:bg-[var(--bg-hover)] transition-colors">刷新</button>
            </div>
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity size={22} className="text-dim mb-3" />
                <p className="text-xs font-semibold text-[var(--text-muted)]">暂无任务记录</p>
                <p className="text-[11px] text-dim mt-1">发送一条消息后，系统自动统计各 Agent 的执行耗时与调用</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tasks.map((t, i) => {
                  const d = t.data || {}
                  const nodes = Object.entries(d).filter(([k]) => k !== 'token_estimate')
                  const total = nodes.reduce((s, [, v]) => s + ((v as any).ms || 0), 0)
                  const tokens = d.token_estimate || 0
                  return (
                    <div key={i} className="card-surface rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px] font-semibold">{t.created_at || '—'}</span>
                        <span className="text-[10px] text-dim">总计 {total}ms · ~{tokens} tokens · {nodes.length} 节点</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {nodes.map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="text-[10px] w-20 flex-shrink-0 text-dim">{NODE_LABEL[k] || k}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                              <div className="h-full rounded-full bg-[#1a1a1a]" style={{ width: total ? Math.max(2, (((v as any).ms || 0) / total) * 100) + '%' : '0%' }} />
                            </div>
                            <span className="text-[10px] w-20 text-right text-dim">{(v as any).ms}ms{(v as any).llm_calls ? ` ×${(v as any).llm_calls}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
