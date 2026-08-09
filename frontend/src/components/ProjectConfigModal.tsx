import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, BookOpen, Upload, Trash2 } from 'lucide-react'
import MemoryView from './MemoryView'
import ResourceView from './ResourceView'

/** 项目记忆与资源窗口：点击侧栏对应「查看更多」进入，只展示对应界面（initialTab 决定展示哪个） */
export default function ProjectConfigModal({ projectId, onRequestModify, onRequestAnalyze, onClose, initialTab = 'memory' }: {
  projectId: string | null
  onRequestModify?: (label: string, pid?: string) => void
  onRequestAnalyze?: (projectName: string) => void
  onClose: () => void
  initialTab?: 'memory' | 'resource'
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="w-[min(1200px,94vw)] h-[90vh] panel rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b hairline flex-shrink-0">
          <h3 className="text-sm font-bold">{initialTab === 'memory' ? '记忆与进程' : '资源'}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg icon-btn flex items-center justify-center text-xs" title="关闭">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {initialTab === 'memory'
            ? <MemoryView projectId={projectId} projectOnly onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
            : <ProjectResources projectId={projectId} />}
        </div>
      </div>
    </div>
  )
}

/** 项目资源：栏目一为项目资源（可上传文件、拖入文件或系统资源），栏目二为系统内置资源（可拖入/加入） */
function ProjectResources({ projectId }: { projectId: string | null }) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const load = useCallback(() => {
    if (!projectId) { setDocs([]); setLoading(false); return }
    fetch('/api/kb/' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { load() }, [load])

  const uploadFiles = async (files: FileList | File[]) => {
    if (!projectId) return
    for (const f of Array.from(files)) {
      setUploading(f.name)
      const fd = new FormData()
      fd.append('project_id', projectId)
      fd.append('session_id', 'project-res')
      fd.append('api_key', localStorage.getItem('coagent-apikey') || '')
      fd.append('file', f, f.name)
      await fetch('/api/knowledge/upload-file', { method: 'POST', body: fd })
    }
    setUploading('')
    setTimeout(load, 2000)
  }
  const addPreset = async (title: string, body: string) => {
    if (!projectId) return
    setUploading('加入 ' + title)
    await fetch('/api/knowledge/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, text: body, source: title, session_id: 'project-res', api_key: localStorage.getItem('coagent-apikey') || '' }),
    })
    setUploading('')
    setTimeout(load, 2000)
  }
  const removeDoc = (source: string) => {
    if (!window.confirm(`从项目资源移除「${source}」？`)) return
    fetch('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId || 'default') + '&source=' + encodeURIComponent(source), { method: 'DELETE' })
      .then(() => setDocs(prev => prev.filter(d => d.source !== source)))
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const json = e.dataTransfer.getData('text/obs-item')
    if (json) {
      try {
        const it = JSON.parse(json)
        if (it && it.title && it.body) { addPreset(it.title, it.body); return }
      } catch { /* 忽略 */ }
    }
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
  }
  return (
    <div className="h-full p-6 flex flex-col gap-5 overflow-hidden">
      {/* 上：项目资源（可上传 / 拖入） */}
      <div className="flex-shrink-0 flex flex-col gap-2.5"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-dim uppercase tracking-wider">项目资源</p>
          <div className="flex items-center gap-2">
            {uploading && <span className="text-[11px] text-dim">处理中：{uploading}</span>}
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors">
              <Upload size={12} /> 上传文件
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }} />
          </div>
        </div>
        <div className={`border rounded-2xl p-3 flex flex-col gap-2 max-h-[26vh] overflow-y-auto transition-colors ${dragOver ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]' : 'border-dashed hairline'}`}>
          {loading ? (
            <div className="p-6 flex items-center justify-center text-xs text-dim">加载中…</div>
          ) : docs.length === 0 ? (
            <div className="p-6 flex flex-col items-center justify-center gap-1.5 text-xs text-dim">
              <Upload size={18} className="opacity-50" />
              <span>暂无资源 — 上传文件，或从下方系统资源拖入</span>
            </div>
          ) : docs.map(d => (
            <div key={d.source} className="flex items-center gap-3 border hairline rounded-xl px-3.5 py-2.5 bg-[var(--bg-panel)]">
              <span className="w-8 h-8 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0"><FileText size={14} /></span>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-xs font-semibold truncate">{d.source}</span>
                <span className="text-[10px] text-dim">{d.chunks} 块 · {d.preview || ''}</span>
              </div>
              <button onClick={() => removeDoc(d.source)} title="移除"
                className="p-1.5 rounded-lg text-dim hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      {/* 下：系统内置资源（可拖入 / 加入项目），撑满剩余空间 */}
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0"><BookOpen size={13} /> 系统内置资源<span className="font-normal text-[10px] text-dim">（卡片可拖入上方，或点卡片详情「加入项目」）</span></p>
        <div className="flex-1 min-h-0 border hairline rounded-2xl overflow-hidden">
          <ResourceView projectId={projectId} onUseItem={addPreset} />
        </div>
      </div>
    </div>
  )
}
