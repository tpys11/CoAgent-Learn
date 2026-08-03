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
          <span className="text-xs font-semibold">第二对话窗口</span>
          <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">独立对话区域，可访问主窗口的记忆、知识库等全部信息。</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2">
          {!visible ? (
            <p className="text-[11px] text-gray-400 text-center py-4">主窗口回复后自动生成</p>
          ) : (
            QUESTIONS.map((item, i) => (
              <div key={i} className={`transition-all duration-300 ${i < showIdx ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                {i < showIdx && (
                  <button className="w-full text-left bg-white border border-[#e5e5e5] rounded-xl rounded-bl-sm px-3 py-2.5 hover:border-[#1a1a1a]/40 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon size={11} className="text-[#1a1a1a]" />
                      <span className="text-[10px] text-gray-400">{item.type}</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{item.text}</p>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 追问输入框 */}
      <div className="p-2 flex-shrink-0 border-t border-[#e5e5e5]">
        <div className="flex gap-1.5 items-end">
          <textarea placeholder="追问..." rows={1}
            className="flex-1 px-3 py-1.5 border border-[#d0d0d0] rounded-lg bg-white text-xs outline-none resize-none focus:border-[#1a1a1a]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault() }} />
          <button className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#333333] transition-colors flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
