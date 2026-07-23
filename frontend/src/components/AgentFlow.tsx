import { useState, useEffect, useMemo, useCallback } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean }

// 自定义 Agent 节点
function AgentNode({ data, selected }: any) {
  const isActive = data.active
  const size = isActive ? 1.08 : 1
  return (
    <div
      className="transition-all duration-500 ease-out"
      style={{
        transform: `scale(${size})`,
        opacity: 0.92,
      }}
    >
      <div
        className="px-3 py-2.5 rounded-xl border text-center"
        style={{
          background: 'rgba(255,255,255,0.45)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderColor: '#b8952e',
          borderWidth: 1.5,
          boxShadow: isActive ? '0 4px 20px rgba(184,149,46,0.18)' : '0 1px 6px rgba(0,0,0,0.04)',
          minWidth: isActive ? 170 : 120,
          transition: 'all 0.5s ease',
        }}
      >
        <div className="flex items-center gap-1.5 mb-0.5" style={{ fontSize: isActive ? 9 : 10, fontWeight: 600, color: '#5c4a1e', justifyContent: 'center' }}>
          <span>{data.icon}</span>
          <span>{data.label}</span>
        </div>
        {isActive && data.detail && (
          <div className="text-[10px] text-gray-500 leading-relaxed mt-1 max-w-[160px]">{data.detail}</div>
        )}
        <Handle type="target" position={Position.Top} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Bottom} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Left} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Left} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Right} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Right} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="source" position={Position.Top} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
        <Handle type="target" position={Position.Bottom} style={{ background: '#b8952e', width: 6, height: 6, border: 'none' }} />
      </div>
    </div>
  )
}

const nodeTypes = { agentNode: AgentNode }

const allNodes: Node[] = [
  { id: 'input', type: 'agentNode', position: { x: 30, y: 160 },
    data: { label: '信息输入处理', icon: '📥', phase: 1, active: false, detail: '识别格式→统一文本' } },
  { id: 'dispatch', type: 'agentNode', position: { x: 220, y: 160 },
    data: { label: '调度 Agent', icon: '🎯', phase: 1, active: false, detail: '判断→分配子Agent' } },
  { id: 'memory', type: 'agentNode', position: { x: 420, y: 30 },
    data: { label: '记忆管理', icon: '🧠', phase: 2, active: false, detail: 'L1/L2/L3三层记忆' } },
  { id: 'diagnose', type: 'agentNode', position: { x: 420, y: 120 },
    data: { label: '学情诊断', icon: '🔍', phase: 2, active: false, detail: '分析知识水平' } },
  { id: 'kb', type: 'agentNode', position: { x: 420, y: 210 },
    data: { label: '知识库管理', icon: '📚', phase: 2, active: false, detail: '检索+切片+向量' } },
  { id: 'search', type: 'agentNode', position: { x: 420, y: 300 },
    data: { label: '搜索', icon: '🔎', phase: 2, active: false, detail: 'SearXNG联网' } },
  { id: 'generate', type: 'agentNode', position: { x: 610, y: 130 },
    data: { label: '信息整理与生成', icon: '📤', phase: 3, active: false, detail: '整理多源信息→生成' } },
  { id: 'review', type: 'agentNode', position: { x: 800, y: 130 },
    data: { label: '审核裁判', icon: '⚖️', phase: 3, active: false, detail: '校验→重试/通过' } },
]

const allEdges: Edge[] = [
  { id: 'e1', source: 'input', target: 'dispatch', animated: false },
  { id: 'e2', source: 'dispatch', target: 'memory', animated: false },
  { id: 'e3', source: 'dispatch', target: 'diagnose', animated: false },
  { id: 'e4', source: 'dispatch', target: 'kb', animated: false },
  { id: 'e5', source: 'dispatch', target: 'search', animated: false },
  { id: 'e6', source: 'diagnose', target: 'generate', animated: false },
  { id: 'e7', source: 'kb', target: 'generate', animated: false },
  { id: 'e8', source: 'search', target: 'generate', animated: false },
  { id: 'e9', source: 'generate', target: 'review', animated: false },
  { id: 'e10', source: 'review', target: 'generate', style: { strokeDasharray: '5,3' } },
  { id: 'e11', source: 'review', target: 'memory', style: { strokeDasharray: '5,3' } },
]

export default function AgentFlow({ visible }: Props) {
  const [phase, setPhase] = useState(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep',
    style: { stroke: '#1a1a1a', strokeWidth: 1.5 },
    markerEnd: { type: 'arrowclosed' as const, color: '#1a1a1a', width: 12, height: 12 },
  }), [])

  useEffect(() => {
    if (!visible) { setPhase(0); setActiveNode(null); return }
    setPhase(1)
    const phases = [
      { t: 300, p: 1, node: 'input' as const },
      { t: 800, p: 1, node: 'dispatch' as const },
      { t: 1600, p: 2, node: 'memory' as const },
      { t: 1900, p: 2, node: 'diagnose' as const },
      { t: 2100, p: 2, node: 'kb' as const },
      { t: 2300, p: 2, node: 'search' as const },
      { t: 2900, p: 3, node: 'generate' as const },
      { t: 3300, p: 3, node: 'review' as const },
    ]
    const timers = phases.map(({ t, p, node }) =>
      setTimeout(() => { setPhase(p); setActiveNode(node) }, t)
    )
    const finish = setTimeout(() => setActiveNode(null), 4500)
    return () => { timers.forEach(clearTimeout); clearTimeout(finish) }
  }, [visible])

  const visibleNodes = allNodes.filter(n => (n.data as any).phase <= phase)
  const visibleEdges = allEdges.filter(e =>
    visibleNodes.some(n => n.id === e.source) && visibleNodes.some(n => n.id === e.target)
  )

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-[42%] min-h-[160px]' : 'h-0'}`}>
      <div className="h-full w-full border-b border-[#dad4cd] relative" style={{ background: 'rgba(250,248,245,0.6)' }}>
        <div className="absolute top-1.5 left-[60px] z-10 flex gap-3">
          {[{ p: 1, c: '输入环节' }, { p: 2, c: '核心逻辑' }, { p: 3, c: '输出环节' }].map(({ p, c }) => (
            <span key={p} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all duration-500 ${
              phase >= p ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-400'}`}>{c}</span>
          ))}
        </div>
        <ReactFlow
          nodes={visibleNodes.map(n => ({
            ...n,
            data: { ...n.data, active: activeNode === n.id },
          }))}
          edges={visibleEdges.map(e => ({
            ...e,
            style: { ...(e.style || {}), stroke: '#1a1a1a' },
            markerEnd: { type: 'arrowclosed', color: '#1a1a1a', width: 12, height: 12 },
          }))}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d9d3cb" gap={28} size={0.4} />
          <Controls position="bottom-right" className="opacity-50 hover:opacity-90 transition-opacity" />
        </ReactFlow>
      </div>
    </div>
  )
}
