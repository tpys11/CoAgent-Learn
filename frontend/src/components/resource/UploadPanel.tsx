/** 上传资源面板（文本 / 文件两种方式；链接通道已下线，保留件见 resource/linkIngest/） */
import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Sparkles, Loader2, X } from 'lucide-react'
import { LS, lsGet } from '../../storage'
import { api } from '../../api'

type UpItem = { id: string; kind: 'file' | 'text'; name: string; file?: File; body?: string }

export function UploadPanel({ projectId, onUploaded }: { projectId: string | null; onUploaded: () => void }) {
  const [upMode, setUpMode] = useState<'text' | 'file'>('text')
  const [upTitle, setUpTitle] = useState('')
  const [upText, setUpText] = useState('')
  const [upItems, setUpItems] = useState<UpItem[]>([])
  const [upUploading, setUpUploading] = useState('')
  const [upDone, setUpDone] = useState('')
  const [upDropActive, setUpDropActive] = useState(false)
  const upFileRef = useRef<HTMLInputElement>(null)
  // 支持格式单一事实源：以后端 upload-constraints 为准（对齐 DeepTutor SupportedFileTypesInfo）
  const [accept, setAccept] = useState('.txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx')
  const [allowedExts, setAllowedExts] = useState<string[]>([])
  useEffect(() => {
    api.getUploadConstraints().then(d => {
      if (d && Array.isArray(d.extensions)) {
        setAccept(d.accept || accept)
        setAllowedExts(d.extensions.map((x: string) => x.replace('.', '')))
      }
    }).catch(() => {})
  }, [])

  const upAddText = () => {
    const title = upTitle.trim() || '文本资料'
    if (!upText.trim()) { alert('请输入文本内容'); return }
    setUpItems(prev => [...prev, { id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), kind: 'text', name: title, body: upText }])
    setUpTitle(''); setUpText('')
  }
  const upAddFiles = (fs: FileList | File[]) => {
    let incoming: File[] = Array.from(fs)
    if (allowedExts.length) {
      const bad = incoming.filter(f => {
        const ext = f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()
        return !allowedExts.includes(ext)
      })
      if (bad.length) alert(`不支持的文件格式：${bad.map(f => f.name).join('、')}（支持：${allowedExts.join('/')} 等）`)
      incoming = incoming.filter(f => allowedExts.includes(f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase()))
    }
    setUpItems(prev => {
      const names = new Set(prev.filter(x => x.kind === 'file' && x.file).map(x => x.name))
      return [...prev, ...incoming.filter(f => !names.has(f.name)).map(f => ({ id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), kind: 'file' as const, name: f.name, file: f }))]
    })
  }
  const upUploadAll = async () => {
    if (!projectId || !upItems.length || upUploading) return
    let total = 0; let ok = 0
    const count = upItems.length
    for (const it of upItems) {
      setUpUploading(it.name)
      try {
        let d: any = null
        if (it.kind === 'file' && it.file) {
          const fd = new FormData()
          fd.append('project_id', projectId); fd.append('session_id', 'project-res')
          fd.append('api_key', lsGet(LS.apiKey, ''))
          fd.append('wait', '1'); fd.append('file', it.file, it.file.name)
          d = await api.uploadKnowledgeFile(fd)
        } else if (it.kind === 'text') {
          d = await api.uploadKnowledgeText({ project_id: projectId, text: it.body, source: it.name, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') })
        }
        if (d && d.status === 'ok') { total += (d.chunks || 0); ok++ }
        else if (d && d.duplicate) { /* 重复内容视为成功跳过 */ }
        else alert(`「${it.name}」接入失败：${(d && d.msg) || '处理失败'}`)
      } catch (e) {
        alert(`「${it.name}」上传失败：${(e as any)?.message || '网络异常'}`)
      }
    }
    setUpUploading('')
    setUpItems([])
    const failed = count - ok
    setUpDone(failed === 0 ? `资源已上传：${count} 个资源已接入课程知识库（${total} 个内容块）` : `上传完成：${ok} 个成功（${total} 个内容块），${failed} 个失败`)
    setTimeout(() => onUploaded(), 500)
  }

  return (
    <div className="border border-[var(--border-color)] rounded-2xl p-4 mb-5 bg-[var(--bg-panel)] shadow-soft flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold flex items-center gap-2"><Upload size={15} /> 上传资源</p>
        {upUploading && <span className="text-[11px] text-dim">上传中：{upUploading}</span>}
        {!upUploading && upDone && <span className="text-[11px] text-emerald-600 font-medium">✓ {upDone}</span>}
      </div>
      {/* 两种方式切换 */}
      <div className="flex gap-2">
        {([['text', '文本'], ['file', '文件']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setUpMode(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${upMode === k ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)]'}`}>
            {label}
          </button>
        ))}
      </div>
      {/* 文本方式 */}
      {upMode === 'text' && (
        <div className="flex flex-col gap-2">
          <input value={upTitle} onChange={e => setUpTitle(e.target.value)} placeholder="标题（可选）"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          <textarea value={upText} onChange={e => setUpText(e.target.value)} rows={3} placeholder="粘贴文本内容"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none resize-none" />
          <div className="flex justify-end">
            <button onClick={upAddText} className="px-3.5 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl hover:bg-[#333333] transition-colors">加入上传</button>
          </div>
        </div>
      )}
      {/* 文件方式 */}
      {upMode === 'file' && (
        <button type="button" onClick={() => upFileRef.current?.click()}
          onDragEnter={e => { e.preventDefault(); setUpDropActive(true) }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={() => setUpDropActive(false)}
          onDrop={e => { e.preventDefault(); setUpDropActive(false); if (e.dataTransfer.files.length) upAddFiles(e.dataTransfer.files) }}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-5 py-5 text-center transition-colors ${upDropActive ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]' : 'border-[var(--border-color)] hover:bg-[var(--bg-hover)]'}`}>
          <Upload size={18} className="text-dim" />
          <span className="text-[11.5px] text-dim">点击选择文件，或拖拽到此处</span>
        </button>
      )}
      <input ref={upFileRef} type="file" multiple className="hidden"
        accept={accept}
        onChange={e => { if (e.target.files?.length) upAddFiles(e.target.files); e.target.value = '' }} />
      {/* 待上传列表 + 确认上传 */}
      {upItems.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t hairline pt-3">
          <p className="text-[11px] font-semibold text-dim">待上传（{upItems.length}）</p>
          {upItems.map(it => (
            <div key={it.id} className="flex items-center gap-2 rounded-lg border hairline px-2.5 py-1.5">
              <span className="w-6 h-6 rounded-md bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0">
                {it.kind === 'file' ? <FileText size={11} /> : <Sparkles size={11} />}
              </span>
              <span className="text-[11px] font-medium truncate flex-1">{it.name}</span>
              <span className="text-[9px] text-dim flex-shrink-0">{it.kind === 'file' ? '文件' : '文本'}</span>
              <button onClick={() => setUpItems(prev => prev.filter(x => x.id !== it.id))} className="p-1 rounded text-dim hover:text-red-500 flex-shrink-0" title="移除"><X size={11} /></button>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button onClick={() => setUpItems([])} className="px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover transition-colors">清空</button>
            <button onClick={upUploadAll} disabled={!!upUploading} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#1a1a1a] text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
              {upUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {upUploading ? '上传中…' : `确认上传（${upItems.length}）`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
