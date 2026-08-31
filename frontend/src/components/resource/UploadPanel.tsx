/** 上传资源面板（文本 / 文件两种方式；链接通道已下线，保留件见 resource/linkIngest/） */
import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Sparkles, Loader2, X } from 'lucide-react'
import { LS, lsGet } from '../../storage'
import { api } from '../../api'

type UpItem = { id: string; kind: 'file' | 'text'; name: string; file?: File; body?: string }

// F3（N2-2）：约束端点拉取失败时的静态回退清单，与后端 UPLOAD_CONSTRAINTS 对齐（5 种图片）。
// 置于模块级：useState 初始值与 catch 兜底共用一份。此前失败被 .catch(() => {}) 静默吞掉、
// allowedExts 留空导致 upAddFiles 的二次过滤整体失效（任何文件都能进）——校验不得因
// 一次网络抖动静默关闭。
// F4′修复④：剔除 .bmp——上游 VL 服务拒收 bmp（E-31，owner 拍板剔除不转码），
// 约束端点故障回退时不得再放行。
const FALLBACK_ACCEPT =
  '.txt,.md,.markdown,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx,.xlsx,.epub,.png,.jpg,.jpeg,.gif,.webp'
const FALLBACK_EXTS = FALLBACK_ACCEPT.split(',').map(x => x.replace('.', ''))

