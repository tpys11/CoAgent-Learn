/** 上传资源面板（文本 / 文件两种方式；链接通道已下线，保留件见 resource/linkIngest/） */
import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Sparkles, Loader2, X } from 'lucide-react'
import { LS, lsGet } from '../../storage'
import { api } from '../../api'
import { RetentionScopePanel } from './RetentionScopePanel'
import { consumeScopeTarget, reportIngestDone, type ScopeTarget } from '../../lib/kbScopeBus'
import { watchUploadProgress } from '../../lib/uploadProgressWatcher'

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

export function UploadPanel({ projectId, onUploaded, scopeTargets = [] }: {
  projectId: string | null
  onUploaded: () => void
  /** F10-S1：留存选择目标由 App 裁决下发（呈现面=内联面板的 pending 子集）——
   *  本组件不再自持目标状态，完成事件经 kbScopeBus 上报后由 App 决定内联/向导步呈现，
   *  同一目标同一时刻只喂一个呈现面（互斥），消费经 bus 撤销。 */
  scopeTargets?: ScopeTarget[]
}) {
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
  const upUploadAll = async () => {
    if (!projectId || !upItems.length || upUploading) return
    let total = 0; let ok = 0
    const count = upItems.length
    const okSet = new Set<string>() // F9-S2：成功上传的资源名（留存面板候选）
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
            // F10-S1：轮询判定抽至 lib/uploadProgressWatcher 共享（向导补传同款语义，防双实现漂移）
            setUpProgress({ stage: '解析文档', pct: 6 })
            const r = await watchUploadProgress(projectId, it.name, {
              onProgress: (stage, pct) => setUpProgress({ stage, pct }),
              onSettled: () => setUpProgress(null),
            })                                     // source = 文件名（后端 source=fname）
            if (r.ok) { ok++; okSet.add(it.name); total += r.chunks; if (r.engine) engines.add(r.engine) }
            // D3 报错文案：失败项不会出现在知识库（非「稍后可见」），须删资源重传；句式避免 msg 尾「。」+「，」连排
            else alert(`「${it.name}」处理失败${r.msg ? `：${r.msg.replace(/。+$/, '')}` : '：处理超时'}。该条未完成向量化，不会出现在知识库；请删除该资源后重新上传`)
          } else if (d && d.status === 'ok') { total += (d.chunks || 0); ok++; okSet.add(it.name); if (d.parse_engine) engines.add(d.parse_engine) }
          else if (d && d.duplicate) { /* 重复内容视为成功跳过 */ }
          else alert(`「${it.name}」接入失败：${(d && d.msg) || '处理失败'}`)
        } else if (it.kind === 'text') {
          d = await api.uploadKnowledgeText({ project_id: projectId, text: it.body, source: it.name, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') })
          if (d && d.status === 'ok') { total += (d.chunks || 0); ok++; okSet.add(it.name) }
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
    // F10-S1：完成事件经 kbScopeBus 广播（活过本组件卸载——「先传文档→关弹窗→再走向导」不丢选择机会）；
    // 树拉取与呈现面裁决移交 App 推进器。duplicate（内容已存在）不上报：树早已在库，重报会重弹面板。
    const okSources = upItems.filter(it => okSet.has(it.name)).map(it => it.name)
    if (okSources.length && projectId) reportIngestDone(projectId, okSources)
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
      {/* F9-S2 留存范围选择（F10-S1 起目标由 App 裁决下发）：上传完成且有章节结构的资源逐个出面板；
          apply 完成经 bus 消费撤销——向导步与内联面板共用同一撤销通道，防双呈现 */}
      {scopeTargets.map(t => (
        <RetentionScopePanel key={t.source} projectId={t.projectId} source={t.source}
          tree={t.tree} apiKey={lsGet(LS.apiKey, '')}
          onApplied={() => consumeScopeTarget(t.projectId, t.source)} />
      ))}
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
