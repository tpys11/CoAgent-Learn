import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, BookOpen, Upload, Trash2, Save, X, Loader2, CheckCircle2 } from 'lucide-react'
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
      // 提交编辑过的字段：项目名（PATCH）/ 基本情况（课程结束时间/平均每日投入时间/其他）/ 目的（抽象目的）/ 初始情况（起点）
      const profile: Record<string, string> = {}
      for (const k of ['课程结束时间', '平均每日投入时间', '其他', '抽象目的', '起点']) {
        if (collected[k]) profile[k] = collected[k]
      }
      if (collected['项目名'] && collected['项目名'].trim() && collected['项目名'].trim() !== projectName) {
        await fetch('/api/projects/' + encodeURIComponent(projectId), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: collected['项目名'].trim() }),
        })
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
            <h3 className="text-sm font-bold">课程初始化</h3>
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
          {initialOnly ? (
            // 初始化：记忆与资源同一界面整体滚动（一个滚动容器，一起滑动）
            <div className="h-full overflow-y-auto flex flex-col">
              <MemoryView projectId={projectId} projectOnly initialEdit onEditChange={setCollected}
                onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
              <div className="border-t hairline">
                <ProjectResources projectId={projectId} naturalHeight />
              </div>
            </div>
          ) : tab === 'memory' ? (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-hidden">
                <MemoryView projectId={projectId} projectOnly
                  onRequestModify={onRequestModify} onRequestAnalyze={onRequestAnalyze} />
              </div>
            </div>
          ) : <ProjectResources projectId={projectId} />}
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

