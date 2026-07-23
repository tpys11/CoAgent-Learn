import { useState, useEffect, useMemo } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean }

function AgentNode({ data }: any) {
  const a = data.active; const size = a ? 1.08 : 1
  return (
    <div className="transition-all duration-500 ease-out" style={{ transform: `scale(${size})`, opacity: 0.92 }}>
      <div className="px-3 py-2.5 rounded-xl border text-center" style={{
        background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)', borderColor: '#b8952e', borderWidth: 1.5,
        boxShadow: a ? '0 4px 20px rgba(184,149,46,0.18)' : '0 1px 6px rgba(0,0,0,0.04)',
        minWidth: a ? 170 : 120, transition: 'all 0.5s ease',
      }}>
        <div style={{ fontSize: a ? 9 : 10, fontWeight: 600, color: '#5c4a1e', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          <span>{data.icon}</span><span>{data.label}</span>
        </div>
        {a && data.detail && <div className="text-[10px] text-gray-500 leading-relaxed mt-1 max-w-[160px]">{data.detail}</div>}
        <Handle type="target" position={Position.Top} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Top} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Bottom} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Left} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Left} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Right} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Right} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
      </div>
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }

const N = (id: string, x: number, y: number, label: string, icon: string, phase: number, detail: string) =>
  ({ id, type: 'agentNode', position: { x, y }, data: { label, icon, phase, active: false, detail } })

const allNodes = [
  N('input', 20, 180, '信息输入处理', '📥', 1, '识别格式→统一文本'),
  N('dispatch', 200, 180, '调度 Agent', '🎯', 1, '判断→分配子Agent'),
  N('memory', 400, 20, '记忆管理', '🧠', 2, 'L1/L2/L3三层记忆'),
  N('diagnose', 400, 100, '学情诊断', '🔍', 2, '分析知识水平'),
  N('kb', 400, 180, '知识库管理', '📚', 2, '检索+切片+向量'),
  N('search', 400, 260, '搜索', '🔎', 2, 'SearXNG联网'),
  N('generate', 600, 140, '信息整理与生成', '📤', 3, '整理多源信息→生成'),
  N('review', 790, 140, '审核裁判', '⚖️', 3, '校验→重试/通过'),
]

const allEdges: Edge[] = [
  { id: 'e1', source: 'input', target: 'dispatch', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'dispatch', target: 'memory', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e3', source: 'dispatch', target: 'diagnose', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e4', source: 'dispatch', target: 'kb', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e5', source: 'dispatch', target: 'search', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e6', source: 'diagnose', target: 'generate', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e7', source: 'kb', target: 'generate', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e8', source: 'search', target: 'generate', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e9', source: 'dispatch', target: 'generate', sourceHandle: 'right', targetHandle: 'left', style: { strokeDasharray: '8,3' } },
  { id: 'e10', source: 'generate', target: 'review', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e11', source: 'review', target: 'generate', sourceHandle: 'bottom', targetHandle: 'bottom', style: { strokeDasharray: '5,3' } },
  { id: 'e12', source: 'review', target: 'memory', sourceHandle: 'top', targetHandle: 'bottom', style: { strokeDasharray: '5,3' } },
]

export default function AgentFlow({ visible }: Props) {
  const [phase, setPhase] = useState(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep', style: { stroke: '#1a1a1a', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, color: '#1a1a1a', width: 12, height: 12 },
  }), [])

  useEffect(() => {
    if (!visible) { setPhase(0); setActiveNode(null); return }
    setPhase(1)
    const seq = [
      [300, 1, 'input'], [800, 1, 'dispatch'], [1600, 2, 'memory'], [1900, 2, 'diagnose'],
      [2100, 2, 'kb'], [2300, 2, 'search'], [2900, 3, 'generate'], [3300, 3, 'review'],
    ]
    const timers = seq.map(([t, p, n]) => setTimeout(() => { setPhase(p as number); setActiveNode(n as string) }, t as number))
    const f = setTimeout(() => setActiveNode(null), 4500)
    return () => { timers.forEach(clearTimeout); clearTimeout(f) }
  }, [visible])

  const vNodes = allNodes.filter(n => (n.data as any).phase <= phase)
  const vEdges = allEdges.filter(e => vNodes.some(n => n.id === e.source) && vNodes.some(n => n.id === e.target))

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-full' : 'h-0'}`}>
      <div className="h-full w-full relative" style={{ background: 'rgba(250,248,245,0.6)' }}>
        <ReactFlow
          nodes={vNodes.map(n => ({ ...n, data: { ...n.data, active: activeNode === n.id } }))}
          edges={vEdges.map(e => ({ ...e, style: { ...(e.style || {}), stroke: '#1a1a1a' }, markerEnd: { type: 'arrowclosed', color: '#1a1a1a', width: 12, height: 12 } }))}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d9d3cb" gap={28} size={0.4} />
          <Controls position="bottom-right" className="opacity-50 hover:opacity-90 transition-opacity" />
        </ReactFlow>
      </div>
    </div>
  )
}
