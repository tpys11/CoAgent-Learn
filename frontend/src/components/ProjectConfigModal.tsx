import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, BookOpen, Upload, Trash2, Save, X, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import MemoryView from './MemoryView'
import ResourceView from './ResourceView'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'

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
        await api.updateProject(projectId, { name: collected['项目名'].trim() })
      }
      if (Object.keys(profile).length) {
        await api.saveProjectMemory(projectId, profile)
      }
      // 标记该课程已完成初次手动填写
      const done = lsGetJSON<string[]>(LS.manualSetupDone, [])
      if (!done.includes(projectId)) { done.push(projectId); lsSetJSON(LS.manualSetupDone, done) }
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
  // 拖入/选择仅占位进待上传列表，点「确认上传」才真正上传（文件与卡片文本统一）
  const [doneMsg, setDoneMsg] = useState('')
  type PendingItem =
    | { kind: 'file'; id: string; file: File }
    | { kind: 'text'; id: string; title: string; body: string }
    | { kind: 'link'; id: string; title: string; url: string }
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const pendingCount = pendingItems.length
  const load = useCallback(() => {
    if (!projectId) { setDocs([]); setLoading(false); return }
    api.getKb(projectId)
      .then(d => setDocs(Array.isArray(d) ? d : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { load() }, [load])

  const uploadItems = async () => {
    if (!projectId) return
    let total = 0
    let okCount = 0
    const count = pendingItems.length
    for (const it of pendingItems) {
      setUploading(it.kind === 'file' ? it.file.name : it.title)
      try {
        if (it.kind === 'file') {
          const fd = new FormData()
          fd.append('project_id', projectId)
          fd.append('session_id', 'project-res')
          fd.append('api_key', lsGet(LS.apiKey, ''))
          fd.append('wait', '1')  // 同步等待后端切块+向量化入库完成
          fd.append('file', it.file, it.file.name)
          const d = await api.uploadKnowledgeFile(fd)
          if (d.status === 'ok') { total += (d.chunks || 0); okCount++ }
          else alert(`「${it.file.name}」接入失败：${d.msg || '处理失败'}`)
        } else if (it.kind === 'link') {
          // 链接资源：后端抓取网页正文入库（真实内容，非空转）
          const d = await api.uploadKnowledgeUrl({ project_id: projectId, url: it.url, source: it.title, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') })
          if (d.status === 'ok') { total += (d.chunks || 0); okCount++ }
          else alert(`「${it.title}」接入失败：${d.msg || '处理失败'}`)
        } else {
          // wait 是后端 query 参数（非 body），必须放在 URL 上，否则走异步分支返回 processing
          const d = await api.uploadKnowledgeText({ project_id: projectId, text: it.body, source: it.title, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') })
          if (d.status === 'ok') { total += (d.chunks || 0); okCount++ }
          else alert(`「${it.title}」接入失败：${d.msg || '处理失败'}`)
        }
      } catch (e) {
        alert(`「${it.kind === 'file' ? it.file.name : it.title}」上传失败：${(e as any)?.message || '网络异常'}`)
      }
    }
    setUploading('')
    setPendingItems([])
    // 明确反馈（对齐 DeepTutor「资源已上传」）：持久显示，直到下次上传；失败不再误报成功
    const failed = count - okCount
    setDoneMsg(failed === 0
      ? `资源已上传：${count} 个资源已接入课程知识库（${total} 个内容块）`
      : `上传完成：${okCount} 个成功（${total} 个内容块），${failed} 个失败`)
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
  /** 卡片「加入课程」/ 拖入的卡片 → 仅占位进待上传列表；无链接又无实质内容的资源明确提示，不假装上传 */
  const addPreset = (title: string, body: string, url?: string) => {
    const u = (url || '').trim()
    if (u) { addLinkItem(title, u); return }
    if ((body || '').trim().length >= 50) { addTextItem(title, body); return }
    alert(`「${title}」还没有链接或正文内容，无法接入知识库（请先为该资源补充链接）`)
  }
  /** 加入链接占位 */
  const addLinkItem = (title: string, url: string) => {
    setPendingItems(prev => {
      if (prev.some(x => x.kind === 'link' && x.url === url)) return prev
      return [...prev, { kind: 'link' as const, id: 'l' + Date.now() + Math.random().toString(36).slice(2, 7), title, url }]
    })
  }
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  /** 删除已上传资源：弹内部确认框，确认后删除 */
  const doRemove = () => {
    const src = removeTarget
    setRemoveTarget(null)
    if (!src || !projectId) return
    api.deleteKnowledge(projectId, src)
      .then(() => {
        setDocs(prev => prev.filter(d => d.source !== src))
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
        if (it && it.title && (it.body || it.url)) { addPreset(it.title, it.body || '', it.url || ''); return }
      } catch { /* 忽略 */ }
    }
    if (e.dataTransfer.files.length) { addFileItem(e.dataTransfer.files) }
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
            {!uploading && doneMsg && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                <CheckCircle2 size={12} /> {doneMsg}
              </span>
            )}
            <button onClick={confirmUpload}
              disabled={!!uploading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl hover:bg-[#333333] transition-colors disabled:opacity-50">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? '上传中…' : pendingCount ? `确认上传（${pendingCount}）` : '确认上传'}
            </button>
          </div>
        </div>
        <div className={`border rounded-2xl p-3 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[26vh] overflow-y-auto transition-colors ${dragOver ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]' : 'border-dashed hairline'}`}>
          {loading ? (
            <div className="col-span-full p-6 flex items-center justify-center text-xs text-dim">加载中…</div>
          ) : (
            <>
              {docs.map(d => (
                <div key={d.source} className="group flex items-center gap-2 border hairline rounded-xl px-3 py-2 bg-[var(--bg-panel)]">
                  <span className="w-7 h-7 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0"><FileText size={13} /></span>
                  <span className="text-xs font-semibold truncate flex-1 min-w-0" title={d.source}>{d.source}</span>
                  <button onClick={() => setRemoveTarget(d.source)} title="移除"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-dim hover:text-red-500 transition-colors flex-shrink-0"><Trash2 size={12} /></button>
                </div>
              ))}
              {/* 待上传占位：拖入/选择的资源显示在项目资源框内，点「确认上传」才真正上传 */}
              {pendingItems.map(it => (
                <div key={it.id} className="flex items-center gap-2 border border-dashed rounded-xl px-3 py-2 bg-[color-mix(in_srgb,var(--accent)_4%,var(--bg-panel))]">
                  <span className="w-7 h-7 rounded-lg bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0">
                    {it.kind === 'file' ? <FileText size={13} /> : it.kind === 'link' ? <ExternalLink size={13} /> : <BookOpen size={13} />}
                  </span>
                  <span className="text-xs font-semibold truncate flex-1 min-w-0" title={it.kind === 'file' ? it.file.name : it.title}>
                    {it.kind === 'file' ? it.file.name : it.title}
                  </span>
                  <span className="text-[9px] text-[var(--accent)] flex-shrink-0">待上传</span>
                  <button onClick={() => setPendingItems(prev => prev.filter(x => x.id !== it.id))} title="移除"
                    className="p-1 rounded text-dim hover:text-red-500 transition-colors flex-shrink-0"><X size={12} /></button>
                </div>
              ))}
              {docs.length === 0 && pendingCount === 0 && (
                <div className="col-span-full p-6 flex flex-col items-center justify-center gap-1.5 text-xs text-dim">
                  <Upload size={18} className="opacity-50" />
                  <span>暂无资源 — 拖入文件/系统资源，或点「选择文件」</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* 下：系统内置资源（可拖入 / 加入课程），撑满剩余空间 */}
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0"><BookOpen size={13} /> 系统内置资源{docs.length === 0 && <span className="font-normal text-[10px] text-dim">（卡片可拖入上方，或点卡片详情「加入课程」）</span>}</p>
        <div className={`border hairline rounded-2xl overflow-hidden ${naturalHeight ? 'h-[45vh]' : 'flex-1 min-h-0'}`}>
          <ResourceView embedded refreshSignal={refreshKey} projectId={projectId} onUseItem={addPreset} />
        </div>
      </div>
      {/* 内部确认弹窗：删除已上传资源（不用浏览器原生 confirm） */}
      {removeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-6" onClick={() => setRemoveTarget(null)}>
          <div className="card-lift rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold">移除资源</p>
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              从项目资源移除「{removeTarget}」？<br />
              移除后该内容不再用于课程知识库检索。
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setRemoveTarget(null)}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium border hairline row-hover transition-colors">取消</button>
              <button onClick={doRemove}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white bg-red-500 hover:opacity-90 transition-colors">删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
