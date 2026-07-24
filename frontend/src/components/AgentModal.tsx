import { useState, useEffect } from 'react'
import { X, RotateCcw, Folder, FolderOpen, Plus, Trash2, Upload } from 'lucide-react'
import type { AgentConfig } from '../types'

interface Props {
  agent: AgentConfig
  onSave: (updated: AgentConfig) => void
  onClose: () => void
}

interface SkillInfo { name: string; description: string; folder: string }

export default function AgentModal({ agent, onSave, onClose }: Props) {
  const [mode, setMode] = useState(agent.mode)
  const [prompt, setPrompt] = useState(agent.systemPrompt)
  const [skill, setSkill] = useState(agent.skill)
  const [allSkills, setAllSkills] = useState<SkillInfo[]>([])
  const [linkedSkills, setLinkedSkills] = useState<string[]>([])
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [uploadedFolders, setUploadedFolders] = useState<string[]>([])

  const handleSkillUpload = (e: any) => {
    const files = Array.from(e.target.files || []) as any[]
    const folders = new Set<string>()
    files.forEach((f: any) => {
      const path = f.webkitRelativePath || f.name
      const topFolder = path.split('/')[0]
      if (topFolder) folders.add(topFolder)
    })
    setUploadedFolders(prev => [...new Set([...prev, ...folders])])
    e.target.value = '' // 允许重复选择同一文件夹
  }

  const handleSkillDrop = (e: any) => {
    e.preventDefault()
    const items = Array.from(e.dataTransfer.items) as any[]
    const names: string[] = []
    const processEntry = async (entry: any) => {
      if (entry.isFile) { names.push(entry.name); return }
      if (entry.isDirectory) {
        const reader = entry.createReader()
        const readAll = (): Promise<any[]> => new Promise(resolve => reader.readEntries(resolve))
        let entries: any[] = []; let batch
        while ((batch = await readAll()) && batch.length > 0) entries = entries.concat(batch)
        for (const e of entries) await processEntry(e)
      }
    }
    Promise.all(items.map(item => processEntry(item.webkitGetAsEntry()))).then(() => {
      if (names.length > 0) setUploadedFolders(prev => [...new Set([...prev, ...names])])
    })
  }

  useEffect(() => {
    fetch('/api/skills').then(r => r.json()).then(d => {
      setAllSkills(d.skills || [])
      // 从当前skill文本中解析已关联的skill名
      const names = (agent.skill || '').match(/[a-z_]+/g) || []
      setLinkedSkills(names.filter((n: string) => (d.skills || []).some((s: SkillInfo) => s.name === n)))
    })
  }, [agent.skill])

  const currentMode = agent.modes.find(m => m.label === mode)

  const handleModeChange = (label: string) => { setMode(label); setPrompt(agent.defaultPrompt) }

  const toggleSkill = (name: string) => {
    setLinkedSkills(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name])
  }

  const handleSave = () => {
    const linked = linkedSkills.map(n => {
      const s = allSkills.find(x => x.name === n)
      return s ? `${s.name}: ${s.description}` : n
    }).join('\n')
    onSave({ ...agent, mode, systemPrompt: prompt, skill: linked || skill })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
           onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="text-base font-bold flex items-center gap-2">
            <span>{agent.icon}</span> {agent.name}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 模式选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">模式</label>
              <button
                onClick={() => { setMode('标准'); setPrompt(agent.defaultPrompt) }}
                className="text-[10px] text-gray-400 hover:text-[#c75f1a] flex items-center gap-1"
              >
                <RotateCcw size={10} /> 恢复默认
              </button>
            </div>
            <div className="flex gap-2">
              {agent.modes.map((m) => (
                <button
                  key={m.label}
                  onClick={() => handleModeChange(m.label)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    mode === m.label
                      ? 'bg-[#fef3eb] text-[#c75f1a] border border-[#c75f1a]/30'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {currentMode?.promptOverride && (
              <p className="text-[10px] text-gray-400 mt-1.5">模式叠加：{currentMode.promptOverride}</p>
            )}
          </div>

          {/* 全局性提示词 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">全局性提示词</label>
              <button
                onClick={() => setPrompt(agent.defaultPrompt)}
                className="text-[10px] text-gray-400 hover:text-[#c75f1a] flex items-center gap-1"
              >
                <RotateCcw size={10} /> 恢复默认
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs font-mono outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]"
            />
          </div>

          {/* Skill 文件夹管理 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Folder size={13} /> Skill 模块
              </label>
              <span className="text-[10px] text-gray-400">{linkedSkills.length} 个已关联</span>
            </div>
            <div className="border border-[#dad4cd] rounded-lg divide-y divide-[#dad4cd] max-h-48 overflow-y-auto">
              {allSkills.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">暂无可用 Skill</p>
              ) : (
                allSkills.map(s => {
                  const linked = linkedSkills.includes(s.name)
                  const expanded = expandedSkill === s.name
                  return (
                    <div key={s.name}>
                      <div
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#faf8f5] transition-colors ${linked ? 'bg-[#fef3eb]/30' : ''}`}
                        onClick={() => setExpandedSkill(expanded ? null : s.name)}
                      >
                        {expanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />}
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold">{s.name}</span>
                          {expanded && <p className="text-[10px] text-gray-400 mt-0.5">{s.description}</p>}
                        </div>
                        <span className="text-[10px] text-gray-300">📁 {s.folder}/</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSkill(s.name) }}
                          className={`p-1 rounded text-[10px] transition-colors ${
                            linked ? 'text-red-400 hover:text-red-600' : 'text-green-500 hover:text-green-700'
                          }`}
                          title={linked ? '移除关联' : '关联到此 Agent'}
                        >
                          {linked ? <Trash2 size={12} /> : <Plus size={12} />}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {/* 上传新 Skill */}
            <div className="mt-3 border-2 border-dashed border-[#c4beb6] rounded-lg p-4 bg-[#faf8f5] flex flex-col items-center gap-2 hover:border-[#c75f1a]/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('skill-file-input')?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleSkillDrop}>
              <Upload size={22} className="text-gray-400" />
              <span className="text-xs text-gray-400">上传 Skill 文件夹</span>
              <span className="text-[10px] text-gray-300">点击选择或拖拽文件夹到此处</span>
              <input id="skill-file-input" type="file" className="hidden"
                {...({ webkitdirectory: '', directory: '' } as any)}
                onChange={handleSkillUpload} />
            </div>
            {uploadedFolders.length > 0 && (
              <div className="mt-2 text-[10px] text-gray-500 bg-white border border-[#dad4cd] rounded-lg p-2">
                <span className="font-semibold">已上传 {uploadedFolders.length} 个文件夹：</span>
                {uploadedFolders.map((f, i) => <div key={i}>📁 {f}</div>)}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-[#dad4cd]">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={handleSave} className="px-4 py-1.5 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10]">保存</button>
        </div>
      </div>
    </div>
  )
}
