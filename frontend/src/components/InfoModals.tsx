import { useState } from 'react'
import { X, Brain, Database, Upload, FileText, BookOpen, User, Edit3 } from 'lucide-react'

interface Props { onClose: () => void }

export function MemoryModal({ onClose }: Props) {
  const [autoMemory, setAutoMemory] = useState(true)
  const [autoGlobalDoc, setAutoGlobalDoc] = useState(true)
  const [autoGlobalNote, setAutoGlobalNote] = useState(true)
  const [autoProfile, setAutoProfile] = useState(true)
  const [autoCustom, setAutoCustom] = useState(true)
  const [globalDoc, setGlobalDoc] = useState('')
  const [globalNote, setGlobalNote] = useState('')
  const [userProfile, setUserProfile] = useState('')
  const [customNote, setCustomNote] = useState('')

  const ToggleBtn = ({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) => (
    <button onClick={() => setOn(!on)}
      className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
        on ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
      }`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${on ? 'bg-green-500' : 'bg-gray-400'}`} />
      {on ? '自动' : '手动'}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col mx-4"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#dad4cd] flex-shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 bg-[#faf8f5] border-b border-[#dad4cd] flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">系统会根据您的行为自动更新记忆，您也可以手动管理。如果需要关闭系统自动管理，则关闭此按钮。</p>
          <button onClick={() => setAutoMemory(!autoMemory)}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
              autoMemory ? 'bg-green-50 border border-green-300 text-green-700' : 'bg-gray-100 border border-gray-300 text-gray-500'
            }`}>
            <span className={`w-3 h-3 rounded-full ${autoMemory ? 'bg-green-500' : 'bg-gray-400'}`} />
            {autoMemory ? '自动管理：已开启' : '自动管理：已关闭'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 全局性记忆 */}
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><FileText size={15} className="text-gray-400" /> 全局性记忆</h3>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><Upload size={12} /> 上传 MD 文档</label>
                <ToggleBtn on={autoGlobalDoc} setOn={setAutoGlobalDoc} />
              </div>
              <p className="text-[10px] text-gray-400 mb-1.5">输入后不做处理，用户从输入框输入内容时系统一并读取。</p>
              <textarea value={globalDoc} onChange={(e) => setGlobalDoc(e.target.value)} placeholder="在此粘贴 Markdown 文档内容..." rows={3}
                className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><Edit3 size={12} /> 自定义指令</label>
                <ToggleBtn on={autoGlobalNote} setOn={setAutoGlobalNote} />
              </div>
              <textarea value={globalNote} onChange={(e) => setGlobalNote(e.target.value)} placeholder="例如：所有回答使用中文、面向初学者..." rows={2}
                className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]" />
            </div>
          </div>

          {/* 项目记忆 */}
          <div className="border border-[#dad4cd] rounded-xl p-4">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><BookOpen size={15} className="text-gray-400" /> 项目记忆</h3>
            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">全局抽象表述</label>
              <textarea value="" readOnly placeholder="从全局性记忆中自动提取..." rows={2}
                className="w-full px-3 py-2 border border-[#dad4cd] rounded-lg text-xs outline-none resize-none bg-gray-50 text-gray-400" />
            </div>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><User size={12} /> 用户知识画像</label>
                <ToggleBtn on={autoProfile} setOn={setAutoProfile} />
              </div>
              <p className="text-[10px] text-gray-400 mb-1.5">根据知识诊断结果自动生成，记录用户知识掌握情况。</p>
              <textarea value={userProfile} onChange={(e) => setUserProfile(e.target.value)} placeholder="知识诊断结果将自动填入..." rows={3}
                className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-semibold text-gray-500 flex items-center gap-1 flex-1"><Edit3 size={12} /> 自定义</label>
                <ToggleBtn on={autoCustom} setOn={setAutoCustom} />
              </div>
              <textarea value={customNote} onChange={(e) => setCustomNote(e.target.value)} placeholder="自由记录项目相关信息..." rows={3}
                className="w-full px-3 py-2 border border-[#c4beb6] rounded-lg text-xs outline-none resize-none focus:border-[#c75f1a] bg-[#faf8f5]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function KnowledgeModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="text-base font-bold flex items-center gap-2"><Database size={18} className="text-green-500" /> 知识库</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[#faf8f5] border border-[#dad4cd] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">RAG 检索增强生成</h3>
            <p className="text-xs text-gray-500 leading-relaxed">文档切片 → 向量嵌入 → Chroma 存储 → 语义检索 → LLM 生成。7篇AI多智能体领域知识文档已入库。</p>
          </div>
          <div className="bg-[#faf8f5] border border-[#dad4cd] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">知识库状态</h3>
            <p className="text-xs text-gray-400">知识库就绪，Agent 编排接入后自动检索。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
