import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, BookOpen, Upload, Trash2, Save, X } from 'lucide-react'
import MemoryView from './MemoryView'
import ResourceView from './ResourceView'

/** 课程记忆与资源窗口：两个页签（记忆与进程 / 资源）可切换；initialTab 决定打开时默认页签。
 * 新建课程引导消息的「手动填写」按钮也复用此弹窗（initialOnly=true：仅初次创建可手动填写，
 * 记忆页顶部显示基本信息填写区，右上角「保存」→ 确认弹窗提示后续只能通过对话间接填写） */
export default function ProjectConfigModal({ projectId, projectName, onRequestModify, onRequestAnalyze, onClose, initialTab = 'memory', initialOnly = false, onSaved }: {
  projectId: string | null
  projectName?: string
  onRequestModify?: (label: string, pid?: string) => void
  onRequestAnalyze?: (projectName: string) => void
  onClose: () => void
  initialTab?: 'memory' | 'resource'
  initialOnly?: boolean
  onSaved?: () => void
}) {
  const [tab, setTab] = useState<'memory' | 'resource'>(initialTab)
  useEffect(() => { setTab(initialTab) }, [initialTab])
  const TABS: Array<{ key: 'memory' | 'resource'; label: string }> = [
    { key: 'memory', label: '记忆与进程' },
    { key: 'resource', label: '资源' },
  ]
  // 初次手动初始化：直接在项目记忆的「基本情况/目的/初始情况」区域原地填写（MemoryView initialEdit），右上角保存
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collected, setCollected] = useState<Record<string, string>>({})

  const doSave = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      // 提交编辑过的字段：基本情况（抽象项目情况/学习时间/强度与频率/学习周期）/ 目的（抽象目的）/ 初始情况（起点）
      const profile: Record<string, string> = {}
      for (const k of ['课程结束时间', '平均每日投入时间', '其他', '抽象目的', '起点']) {
        if (collected[k]) profile[k] = collected[k]
      }
      if (Object.keys(profile).length) {
        await fetch('/api/project-memory/' + encodeURIComponent(projectId), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile }),
        })
      }
      // 标记该课程已完成初次手动填写
      try {
        const done = JSON.parse(localStorage.getItem('coagent-manual-setup-done') || '[]')
        if (!done.includes(projectId)) { done.push(projectId); localStorage.setItem('coagent-manual-setup-done', JSON.stringify(done)) }
      } catch { /* 忽略 */ }
      onSaved?.()
      onClose()
    } catch (e) {
      alert('保存失败：' + ((e as any)?.message || '网络异常'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="w-[min(1200px,94vw)] h-[90vh] panel rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b hairline flex-shrink-0">
          {initialOnly ? (
            <>
              <h3 className="text-sm font-bold mr-2">课程</h3>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${tab === t.key ? 'bg-[#1a1a1a] text-white' : 'row-hover'}`}>
                  {t.label}
                </button>
              ))}
            </>
          ) : (
            <h3 className="text-sm font-bold">{tab === 'memory' ? '记忆与进程' : '资源'}</h3>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* 右上角保存：仅初次创建支持手动填写 */}
            {initialOnly && (
              <button onClick={() => setConfirming(true)} disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-medium text-white bg-[var(--accent)] hover:opacity-90 transition-colors disabled:opacity-50">
                <Save size={12} /> 保存
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-lg icon-btn flex items-center justify-center text-xs" title="关闭">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'memory'
            ? (
              <div className="h-full flex flex-col min-h-0">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <MemoryView projectId={projectId} projectOnly initialEdit={initialOnly} onEditChange={setCollected}
                    onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
                </div>
              </div>
            )
            : <ProjectResources projectId={projectId} />}
        </div>
      </div>
      {/* 保存确认弹窗：仅初次创建支持手动填写，后续只能通过对话间接填写 */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6" onClick={() => setConfirming(false)}>
          <div className="card-lift rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">保存课程信息？</p>
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              仅初次创建支持手动填写，<br />
              后续只能通过对话间接填写。<br />
              确定保存吗？
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirming(false)}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium border hairline row-hover transition-colors">取消</button>
              <button onClick={() => { setConfirming(false); doSave() }}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white bg-[var(--accent)] hover:opacity-90 transition-colors">确认保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 课程资源：栏目一为课程资源（可上传文件、拖入文件或系统资源），栏目二为系统内置资源（可拖入/加入） */
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
    if (!window.confirm(`从课程资源移除「${source}」？`)) return
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
      {/* 上：课程资源（可上传 / 拖入） */}
      <div className="flex-shrink-0 flex flex-col gap-2.5"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-dim uppercase tracking-wider">课程资源</p>
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
      {/* 下：系统内置资源（可拖入 / 加入课程），撑满剩余空间 */}
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0"><BookOpen size={13} /> 系统内置资源<span className="font-normal text-[10px] text-dim">（卡片可拖入上方，或点卡片详情「加入课程」）</span></p>
        <div className="flex-1 min-h-0 border hairline rounded-2xl overflow-hidden">
          <ResourceView projectId={projectId} onUseItem={addPreset} />
        </div>
      </div>
    </div>
  )
}
