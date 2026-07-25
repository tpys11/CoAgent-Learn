import { useState } from 'react'
import { X, Brain, Database, Plus, Trash2 } from 'lucide-react'
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

/** 选项列表组件 */
function OptionList({ title, desc, items, active, onToggle, onRemove, onAdd, placeholder, accentColor, disableAdd }: {
  title: string; desc: string; items: string[]; active: Set<string>; onToggle: (v: string) => void;
  onRemove: (v: string) => void; onAdd: (v: string) => void; placeholder: string; accentColor: string; disableAdd?: boolean
}) {
  const [input, setInput] = useState('')
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <label key={item} className="flex items-center gap-2.5 py-1 px-2 rounded-lg hover:bg-gray-50 cursor-pointer group">
          <input type="checkbox" checked={active.has(item)} onChange={() => onToggle(item)}
            className={`w-3.5 h-3.5 rounded accent-current`} style={{ accentColor }} />
          <span className="flex-1 text-xs text-gray-700">{item}</span>
          <button onClick={(e) => { e.stopPropagation(); onRemove(item) }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500"><Trash2 size={10} /></button>
        </label>
      ))}
      {!disableAdd && (
        <div className="flex items-center gap-1.5 pl-7 pt-1">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
            placeholder={placeholder}
            className="flex-1 px-2 py-1 text-[11px] border border-dashed border-gray-300 rounded-md outline-none focus:border-gray-400 bg-transparent" />
          <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
            className="p-0.5 text-gray-400 hover:text-gray-600"><Plus size={13} /></button>
        </div>
      )}
    </div>
  )
}

