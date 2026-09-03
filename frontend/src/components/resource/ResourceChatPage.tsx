/**
 * 闭环六：资源编辑会话独立界面（壳照 SubAgentPage：顶部返回条 + Esc；布局=左对话流 + 右资源预览）。
 * 每资源绑定独立 dialogue（后端 kind='resource' 隔离，不进对话列表/学情管线）。
 * 对话流 = 用户指令右气泡 / AI 新版全文左气泡（answer_token 流式 → done 终稿）。
 * 预览（拍板③非实时）：done 后刷新为最新版；版本下拉 = listResources 同名过滤按时间排序，切版本即预览。
 * 历史回放：挂载时 GET /api/dialogues/{did}/messages 拉编辑记录（重开窗口可续聊）。
 * 闭环七：生成模式——genKey 在场（无 resourceId）即生成会话（后端 gen_resource 分支）；
 * done 收养 resource_id/name 并写入 RES_DLG_KEY 映射，后续消息自动转编辑分支（生命周期：生成一次→续聊即修订）。
 */
import { useEffect, useRef, useState } from 'react'
import { renderMd } from '../../lib/mdRenderer'
import { ArrowLeft, PanelRightClose, PanelRightOpen, Send, Loader2 } from 'lucide-react'
import { api } from '../../api'
import { streamChatResponse } from '../../sse'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../../storage'
import { lineDiff, LineDiff } from './lineDiff'

/** markdown 渲染缓存（照 AssistantMessage.renderMdCached）：历史消息/版本预览 content 不变，
 *  命中即跳过 markdown-it 全量解析——流式期间该组件整体重渲染频繁，缓存是卡顿第二道闸。
 *  F8-S5：渲染走统一管线（KaTeX 公式 + 图表围栏）。 */
const _mdCache = new Map<string, string>()
const renderMdCached = (text: string) => {
  const key = text || ''
  let h = _mdCache.get(key)
  if (h === undefined) {
    h = renderMd(key)
    if (_mdCache.size > 200) {
      const first = _mdCache.keys().next().value
      if (first !== undefined) _mdCache.delete(first)
    }
    _mdCache.set(key, h)
  }
  return h
}

interface VersionItem { id: string; content: string; created_at?: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string; diff?: LineDiff | null }

/** 资源级 dialogue id 的本地映射键（跨会话续聊同一资源的编辑记录）。
 * v2：v1 键下的映射可能指向被旧后端污染的主对话管系会话（bind mount 不触发 uvicorn
 * --reload 的历史遗留），升键即全部作废重来。 */
const RES_DLG_KEY = 'resDialogues-v2'

