import { useState } from 'react'
import { X, Brain, Database, Plus } from 'lucide-react'
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

/** Tag 选项组件 */
function TagList({ items, active, onToggle, onRemove, onAdd, placeholder, colorClass, disableAdd }: {
  items: string[]; active: Set<string>; onToggle: (v: string) => void; onRemove: (v: string) => void;
  onAdd: (v: string) => void; placeholder: string; colorClass: string; disableAdd?: boolean
}) {
  const [input, setInput] = useState('')
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {items.map(item => {
        const sel = active.has(item)
        return (
          <button key={item} onClick={() => onToggle(item)}
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              sel ? `${colorClass} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            } group`}>
            {item}
            {sel && <span onClick={(e) => { e.stopPropagation(); onRemove(item) }} className="text-white/70 hover:text-white ml-0.5">×</span>}
          </button>
        )
      })}
      {!disableAdd && (
        <div className="flex items-center gap-1">
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
            placeholder={placeholder}
            className="w-24 px-2 py-1 text-[11px] border border-dashed border-gray-300 rounded-full outline-none focus:border-gray-400 bg-transparent" />
          <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
            className="p-0.5 hover:text-[#1a1a1a]"><Plus size={12} /></button>
        </div>
      )}
    </div>
  )
}

// ========== 记忆系统（三层模板设计） ==========
export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)
  const [autoCore, setAutoCore] = useState(false)
  const [autoFoundation, setAutoFoundation] = useState(true)
  const [autoFlexible, setAutoFlexible] = useState(true)

  // 核心原则
  const [corePresets] = useState(['多智能体协同架构', 'MCP协议连接', '知识库驱动生成', 'Agent间独立通信'])
  const [activeCore, setActiveCore] = useState<Set<string>>(new Set(['多智能体协同架构']))
  const [customCore, setCustomCore] = useState<string[]>([])

  // 基础框架
  const [foundationPresets] = useState(['React + Tailwind', 'FastAPI + LangGraph', 'Chroma 向量库', 'Redis 缓存', 'Docker 部署'])
  const [activeFoundation, setActiveFoundation] = useState<Set<string>>(new Set(['React + Tailwind', 'FastAPI + LangGraph']))
  const [customFoundation, setCustomFoundation] = useState<string[]>([])

  // 灵活配置
  const [flexiblePresets] = useState(['学习深度：中等', '输出格式：Markdown', '检索模式：增强', '思考链展示：开启'])
  const [activeFlexible, setActiveFlexible] = useState<Set<string>>(new Set(['学习深度：中等', '输出格式：Markdown']))
  const [customFlexible, setCustomFlexible] = useState<string[]>([])

  const allCore = [...corePresets, ...customCore]
  const allFoundation = [...foundationPresets, ...customFoundation]
  const allFlexible = [...flexiblePresets, ...customFlexible]

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e5e5] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-[#ffffff] border-b border-[#e5e5e5] flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">系统根据行为自动更新记忆。选中项为已激活，点击切换状态，× 可删除。</p>
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
          {/* 第一层：核心原则 */}
          <div className="border border-red-200 rounded-xl p-4 bg-red-50/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-red-700">🔒 核心原则</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">极少数极其确定的内容。仅手动管理，不轻易改变。</p>
              </div>
              <ToggleBtn on={autoCore} setOn={setAutoCore} />
            </div>
            <TagList items={allCore} active={activeCore}
              onToggle={v => setActiveCore(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomCore(prev => prev.filter(x => x !== v)); setActiveCore(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomCore(prev => [...prev, v]); setActiveCore(prev => new Set([...prev, v])) }}
              placeholder="自定义" colorClass="bg-red-500" />
          </div>

          {/* 第二层：基础框架 */}
          <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-orange-700">⚙️ 基础框架</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">项目基石。遇到较大困难时可优先尝试改动。</p>
              </div>
              <ToggleBtn on={autoFoundation} setOn={setAutoFoundation} />
            </div>
            <TagList items={allFoundation} active={activeFoundation}
              onToggle={v => setActiveFoundation(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomFoundation(prev => prev.filter(x => x !== v)); setActiveFoundation(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomFoundation(prev => [...prev, v]); setActiveFoundation(prev => new Set([...prev, v])) }}
              placeholder="自定义" colorClass="bg-orange-500" />
          </div>

          {/* 第三层：灵活配置 */}
          <div className="border border-green-200 rounded-xl p-4 bg-green-50/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-1.5 text-green-700">🟢 灵活配置</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">可随时调整的目标、参数与偏好设置。</p>
              </div>
              <ToggleBtn on={autoFlexible} setOn={setAutoFlexible} />
            </div>
            <TagList items={allFlexible} active={activeFlexible}
              onToggle={v => setActiveFlexible(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n })}
              onRemove={v => { setCustomFlexible(prev => prev.filter(x => x !== v)); setActiveFlexible(prev => { const n = new Set(prev); n.delete(v); return n }) }}
              onAdd={v => { setCustomFlexible(prev => [...prev, v]); setActiveFlexible(prev => new Set([...prev, v])) }}
              placeholder="自定义" colorClass="bg-green-500" />
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
