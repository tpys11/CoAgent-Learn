import { useState } from 'react'
import { Brain, Plus, Trash2 } from 'lucide-react'

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

/** 记忆系统：完整界面（替代原弹窗），最左侧栏「记忆」打开 */
export default function MemoryView() {
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

  const [persona, setPersona] = useState('')
  const [autoPersona, setAutoPersona] = useState(true)

  return (
    <div className="flex-1 h-full min-w-0 flex flex-col panel rounded-3xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
        <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
        <span className="text-[10px] text-gray-400">系统根据行为自动更新记忆，勾选项即为已激活</span>
      </div>
      <div className="px-5 py-3 bg-[#ffffff] border-b border-[#e5e5e5] flex-shrink-0">
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
        <div className="border border-blue-300 rounded-xl p-4 bg-blue-50/30">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-1.5 text-blue-700">👤 个人画像记忆</h3>
              <p className="text-[10px] text-gray-400 mt-0.5">基于所有项目记忆提炼的用户基础画像（≤500字）。</p>
            </div>
            <ToggleBtn on={autoPersona} setOn={setAutoPersona} />
          </div>
          <textarea value={persona} onChange={e => setPersona(e.target.value)}
            placeholder="例：该用户偏好理解原理而非记忆，视觉型学习者，动手实践能力强，关注AI Agent开发领域……"
            rows={5}
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs outline-none resize-none focus:border-blue-400 bg-white" />
        </div>
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-bold text-blue-700">🧠 学习偏好</h3><p className="text-[10px] text-gray-400 mt-0.5">几乎不变的底层学习风格。</p></div>
          </div>
          <OptionList items={[...purposePresets, ...customPurpose]} active={activePurpose}
            onToggle={v => setActivePurpose(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
            onRemove={v => { setCustomPurpose(prev => prev.filter(x => x !== v)); setActivePurpose(prev => { const n = new Set(prev); n.delete(v); return n }) }}
            onAdd={v => { setCustomPurpose(prev => [...prev, v]); setActivePurpose(prev => new Set([...prev, v])) }}
            placeholder="自定义" accentColor="#2563eb" />
        </div>
        <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/20">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-bold text-purple-700">🔧 资源配置</h3><p className="text-[10px] text-gray-400 mt-0.5">较大困难时可更换。</p></div>
          </div>
          <OptionList items={[...methodPresets, ...customMethod]} active={activeMethod}
            onToggle={v => setActiveMethod(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
            onRemove={v => { setCustomMethod(prev => prev.filter(x => x !== v)); setActiveMethod(prev => { const n = new Set(prev); n.delete(v); return n }) }}
            onAdd={v => { setCustomMethod(prev => [...prev, v]); setActiveMethod(prev => new Set([...prev, v])) }}
            placeholder="自定义" accentColor="#7c3aed" />
        </div>
        <div className="border border-green-200 rounded-xl p-4 bg-green-50/20">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-sm font-bold text-green-700">📝 本次要求</h3><p className="text-[10px] text-gray-400 mt-0.5">每次对话前可灵活调整。</p></div>
          </div>
          <OptionList items={[...constraintPresets, ...customConstraint]} active={activeConstraint}
            onToggle={v => setActiveConstraint(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
            onRemove={v => { setCustomConstraint(prev => prev.filter(x => x !== v)); setActiveConstraint(prev => { const n = new Set(prev); n.delete(v); return n }) }}
            onAdd={v => { setCustomConstraint(prev => [...prev, v]); setActiveConstraint(prev => new Set([...prev, v])) }}
            placeholder="自定义" accentColor="#16a34a" />
        </div>
      </div>
    </div>
  )
}
