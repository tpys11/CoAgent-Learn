import { useState, useEffect, useMemo } from 'react'
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean }

const allNodes: Node[] = [
  { id: 'input', type: 'default', position: { x: 20, y: 140 },
    data: { label: '信息输入处理', icon: '📥', phase: 1 as number },
    style: { background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1.5px solid #6ee7b7', borderRadius: 14, padding: '10px 16px', fontSize: 12, fontWeight: 600, width: 130, textAlign: 'center', boxShadow: '0 2px 8px rgba(16,185,129,0.12)' } },
  { id: 'dispatch', position: { x: 190, y: 140 },
    data: { label: '调度 Agent', icon: '🎯', phase: 1 },
    style: { background: 'linear-gradient(135deg, #fff7ed, #fed7aa)', border: '1.5px solid #fb923c', borderRadius: 14, padding: '10px 16px', fontSize: 12, fontWeight: 600, width: 130, textAlign: 'center', boxShadow: '0 2px 8px rgba(249,115,22,0.12)' } },

  { id: 'memory', position: { x: 370, y: 20 },
    data: { label: '记忆管理', icon: '🧠', phase: 2 },
    style: { background: 'linear-gradient(135deg, #f5f3ff, #e9d5ff)', border: '1.5px solid #c4b5fd', borderRadius: 14, padding: '8px 14px', fontSize: 11, fontWeight: 600, width: 110, textAlign: 'center', boxShadow: '0 2px 6px rgba(139,92,246,0.10)' } },
  { id: 'diagnose', position: { x: 370, y: 100 },
    data: { label: '学情诊断', icon: '🔍', phase: 2 },
    style: { background: 'linear-gradient(135deg, #fff7ed, #fed7aa)', border: '1.5px solid #fb923c', borderRadius: 14, padding: '8px 14px', fontSize: 11, fontWeight: 600, width: 110, textAlign: 'center', boxShadow: '0 2px 6px rgba(249,115,22,0.10)' } },
  { id: 'kb', position: { x: 370, y: 180 },
    data: { label: '知识库管理', icon: '📚', phase: 2 },
    style: { background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1.5px solid #6ee7b7', borderRadius: 14, padding: '8px 14px', fontSize: 11, fontWeight: 600, width: 110, textAlign: 'center', boxShadow: '0 2px 6px rgba(16,185,129,0.10)' } },
  { id: 'search', position: { x: 370, y: 260 },
    data: { label: '搜索', icon: '🔎', phase: 2 },
    style: { background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1.5px solid #6ee7b7', borderRadius: 14, padding: '8px 14px', fontSize: 11, fontWeight: 600, width: 110, textAlign: 'center', boxShadow: '0 2px 6px rgba(16,185,129,0.10)' } },

  { id: 'generate', position: { x: 540, y: 110 },
    data: { label: '信息整理与生成', icon: '📤', phase: 3 },
    style: { background: 'linear-gradient(135deg, #eff6ff, #bfdbfe)', border: '1.5px solid #60a5fa', borderRadius: 14, padding: '10px 16px', fontSize: 12, fontWeight: 600, width: 145, textAlign: 'center', boxShadow: '0 2px 8px rgba(59,130,246,0.12)' } },
  { id: 'review', position: { x: 720, y: 110 },
    data: { label: '审核裁判', icon: '⚖️', phase: 3 },
    style: { background: 'linear-gradient(135deg, #fef2f2, #fecaca)', border: '1.5px solid #f87171', borderRadius: 14, padding: '10px 16px', fontSize: 12, fontWeight: 600, width: 110, textAlign: 'center', boxShadow: '0 2px 8px rgba(239,68,68,0.12)' } },
]

const allEdges: Edge[] = [
  { id: 'e1', source: 'input', target: 'dispatch', animated: true, style: { stroke: '#6ee7b7', strokeWidth: 1.5 } },
  { id: 'e2', source: 'dispatch', target: 'memory', animated: true, style: { stroke: '#c4b5fd', strokeWidth: 1.5 } },
  { id: 'e3', source: 'dispatch', target: 'diagnose', animated: true, style: { stroke: '#fb923c', strokeWidth: 1.5 } },
  { id: 'e4', source: 'dispatch', target: 'kb', animated: true, style: { stroke: '#6ee7b7', strokeWidth: 1.5 } },
  { id: 'e5', source: 'dispatch', target: 'search', animated: true, style: { stroke: '#6ee7b7', strokeWidth: 1.5 } },
  { id: 'e6', source: 'diagnose', target: 'generate', animated: true, style: { stroke: '#fb923c', strokeWidth: 1.5 } },
  { id: 'e7', source: 'kb', target: 'generate', animated: true, style: { stroke: '#6ee7b7', strokeWidth: 1.5 } },
  { id: 'e8', source: 'search', target: 'generate', animated: true, style: { stroke: '#6ee7b7', strokeWidth: 1.5 } },
  { id: 'e9', source: 'generate', target: 'review', animated: true, style: { stroke: '#60a5fa', strokeWidth: 1.5 } },
  { id: 'e10', source: 'review', target: 'generate', animated: true, style: { stroke: '#f87171', strokeWidth: 1.5, strokeDasharray: '5,5' } },
  { id: 'e11', source: 'review', target: 'memory', animated: true, style: { stroke: '#c4b5fd', strokeWidth: 1.5, strokeDasharray: '5,5' } },
]

export default function AgentFlow({ visible }: Props) {
  const [phase, setPhase] = useState(0)
  const defaultEdgeOptions = useMemo(() => ({ type: 'smoothstep' }), [])

  useEffect(() => {
    if (!visible) { setPhase(0); return }
    const t1 = setTimeout(() => setPhase(1), 200)
    const t2 = setTimeout(() => setPhase(2), 1000)
    const t3 = setTimeout(() => setPhase(3), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [visible])

  const visibleNodes = allNodes.filter(n => (n.data as any).phase <= phase)
  const visibleEdges = allEdges.filter(e => {
    return visibleNodes.some(n => n.id === e.source) && visibleNodes.some(n => n.id === e.target)
  })

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-[45%] min-h-[180px]' : 'h-0'}`}>
      <div className="h-full w-full border-b border-[#dad4cd] relative bg-gradient-to-r from-[#faf8f5] via-white to-[#faf8f5]">
        <div className="absolute top-2 left-[50px] z-10 flex gap-4">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all ${phase >= 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>输入环节</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all ${phase >= 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>核心逻辑</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all ${phase >= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>输出环节</span>
        </div>
        <ReactFlow
          nodes={visibleNodes.map(n => ({
            ...n,
            data: { label: <span className="flex items-center gap-1.5"><span>{(n.data as any).icon}</span>{(n.data as any).label}</span> },
          }))}
          edges={visibleEdges}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e8e2d9" gap={24} size={0.5} />
          <Controls position="bottom-right" className="opacity-60 hover:opacity-100 transition-opacity" />
        </ReactFlow>
      </div>
    </div>
  )
}
