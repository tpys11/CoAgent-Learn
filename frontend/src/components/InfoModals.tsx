import { useState } from 'react'
import { X, Brain, Database, Plus, Trash2, Clock } from 'lucide-react'
import DragDropInput from './DragDropInput'

interface Props { onClose: () => void }

const closeOnBackdrop = (onClose: () => void) => (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose()
}

const ToggleBtn = ({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) => (
  <button onClick={() => setOn(!on)}
    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-gray-400' : 'bg-gray-300'}`}>
    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
  </button>
)

function OptionList({ items, active, onToggle, onRemove, onAdd, placeholder, accentColor }: {
  items: string[]; active: Set<string>; onToggle: (v: string) => void;
  onRemove: (v: string) => void; onAdd: (v: string) => void; placeholder: string; accentColor: string
}) {
  const [input, setInput] = useState('')
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <label key={item} className="flex items-center gap-2.5 py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
          <input type="checkbox" checked={active.has(item)} onChange={() => onToggle(item)}
            className="w-3.5 h-3.5 rounded" style={{ accentColor }} />
          <span className="flex-1 text-xs text-gray-700">{item}</span>
          <button onClick={(e) => { e.stopPropagation(); onRemove(item) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"><Trash2 size={10} /></button>
        </label>
      ))}
      <div className="flex items-center gap-1.5 pl-7 pt-1">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 text-[11px] border border-dashed border-gray-300 rounded-md outline-none focus:border-gray-400 bg-transparent" />
        <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
          className="p-0.5 text-gray-400 hover:text-gray-600"><Plus size={13} /></button>
      </div>
    </div>
  )
}

