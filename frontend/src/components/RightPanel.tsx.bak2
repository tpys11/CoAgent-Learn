import { Map, Search, Lightbulb, BookOpen } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface Props {
  messageCount: number
  projectId?: string | null
}

const QUESTIONS = [
  { icon: Search, text: '这个概念的准确定义是什么？', type: '概念' },
  { icon: Lightbulb, text: '在实际项目中如何应用这个技术？', type: '场景' },
  { icon: BookOpen, text: '有没有推荐的进阶学习资源？', type: '学习' },
]

export default function RightPanel({ messageCount, projectId }: Props) {
  const [visible, setVisible] = useState(false)
  const [showIdx, setShowIdx] = useState(0)
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

  // 加载项目知识图谱
  useEffect(() => {
    if (!projectId) return
    fetch('/api/graph?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const nodesRaw = d.nodes || []
        const empty = nodesRaw.length === 0
        setGraphEmpty(empty)
        if (!chartRef.current || empty) return
        if (!chartInst.current) {
          chartInst.current = echarts.init(chartRef.current)
        }
        const nodes = (d.nodes || []).map((n: any) => ({
          id: n.id, name: n.name, symbolSize: 28,
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
      })
      .catch((e) => { console.error('[graph] 加载失败:', e); setGraphErr(String(e)); setGraphEmpty(true) })
    return () => { if (chartInst.current) { chartInst.current.dispose(); chartInst.current = null } }
  }, [projectId])

  // 监听知识库更新事件，重新加载图谱
  useEffect(() => {
    const onKb = () => {
      if (!projectId) return
      fetch('/api/graph?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
        .then(r => r.json())
        .then(d => {
          const nodesRaw = d.nodes || []
          const empty = nodesRaw.length === 0
          setGraphEmpty(empty)
          if (!chartRef.current || empty) return
          if (!chartInst.current) chartInst.current = echarts.init(chartRef.current)
          const nodes = (d.nodes || []).map((n: any) => ({ id: n.id, name: n.name, symbolSize: 28, itemStyle: { color: '#4f8cff' }, label: { show: true, fontSize: 10 } }))
          const edges = (d.edges || []).map((e: any) => ({ source: e.source, target: e.target, label: { show: true, formatter: e.relation, fontSize: 9 }, lineStyle: { width: 1.5, color: '#bbb' } }))
          chartInst.current.setOption({ tooltip: { trigger: 'item' }, series: [{ type: 'graph', layout: 'force', roam: true, draggable: true, force: { repulsion: 300, edgeLength: 80 }, data: nodes, links: edges, emphasis: { focus: 'adjacency', lineStyle: { width: 3 } } }] }, true)
          chartInst.current.off('click')
          chartInst.current.on('click', (params: any) => {
            if (params && params.data && params.data.name) {
              fetch('/api/graph/node?project_id=' + encodeURIComponent(projectId || '') + '&name=' + encodeURIComponent(params.data.name), { cache: 'no-store' })
                .then(r => r.json())
                .then(d => setNodeDetail({ name: params.data.name, relations: d.relations || [], kb_refs: d.kb_refs || [] }))
                .catch(() => {})
            }
          })
        })
        .catch(() => setGraphEmpty(true))
    }
    window.addEventListener('kb-updated', onKb)
    return () => window.removeEventListener('kb-updated', onKb)
  }, [projectId])

  // 窗口尺寸变化自适应
  useEffect(() => {
    const onResize = () => chartInst.current && chartInst.current.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 主窗口输出后自动显示追问
  useEffect(() => {
    if (messageCount > 0) {
      setVisible(true); setShowIdx(0)
      QUESTIONS.forEach((_, i) => {
        setTimeout(() => setShowIdx(i + 1), (i + 1) * 300)
      })
    }
  }, [messageCount])

  return (
    <aside className="w-full h-full bg-[#f5f5f5] flex flex-col overflow-hidden">
      <div className="p-3 flex-shrink-0 flex flex-col" style={{ height: "33%", minHeight: 120 }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1"><Map size={14} /> 知识图谱</span>
        </div>
        <div className="flex-1 w-full border border-dashed border-[#1a1a1a]/30 bg-white rounded-lg relative overflow-hidden">
          {graphEmpty && (
            <div className="absolute inset-0 flex items-center justify-center z-10 px-2">
              <span className="text-xs text-gray-400 text-center">{graphErr ? ('图谱加载失败: ' + graphErr) : '暂无知识图谱（上传文档后自动生成）'}</span>
            </div>
          )}
          <div ref={chartRef} className="w-full h-full" />
        </div>
      </div>

      <div className="flex-1 flex flex-col border-t border-[#e5e5e5] overflow-hidden">
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold">第二对话窗口</span>
            <div className="flex gap-1 text-[10px]">
              <button onClick={() => setSideMode('free')} className={`px-2 py-0.5 rounded border ${sideMode === 'free' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-500 border-gray-200'}`}>模型自由回答</button>
              <button onClick={() => setSideMode('kb')} className={`px-2 py-0.5 rounded border ${sideMode === 'kb' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-gray-500 border-gray-200'}`}>参考知识库</button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">遇到不懂的概念可在这里单独提问，不影响主对话。</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2">
          {sideMessages.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-4">遇到不懂的概念可在这里单独提问，不影响主对话</p>
          ) : (
            sideMessages.map((m, i) => (
              <div key={i} className={`max-w-[90%] rounded-xl rounded-bl-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'self-end bg-[#1a1a1a] text-white' : 'self-start bg-white border border-[#e5e5e5] text-gray-700'}`}>
                {m.content}
              </div>
            ))
          )}
          {sideLoading && <p className="text-[10px] text-gray-400 text-center">思考中…</p>}
        </div>
      </div>

      {/* 追问输入框 */}
      <div className="p-2 flex-shrink-0 border-t border-[#e5e5e5]">
        <div className="flex gap-1.5 items-end">
          <textarea placeholder="在此提问..." rows={1} value={sideInput}
            onChange={e => setSideInput(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-[#d0d0d0] rounded-lg bg-white text-xs outline-none resize-none focus:border-[#1a1a1a]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSide() } }} />
          <button onClick={sendSide} disabled={sideLoading} className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#333333] transition-colors flex-shrink-0 disabled:opacity-50">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
      {nodeDetail && (
        <div className="fixed right-6 top-1/2 -translate-y-1/2 bg-white border border-[#e5e5e5] rounded-2xl shadow-xl w-72 p-4 z-50 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">🔍 {nodeDetail.name}</span>
            <button onClick={() => setNodeDetail(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="mb-3">
            <h4 className="text-[11px] font-semibold text-gray-500 mb-1">相关关系</h4>
            {nodeDetail.relations.length === 0 ? <p className="text-[10px] text-gray-400">无</p> : (
              <div className="flex flex-col gap-1">
                {nodeDetail.relations.map((r, i) => (
                  <span key={i} className="text-[11px] bg-gray-50 rounded px-2 py-1">{nodeDetail.name} —{r.rel}→ {r.target}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-[11px] font-semibold text-gray-500 mb-1">知识库相关</h4>
            {nodeDetail.kb_refs.length === 0 ? <p className="text-[10px] text-gray-400">无</p> : (
              <div className="flex flex-col gap-1.5">
                {nodeDetail.kb_refs.map((r, i) => (
                  <div key={i} className="text-[10px] text-gray-600 border-l-2 border-gray-200 pl-2">
                    <p className="line-clamp-3">{r.content}</p>
                    {r.source && <p className="text-gray-400 mt-0.5">来源：{r.source}</p>}
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