export default function ResourceChatPage({ resourceId: initialId = '', resourceName: initialName = '', projectId, onBack, genKey, genLabel, genPrompt }: {
  resourceId?: string; resourceName?: string; projectId?: string | null; onBack: () => void
  /** 闭环七：生成模式——genKey 在场（无 resourceId）即生成会话；done 收养资源后续聊自动转编辑 */
  genKey?: string; genLabel?: string; genPrompt?: string
}) {
  const [resourceId, setResourceId] = useState(initialId)
  const [resourceName, setResourceName] = useState(initialName)
  const isGen = !resourceId && !!genKey
  const [dialogueId] = useState(() => {
    if (genKey) return 'gen-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    const map = lsGetJSON<Record<string, string>>(RES_DLG_KEY, {}) || {}
    return map[initialId] || ''
  })
  const dlgRef = useRef(dialogueId)
  const genSentRef = useRef(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [histLoading, setHistLoading] = useState(!genKey)
  /** 首屏只渲染尾部窗口（opencode 式最小虚拟化）：编辑会话可能几十轮全文修订，
   *  全量 md 解析会拖死挂载；向上滚到顶逐步扩大窗口。 */
  const [renderWindow, setRenderWindow] = useState(8)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [previewIdx, setPreviewIdx] = useState(-1)   // -1 = 最新版
  const [showPreview, setShowPreview] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 版本列表：同 type 同名过滤由后端 name 精确匹配在前端完成（type 前缀 gen: 由资源本身保证） */
  const loadVersions = (name: string = resourceName) => {
    if (!projectId || !name) return
    api.listResources(projectId).then(d => {
      const rows: VersionItem[] = (d.resources || [])
        .filter((r: any) => r.name === name)
        .map((r: any) => ({ id: r.id, content: r.content || '', created_at: r.created_at }))
      setVersions(rows)
      setPreviewIdx(-1)
    }).catch(() => {})
  }

  /** 挂载：取/建 dialogue → 回放历史 → 拉版本（生成模式无历史可回放，直接就绪） */
  useEffect(() => {
    if (genKey) return
    const map = lsGetJSON<Record<string, string>>(RES_DLG_KEY, {}) || {}
    let did = map[initialId]
    if (!did) {
      did = 'red-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      map[initialId] = did
      lsSetJSON(RES_DLG_KEY, map)
    }
    dlgRef.current = did
    api.getDialogueMessagesLight(did).then((d: any) => {
      const hist: ChatMsg[] = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content }))
      setMsgs(hist.filter((m: ChatMsg) => m.role === 'user' || m.role === 'assistant'))
      setHistLoading(false)
    }).catch(() => setHistLoading(false))
    loadVersions(initialName)
  }, [initialId, genKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [msgs, liveText])

  /** 滚到顶 → 窗口扩大（每次 +6），让更早的历史逐步进入渲染 */
  const onScroll = () => {
    const el = scrollRef.current
    if (el && el.scrollTop === 0 && renderWindow < msgs.length) {
      setRenderWindow(w => Math.min(w + 6, msgs.length))
    }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !streaming) onBack() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onBack, streaming])

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || streaming) return
    const ridAtSend = resourceId                                    // 单步4：修改/regen 才有上一版可比
    const prevVersion = versions[versions.length - 1]?.content ?? ''
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
          edit_resource_id: resourceId || undefined,
          gen_resource: (!resourceId && genKey) ? genKey : undefined,
        }),
      })
      let reply = ''
      let doneName = ''
      let diff: LineDiff | null = null
      await streamChatResponse(resp, d => {
        if (d.type === 'answer_token') setLiveText(t => t + d.chunk)
        if (d.type === 'done') {
          reply = d.reply || ''
          // 闭环七：生成会话收养资源——绑定 dialogue 映射，后续消息自动转编辑分支
          if (d.resource_id) {
            setResourceId(d.resource_id)
            if (d.name) { setResourceName(d.name); doneName = d.name }
            const map = lsGetJSON<Record<string, string>>(RES_DLG_KEY, {}) || {}
            map[d.resource_id] = dlgRef.current
            lsSetJSON(RES_DLG_KEY, map)
          }
        }
        if (d.type === 'error') reply = '⚠ ' + (d.message || '生成失败')
      })
      setMsgs(prev => [...prev, { role: 'assistant', content: reply || '（无回复）' }])
      if (reply && !reply.startsWith('⚠')) loadVersions(doneName || resourceName)   // 拍板③：done 后才刷新预览
      // 单步4：修订确认——有上一版且非问答轮（💬）时做行级 diff（熔断由 lineDiff 负责）
      if (ridAtSend && reply && !reply.startsWith('⚠') && !reply.startsWith('💬')) {
        diff = lineDiff(prevVersion, reply)
        setMsgs(prev => {
          const next = [...prev]
          if (next.length && next[next.length - 1].role === 'assistant') {
            next[next.length - 1] = { ...next[next.length - 1], diff }
          }
          return next
        })
      }
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: '⚠ 请求失败，请检查后端服务' }])
    }
    setLiveText('')
    setStreaming(false)
  }

  /** 闭环七：生成模式挂载就绪后自动首发提示词（一次） */
  useEffect(() => {
    if (genKey && genPrompt && !histLoading && !genSentRef.current) {
      genSentRef.current = true
      send(genPrompt)
    }
  }, [histLoading])

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
        <span className="text-[13px] font-semibold truncate max-w-[50%]">{isGen ? `AI 生成 · ${genLabel || ''}` : `AI 修改 · ${resourceName}`}</span>
        <button onClick={() => setShowPreview(s => !s)}
          title="展开/收起资源预览"
          className="p-1.5 rounded-lg border hairline row-hover transition-colors">
          {showPreview ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* 左：对话流 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {histLoading && (
              <div className="flex flex-col gap-3 animate-pulse" aria-label="加载中">
                {[0, 1].map(i => (
                  <div key={i} className={i % 2 ? 'self-start w-[85%]' : 'self-end w-[60%]'}>
                    <div className="card-surface px-4 py-3">
                      <div className="h-3 rounded bg-[var(--bg-hover)] w-3/4 mb-2" />
                      <div className="h-3 rounded bg-[var(--bg-hover)] w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!histLoading && msgs.length === 0 && (
              <p className="text-center text-[12px] text-dim mt-8">
                {isGen ? '正在生成资源：AI 将结合知识库要点与你的学情自主创作，完成后可在此继续修订…' : '用一句话告诉 AI 怎么改这份资料，例如「把第二段改得更口语化」'}
              </p>
            )}
            {msgs.length > renderWindow && (
              <button onClick={() => setRenderWindow(msgs.length)}
                className="self-center text-[11px] text-dim hover:text-[var(--text)] px-3 py-1 rounded-lg border hairline row-hover transition-colors">
                ↑ 加载更早的 {msgs.length - renderWindow} 条
              </button>
            )}
            {msgs.slice(Math.max(0, msgs.length - renderWindow)).map((m, i) => (
              m.role === 'user' ? (
                <div key={i} className="flex flex-col items-end">
                  <div className="self-end max-w-[85%] card-surface px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
                       style={{ borderBottomRightRadius: 6 }}>{m.content}</div>
                </div>
              ) : (
                <div key={i} className="self-start w-full max-w-[92%] flex flex-col gap-1">
                  <span className="text-[10px] text-dim">{resourceId ? 'AI · 修订版全文' : 'AI · 生成全文'}</span>
                  <div className="w-full text-sm leading-7 card-surface px-4 py-3"
                       dangerouslySetInnerHTML={{ __html: renderMdCached(m.content) }} />
                  {m.diff && (m.diff.added.length > 0 || m.diff.removed.length > 0) && (
                    <details className="w-full border hairline rounded-lg px-2.5 py-1.5">
                      <summary className="text-[10px] text-dim cursor-pointer select-none">
                        查看变更（+{m.diff.added.length} / −{m.diff.removed.length} 行）
                      </summary>
                      <div className="mt-1 flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                        {m.diff.removed.slice(0, 60).map((l, k) => (
                          <p key={'r' + k} className="text-[10px] text-red-500 break-all whitespace-pre-wrap">− {l}</p>
                        ))}
                        {m.diff.added.slice(0, 60).map((l, k) => (
                          <p key={'a' + k} className="text-[10px] text-green-600 break-all whitespace-pre-wrap">+ {l}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )
            ))}
            {streaming && (
              <div className="self-start w-full max-w-[92%] flex flex-col gap-1">
                <span className="text-[10px] text-dim">{isGen ? 'AI · 生成中…' : 'AI · 修订中…'}</span>
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
              placeholder={streaming ? (isGen ? 'AI 生成中…' : 'AI 修订中…') : (isGen ? '补充生成要求（Enter 发送，Shift+Enter 换行）' : '描述修改要求（Enter 发送，Shift+Enter 换行）')}
              rows={2} disabled={streaming}
              className="flex-1 px-3 py-2 input-surface rounded-xl text-xs outline-none resize-none disabled:opacity-60" />
            <button onClick={() => send()} disabled={streaming || !input.trim()}
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
                   dangerouslySetInnerHTML={{ __html: renderMdCached(previewContent || '（空）') }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
