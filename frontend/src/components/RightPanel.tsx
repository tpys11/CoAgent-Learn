import { Map, Search, Send, MessagesSquare, PanelRightClose, ChevronUp, ChevronDown, SlidersHorizontal, FileText } from 'lucide-react'
import { useEffect, useRef, useState, Fragment } from 'react'
import * as echarts from 'echarts'

interface Props {
  messageCount: number
  projectId?: string | null
  onCollapse: () => void
}

type WinKey = 'flow' | 'graph' | 'chat' | 'report'

const WINDOWS: Array<{ key: WinKey; title: string; icon: any }> = [
  { key: 'graph', title: '知识图谱', icon: Map },
  { key: 'chat', title: '第二对话', icon: MessagesSquare },
  { key: 'report', title: '报告', icon: FileText },
]

const DEFAULT_HEIGHTS: Record<WinKey, number> = { flow: 200, graph: 190, chat: 240, report: 180 }
const MIN_H = 56
const MAX_H = 800
const WINDOWS_KEY = 'coagent-rp-windows'

/** 可折叠窗口：header 常驻（点击展开/收起），内容区高度可被拖拽调整；flex 模式自动填满剩余空间 */
function Pane({ title, icon: Icon, collapsed, height, flex, onToggle, children }: {
  title: string; icon: any; collapsed: boolean; height: number; flex?: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="card-surface flex flex-col overflow-hidden flex-shrink-0"
      style={collapsed ? { height: 32 } : flex ? { flex: 1, minHeight: 56 } : { height }}
    >
      <div
        onClick={onToggle}
        className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 cursor-pointer select-none"
        title={collapsed ? '展开' : '收起'}
      >
        <span className="text-[11px] font-semibold text-dim uppercase tracking-widest flex items-center gap-1.5">
          <Icon size={13} /> {title}
        </span>
        <span className="p-0.5 rounded icon-btn">
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </span>
      </div>
      {/* 内容区占满窗口剩余高度（折叠时高度 0 并禁止伸缩） */}
      <div className="min-h-0" style={collapsed ? { height: 0, flex: '0 0 0', overflow: 'hidden' } : { flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

/** 报告窗口：汇总最近对话生成的讲义/实操指南/测试题 */
function ReportPane({ projectId }: { projectId?: string | null }) {
  const [items, setItems] = useState<Array<{ id: string; title: string; type: string }>>([])
  useEffect(() => {
    if (!projectId) return
    fetch('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setItems(d.artifacts || [])).catch(() => {})
  }, [projectId])
  return (
    <div className="w-full h-full overflow-y-auto p-3 flex flex-col gap-1.5">
      {items.length === 0 ? (
        <p className="text-[11px] text-dim text-center py-6">暂无报告（对话生成讲义/指南/测试题后会汇总于此）</p>
      ) : (
        items.map(it => (
          <div key={it.id} className="chip px-2.5 py-1.5 text-[11px]">
            <b>{it.title}</b> <span className="text-dim">· {it.type}</span>
          </div>
        ))
      )}
    </div>
  )
}

export default function RightPanel({ messageCount, projectId, onCollapse }: Props) {
  // 三个窗口高度（px）与折叠状态
  const [heights, setHeights] = useState<Record<WinKey, number>>({ ...DEFAULT_HEIGHTS })
  const [collapsed, setCollapsed] = useState<Record<WinKey, boolean>>({ flow: false, graph: false, chat: false, report: false })
  // 右侧栏展示设置（可勾选要显示的窗口，持久化）
  const [visible, setVisible] = useState<Record<WinKey, boolean>>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(WINDOWS_KEY) || '')
      return { flow: true, graph: true, chat: true, report: false, ...s }
    } catch { return { flow: true, graph: true, chat: true, report: false } }
  })
  const [showWinSettings, setShowWinSettings] = useState(false)
  const dragRef = useRef<{ a: WinKey; b: WinKey; isLast: boolean; startY: number; startHa: number; startHb: number } | null>(null)

  const toggle = (k: WinKey) => setCollapsed(prev => ({ ...prev, [k]: !prev[k] }))
  const toggleWin = (k: WinKey) => {
    setVisible(prev => {
      const next = { ...prev, [k]: !prev[k] }
      localStorage.setItem(WINDOWS_KEY, JSON.stringify(next))
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

  // 知识图谱
  const [graphEmpty, setGraphEmpty] = useState(true)
  const [graphErr, setGraphErr] = useState('')
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInst = useRef<any>(null)
  // 第二对话窗口：独立会话
  const sideDialogueId = useRef('sd-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  const [sideMessages, setSideMessages] = useState<Array<{role: string; content: string}>>([])
  const [sideInput, setSideInput] = useState('')
  const [sideLoading, setSideLoading] = useState(false)
  const [sideMode, setSideMode] = useState<'kb'|'free'>('free')
  // 第二对话追问建议：横向拓展/轻松闲聊风格（后端 followup_focus=expand 生成）
  const [sideFollowups, setSideFollowups] = useState<string[]>([])
  const loadSideFollowups = () => {
    fetch('/api/dialogues/' + encodeURIComponent(sideDialogueId.current) + '/followups', { cache: 'no-store' })
      .then(r => r.json())
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
  const [nodeDetail, setNodeDetail] = useState<{name: string; relations: any[]; kb_refs: any[]} | null>(null)

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
        body: JSON.stringify({ message: text, dialogue_id: sideDialogueId.current, project_id: projectId || 'default', api_key: localStorage.getItem('coagent-apikey') || undefined, mode: sideMode, followup_focus: 'expand' })
      })
      const reader = resp.body ? resp.body.getReader() : null
      let buf = ''
      let reply = ''
      if (reader) {
        const dec = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let idx
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2)
            if (chunk.startsWith('data: ')) {
              try {
                const d = JSON.parse(chunk.slice(6))
                if (d.type === 'done' && d.reply) reply = d.reply
              } catch (e) {}
            }
          }
        }
      }
      setSideMessages(prev => [...prev, { role: 'assistant', content: reply || '（无回复）' }])
    } catch (e) {
      setSideMessages(prev => [...prev, { role: 'assistant', content: '请求失败' }])
    }
    setSideLoading(false)
  }

  const renderGraph = (d: any) => {
    const nodesRaw = d.nodes || []
    const empty = nodesRaw.length === 0
    setGraphEmpty(empty)
    // 图谱窗口被隐藏时清理实例，避免挂载到已卸载的 DOM
    if (!chartRef.current) {
      if (chartInst.current) { chartInst.current.dispose(); chartInst.current = null }
      return
    }
    if (empty) return
    if (!chartInst.current) chartInst.current = echarts.init(chartRef.current)
    const nodes = nodesRaw.map((n: any) => ({
      id: n.id, name: n.name, symbolSize: 26,
      itemStyle: { color: '#4f8cff' },
      label: { show: true, fontSize: 10 }
    }))
    const edges = (d.edges || []).map((e: any) => ({
      source: e.source, target: e.target,
      label: { show: true, formatter: e.relation, fontSize: 9 },
      lineStyle: { width: 1.5, color: '#bbb' }
    }))
    chartInst.current.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'graph', layout: 'force', roam: true,
        draggable: true,
        force: { repulsion: 300, edgeLength: 80 },
        data: nodes, links: edges,
        emphasis: { focus: 'adjacency', lineStyle: { width: 3 } }
      }]
    }, true)
    chartInst.current.off('click')
    chartInst.current.on('click', (params: any) => {
      if (params && params.data && params.data.name) {
        fetch('/api/graph/node?project_id=' + encodeURIComponent(projectId || '') + '&name=' + encodeURIComponent(params.data.name), { cache: 'no-store' })
          .then(r => r.json())
          .then(d => setNodeDetail({ name: params.data.name, relations: d.relations || [], kb_refs: d.kb_refs || [] }))
          .catch(() => {})
      }
    })
  }

  // 加载课程知识图谱
  useEffect(() => {
    if (!projectId) return
    fetch('/api/graph?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(renderGraph)
      .catch((e) => { console.error('[graph] 加载失败:', e); setGraphErr(String(e)); setGraphEmpty(true) })
    return () => { if (chartInst.current) { chartInst.current.dispose(); chartInst.current = null } }
  }, [projectId])

  // 监听知识库更新事件，重新加载图谱
  useEffect(() => {
    const onKb = () => {
      if (!projectId) return
      fetch('/api/graph?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
        .then(r => r.json())
        .then(renderGraph)
        .catch(() => setGraphEmpty(true))
    }
    window.addEventListener('kb-updated', onKb)
    return () => window.removeEventListener('kb-updated', onKb)
  }, [projectId])

  // 窗口尺寸/折叠变化自适应
  useEffect(() => {
    if (chartInst.current) chartInst.current.resize()
  }, [heights.graph, collapsed.graph])

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
          <Pane title={w.title} icon={w.icon} collapsed={collapsed[w.key]} height={heights[w.key]} flex={i === shown.length - 1} onToggle={() => toggle(w.key)}>
            {w.key === 'graph' && (
              <div className="w-full h-full relative">
                {graphEmpty && (
                  <div className="absolute inset-0 flex items-center justify-center z-10 px-3">
                    <span className="text-[11px] text-dim text-center leading-relaxed">{graphErr ? ('图谱加载失败: ' + graphErr) : '暂无知识图谱（上传文档后自动生成）'}</span>
                  </div>
                )}
                <div ref={chartRef} className="w-full h-full" />
              </div>
            )}
            {w.key === 'chat' && (
              <div className="w-full h-full flex flex-col">
                <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2 min-h-0">
                  {sideMessages.length === 0 ? (
                    <p className="text-[11px] text-dim text-center py-4">独立会话 · 追问聚焦横向拓展 / 轻松闲聊</p>
                  ) : (
                    sideMessages.map((m, i) => (
                      <div key={i} className={`max-w-[90%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end btn-primary' : 'self-start chip'}`} style={{ borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}>
                        {m.content}
                      </div>
                    ))
                  )}
                  {sideLoading && <p className="text-[10px] text-dim text-center">思考中…</p>}
                </div>
                {/* 横向拓展/闲聊追问建议 */}
                {sideFollowups.length > 0 && !sideLoading && (
                  <div className="px-3 pb-1 flex flex-col gap-1 items-start flex-shrink-0">
                    <p className="text-[10px] text-dim font-medium">横向拓展 · 闲聊</p>
                    {sideFollowups.map((q, i) => (
                      <button key={i} onClick={() => sendSide(q)}
                        className="chip text-left text-[11px] px-2.5 py-1.5 transition-all">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-2.5 flex-shrink-0">
                  <div className="chip flex items-center gap-1.5 px-2 py-1">
                    <textarea placeholder="在此提问..." rows={1} value={sideInput}
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
            {w.key === 'report' && <ReportPane projectId={projectId} />}
          </Pane>
        </Fragment>
      ))}

      {/* 图谱节点详情 */}
      {nodeDetail && (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 card-lift w-72 p-4 z-50 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold flex items-center gap-1.5"><Search size={14} /> {nodeDetail.name}</span>
            <button onClick={() => setNodeDetail(null)} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn text-xs">✕</button>
          </div>
          <div className="mb-3">
            <h4 className="text-[11px] font-semibold text-dim mb-1">相关关系</h4>
            {nodeDetail.relations.length === 0 ? <p className="text-[10px] text-dim">无</p> : (
              <div className="flex flex-col gap-1">
                {nodeDetail.relations.map((r, i) => (
                  <span key={i} className="text-[11px] chip px-2 py-1">{nodeDetail.name} —{r.rel}→ {r.target}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-[11px] font-semibold text-dim mb-1">知识库相关</h4>
            {nodeDetail.kb_refs.length === 0 ? <p className="text-[10px] text-dim">无</p> : (
              <div className="flex flex-col gap-1.5">
                {nodeDetail.kb_refs.map((r, i) => (
                  <div key={i} className="text-[10px] text-dim border-l-2 hairline pl-2">
                    <p className="line-clamp-3">{r.content}</p>
                    {r.source && <p className="mt-0.5">来源：{r.source}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
