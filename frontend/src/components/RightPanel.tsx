import { Map, Search, Send, MessagesSquare, PanelRightClose, Workflow, ChevronUp, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import AgentFlow from './AgentFlow'

interface Props {
  messageCount: number
  projectId?: string | null
  onCollapse: () => void
  flowAgents: string[]
  flowActiveAgent: string | null
}

type WinKey = 'flow' | 'graph' | 'chat'

const WINDOWS: Array<{ key: WinKey; title: string; icon: any }> = [
  { key: 'flow', title: '多智能体协作流程', icon: Workflow },
  { key: 'graph', title: '知识图谱', icon: Map },
  { key: 'chat', title: '第二对话', icon: MessagesSquare },
]

const DEFAULT_HEIGHTS: Record<WinKey, number> = { flow: 200, graph: 190, chat: 240 }
const MIN_H = 56
const MAX_H = 800

/** 可折叠窗口：header 常驻（点击展开/收起），内容区高度可被拖拽调整 */
function Pane({ title, icon: Icon, collapsed, height, onToggle, children }: {
  title: string; icon: any; collapsed: boolean; height: number; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="card-surface flex flex-col overflow-hidden flex-shrink-0" style={{ height: collapsed ? 32 : height }}>
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
      {/* 折叠时内容高度为 0 但仍渲染（保留 echarts / ReactFlow 实例，展开后自动复原） */}
      <div className="min-h-0" style={{ height: collapsed ? 0 : undefined, overflow: 'hidden' }}>
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

export default function RightPanel({ messageCount, projectId, onCollapse, flowAgents, flowActiveAgent }: Props) {
  // 三个窗口高度（px）与折叠状态
  const [heights, setHeights] = useState<Record<WinKey, number>>({ ...DEFAULT_HEIGHTS })
  const [collapsed, setCollapsed] = useState<Record<WinKey, boolean>>({ flow: false, graph: false, chat: false })
  const dragRef = useRef<{ pair: [WinKey, WinKey]; startY: number; startH: [number, number] } | null>(null)

  const toggle = (k: WinKey) => setCollapsed(prev => ({ ...prev, [k]: !prev[k] }))

  const startDrag = (pair: [WinKey, WinKey]) => (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { pair, startY: e.clientY, startH: [heights[pair[0]], heights[pair[1]]] }
    document.body.style.userSelect = 'none'
  }

  // 拖拽调整相邻窗口高度
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const delta = e.clientY - d.startY
      const a = Math.max(MIN_H, Math.min(MAX_H, d.startH[0] + delta))
      const b = Math.max(MIN_H, Math.min(MAX_H, d.startH[1] - delta))
      setHeights(prev => ({ ...prev, [d.pair[0]]: a, [d.pair[1]]: b }))
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
  const [nodeDetail, setNodeDetail] = useState<{name: string; relations: any[]; kb_refs: any[]} | null>(null)

  const sendSide = async () => {
    const text = sideInput.trim()
    if (!text || sideLoading) return
    setSideInput('')
    setSideMessages(prev => [...prev, { role: 'user', content: text }])
    setSideLoading(true)
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, dialogue_id: sideDialogueId.current, project_id: projectId || 'default', api_key: localStorage.getItem('coagent-apikey') || undefined, mode: sideMode })
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
    if (!chartRef.current || empty) return
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

  // 加载项目知识图谱
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
      {/* 右栏顶部：折叠按钮（左上角） */}
      <div className="flex items-center justify-start flex-shrink-0 h-6 mb-1">
        <button onClick={onCollapse} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="收起侧栏">
          <PanelRightClose size={14} />
        </button>
      </div>

      {/* 窗口1：多智能体协作流程 */}
      <Pane title="多智能体协作流程" icon={Workflow} collapsed={collapsed.flow} height={heights.flow} onToggle={() => toggle('flow')}>
        <div className="w-full h-full">
          <AgentFlow visible={true} agents={flowAgents} activeAgent={flowActiveAgent} />
        </div>
      </Pane>
      <DragHandle onDown={startDrag(['flow', 'graph'])} />

      {/* 窗口2：知识图谱 */}
      <Pane title="知识图谱" icon={Map} collapsed={collapsed.graph} height={heights.graph} onToggle={() => toggle('graph')}>
        <div className="w-full h-full relative">
          {graphEmpty && (
            <div className="absolute inset-0 flex items-center justify-center z-10 px-3">
              <span className="text-[11px] text-dim text-center leading-relaxed">{graphErr ? ('图谱加载失败: ' + graphErr) : '暂无知识图谱（上传文档后自动生成）'}</span>
            </div>
          )}
          <div ref={chartRef} className="w-full h-full" />
        </div>
      </Pane>
      <DragHandle onDown={startDrag(['graph', 'chat'])} />

      {/* 窗口3：第二对话 */}
      <Pane title="第二对话" icon={MessagesSquare} collapsed={collapsed.chat} height={heights.chat} onToggle={() => toggle('chat')}>
        <div className="w-full h-full flex flex-col">
          <p className="px-4 pb-2 text-[10px] text-dim leading-relaxed flex-shrink-0">遇到不懂的概念可在这里单独提问，不影响主对话。</p>
          <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2 min-h-0">
            {sideMessages.length === 0 ? (
              <p className="text-[11px] text-dim text-center py-4">暂无对话</p>
            ) : (
              sideMessages.map((m, i) => (
                <div key={i} className={`max-w-[90%] px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end btn-primary' : 'self-start chip'}`} style={{ borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px' }}>
                  {m.content}
                </div>
              ))
            )}
            {sideLoading && <p className="text-[10px] text-dim text-center">思考中…</p>}
          </div>
          <div className="p-2.5 flex-shrink-0">
            <div className="chip flex items-center gap-1.5 px-2 py-1">
              <textarea placeholder="在此提问..." rows={1} value={sideInput}
                onChange={e => setSideInput(e.target.value)}
                className="flex-1 px-1.5 py-1 bg-transparent text-xs outline-none resize-none"
                style={{ background: 'transparent' }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSide() } }} />
              <button onClick={sendSide} disabled={sideLoading} className="w-7 h-7 btn-primary flex items-center justify-center flex-shrink-0 disabled:opacity-50">
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </Pane>

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
