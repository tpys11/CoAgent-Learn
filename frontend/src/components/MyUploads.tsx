import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Image as ImageIcon, X, File as FileIcon, Eye, BookOpen } from 'lucide-react'
import { api } from '../api'

interface ResItem {
  id: string; name: string; content?: string; type?: string
  file_ext?: string; file_size?: number; created_at?: string
}

const ACCEPT = '.txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx,.xlsx,.epub,.png,.jpg,.jpeg,.gif,.webp'
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']

function extIcon(ext?: string) {
  if (!ext) return <FileIcon size={14} className="text-dim" />
  return IMG_EXTS.includes(ext) ? <ImageIcon size={14} className="text-dim" /> : <FileText size={14} className="text-dim" />
}
const fmtSize = (n?: number) => {
  if (!n && n !== 0) return ''
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'
}
const fmtDate = (s?: string) => s ? String(s).slice(0, 10) : ''

/** 我的上传（个人资源库，不绑课程）：上传文档/图片 → 资源表；可预览解析文本、删除 */
export default function MyUploads() {
  const [items, setItems] = useState<ResItem[]>([])
  const [loading, setLoading] = useState(false)
  const [upBusy, setUpBusy] = useState(false)
  const [upMsg, setUpMsg] = useState('')
  const [preview, setPreview] = useState<ResItem | null>(null)
  const [projs, setProjs] = useState<Array<{ id: string; name: string }>>([])
  const [joinTarget, setJoinTarget] = useState<ResItem | null>(null)
  const [joining, setJoining] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const BUCKET = 'default' // 个人资源库桶（不属具体课程）

  const load = () => {
    setLoading(true)
    api.listResources(BUCKET)
      .then(d => setItems(Array.isArray(d?.resources) ? d.resources : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const doUpload = async (f: File) => {
    setUpBusy(true); setUpMsg('上传解析中：' + f.name + ' …')
    try {
      const fd = new FormData()
      fd.append('project_id', BUCKET)
      fd.append('file', f, f.name)
      await api.uploadResource(fd)
      setUpMsg('✓ 已保存到「我的上传」')
      load()
    } catch (e: any) {
      setUpMsg('上传失败：' + (e?.message || '网络异常') + '（该格式可能无法解析，但仍尝试保存）')
    } finally {
      setUpBusy(false)
    }
  }

  const openJoin = async (r: ResItem) => {
    setJoinTarget(r)
    try { const d = await api.listProjects(); setProjs(Array.isArray(d?.projects) ? d.projects : []) } catch { setProjs([]) }
  }
  const doJoin = async () => {
    if (!joinTarget) return
    const pid = (document.getElementById('join-proj-select') as HTMLSelectElement)?.value
    if (!pid) { alert('请选择课程'); return }
    setJoining(joinTarget.id); setJoinTarget(null)
    try {
      const d = await api.resourceJoinProject(joinTarget.id, pid)
      alert(d.status === 'ok' ? ('已加入课程知识库（' + (d.chunks || 0) + ' 个内容块）') : ('加入失败：' + (d.msg || '')))
    } catch (e: any) { alert('加入失败：' + (e?.message || '网络异常')) }
    finally { setJoining('') }
  }
  const del = async (id: string) => {
    if (!window.confirm('删除这条资源？')) return
    try { await api.deleteResource(id) } catch { /* ignore */ }
    load()
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6">
      {/* 顶部：说明 + 上传按钮 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">我的上传</h2>
          <p className="text-[11px] text-dim mt-0.5">个人资源库（不绑定具体课程）。上传后可在任意课程里使用。</p>
        </div>
        <input ref={fileRef} type="file" className="hidden" accept={ACCEPT}
          onChange={e => { const f = e.target.files?.[0]; if (f) void doUpload(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={upBusy}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-semibold hover:bg-[#333333] transition-colors disabled:opacity-50">
          <Upload size={14} /> {upBusy ? '上传中…' : '上传资源'}
        </button>
      </div>
      {upMsg && <p className="text-[11px] text-dim mb-3 -mt-2">{upMsg}</p>}

      {/* 提示：支持格式 + 展示方式 */}
      <p className="text-[10px] text-dim mb-3 leading-relaxed">
        支持：文档(txt/md/pdf/docx/pptx/xlsx/epub/html) · 代码(py/js/ts/json/csv/css/log/yaml) · 图片(png/jpg/gif/webp)。
        {upMsg && upMsg.includes('无法解析') ? ' —— 无法解析的格式仅保存文件名，不产生可检索文本。' : ''}
      </p>

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? <p className="text-xs text-dim py-8 text-center">加载中…</p>
          : items.length === 0 ? (
            <div className="border-2 border-dashed hairline rounded-2xl py-16 flex flex-col items-center gap-2 text-dim">
              <Upload size={26} strokeWidth={1.5} />
              <p className="text-xs">还没有上传资源</p>
              <p className="text-[10px]">点右上角「上传资源」把文件/资料存进个人资源库</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(r => (
                <div key={r.id} className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2 group">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="mt-0.5 flex-shrink-0">{extIcon(r.file_ext)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" title={r.name}>{r.name}</p>
                      <p className="text-[10px] text-dim mt-0.5">{fmtDate(r.created_at)}{r.file_size ? ' · ' + fmtSize(r.file_size) : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setPreview(r)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg text-dim hover:bg-[var(--bg-hover)]" title="预览解析文本">
                      <Eye size={11} /> 预览
                    </button>
                    <button onClick={() => openJoin(r)} disabled={!!joining}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg text-[var(--accent)] hover:bg-blue-50" title="加入某课程知识库（可检索）">
                      <BookOpen size={11} /> 加入课程
                    </button>
                    <button onClick={() => del(r.id)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg text-dim hover:bg-red-50 hover:text-red-500" title="删除">
                      <Trash2 size={11} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* 加入课程弹窗 */}
      {joinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setJoinTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="w-[380px] rounded-2xl bg-white border hairline shadow-2xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-bold">把「{joinTarget.name}」加入课程</h3>
            <p className="text-[11px] text-dim">加入后该课程可基于它检索回答（文档切块入库）。</p>
            <select id="join-proj-select" defaultValue={projs[0]?.id || ''} className="w-full px-3 py-2 border hairline rounded-lg text-xs">
              {projs.length === 0 ? <option value="">暂无课程</option> : projs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setJoinTarget(null)} className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={doJoin} disabled={projs.length === 0}
                className="text-xs px-4 py-1.5 bg-[#1a1a1a] text-white font-semibold rounded-lg disabled:opacity-40">加入</button>
            </div>
          </div>
        </div>
      )}
      {/* 预览弹窗 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setPreview(null)}>
          <div onClick={e => e.stopPropagation()} className="w-[560px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-2xl bg-white border hairline shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b hairline">
              <p className="text-xs font-bold truncate">{preview.name}</p>
              <button onClick={() => setPreview(null)} className="p-1 rounded-lg text-dim hover:bg-[var(--bg-hover)]"><X size={14} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              {preview.content && preview.content.trim() ? (
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--text)]">{preview.content}</pre>
              ) : (
                <p className="text-xs text-dim py-8 text-center">
                  {IMG_EXTS.includes(preview.file_ext || '')
                    ? '（图片资源：已保存，无文字预览；其内容描述在入库时生成）'
                    : '（该资源无解析文本：可能是无法解析的格式，仅保存了文件名）'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
