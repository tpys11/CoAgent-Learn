import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, type Edge } from '@xyflow/react'
import { Workflow, Brain, Database, Scale } from 'lucide-react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean; agents?: string[]; activeAgent?: string | null }

function AgentNode({ data }: any) {
  const a = data.active; const size = a ? 1.08 : 1
  return (
    <div className="transition-all duration-500 ease-out" style={{ transform: `scale(${size})`, opacity: 0.92 }}>
      <div className="px-3 py-2.5 rounded-xl border text-center" style={{
        background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)', borderColor: '#666666', borderWidth: 1.5,
        boxShadow: a ? '0 4px 20px rgba(184,149,46,0.18)' : '0 1px 6px rgba(0,0,0,0.04)',
        minWidth: 120, transition: 'all 0.5s ease',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#333333', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          {data.icon ? <data.icon size={11} strokeWidth={2} /> : null}<span>{data.label}</span>
        </div>
        <Handle type="target" position={Position.Top} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Top} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Bottom} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Left} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Left} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Right} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Right} style={{ background: '#666666', width: 6, height: 6, border: 'none' }} />
      </div>
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }

const N = (id: string, x: number, y: number, label: string, icon: any, phase: number, detail: string) =>
  ({ id, type: 'agentNode', position: { x, y }, data: { label, icon, phase, active: false, detail } })

const allNodes = [
  N('main', 200, 140, '主 Agent', Workflow, 1, '输入处理→一次规划→生成'),
  N('study', 440, 40, '学情与记忆管理', Brain, 2, '画像+记忆读取'),
  N('kb', 440, 240, '知识库管理', Database, 2, '知识库检索+联网'),
  N('review', 680, 140, '审核', Scale, 3, '三维度综合审查'),
]

const allEdges: Edge[] = [
  { id: 'e1', source: 'main', target: 'study', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e2', source: 'main', target: 'kb', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e3', source: 'study', target: 'main', sourceHandle: 'bottom', targetHandle: 'top', style: { strokeDasharray: '8,3' } },
  { id: 'e4', source: 'kb', target: 'main', sourceHandle: 'top', targetHandle: 'bottom', style: { strokeDasharray: '8,3' } },
  { id: 'e5', source: 'main', target: 'review', sourceHandle: 'right', targetHandle: 'left' },
  { id: 'e6', source: 'review', target: 'main', sourceHandle: 'bottom', targetHandle: 'bottom', style: { strokeDasharray: '5,3' } },
]

export default function AgentFlow({ visible, agents, activeAgent }: Props) {
  const [phase, setPhase] = useState(0)
  const agentNameToId: Record<string, string> = {
    '主Agent': 'main', '学情与记忆管理': 'study',
    '知识库管理': 'kb', '审核': 'review', '输出': 'main',
  }

  useEffect(() => {
    if (!visible) return
    if (activeAgent) {
      const node = allNodes.find(n => n.id === agentNameToId[activeAgent])
      if (node) setPhase((node.data as any).phase || 1)
    }
  }, [visible, activeAgent])

  const shownIds = new Set((agents || []).map(a => agentNameToId[a]).filter(Boolean))
  const vNodes = allNodes.filter(n => shownIds.has(n.id) || (n.data as any).phase <= phase)
  const activeId = activeAgent ? agentNameToId[activeAgent] : null
  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep', style: { stroke: '#1a1a1a', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, color: '#1a1a1a', width: 12, height: 12 },
  }), [])
  const vEdges = allEdges.filter(e => vNodes.some(n => n.id === e.source) && vNodes.some(n => n.id === e.target))

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-full' : 'h-0'}`}>
      <div className="h-full w-full relative" style={{ background: 'rgba(250,248,245,0.6)' }}>
        <ReactFlow
          nodes={vNodes.map(n => ({ ...n, data: { ...n.data, active: activeId === n.id } }))}
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
