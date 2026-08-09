import { useState } from 'react'
import MemoryView from './MemoryView'
import ResourceView from './ResourceView'

/** 项目配置弹窗：项目记忆 / 项目资源 两个页签，复用已有记忆界面与资源界面 */
export default function ProjectConfigModal({ projectId, onRequestModify, onRequestAnalyze, onClose }: {
  projectId: string | null
  onRequestModify?: (label: string, pid?: string) => void
  onRequestAnalyze?: (projectName: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'memory' | 'resource'>('memory')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="w-[min(1200px,94vw)] h-[90vh] panel rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 px-4 py-2.5 border-b hairline flex-shrink-0">
          {([['memory', '项目记忆'], ['resource', '项目资源']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={onClose} className="w-7 h-7 rounded-lg icon-btn flex items-center justify-center text-xs" title="关闭">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'memory'
            ? <MemoryView projectId={projectId} onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
            : <ResourceView projectId={projectId} />}
        </div>
      </div>
    </div>
  )
}