/** 项目资源：栏目一为项目资源（可上传文件、拖入文件或系统资源），栏目二为系统内置资源（可拖入/加入） */
function ProjectResources({ projectId, naturalHeight }: { projectId: string | null; naturalHeight?: boolean }) {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  // 「添加文档」流程（对齐 DeepTutor Add documents）：拖入/选择仅占位进列表，
  // 点「确认上传」才真正上传（文件与卡片文本统一）
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  type PendingItem =
    | { kind: 'file'; id: string; file: File }
    | { kind: 'text'; id: string; title: string; body: string }
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const pendingCount = pendingItems.length
  const load = useCallback(() => {
    if (!projectId) { setDocs([]); setLoading(false); return }
    fetch('/api/kb/' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { load() }, [load])

  const uploadItems = async () => {
    if (!projectId) return
    let total = 0
    const count = pendingItems.length
    for (const it of pendingItems) {
      setUploading(it.kind === 'file' ? it.file.name : it.title)
      try {
        if (it.kind === 'file') {
          const fd = new FormData()
          fd.append('project_id', projectId)
          fd.append('session_id', 'project-res')
          fd.append('api_key', localStorage.getItem('coagent-apikey') || '')
          fd.append('wait', '1')  // 同步等待后端切块+向量化入库完成
          fd.append('file', it.file, it.file.name)
          const r = await fetch('/api/knowledge/upload-file', { method: 'POST', body: fd })
          const d = await r.json().catch(() => ({}))
          if (d.status === 'ok') total += (d.chunks || 0)
          else alert(`「${it.file.name}」接入失败：${d.msg || '处理失败'}`)
        } else {
          const r = await fetch('/api/knowledge/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, text: it.body, source: it.title, session_id: 'project-res', api_key: localStorage.getItem('coagent-apikey') || '', wait: true }),
          })
          const d = await r.json().catch(() => ({}))
          if (d.status === 'ok') total += (d.chunks || 0)
          else alert(`「${it.title}」接入失败：${d.msg || '处理失败'}`)
        }
      } catch (e) {
        alert(`「${it.kind === 'file' ? it.file.name : it.title}」上传失败：${(e as any)?.message || '网络异常'}`)
      }
    }
    setUploading('')
    setPendingItems([])
    // 明确反馈（对齐 DeepTutor「资源已上传」）：持久显示，直到下次上传
    setDoneMsg(`资源已上传：${count} 个资源已接入课程知识库（${total} 个内容块）`)
    setTimeout(() => { load(); setRefreshKey(k => k + 1) }, 500)
  }
  /** 加入文件占位（按文件名去重） */
  const addFileItem = (fs: FileList | File[]) => {
    const incoming = Array.from(fs)
    setPendingItems(prev => {
      const names = new Set(prev.filter(x => x.kind === 'file').map(x => x.file.name))
      return [...prev, ...incoming.filter(f => !names.has(f.name)).map(f => ({ kind: 'file' as const, id: 'f' + Date.now() + Math.random().toString(36).slice(2, 7), file: f }))]
    })
  }
  /** 加入卡片/文本占位（按标题去重） */
  const addTextItem = (title: string, body: string) => {
    setPendingItems(prev => {
      if (prev.some(x => x.kind === 'text' && x.title === title)) return prev
      return [...prev, { kind: 'text' as const, id: 't' + Date.now() + Math.random().toString(36).slice(2, 7), title, body }]
    })
  }
  /** 确认上传：把占位列表里的资源真正上传（同步向量化）；拖入只占位，不弹选择器 */
  const confirmUpload = () => {
    if (uploading) return
    if (!pendingCount) { alert('请先把资源拖入虚线框，或点击选择文件'); return }
    uploadItems()
  }
  /** 文件大小格式化 */
  const fmtSize = (b: number) => b < 1024 ? b + 'B' : b < 1024 * 1024 ? (b / 1024).toFixed(1) + 'KB' : (b / (1024 * 1024)).toFixed(1) + 'MB'
  /** 卡片「加入课程」/ 拖入的卡片 → 仅占位进待上传列表（不真正上传） */
  const addPreset = (title: string, body: string) => {
    addTextItem(title, body)
    setShowAddDoc(true)
  }
  const removeDoc = (source: string) => {
    if (!window.confirm(`从项目资源移除「${source}」？`)) return
    fetch('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId || 'default') + '&source=' + encodeURIComponent(source), { method: 'DELETE' })
      .then(() => {
        setDocs(prev => prev.filter(d => d.source !== source))
        setRefreshKey(k => k + 1)  // 刷新嵌套 ResourceView（原文已转存资源表）
      })
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
    if (e.dataTransfer.files.length) { addFileItem(e.dataTransfer.files); setShowAddDoc(true) }
  }
  return (
    <div className={`p-6 flex flex-col gap-5 ${naturalHeight ? '' : 'h-full overflow-hidden'}`}>
      {/* 上：项目资源（可上传 / 拖入） */}
      <div className="flex-shrink-0 flex flex-col gap-2.5"
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-dim uppercase tracking-wider">项目资源</p>
          <div className="flex items-center gap-2">
            {uploading && <span className="text-[11px] text-dim">向量化中：{uploading}</span>}
            {!uploading && doneMsg && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <CheckCircle2 size={12} /> {doneMsg}
              </span>
            )}
            <button onClick={() => setShowAddDoc(v => !v)}
              disabled={!!uploading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors disabled:opacity-50">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? '上传中…' : showAddDoc ? '收起' : '确认上传'}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) addFileItem(e.target.files); e.target.value = '' }} />
          </div>
        </div>
        <div className={`border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[26vh] overflow-y-auto transition-colors ${dragOver ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]' : 'border-dashed hairline'}`}>
          {loading ? (
            <div className="col-span-full p-6 flex items-center justify-center text-xs text-dim">加载中…</div>
          ) : docs.length === 0 ? (
            <div className="col-span-full p-6 flex flex-col items-center justify-center gap-1.5 text-xs text-dim">
              <Upload size={18} className="opacity-50" />
              <span>暂无资源 — 上传文件，或从下方系统资源拖入</span>
            </div>
          ) : docs.map(d => (
            <div key={d.source} className="group flex items-center gap-2 border hairline rounded-xl px-3 py-2 bg-[var(--bg-panel)]">
              <span className="w-7 h-7 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0"><FileText size={13} /></span>
              <span className="text-xs font-semibold truncate flex-1 min-w-0" title={d.source}>{d.source}</span>
              <button onClick={() => removeDoc(d.source)} title="移除"
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-dim hover:text-red-500 transition-colors flex-shrink-0"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
        {/* 添加文档：DeepTutor 式上传流程（拖拽/选择文件 → 列表 → 确认上传） */}
        {showAddDoc && (
          <div className="border border-[var(--border-color)] rounded-2xl p-4 bg-[var(--bg-panel)] shadow-soft flex flex-col gap-3">
            <div>
              <p className="text-[13px] font-semibold">添加文档</p>
              <p className="mt-0.5 text-[11px] text-dim">拖拽文件到这里，或点击选择文件；确认后接入课程知识库（自动向量化）</p>
            </div>
            {/* 虚线框：点击选择 / 拖拽（文件或卡片），仅占位进列表 */}
            <button
              type="button"
              disabled={!!uploading}
              onClick={() => fileRef.current?.click()}
              onDragEnter={e => { e.preventDefault(); setDropActive(true) }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDragLeave={() => setDropActive(false)}
              onDrop={e => {
                e.preventDefault(); setDropActive(false)
                const json = e.dataTransfer.getData('text/obs-item')
                if (json) {
                  try { const it = JSON.parse(json); if (it && it.title && it.body) { addTextItem(it.title, it.body); return } } catch { /* 忽略 */ }
                }
                if (e.dataTransfer.files.length) addFileItem(e.dataTransfer.files)
              }}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors ${dropActive ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]' : 'border-[var(--border-color)] hover:border-[var(--text)]/30 hover:bg-[var(--bg-hover)]'} ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload size={20} className="text-dim" />
              <span className="text-[12px] font-medium">
                {dropActive ? '释放即可添加' : pendingCount ? `已选择 ${pendingCount} 个资源（待确认上传）` : '点击选择文件，或拖拽文件/卡片到此处'}
              </span>
              <span className="text-[10px] text-dim">支持文件（TXT/MD/PDF/Word/PPT）与系统资源卡片</span>
            </button>
            {/* 待上传列表：对齐 DeepTutor SelectionSummary（文件 + 卡片文本占位） */}
            {pendingCount > 0 && (
              <div className="flex flex-col gap-1.5">
                {pendingItems.map(it => (
                  <div key={it.id} className="flex items-center gap-2.5 rounded-xl border hairline px-3 py-2 bg-[var(--bg-panel)]">
                    <span className="w-7 h-7 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0">
                      {it.kind === 'file' ? <FileText size={13} /> : <BookOpen size={13} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-medium truncate">{it.kind === 'file' ? it.file.name : it.title}</p>
                      <p className="text-[10px] text-dim">{it.kind === 'file' ? fmtSize(it.file.size) : '系统资源'}</p>
                    </div>
                    <button onClick={() => setPendingItems(prev => prev.filter(x => x.id !== it.id))}
                      className="p-1.5 rounded-lg text-dim hover:bg-[var(--bg-hover)] hover:text-red-500 flex-shrink-0" title="移除">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setPendingItems([])} className="self-end text-[10px] text-dim hover:text-red-500 px-1" title="清空">
                  清空选择
                </button>
              </div>
            )}
            {/* 确认上传按钮：点击才真正上传（同步向量化） */}
            <div className="flex justify-end">
              <button onClick={confirmUpload} disabled={!pendingCount || !!uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? '上传中…' : `确认上传（${pendingCount}）`}
              </button>
            </div>
          </div>
        )}
      </div>
      {/* 下：系统内置资源（可拖入 / 加入课程），撑满剩余空间 */}
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0"><BookOpen size={13} /> 系统内置资源{docs.length === 0 && <span className="font-normal text-[10px] text-dim">（卡片可拖入上方，或点卡片详情「加入课程」）</span>}</p>
        <div className={`border hairline rounded-2xl overflow-hidden ${naturalHeight ? 'h-[45vh]' : 'flex-1 min-h-0'}`}>
          <ResourceView refreshSignal={refreshKey} projectId={projectId} onUseItem={addPreset} />
        </div>
      </div>
    </div>
  )
}