// ==================== 全局记忆系统 ====================
export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)

  const [purposePresets] = useState(['理解原理优先于记忆', '视觉型学习（图表/流程）', '动手实践优先', '自顶向下学习', '费曼输出法', '定期复习间隔'])
  const [activePurpose, setActivePurpose] = useState<Set<string>>(new Set(['理解原理优先于记忆', '自顶向下学习']))
  const [customPurpose, setCustomPurpose] = useState<string[]>([])

  const [methodPresets] = useState(['主用官方文档', '笔记工具辅助', '思维导图梳理', '代码实践验证', '视频教程补充', '参与社区讨论'])
  const [activeMethod, setActiveMethod] = useState<Set<string>>(new Set(['主用官方文档', '代码实践验证']))
  const [customMethod, setCustomMethod] = useState<string[]>([])

  const [constraintPresets] = useState(['需要举例说明', '需要类比辅助', '输出Markdown格式', '控制在500字以内', '给出课后练习', '标注信息来源', '附推荐阅读'])
  const [activeConstraint, setActiveConstraint] = useState<Set<string>>(new Set(['需要举例说明', '输出Markdown格式']))
  const [customConstraint, setCustomConstraint] = useState<string[]>([])

  // 个人画像记忆
  const [persona, setPersona] = useState('')
  const [autoPersona, setAutoPersona] = useState(true)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-[#ffffff] border-b border-[#e5e5e5] flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">系统根据行为自动更新记忆。勾选项即为已激活，取消勾选即关闭。</p>
          <button onClick={() => setAutoMemory(!autoMemory)}
            className={`relative w-full h-10 rounded-lg transition-colors flex items-center justify-center px-4 ${
              autoMemory ? 'bg-gray-50 border border-gray-300' : 'bg-gray-100 border border-gray-300'}`}>
            <span className="text-sm font-semibold mr-3">{autoMemory ? '自动管理：已开启' : '自动管理：已关闭'}</span>
            <span className={`relative w-10 h-5 rounded-full transition-colors ${autoMemory ? 'bg-gray-400' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoMemory ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* 个人画像记忆 */}
          <div className="border border-blue-300 rounded-xl p-4 bg-blue-50/30">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-blue-700">👤 个人画像记忆</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">基于所有项目记忆提炼的用户基础画像（≤500字）。</p>
              </div>
              <ToggleBtn on={autoPersona} setOn={setAutoPersona} />
            </div>
            <textarea value={persona} onChange={e => setPersona(e.target.value)}
              placeholder="例：该用户偏好理解原理而非记忆，视觉型学习者，动手实践能力强，关注AI Agent开发领域。当前知识水平：已掌握React+Python基础，正在学习LangGraph多智能体框架……"
              rows={5}
              className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs outline-none resize-none focus:border-blue-400 bg-white" />
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-gray-400">跨项目综合提炼</span>
              <span className="text-[9px] text-gray-400">{persona.length}/500</span>
            </div>
          </div>

          {/* 学习偏好 */}
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-blue-700">🧠 学习偏好</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">几乎不变的底层学习风格。仅手动管理，不轻易调整。</p>
              </div>
            </div>
            <OptionList items={[...purposePresets, ...customPurpose]} active={activePurpose}
              onToggle={v => setActivePurpose(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomPurpose(prev => prev.filter(x => x !== v)); setActivePurpose(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomPurpose(prev => [...prev, v]); setActivePurpose(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#2563eb" />
          </div>

          {/* 资源配置 */}
          <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-purple-700">🔧 资源配置</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">较大困难时可更换。选择学习中使用的工具和资源。</p>
              </div>
            </div>
            <OptionList items={[...methodPresets, ...customMethod]} active={activeMethod}
              onToggle={v => setActiveMethod(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomMethod(prev => prev.filter(x => x !== v)); setActiveMethod(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomMethod(prev => [...prev, v]); setActiveMethod(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#7c3aed" />
          </div>

          {/* 本次要求 */}
          <div className="border border-green-200 rounded-xl p-4 bg-green-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-green-700">📝 本次要求</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">每次对话前可灵活调整。设定本次学习的具体要求。</p>
              </div>
            </div>
            <OptionList items={[...constraintPresets, ...customConstraint]} active={activeConstraint}
              onToggle={v => setActiveConstraint(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomConstraint(prev => prev.filter(x => x !== v)); setActiveConstraint(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomConstraint(prev => [...prev, v]); setActiveConstraint(prev => new Set([...prev, v])) }}
              placeholder="自定义" accentColor="#16a34a" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== 项目配置窗口 ====================
export function ProjectKnowledgeModal({ onClose, projectId }: Props & { projectId?: string }) {
  const [tab, setTab] = useState<'resource' | 'knowledge' | 'memory'>('resource')
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)
  const [projectMemory, setProjectMemory] = useState('')
  const [episodicMemory, setEpisodicMemory] = useState('')

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 项目配置</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        {/* Tab 栏 */}
        <div className="flex border-b border-[#e5e5e5] flex-shrink-0">
          {(['resource','knowledge','memory'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === t ? 'text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {{ resource: '资源选择', knowledge: '知识库', memory: '项目记忆' }[t]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'resource' && <ResourceTab />}
          {tab === 'knowledge' && (
            <div className="flex flex-col gap-5">
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-3">输入内容</h3>
                <DragDropInput value={kbInput} onChange={setKbInput} placeholder="输入知识库内容，或拖拽文件上传" rows={5} />
                <div className="flex items-center gap-3 mt-3">
                  <p className="text-[11px] text-gray-400 cursor-pointer hover:text-[#1a1a1a]" onClick={() => setShowGuide(!showGuide)}>💡 我需要引导</p>
                  <button className="text-[11px] px-3 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors">进入知识库建立模式</button>
                </div>
              </div>
            </div>
          )}
          {tab === 'memory' && (
            <div className="flex flex-col gap-5">
              {/* 情景记忆 */}
              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/20">
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-indigo-700 mb-2">
                  <Clock size={14} /> 情景记忆
                </h3>
                <p className="text-[10px] text-gray-400 mb-2">基于用户与AI对话内容的简要概述。由 Agent 自动提取关键信息并更新（≤1000字）。</p>
                <textarea value={episodicMemory} onChange={e => setEpisodicMemory(e.target.value)}
                  placeholder="例：用户询问了LangGraph的状态管理机制，AI解释了StateGraph和MessageGraph的区别。用户对条件路由的概念有疑问，AI用代码示例进行了说明。用户表示理解了基本用法……"
                  rows={8}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-xs outline-none resize-none focus:border-indigo-400 bg-white" />
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-gray-400">对话自动提取</span>
                  <span className="text-[9px] text-gray-400">{episodicMemory.length}/1000</span>
                </div>
              </div>
              {/* 项目记忆 */}
              <div className="border border-[#e5e5e5] rounded-xl p-4">
                <h3 className="text-sm font-bold mb-2">项目上下文记忆</h3>
                <p className="text-[10px] text-gray-400 mb-2">记录与本项目相关的配置和上下文信息。</p>
                <textarea value={projectMemory} onChange={e => setProjectMemory(e.target.value)}
                  placeholder="例：本项目聚焦多智能体系统开发，已完成前端UI搭建，正在对接LangGraph后端……"
                  rows={4}
                  className="w-full px-3 py-2 border border-[#d0d0d0] rounded-lg text-xs outline-none resize-none focus:border-[#1a1a1a] bg-[#fafafa]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 资源选择 Tab */
function ResourceTab() {
  const resources = ['书籍', '百科', '论文', '官方文档', '教程', '视频', '代码仓库', '课件/PPT']
  const [selected, setSelected] = useState<Set<string>>(new Set(['书籍', '官方文档']))
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">选择项目依赖资源</h3>
      <div className="flex flex-wrap gap-2">
        {resources.map(r => (
          <button key={r} onClick={() => setSelected(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              selected.has(r) ? 'bg-[#f0f0f0] text-[#1a1a1a] border border-[#1a1a1a]/30' : 'bg-gray-50 text-gray-500 border border-gray-200'
            }`}>{r}</button>
        ))}
      </div>
      <div className="border-t border-[#e5e5e5] pt-4">
        <h3 className="text-sm font-bold mb-2">上传资料</h3>
        <DragDropInput value="" onChange={() => {}} placeholder="拖拽文件到此处或点击上传" rows={1} />
      </div>
    </div>
  )
}
