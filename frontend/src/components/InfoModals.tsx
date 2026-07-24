import { useState } from 'react'
import { X, Brain, Database, Upload, FileText, BookOpen, User, Edit3 } from 'lucide-react'
import DragDropInput from './DragDropInput'

interface Props { onClose: () => void }

const closeOnBackdrop = (onClose: () => void) => (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) onClose()
}

export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)
  const [autoGlobalDoc, setAutoGlobalDoc] = useState(true)
  const [autoAbstract, setAutoAbstract] = useState(true)
  const [autoProfile, setAutoProfile] = useState(true)
  const [autoCustom, setAutoCustom] = useState(true)
  const [globalDoc, setGlobalDoc] = useState('')
  const [globalAbstract, setGlobalAbstract] = useState('')
  const [userProfile, setUserProfile] = useState('')
  const [customNote, setCustomNote] = useState('')

  const ToggleBtn = ({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) => (
    <button onClick={() => setOn(!on)}
      className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-amber-400' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-4' : 'left-0.5'}`} />
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        {/* ... 内容不变 ... */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#dad4cd] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 bg-[#faf8f5] border-b border-[#dad4cd] flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">系统会根据您的行为自动更新记忆，您也可以手动管理。如果需要关闭系统自动管理，则关闭此按钮。</p>
          <button onClick={() => setAutoMemory(!autoMemory)}
            className={`relative w-full h-10 rounded-lg transition-colors flex items-center justify-center px-4 ${
              autoMemory ? 'bg-amber-50 border border-amber-300' : 'bg-gray-100 border border-gray-300'}`}>
            <span className="text-sm font-semibold mr-3">{autoMemory ? '自动管理：已开启' : '自动管理：已关闭'}</span>
            <span className={`relative w-10 h-5 rounded-full transition-colors ${autoMemory ? 'bg-amber-400' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoMemory ? 'left-5' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><FileText size={15} className="text-gray-400" /> 全局性记忆</h3>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><Upload size={12} /> 上传 MD 文档</label>
                <ToggleBtn on={autoGlobalDoc} setOn={setAutoGlobalDoc} />
              </div>
              <p className="text-[10px] text-gray-400 mb-1.5">输入后不做处理，用户从输入框输入内容时系统一并读取。</p>
              <DragDropInput value={globalDoc} onChange={setGlobalDoc} placeholder="在此粘贴 Markdown 文档内容，或拖拽文件上传" rows={3} />
            </div>
          </div>
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><BookOpen size={15} className="text-gray-400" /> 项目记忆</h3>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex-1">项目角度记忆</label>
                <ToggleBtn on={autoAbstract} setOn={setAutoAbstract} />
              </div>
              <DragDropInput value={globalAbstract} onChange={setGlobalAbstract} placeholder="从全局性记忆中自动提取或手动编辑..." rows={2} />
            </div>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><User size={12} /> 用户知识画像</label>
                <ToggleBtn on={autoProfile} setOn={setAutoProfile} />
              </div>
              <p className="text-[10px] text-gray-400 mb-1.5">根据知识诊断结果自动生成，记录用户知识掌握情况。</p>
              <DragDropInput value={userProfile} onChange={setUserProfile} placeholder="知识诊断结果将自动填入..." rows={3} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><Edit3 size={12} /> 自定义</label>
                <ToggleBtn on={autoCustom} setOn={setAutoCustom} />
              </div>
              <DragDropInput value={customNote} onChange={setCustomNote} placeholder="自由记录项目相关信息..." rows={3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function KnowledgeModal({ onClose }: Props) {
  const [kbInput, setKbInput] = useState('')
  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={closeOnBackdrop(onClose)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#dad4cd] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 知识库</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">输入内容</h3>
            <DragDropInput value={kbInput} onChange={setKbInput} placeholder="输入知识库内容，或拖拽文件上传" rows={5} />
            <div className="flex items-center gap-3 mt-3">
              <p className="text-[11px] text-gray-400 cursor-pointer hover:text-[#c75f1a]" onClick={() => setShowGuide(!showGuide)}>💡 我需要引导</p>
              <button className="text-[11px] px-3 py-1.5 bg-[#c75f1a] text-white font-semibold rounded-lg hover:bg-[#a84a10] transition-colors">进入知识库建立模式</button>
            </div>
            {showGuide && (
              <div className="mt-3 p-3 bg-[#faf8f5] border border-[#dad4cd] rounded-lg text-xs text-gray-600 leading-relaxed">
                知识库建立引导：1. 确定知识领域范围 2. 上传或输入相关文档资料 3. 系统自动切片→向量化→存入Chroma 4. 后续对话自动检索知识库内容
              </div>
            )}
          </div>
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">内容展示</h3>
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">总体概述</h4>
              <div className="bg-[#faf8f5] border border-[#dad4cd] rounded-lg p-3 space-y-2 text-xs">
                <div><span className="font-semibold text-gray-600">聚焦领域：</span><span className="text-gray-600">多智能体系统开发</span></div>
                <div><span className="font-semibold text-gray-600">具体内容：</span><span className="text-gray-600">7篇结构化文档，覆盖Agent/Prompt/RAG/向量等</span></div>
                <div><span className="font-semibold text-gray-600">存储形式：</span><span className="text-gray-600">Markdown→切片→Embedding→Chroma</span></div>
                <div className="border-t border-[#dad4cd] pt-2 mt-2 space-y-1">
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容量：</span><span className="text-gray-600">适中</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容质量：</span><span className="text-green-600">较高</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">预期效果：</span><span className="text-gray-600">可独立搭建多Agent系统</span></div>
                  <div className="flex gap-4"><span className="font-semibold text-gray-600">内容难度：</span><span className="text-orange-600">中等</span></div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-2">知识图谱</h4>
              <div className="h-40 w-full border border-dashed border-[#c75f1a]/50 bg-white rounded-lg flex items-center justify-center">
                <span className="text-xs text-gray-400">知识关系图谱 — 接入后端后自动生成</span>
              </div>
            </div>
          </div>
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3">知识库状态</h3>
            <div className="flex gap-6">
              <div><span className="text-[10px] text-gray-400">上次更新</span><p className="text-xs font-semibold">2026年7月22日</p></div>
              <div><span className="text-[10px] text-gray-400">文档数量</span><p className="text-xs font-semibold">7 篇</p></div>
              <div><span className="text-[10px] text-gray-400">学习进度</span><p className="text-xs font-semibold">已覆盖 <span className="text-[#c75f1a]">3/7</span> 主题</p></div>
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5"><div className="bg-[#c75f1a] h-1.5 rounded-full" style={{ width: '43%' }} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
