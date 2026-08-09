import { useEffect, useState } from 'react'
import { FileText, BookOpen } from 'lucide-react'
import MemoryView from './MemoryView'

/** 项目配置弹窗：项目记忆 / 项目资源 两个页签 */
export default function ProjectConfigModal({ projectId, onRequestModify, onRequestAnalyze, onOpenResources, onClose }: {
  projectId: string | null
  onRequestModify?: (label: string, pid?: string) => void
  onRequestAnalyze?: (projectName: string) => void
  onOpenResources: () => void
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
            ? <MemoryView projectId={projectId} projectOnly onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
            : <ProjectResources projectId={projectId} onOpenResources={onOpenResources} />}
        </div>
      </div>
    </div>
  )
}

/** 项目资源：先展示项目已有资源，再提供引用系统内置资源的引导 */
function ProjectResources({ projectId, onOpenResources }: { projectId: string | null; onOpenResources: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!projectId) { setDocs([]); setLoading(false); return }
    fetch('/api/kb/' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [projectId])
  return (
    <div className="h-full overflow-y-auto p-6 flex flex-col gap-6 max-w-3xl">
      {/* 项目已有资源 */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider">项目资源</p>
        {loading ? (
          <div className="border hairline rounded-2xl p-8 flex items-center justify-center text-xs text-dim">加载中…</div>
        ) : docs.length === 0 ? (
          <div className="border border-dashed hairline rounded-2xl p-8 flex items-center justify-center text-xs text-dim">暂无资源</div>
        ) : docs.map(d => (
          <div key={d.source} className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0"><FileText size={16} /></span>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-semibold truncate">{d.source}</span>
              <span className="text-[11px] text-dim">{d.chunks} 块 · {d.preview || ''}</span>
            </div>
          </div>
        ))}
      </div>
      {/* 引用系统内置资源的引导 */}
      <div className="border hairline rounded-2xl p-5 bg-[var(--bg-panel)] flex flex-col gap-3">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5"><BookOpen size={13} /> 系统内置资源</p>
        <button onClick={onOpenResources}
          className="self-start px-4 py-2 rounded-xl text-xs font-medium text-white shadow-soft transition-transform hover:scale-105"
          style={{ background: 'var(--accent)' }}>
          进入系统资源中心
        </button>
      </div>
    </div>
  )
}
