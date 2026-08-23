/** 上传资源面板（文本 / 文件 / 链接，仿 DeepTutor add resource；ResourceView 拆分子组件，5.1） */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, FileText, ExternalLink, Sparkles, Loader2, X } from 'lucide-react'
import { LS, lsGet } from '../../storage'
import { api } from '../../api'
import type { UrlIngestScope } from '../../api'
import { ProbePreviewCard, isHttpUrl, normUrl, buildScopeFrom } from './UrlProbeShared'

type UpItem = { id: string; kind: 'file' | 'text' | 'link'; name: string; file?: File; body?: string; url?: string; scope?: UrlIngestScope }

/** 链接预检状态机：闲置 → 识别中 → 成功（带预览数据）/ 失败（可直接上传兜底） */
type ProbeState =
  | { phase: 'idle' }
  | { phase: 'loading'; url: string }
  | { phase: 'error'; url: string; msg: string }
  | { phase: 'ok'; url: string; data: import('../../api').UrlProbeOk }

const PROBE_DEBOUNCE_MS = 600

export function UploadPanel({ projectId, onUploaded }: { projectId: string | null; onUploaded: () => void }) {
  const [upMode, setUpMode] = useState<'text' | 'file' | 'link'>('text')
  const [upTitle, setUpTitle] = useState('')
  const [upText, setUpText] = useState('')
  const [upUrl, setUpUrl] = useState('')
  const [upItems, setUpItems] = useState<UpItem[]>([])
  const [upUploading, setUpUploading] = useState('')
  const [upDone, setUpDone] = useState('')
  const [upDropActive, setUpDropActive] = useState(false)
  const upFileRef = useRef<HTMLInputElement>(null)
  // 链接预检
  const [upProbe, setUpProbe] = useState<ProbeState>({ phase: 'idle' })
  const [upGroupChecked, setUpGroupChecked] = useState<Record<string, boolean>>({})
  const [upGroupsOpen, setUpGroupsOpen] = useState(false)
  const upProbedRef = useRef('')   // 已发起过预检的归一化链接：保证每个链接只探一次
  const upProbeSeqRef = useRef(0)  // 递增序号：过期响应直接丢弃

  const resetProbe = useCallback(() => {
    upProbeSeqRef.current++
    upProbedRef.current = ''
    setUpProbe({ phase: 'idle' })
    setUpGroupChecked({})
    setUpGroupsOpen(false)
  }, [])

  const runProbe = useCallback(async (norm: string, raw: string) => {
    upProbedRef.current = norm
    const seq = ++upProbeSeqRef.current
    setUpProbe({ phase: 'loading', url: norm })
    try {
      const d = await api.uploadUrlProbe(raw)
      if (seq !== upProbeSeqRef.current) return // 已有更新的请求或链接已变，丢弃
      if (d.status === 'ok') {
        const next: Record<string, boolean> = {}
        for (const g of d.groups ?? []) next[g.key] = !!g.default_selected
        setUpGroupChecked(next)
        setUpGroupsOpen(false)
        setUpProbe({ phase: 'ok', url: norm, data: d })
      } else {
        setUpProbe({ phase: 'error', url: norm, msg: d.msg ?? '' })
      }
    } catch (e) {
      if (seq !== upProbeSeqRef.current) return
      setUpProbe({ phase: 'error', url: norm, msg: e instanceof Error ? e.message : '' })
    }
  }, [])

  // 链接变化 → 防抖预检；链接非法/清空 → 复位并作废在途请求
  useEffect(() => {
    if (upMode !== 'link') return
    const norm = normUrl(upUrl)
    if (!isHttpUrl(norm)) {
      if (upProbe.phase !== 'idle') resetProbe()
      return
    }
    // 链接已变成另一个：立即撤下旧预览并作废在途请求，再重新预检
    if (upProbe.phase !== 'idle' && upProbe.url !== norm) { resetProbe(); return }
    if (norm === upProbedRef.current) return
    const timer = setTimeout(() => {
      if (norm !== upProbedRef.current) void runProbe(norm, upUrl.trim())
    }, PROBE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [upUrl, upMode, upProbe.phase, resetProbe, runProbe])

  // 失焦立即预检（不等防抖）
  const upProbeNow = () => {
    const norm = normUrl(upUrl)
    if (!isHttpUrl(norm) || norm === upProbedRef.current) return
    void runProbe(norm, upUrl.trim())
  }

  const upProbeData = upProbe.phase === 'ok' ? upProbe.data : null
  const upGroups = upProbeData?.groups ?? []
  const upCheckedKeys = upGroups.filter(g => upGroupChecked[g.key]).map(g => g.key).sort()

  /** 勾选与默认一致 / 无可分区内容 → 不下发范围字段（后端按默认全量处理） */
  const upBuildScope = (): UrlIngestScope | undefined => buildScopeFrom(upGroups, upGroupChecked)

  const upAddText = () => {
    const title = upTitle.trim() || '文本资料'
    if (!upText.trim()) { alert('请输入文本内容'); return }
    setUpItems(prev => [...prev, { id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), kind: 'text', name: title, body: upText }])
    setUpTitle(''); setUpText('')
  }
  const upAddLink = () => {
    const url = upUrl.trim()
    if (!url) { alert('请输入链接'); return }
    if (!/^https?:\/\//.test(url)) { alert('链接需以 http:// 或 https:// 开头'); return }
    const title = upTitle.trim() || url
    const scope = upProbe.phase === 'ok' && upProbe.url === normUrl(url) ? upBuildScope() : undefined
    setUpItems(prev => [...prev, { id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), kind: 'link', name: title, url, scope }])
    setUpTitle(''); setUpUrl(''); resetProbe()
  }
  /** 链接直接摄取（预检确认 / 跳过预检兜底）：不进待上传队列，立即入库 */
  const upIngestUrl = async (scope?: UrlIngestScope) => {
    if (upUploading) return
    if (!projectId) { alert('请先选择课程'); return }
    const url = upUrl.trim()
    if (!url) { alert('请输入链接'); return }
    if (!/^https?:\/\//.test(url)) { alert('链接需以 http:// 或 https:// 开头'); return }
    const source = upTitle.trim() || url
    setUpUploading(source)
    setUpDone('')
    try {
      const d = await api.uploadKnowledgeUrl(
        { project_id: projectId, url, source, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') }, scope)
      if (d && d.status === 'ok') {
        setUpDone(`资源已上传：「${source}」已接入课程知识库（${d.chunks || 0} 个内容块）`)
        setUpTitle(''); setUpUrl(''); resetProbe()
        setTimeout(() => onUploaded(), 500)
      } else {
        alert(`「${source}」接入失败：${(d && d.msg) || '处理失败'}`)
      }
    } catch (e) {
      alert(`「${source}」上传失败：${e instanceof Error ? e.message : '网络异常'}`)
    } finally {
      setUpUploading('')
    }
  }
  const upAddFiles = (fs: FileList | File[]) => {
    const incoming = Array.from(fs)
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
        } else if (it.kind === 'link') {
          d = await api.uploadKnowledgeUrl({ project_id: projectId, url: it.url, source: it.name, session_id: 'project-res', api_key: lsGet(LS.apiKey, '') }, it.scope)
        }
        if (d && d.status === 'ok') { total += (d.chunks || 0); ok++ }
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
      {/* 三种方式切换 */}
      <div className="flex gap-2">
        {([['text', '文本'], ['file', '文件'], ['link', '链接']] as const).map(([k, label]) => (
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
      {/* 链接方式 */}
      {upMode === 'link' && (
        <div className="flex flex-col gap-2">
          <input value={upTitle} onChange={e => setUpTitle(e.target.value)} placeholder="标题（可选，默认取链接）"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          <input value={upUrl} onChange={e => setUpUrl(e.target.value)} onBlur={upProbeNow} placeholder="https://…"
            className="px-3 py-2 text-xs input-surface rounded-xl outline-none" />
          {/* 预检：识别中 / 失败兜底 */}
          {upProbe.phase === 'loading' && (
            <p className="flex items-center gap-1.5 text-[11px] text-dim"><Loader2 size={11} className="animate-spin" /> 正在识别链接结构…</p>
          )}
          {upProbe.phase === 'error' && (
            <p className="text-[11px] text-dim" title={upProbe.msg || undefined}>无法预览结构（可能需登录或链接不可访问），可直接上传</p>
          )}
          {/* 预检：结构预览卡片（共享组件，见 UrlProbeShared） */}
          {upProbeData && (
            <ProbePreviewCard data={upProbeData} groups={upGroups} checked={upGroupChecked}
              onToggle={k => setUpGroupChecked(prev => ({ ...prev, [k]: !prev[k] }))}
              onSelectAll={all => setUpGroupChecked(all ? Object.fromEntries(upGroups.map(g => [g.key, true])) : {})}
              open={upGroupsOpen} onToggleOpen={() => setUpGroupsOpen(v => !v)} />
          )}
          <div className="flex items-center justify-end gap-2">
            {upProbe.phase !== 'ok' && isHttpUrl(normUrl(upUrl)) && (
              <button onClick={() => void upIngestUrl()} disabled={!!upUploading}
                className="px-2 py-1.5 text-[11px] text-dim rounded-xl row-hover transition-colors disabled:opacity-40">
                跳过预览直接上传
              </button>
            )}
            {upProbeData && (
              <button onClick={() => void upIngestUrl(upBuildScope())}
                disabled={!!upUploading || (upGroups.length > 0 && upCheckedKeys.length === 0)}
                title={upGroups.length > 0 && upCheckedKeys.length === 0 ? '请至少勾选一个分区' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#1a1a1a] text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                {upUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {upUploading ? '摄取中…' : '开始摄取'}
              </button>
            )}
            <button onClick={upAddLink}
              className={upProbeData
                ? 'px-3 py-1.5 text-[11px] text-dim rounded-xl row-hover transition-colors'
                : 'px-3.5 py-1.5 text-[11px] bg-[#1a1a1a] text-white font-semibold rounded-xl hover:bg-[#333333] transition-colors'}>
              加入上传
            </button>
          </div>
        </div>
      )}
      <input ref={upFileRef} type="file" multiple className="hidden"
        accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx"
        onChange={e => { if (e.target.files?.length) upAddFiles(e.target.files); e.target.value = '' }} />
      {/* 待上传列表 + 确认上传 */}
      {upItems.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t hairline pt-3">
          <p className="text-[11px] font-semibold text-dim">待上传（{upItems.length}）</p>
          {upItems.map(it => (
            <div key={it.id} className="flex items-center gap-2 rounded-lg border hairline px-2.5 py-1.5">
              <span className="w-6 h-6 rounded-md bg-[#1a1a1a] text-white flex items-center justify-center flex-shrink-0">
                {it.kind === 'file' ? <FileText size={11} /> : it.kind === 'link' ? <ExternalLink size={11} /> : <Sparkles size={11} />}
              </span>
              <span className="text-[11px] font-medium truncate flex-1">{it.name}</span>
              <span className="text-[9px] text-dim flex-shrink-0">{it.kind === 'file' ? '文件' : it.kind === 'link' ? '链接' : '文本'}</span>
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