import { useState, useEffect } from 'react'
import { Settings, Square, Upload, Folder } from 'lucide-react'
import type { AgentConfig } from '../types'

interface SkillInfo { name: string; description: string; folder: string }

interface Props {
  agents: AgentConfig[]
  onSave: (updated: AgentConfig) => void
}

/** Agent 系统：完整界面（替代原弹窗），最左侧栏「Agent」打开 */
export default function AgentsView({ agents, onSave }: Props) {
  const [selectedId, setSelectedId] = useState(agents[0]?.id || '')
  const agent = agents.find(a => a.id === selectedId) || agents[0]
  const [mode, setMode] = useState(agent?.mode || '标准')
  const [prompt, setPrompt] = useState(agent?.systemPrompt || '')
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([])
  const [linkedSkills, setLinkedSkills] = useState<string[]>([])

  useEffect(() => {
    setMode(agent?.mode || '标准')
    setPrompt(agent?.systemPrompt || '')
    fetch('/api/skills').then(r => r.json()).then(d => {
      setAllSkills(d.skills || [])
      const names = (agent?.skill || '').match(/[a-z_]+/g) || []
      setLinkedSkills(names.filter((n: string) => (d.skills || []).some((s: SkillInfo) => s.name === n)))
    })
  }, [selectedId])

  const toggleSkill = (name: string) => {
    const next = linkedSkills.includes(name) ? linkedSkills.filter(s => s !== name) : [...linkedSkills, name]
    setLinkedSkills(next)
    commit(mode, prompt, next)
  }

  /** 自动保存：任何修改立即持久化（无需手动点保存） */
  const buildSkill = (linked: string[]) => linked.map(n => {
    const s = allSkills.find(x => x.name === n)
    return s ? `${s.name}: ${s.description}` : n
  }).join('\n')
  const commit = (m: string, p: string, linked: string[]) => {
    onSave({ ...agent, mode: m, systemPrompt: p, skill: buildSkill(linked) || agent.skill })
  }

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左侧 Agent 列表 */}
      <div className="w-48 bg-[#f5f5f5] border-r border-[#e5e5e5] flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><Settings size={15} /> Agent 设置</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {agents.map(a => (
            <button key={a.id} onClick={() => setSelectedId(a.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                a.id === selectedId ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm' : 'hover:bg-white/60 text-gray-500'
              }`}>
              <span>{a.icon}</span><span className="truncate">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 右侧设置 */}
      {agent && (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 模式 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">模式</label>
            <div className="flex gap-2">
              {agent.modes.map(m => (
                <button key={m.label} onClick={() => { setMode(m.label); commit(m.label, prompt, linkedSkills) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mode === m.label ? 'bg-[#1a1a1a] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>{m.label}</button>
              ))}
            </div>
          </div>

          {/* 提示词 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">全局性提示词</label>
            <textarea value={prompt} onChange={e => { setPrompt(e.target.value); commit(mode, e.target.value, linkedSkills) }} rows={5}
              className="w-full px-3 py-2 border border-[#d0d0d0] rounded-lg text-xs font-mono outline-none resize-none focus:border-[#1a1a1a] bg-[#fafafa]" />
          </div>

          {/* Skill 区域 — 正方形卡片 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Folder size={13} /> Skill 模块
            </label>
            <div className="flex flex-wrap gap-3">
              {allSkills.map(s => {
                const linked = linkedSkills.includes(s.name)
                return (
                  <button key={s.name} onClick={() => toggleSkill(s.name)}
                    title={s.description}
                    className={`w-20 h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      linked ? 'border-[#1a1a1a] bg-[#f0f0f0]' : 'border-dashed border-[#d0d0d0] hover:border-gray-300'
                    }`}>
                    <Square size={16} className={linked ? 'text-[#1a1a1a]' : 'text-gray-400'} />
                    <span className="text-[10px] font-medium leading-tight text-center px-1 truncate w-full">
                      {s.name}
                    </span>
                  </button>
                )
              })}
              {/* 上传 Skill */}
              <button className="w-20 h-20 rounded-xl border-2 border-dashed border-[#d0d0d0] flex flex-col items-center justify-center gap-1 hover:border-gray-400 transition-colors"
                onClick={() => document.getElementById('agent-skill-upload')?.click()}>
                <Upload size={16} className="text-gray-400" />
                <span className="text-[10px] text-gray-400">上传</span>
                <input id="agent-skill-upload" type="file" className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