export function UploadPanel({ projectId, onUploaded }: { projectId: string | null; onUploaded: () => void }) {
  const [upMode, setUpMode] = useState<'text' | 'file'>('text')
  // 单步3：后台处理进度条（轮询 /api/knowledge/upload-progress：解析→切分→向量化→增强）
  const [upProgress, setUpProgress] = useState<{ stage: string; pct: number } | null>(null)
  const [upTitle, setUpTitle] = useState('')
  const [upText, setUpText] = useState('')
  const [upItems, setUpItems] = useState<UpItem[]>([])
  const [upUploading, setUpUploading] = useState('')
  const [upDone, setUpDone] = useState('')
  const [upDropActive, setUpDropActive] = useState(false)
  const upFileRef = useRef<HTMLInputElement>(null)
  // 支持格式单一事实源：以后端 upload-constraints 为准（对齐 DeepTutor SupportedFileTypesInfo）。
  // 初始态即回退清单（而非留空）：拉取成功后被端点值覆盖；拉取失败时校验保持开启。
  const [accept, setAccept] = useState(FALLBACK_ACCEPT)
  const [allowedExts, setAllowedExts] = useState<string[]>(FALLBACK_EXTS)
  useEffect(() => {
    api.getUploadConstraints().then(d => {
      if (d && Array.isArray(d.extensions)) {
        setAccept(d.accept || FALLBACK_ACCEPT)
        setAllowedExts(d.extensions.map((x: string) => x.replace('.', '')))
      }
    }).catch(() => {
      // F3 修复②：拉取失败不得静默——回退默认清单（校验保持开启）+ 可见告警。
      console.warn('[UploadPanel] upload-constraints 拉取失败，已回退内置默认格式清单（校验保持开启）')
    })
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
  const STAGE_CN: Record<string, string> = {
    parsing: '解析文档', chunking: '切分内容块', embedding: '向量化入库', enhancing: '问题增强',
  }

  /** 后台处理进度轮询：完成/错误/10 分钟超时退出；返回最终入库块数与失败原因（用于汇总文案）。
   *  F4′修复①：后端 _set_progress_error 写入的失败原因（msg）随 resolve 透传给 alert，
   *  此前被丢弃——评委只能看到「处理失败或超时」，看不到「未配置 EMBEDDING_API_KEY」。
   *  F8-S2：进度载荷的 parse_engine（本次解析用的引擎）随 resolve 透传给完成汇总。 */
  const pollProgress = (source: string) => new Promise<{ ok: boolean; chunks: number; msg?: string; engine?: string }>(resolve => {
    const started = Date.now()
    let lastChunks = 0
    let stable = 0
    let lastEngine: string | undefined
    const timer = setInterval(async () => {
      try {
        const p: any = await api.uploadProgress(projectId || 'default', source)
        if (p && p.status === 'error') {
          clearInterval(timer); setUpProgress(null); resolve({ ok: false, chunks: 0, msg: p.msg }); return
        }
        if (p && p.status === 'ok') {
          if (p.parse_engine) lastEngine = p.parse_engine
          lastChunks = Math.max(lastChunks, p.total || 0)
          const pct = p.total ? Math.max(6, Math.min(99, Math.round(100 * p.done / p.total)))
                              : (p.stage === 'parsing' ? 12 : 40)
          setUpProgress({ stage: STAGE_CN[p.stage || ''] || '处理中', pct })
          const embDone = p.stage === 'embedding' && p.done === p.total && p.total > 0
          if (embDone) stable++; else stable = 0
          // 完成判定：问题增强收尾（默认链路）或向量化满载连续两拍（增强被关闭的配置）
          if ((p.stage === 'enhancing' && (p.done || 0) >= (p.total || 1)) || stable >= 2) {
            clearInterval(timer); setUpProgress(null); resolve({ ok: true, chunks: lastChunks, engine: lastEngine }); return
          }
        }
        if (Date.now() - started > 10 * 60 * 1000) {
          clearInterval(timer); setUpProgress(null); resolve({ ok: false, chunks: 0 })
        }
      } catch { /* 网络抖动：继续轮询（超时兜底） */ }
    }, 1200)
  })

  const upUploadAll = async () => {
    if (!projectId || !upItems.length || upUploading) return
    let total = 0; let ok = 0
    const count = upItems.length
    const engines = new Set<string>() // F8-S2：本次上传实际用到的解析引擎（完成汇总展示）
    for (const it of upItems) {
      setUpUploading(it.name)
      try {
        let d: any = null
        if (it.kind === 'file' && it.file) {
          const fd = new FormData()
          fd.append('project_id', projectId); fd.append('session_id', 'project-res')
          fd.append('api_key', lsGet(LS.apiKey, ''))
          fd.append('wait', '0'); fd.append('file', it.file, it.file.name)
          d = await api.uploadKnowledgeFile(fd)
          if (d && d.status === 'processing') {
            // 单步3：后台处理 + 进度轮询（解析→切分→向量化→问题增强）
            setUpProgress({ stage: '解析文档', pct: 6 })
            const r = await pollProgress(it.name)               // source = 文件名（后端 source=fname）
            if (r.ok) { ok++; total += r.chunks; if (r.engine) engines.add(r.engine) }
            else alert(`「${it.name}」处理失败${r.msg ? '：' + r.msg : '或超时'}，请稍后在知识库查看`)
          } else if (d && d.status === 'ok') { total += (d.chunks || 0); ok++; if (d.parse_engine) engines.add(d.parse_engine) }
          else if (d && d.duplicate) { /* 重复内容视为成功跳过 */ }
          else alert(`「${it.name}」接入失败：${(d && d.msg) || '处理失败'}`)
        } else if (it.kind === 'text') {
          d = await api.uploadKnowledgeText({ project_id: projectId, text: it.body, source: it.name, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') })
          if (d && d.status === 'ok') { total += (d.chunks || 0); ok++ }
          else if (d && d.duplicate) { /* 重复内容视为成功跳过 */ }
          else alert(`「${it.name}」接入失败：${(d && d.msg) || '处理失败'}`)
        }
      } catch (e) {
        alert(`「${it.name}」上传失败：${(e as any)?.message || '网络异常'}`)
      }
    }
    setUpUploading('')
    setUpItems([])
    const failed = count - ok
    const engineSuffix = engines.size ? `（解析引擎：${Array.from(engines).join('、')}）` : ''
    setUpDone(failed === 0 ? `资源已上传：${count} 个资源已接入课程知识库（${total} 个内容块）${engineSuffix}` : `上传完成：${ok} 个成功（${total} 个内容块），${failed} 个失败`)
    setTimeout(() => onUploaded(), 500)
  }

  return (
    <div className="border border-[var(--border-color)] rounded-2xl p-4 mb-5 bg-[var(--bg-panel)] shadow-soft flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold flex items-center gap-2"><Upload size={15} /> 上传资源</p>
        {upUploading && <span className="text-[11px] text-dim">上传中：{upUploading}</span>}
        {!upUploading && upDone && <span className="text-[11px] text-emerald-600 font-medium">✓ {upDone}</span>}
      </div>
      {/* 单步3：后台处理进度条（解析→切分→向量化→问题增强） */}
      {upProgress && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] text-dim">
            <span>{upProgress.stage}</span><span>{upProgress.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
            <div className="h-full bg-[#1a1a1a] transition-all duration-300" style={{ width: `${upProgress.pct}%` }} />
          </div>
        </div>
      )}
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
