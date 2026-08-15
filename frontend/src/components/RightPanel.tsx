import { Map, Send, MessagesSquare, X, PanelRightClose, SlidersHorizontal, FileText, Activity } from 'lucide-react'
import { useEffect, useRef, useState, Fragment } from 'react'
import { KnowledgeTree } from './KbTree'
import SpecialOutputPane from './SpecialOutputPane'
import MarkdownIt from 'markdown-it'
import { streamChatResponse } from '../sse'
import { LS, lsGet, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'

// 第二对话回答渲染：markdown-it 轻量渲染（html:false 防 XSS，breaks 换行生效）
const mdSide = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderSideMd = (text: string) => mdSide.render(text || '')

interface Props {
  messageCount: number
  projectId?: string | null
  /** 第二对话 id（App 持有，主对话完成后为它同步生成横向拓展追问） */
  sideDialogueId?: string
  onCollapse: () => void
}

type WinKey = 'flow' | 'graph' | 'chat' | 'special' | 'monitor'

const WINDOWS: Array<{ key: WinKey; title: string; icon: any }> = [
  { key: 'graph', title: '知识图谱', icon: Map },
  { key: 'chat', title: '第二对话', icon: MessagesSquare },
  { key: 'special', title: '特殊形式输出', icon: FileText },
  { key: 'monitor', title: '运行监控', icon: Activity },
]

const DEFAULT_HEIGHTS: Record<WinKey, number> = { flow: 200, graph: 190, chat: 240, special: 200, monitor: 180 }
const MIN_H = 56
const MAX_H = 800

/** 窗口：header 常驻，内容区高度可被拖拽调整；flex 模式自动填满剩余空间。
 * 右上角独立叉 = 关闭该窗口（visible=false，可在顶部"在此处展示"重新打开） */
function Pane({ title, icon: Icon, height, flex, onClose, children }: {
  title: string; icon: any; height: number; flex?: boolean; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="card-surface flex flex-col overflow-hidden flex-shrink-0"
      style={flex ? { flex: 1, minHeight: 56 } : { height }}
    >
      <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 select-none">
        <span className="text-[11px] font-semibold text-dim uppercase tracking-widest flex items-center gap-1.5">
          <Icon size={13} /> {title}
        </span>
        <span onClick={(e) => { e.stopPropagation(); onClose() }}
          className="p-0.5 rounded icon-btn hover:text-red-500 transition-colors" title="关闭此窗口（可在上方「在此处展示」重新打开）">
          <X size={13} />
        </span>
      </div>
      {/* 内容区占满窗口剩余高度 */}
      <div className="min-h-0" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

/** 垂直拖拽手柄 */
function DragHandle({ onDown }: { onDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onDown}
      className="h-2 flex-shrink-0 cursor-row-resize group flex items-center justify-center"
    >
      <span className="w-10 h-1 rounded-full bg-[#d0d0d0] opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

export default function RightPanel({ messageCount, projectId, sideDialogueId, onCollapse }: Props) {
  // 三个窗口高度（px）
  const [heights, setHeights] = useState<Record<WinKey, number>>({ ...DEFAULT_HEIGHTS })
  // 右侧栏展示设置（可勾选要显示的窗口，持久化）
  const [visible, setVisible] = useState<Record<WinKey, boolean>>(() => {
    return { flow: true, graph: true, chat: true, special: false, monitor: true, ...lsGetJSON<Record<string, boolean>>(LS.rpWindows, {}) }
  })
  const [showWinSettings, setShowWinSettings] = useState(false)
  const dragRef = useRef<{ a: WinKey; b: WinKey; isLast: boolean; startY: number; startHa: number; startHb: number } | null>(null)

  const toggleWin = (k: WinKey) => {
    setVisible(prev => {
      const next = { ...prev, [k]: !prev[k] }
      lsSetJSON(LS.rpWindows, next)
      return next
    })
  }
  const shown = WINDOWS.filter(w => visible[w.key])

  const startDrag = (a: WinKey, b: WinKey) => (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { a, b, isLast: shown[shown.length - 1].key === b, startY: e.clientY, startHa: heights[a], startHb: heights[b] }
    document.body.style.userSelect = 'none'
  }

  // 拖拽调整相邻窗口高度（最后一个窗口 flex 自动填充，手柄只调其上方固定窗口）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = e.clientY - d.startY
      const na = Math.max(MIN_H, Math.min(MAX_H, d.startHa + delta))
      setHeights(prev => ({ ...prev, [d.a]: na }))
      if (!d.isLast) {
        const nb = Math.max(MIN_H, Math.min(MAX_H, d.startHb - delta))
        setHeights(prev => ({ ...prev, [d.b]: nb }))
      }
    }
    const onUp = () => { dragRef.current = null; document.body.style.userSelect = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // 知识图谱（树状）：基于上传资料标题层级
  const [treeDocs, setTreeDocs] = useState<Array<{ source: string; tree: any[] }>>([])
  const [progressItems, setProgressItems] = useState<any[]>([])
  const loadKbTree = () => {
    if (!projectId) return
    api.listKnowledge(projectId)
      .then(d => setTreeDocs((d.docs || []).map((x: any) => ({ source: x.source || '未命名', tree: Array.isArray(x.tree) ? x.tree : [] }))))
      .catch(() => setTreeDocs([]))
    api.getMemoryProgress(projectId)
      .then(d => setProgressItems((d && d.items) || []))
      .catch(() => setProgressItems([]))
  }
  // 第二对话窗口：独立会话（id 由 App 持有，保证主对话完成后能为其生成追问）
  const sideDialogueIdRef = useRef(sideDialogueId || ('sd-' + Math.random().toString(36).slice(2) + Date.now().toString(36)))
  const [sideMessages, setSideMessages] = useState<Array<{role: string; content: string}>>([])
  const [sideInput, setSideInput] = useState('')
  const [sideLoading, setSideLoading] = useState(false)
  // 第二对话追问建议：横向拓展/轻松闲聊风格（后端 followup_focus=expand 生成）
  const [sideFollowups, setSideFollowups] = useState<string[]>([])
  const loadSideFollowups = () => {
    api.getDialogueFollowups(sideDialogueIdRef.current)
      .then(d => setSideFollowups(Array.isArray(d.questions) ? d.questions.slice(0, 3) : []))
      .catch(() => {})
  }
  // 回答结束后台线程生成新追问，延迟拉取一次
  const prevSideLoading = useRef(sideLoading)
  useEffect(() => {
    if (prevSideLoading.current && !sideLoading) {
      const t1 = setTimeout(loadSideFollowups, 5000)
      const t2 = setTimeout(loadSideFollowups, 12000)
      prevSideLoading.current = sideLoading
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevSideLoading.current = sideLoading
  }, [sideLoading])
  // 主对话完成后：后台已同步为第二对话生成横向拓展追问，延迟拉取（生成是异步的）
  useEffect(() => {
    const onSideReady = () => {
      const t1 = setTimeout(loadSideFollowups, 5000)
      const t2 = setTimeout(loadSideFollowups, 12000)
    }
    window.addEventListener('side-followups-ready', onSideReady)
    return () => window.removeEventListener('side-followups-ready', onSideReady)
  }, [])

  const sendSide = async (q?: string) => {
    const text = (q ?? sideInput).trim()
    if (!text || sideLoading) return
    if (!q) setSideInput('')
    setSideMessages(prev => [...prev, { role: 'user', content: text }])
    setSideLoading(true)
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, dialogue_id: sideDialogueIdRef.current, project_id: projectId || 'default', api_key: lsGet(LS.apiKey, '') || undefined, followup_focus: 'expand' })
      })
      let reply = ''
      await streamChatResponse(resp, (d) => {
        if (d.type === 'done' && d.reply) reply = d.reply
      })
      setSideMessages(prev => [...prev, { role: 'assistant', content: reply || '（无回复）' }])
    } catch (e) {
      setSideMessages(prev => [...prev, { role: 'assistant', content: '请求失败' }])
    }
    setSideLoading(false)
  }

  // 加载课程知识图谱树（上传资料标题层级）
  useEffect(() => {
    if (!projectId) return
    loadKbTree()
  }, [projectId])

  // 监听知识库更新事件，重新加载知识树
  useEffect(() => {
    const onKb = () => { if (projectId) loadKbTree() }
    window.addEventListener('kb-updated', onKb)
    return () => window.removeEventListener('kb-updated', onKb)
  }, [projectId])

  return (
    <aside className="w-full h-full flex flex-col overflow-hidden px-2.5 py-3 gap-1">
      {/* 右栏顶部：折叠按钮 + 展示设置 */}
      <div className="flex items-center justify-between flex-shrink-0 h-6 mb-1">
        <button onClick={onCollapse} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="收起侧栏">
          <PanelRightClose size={14} />
        </button>
        <div className="relative">
          <button onClick={() => setShowWinSettings(!showWinSettings)} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="右侧栏展示设置">
            <SlidersHorizontal size={13} />
          </button>
          {showWinSettings && (
            <div className="absolute right-0 top-full mt-1 card-lift p-2 z-30 w-48">
              <p className="text-[10px] font-semibold text-dim uppercase tracking-wider px-2 mb-1">在此处展示</p>
              {WINDOWS.map(w => (
                <label key={w.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg row-hover cursor-pointer">
                  <input
                    name={'win-' + w.key}
                    type="checkbox" checked={visible[w.key]} onChange={() => toggleWin(w.key)}
                    className="w-3.5 h-3.5 accent-[var(--accent)]"
                  />
                  <span className="text-[11px]">{w.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 动态窗口：按展示设置过滤，最后一个窗口 flex 填满，相邻窗口间有拖拽手柄 */}
      {shown.map((w, i) => (
        <Fragment key={w.key}>
          {i > 0 && <DragHandle onDown={startDrag(shown[i - 1].key, w.key)} />}
          <Pane title={w.title} icon={w.icon} height={heights[w.key]} flex={i === shown.length - 1} onClose={() => toggleWin(w.key)}>
            {w.key === 'graph' && (
              <div className="w-full h-full overflow-y-auto px-2 py-1.5">
                <KnowledgeTree treeDocs={treeDocs} progressItems={progressItems} />
              </div>
            )}
            {w.key === 'chat' && (
              <div className="w-full h-full flex flex-col">
                <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2 min-h-0">
                  {sideMessages.length === 0 ? (
                    <p className="text-[11px] text-dim text-center py-4">独立会话 · 追问聚焦横向拓展 / 轻松闲聊</p>
                  ) : (
                    sideMessages.map((m, i) => (
                      <div key={i} className="flex flex-col gap-1.5 max-w-[95%]">
                        <div className={`max-w-full px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'self-end btn-primary whitespace-pre-wrap' : 'self-start chip'}`} style={{ borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}>
                          {m.role === 'user' ? m.content : <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: renderSideMd(m.content) }} />}
                        </div>
                        {/* 横向拓展/闲聊追问：附着于该条 AI 输出下方（豆包样式，仅最后一条输出） */}
                        {m.role === 'assistant' && i === sideMessages.length - 1 && sideFollowups.length > 0 && !sideLoading && (
                          <div className="self-start flex flex-col gap-1 animate-[fadeIn_0.3s_ease]">
                            <p className="text-[10px] text-dim font-medium">横向拓展 · 闲聊</p>
                            <div className="flex flex-wrap gap-1">
                              {sideFollowups.map((q, k) => (
                                <button key={k} onClick={() => sendSide(q)}
                                  className="chip text-left text-[10px] px-2 py-1 transition-all">
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {sideLoading && <p className="text-[10px] text-dim text-center">思考中…</p>}
                </div>
                <div className="p-2.5 flex-shrink-0">
                  <div className="chip flex items-center gap-1.5 px-2 py-1">
                    <textarea name="side-chat-input" placeholder="在此提问..." rows={1} value={sideInput}
                      onChange={e => setSideInput(e.target.value)}
                      className="flex-1 px-1.5 py-1 bg-transparent text-xs outline-none resize-none"
                      style={{ background: 'transparent' }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSide() } }} />
                      <button onClick={() => sendSide()} disabled={sideLoading} className="w-7 h-7 btn-primary flex items-center justify-center flex-shrink-0 disabled:opacity-50">
                        <Send size={12} />
                      </button>
                  </div>
                </div>
              </div>
            )}
            {w.key === 'special' && <SpecialOutputPane />}
            {w.key === 'monitor' && (
              <div className="w-full h-full overflow-y-auto px-3 py-2">
                <p className="text-[11px] text-dim">运行监控（待接入：节点耗时 / LLM 调用次数 / token 估算）</p>
              </div>
            )}
          </Pane>
        </Fragment>
      ))}

    </aside>
  )
}
