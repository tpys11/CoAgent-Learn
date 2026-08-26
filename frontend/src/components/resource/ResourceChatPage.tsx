/**
 * 闭环六：资源编辑会话独立界面（壳照 SubAgentPage：顶部返回条 + Esc；布局=左对话流 + 右资源预览）。
 * 每资源绑定独立 dialogue（后端 kind='resource' 隔离，不进对话列表/学情管线）。
 * 对话流 = 用户指令右气泡 / AI 新版全文左气泡（answer_token 流式 → done 终稿）。
 * 预览（拍板③非实时）：done 后刷新为最新版；版本下拉 = listResources 同名过滤按时间排序，切版本即预览。
 * 历史回放：挂载时 GET /api/dialogues/{did}/messages 拉编辑记录（重开窗口可续聊）。
 */
import { useEffect, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import { ArrowLeft, PanelRightClose, PanelRightOpen, Send, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { streamChatResponse } from '../../sse'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../../storage'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

interface VersionItem { id: string; content: string; created_at?: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string }

/** 资源级 dialogue id 的本地映射键（跨会话续聊同一资源的编辑记录） */
const RES_DLG_KEY = 'resDialogues'

export default function ResourceChatPage({ resourceId, resourceName, projectId, onBack }: {
  resourceId: string; resourceName: string; projectId?: string | null; onBack: () => void
}) {
  const [dialogueId] = useState(() => {
    const map = lsGetJSON<Record<string, string>>(RES_DLG_KEY, {}) || {}
    return map[resourceId] || ''
  })
  const dlgRef = useRef(dialogueId)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [previewIdx, setPreviewIdx] = useState(-1)   // -1 = 最新版
  const [showPreview, setShowPreview] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 版本列表：同 type 同名过滤由后端 name 精确匹配在前端完成（type 前缀 gen: 由资源本身保证） */
  const loadVersions = () => {
    if (!projectId) return
    api.listResources(projectId).then(d => {
      const rows: VersionItem[] = (d.resources || [])
        .filter((r: any) => r.name === resourceName)
        .map((r: any) => ({ id: r.id, content: r.content || '', created_at: r.created_at }))
      setVersions(rows)
      setPreviewIdx(-1)
    }).catch(() => {})
  }

  /** 挂载：取/建 dialogue → 回放历史 → 拉版本 */
  useEffect(() => {
    const map = lsGetJSON<Record<string, string>>(RES_DLG_KEY, {}) || {}
    let did = map[resourceId]
    if (!did) {
      did = 'red-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      map[resourceId] = did
      lsSetJSON(RES_DLG_KEY, map)
    }
    dlgRef.current = did
    api.getDialogueMessages(did).then((d: any) => {
      const hist: ChatMsg[] = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content }))
      setMsgs(hist.filter((m: ChatMsg) => m.role === 'user' || m.role === 'assistant'))
    }).catch(() => {})
    loadVersions()
  }, [resourceId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [msgs, liveText])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !streaming) onBack() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onBack, streaming])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMsgs(prev => [...prev, { role: 'user', content: text }])
    setStreaming(true)
    setLiveText('')
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, dialogue_id: dlgRef.current,
          project_id: projectId || 'default',
          api_key: lsGet(LS.apiKey, '') || undefined,
          edit_resource_id: resourceId,
        }),
      })
      let reply = ''
      await streamChatResponse(resp, d => {
        if (d.type === 'answer_token') setLiveText(t => t + d.chunk)
        if (d.type === 'done') reply = d.reply || ''
        if (d.type === 'error') reply = '⚠ ' + (d.message || '修改失败')
      })
      setMsgs(prev => [...prev, { role: 'assistant', content: reply || '（无回复）' }])
      if (reply && !reply.startsWith('⚠')) loadVersions()   // 拍板③：done 后才刷新预览
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: '⚠ 请求失败，请检查后端服务' }])
    }
    setLiveText('')
    setStreaming(false)
  }

  const previewContent = previewIdx === -1
    ? (versions[versions.length - 1]?.content ?? '')
    : (versions[previewIdx]?.content ?? '')

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-root)' }}>
      {/* 顶部返回条（照 SubAgentPage 顶栏范式：hairline 分隔 + row-hover 按钮） */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b hairline">
        <button onClick={() => { if (!streaming) onBack() }}
          title="返回 (Esc)"
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg border hairline row-hover transition-colors">
          <ArrowLeft size={14} /> 返回对话
        </button>
        <span className="text-[13px] font-semibold truncate max-w-[50%]">AI 修改 · {resourceName}</span>
        <button onClick={() => setShowPreview(s => !s)}
          title="展开/收起资源预览"
          className="p-1.5 rounded-lg border hairline row-hover transition-colors">
          {showPreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* 左：对话流 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {msgs.length === 0 && (
              <p className="text-center text-[12px] text-dim mt-8">用一句话告诉 AI 怎么改这份资料，例如「把第二段改得更口语化」</p>
            )}
            {msgs.map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="flex flex-col items-end">
                  <div className="self-end max-w-[85%] card-surface px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
                       style={{ borderBottomRightRadius: 6 }}>{m.content}</div>
                </div>
              ) : (
                <div key={i} className="self-start w-full max-w-[92%] flex flex-col gap-1">
                  <span className="text-[10px] text-dim">AI · 修订版全文</span>
                  <div className="w-full text-sm leading-7 card-surface px-4 py-3"
                       dangerouslySetInnerHTML={{ __html: md.render(m.content) }} />
                </div>
              )
            ))}
            {streaming && (
              <div className="self-start w-full max-w-[92%] flex flex-col gap-1">
                <span className="text-[10px] text-dim">AI · 修订中…</span>
                <div className="w-full text-sm leading-7 whitespace-pre-wrap break-words card-surface px-4 py-3">
                  {liveText || '…'}<span className="inline-block w-1.5 h-4 align-middle bg-[var(--accent)] animate-pulse ml-0.5" />
                </div>
              </div>
            )}
          </div>
          {/* 输入行（v1 简单锁：生成中禁发） */}
          <div className="flex items-end gap-2 px-4 py-3 flex-shrink-0 border-t hairline">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={streaming ? 'AI 修订中…' : '描述修改要求（Enter 发送，Shift+Enter 换行）'}
              rows={2} disabled={streaming}
              className="flex-1 px-3 py-2 input-surface rounded-xl text-xs outline-none resize-none disabled:opacity-60" />
            <button onClick={send} disabled={streaming || !input.trim()}
              className="btn-primary px-4 py-2 text-[11px] font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {streaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} 发送
            </button>
          </div>
        </div>

        {/* 右：资源预览（可收起；版本下拉切版本） */}
        {showPreview && (
          <div className="w-[42%] max-w-[560px] min-w-[320px] flex flex-col border-l hairline">
            <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
              <span className="text-[11px] font-semibold text-dim uppercase tracking-widest">资源预览</span>
              <select value={previewIdx} onChange={e => setPreviewIdx(Number(e.target.value))}
                className="text-[11px] input-surface rounded-lg px-2 py-1" title="版本历史（append 天然版本化）">
                <option value={-1}>最新版</option>
                {versions.map((v, i) => (
                  <option key={v.id} value={i}>{(v.created_at || '').slice(5, 16) || v.id.slice(0, 6)}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              <div className="md-answer-body text-[12px] leading-relaxed"
                   dangerouslySetInnerHTML={{ __html: md.render(previewContent || '（空）') }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
