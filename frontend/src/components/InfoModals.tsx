import { X, Brain, Database, Cpu } from 'lucide-react'

interface Props { onClose: () => void }

export function MemoryModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="text-base font-bold flex items-center gap-2"><Brain size={18} className="text-purple-500" /> 记忆系统</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[#faf8f5] border border-[#dad4cd] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><Cpu size={14} /> 记忆分层架构</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              L1 事件追踪 → L2 精选事实 → L3 综合画像。参考 DeepTutor 三层记忆体系。
            </p>
          </div>
          <div className="bg-[#faf8f5] border border-[#dad4cd] rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">当前记忆状态</h3>
            <p className="text-xs text-gray-400">对话记忆将在 Agent 编排接入后自动存储。</p>
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
            <p className="text-xs text-gray-500 leading-relaxed">
              文档切片 → 向量嵌入 → Chroma 存储 → 语义检索 → LLM 生成。7篇AI多智能体领域知识文档已入库。
            </p>
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
