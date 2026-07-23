import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean; agents?: string[]; activeAgent?: string | null }

function AgentNode({ data }: any) {
  const a = data.active; const size = a ? 1.08 : 1
  return (
    <div className="transition-all duration-500 ease-out" style={{ transform: `scale(${size})`, opacity: 0.92 }}>
      <div className="px-3 py-2.5 rounded-xl border text-center" style={{
        background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)', borderColor: '#b8952e', borderWidth: 1.5,
        boxShadow: a ? '0 4px 20px rgba(184,149,46,0.18)' : '0 1px 6px rgba(0,0,0,0.04)',
        minWidth: 120, transition: 'all 0.5s ease',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#5c4a1e', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          <span>{data.icon}</span><span>{data.label}</span>
        </div>
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

export default function AgentFlow({ visible, agents, activeAgent }: Props) {
  const [phase, setPhase] = useState(0)
  const agentNameToId: Record<string, string> = {
    '输入信息处理': 'input', '调度': 'dispatch', '记忆管理': 'memory',
    '学情诊断': 'diagnose', '知识库管理': 'kb', '搜索': 'search',
    '信息整理与生成': 'generate', '审核裁判': 'review',
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