// ========== 记忆系统（可选列表设计） ==========
export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)
  const [autoCore, setAutoCore] = useState(false)
  const [autoFoundation, setAutoFoundation] = useState(true)
  const [autoFlexible, setAutoFlexible] = useState(true)

  // 学习偏好（几乎不变）
  const [purposePresets] = useState(['理解原理优先于记忆', '视觉型学习（图表/流程）', '动手实践优先', '自顶向下学习', '费曼输出法', '定期复习间隔'])
  const [activePurpose, setActivePurpose] = useState<Set<string>>(new Set(['理解原理优先于记忆', '自顶向下学习']))
  const [customPurpose, setCustomPurpose] = useState<string[]>([])

  // 资源配置（可更换）
  const [methodPresets] = useState(['主用官方文档', '笔记工具辅助', '思维导图梳理', '代码实践验证', '视频教程补充', '参与社区讨论'])
  const [activeMethod, setActiveMethod] = useState<Set<string>>(new Set(['主用官方文档', '代码实践验证']))
  const [customMethod, setCustomMethod] = useState<string[]>([])

  // 本次要求（灵活调整）
  const [constraintPresets] = useState(['需要举例说明', '需要类比辅助', '输出Markdown格式', '控制在500字以内', '给出课后练习', '标注信息来源', '附推荐阅读'])
  const [activeConstraint, setActiveConstraint] = useState<Set<string>>(new Set(['需要举例说明', '输出Markdown格式']))
  const [customConstraint, setCustomConstraint] = useState<string[]>([])

  const allPurpose = [...purposePresets, ...customPurpose]
  const allMethod = [...methodPresets, ...customMethod]
  const allConstraint = [...constraintPresets, ...customConstraint]

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
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 学习偏好 */}
          <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-blue-700">🧠 学习偏好</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">几乎不变的底层学习风格。仅手动管理，不轻易调整。</p>
              </div>
              <ToggleBtn on={autoCore} setOn={setAutoCore} />
            </div>
            <OptionList title="" desc="" items={allPurpose} active={activePurpose}
              onToggle={v => setActivePurpose(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomPurpose(prev => prev.filter(x => x !== v)); setActivePurpose(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomPurpose(prev => [...prev, v]); setActivePurpose(prev => new Set([...prev, v])) }}
              placeholder="添加目的" accentColor="#2563eb" />
          </div>

          {/* 资源配置 */}
          <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-purple-700">🔧 资源配置</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">较大困难时可更换。选择学习中使用的工具和资源。</p>
              </div>
              <ToggleBtn on={autoFoundation} setOn={setAutoFoundation} />
            </div>
            <OptionList title="" desc="" items={allMethod} active={activeMethod}
              onToggle={v => setActiveMethod(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomMethod(prev => prev.filter(x => x !== v)); setActiveMethod(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomMethod(prev => [...prev, v]); setActiveMethod(prev => new Set([...prev, v])) }}
              placeholder="添加方式" accentColor="#7c3aed" />
          </div>

          {/* 本次要求 */}
          <div className="border border-green-200 rounded-xl p-4 bg-green-50/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-green-700">📝 本次要求</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">每次对话前可灵活调整。设定本次学习的具体要求。</p>
              </div>
              <ToggleBtn on={autoFlexible} setOn={setAutoFlexible} />
            </div>
            <OptionList title="" desc="" items={allConstraint} active={activeConstraint}
              onToggle={v => setActiveConstraint(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomConstraint(prev => prev.filter(x => x !== v)); setActiveConstraint(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomConstraint(prev => [...prev, v]); setActiveConstraint(prev => new Set([...prev, v])) }}
              placeholder="添加约束" accentColor="#16a34a" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 知识库（项目级） ==========
export function ProjectKnowledgeModal({ onClose, projectId }: Props & { projectId?: string }) {
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 项目知识库{projectId ? ` (${projectId.slice(0,6)})` : ''}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <div className="border border-[#e5e5e5] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">输入内容</h3>
            <DragDropInput value={kbInput} onChange={setKbInput} placeholder="输入知识库内容，或拖拽文件上传" rows={5} />
            <div className="flex items-center gap-3 mt-3">
              <p className="text-[11px] text-gray-400 cursor-pointer hover:text-[#1a1a1a]" onClick={() => setShowGuide(!showGuide)}>💡 我需要引导</p>
              <button className="text-[11px] px-3 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg hover:bg-[#333333] transition-colors">进入知识库建立模式</button>
            </div>
            {showGuide && (
              <div className="mt-3 p-3 bg-[#ffffff] border border-[#e5e5e5] rounded-lg text-xs text-gray-600 leading-relaxed">
                知识库建立引导：1. 确定知识领域范围 2. 上传或输入相关文档资料 3. 系统自动切片→向量化→存入Chroma 4. 后续对话自动检索知识库内容
              </div>
            )}
          </div>
          <div className="border border-[#e5e5e5] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">内容展示</h3>
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">总体概述</h4>
              <div className="bg-[#ffffff] border border-[#e5e5e5] rounded-lg p-3 space-y-2 text-xs">
                <div><span className="font-semibold text-gray-600">聚焦领域：</span><span className="text-gray-600">多智能体系统开发</span></div>
                <div><span className="font-semibold text-gray-600">具体内容：</span><span className="text-gray-600">7篇结构化文档，覆盖Agent/Prompt/RAG/向量等</span></div>
                <div><span className="font-semibold text-gray-600">存储形式：</span><span className="text-gray-600">Markdown→切片→Embedding→Chroma</span></div>
                <div className="border-t border-[#e5e5e5] pt-2 mt-2 space-y-1">
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容量：</span><span className="text-gray-600">适中</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容质量：</span><span className="text-green-600">较高</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">预期效果：</span><span className="text-gray-600">可独立搭建多Agent系统</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容难度：</span><span className="text-orange-600">中等</span></div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2">知识图谱</h4>
              <div className="h-40 w-full border border-dashed border-[#1a1a1a]/50 bg-white rounded-lg flex items-center justify-center">
                <span className="text-xs text-gray-400">知识关系图谱 — 接入后端后自动生成</span>
              </div>
            </div>
          </div>
          <div className="border border-[#e5e5e5] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">知识库状态</h3>
            <div className="flex gap-6">
              <div><span className="text-[10px] text-gray-400">上次更新</span><p className="text-xs font-semibold">2026年7月22日</p></div>
              <div><span className="text-[10px] text-gray-400">文档数量</span><p className="text-xs font-semibold">7 篇</p></div>
              <div><span className="text-[10px] text-gray-400">学习进度</span><p className="text-xs font-semibold">已覆盖 <span className="text-[#1a1a1a]">3/7</span> 主题</p></div>
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5"><div className="bg-[#1a1a1a] h-1.5 rounded-full" style={{ width: '43%' }} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
