import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props {
  visible: boolean
}

const agentNodes: Node[] = [
  {
    id: 'input', type: 'default',
    position: { x: 50, y: 40 },
    data: { label: '📥 输入处理 Agent' },
    style: { background: '#fef3eb', border: '2px solid #c75f1a', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
  {
    id: 'memory', type: 'default',
    position: { x: 50, y: 140 },
    data: { label: '🧠 记忆管理 Agent' },
    style: { background: '#f5f3ff', border: '2px solid #7c3aed', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
  {
    id: 'diagnose', type: 'default',
    position: { x: 280, y: 20 },
    data: { label: '🔍 学情诊断 Agent' },
    style: { background: '#fef3eb', border: '2px solid #c75f1a', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
  {
    id: 'generate', type: 'default',
    position: { x: 280, y: 110 },
    data: { label: '📝 知识生成 Agent' },
    style: { background: '#ecfdf5', border: '2px solid #16a34a', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
  {
    id: 'review', type: 'default',
    position: { x: 280, y: 200 },
    data: { label: '⚖️ 审核裁判 Agent' },
    style: { background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
  {
    id: 'output', type: 'default',
    position: { x: 510, y: 100 },
    data: { label: '📤 信息整理与生成 Agent' },
    style: { background: '#fef3eb', border: '2px solid #c75f1a', borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 600, width: 160 },
  },
]

const agentEdges: Edge[] = [
  { id: 'e-input-diagnose', source: 'input', target: 'diagnose', animated: true, style: { stroke: '#c75f1a' }, label: '用户输入', labelStyle: { fontSize: 9 } },
  { id: 'e-input-generate', source: 'input', target: 'generate', animated: true, style: { stroke: '#c75f1a' } },
  { id: 'e-input-memory', source: 'input', target: 'memory', animated: true, style: { stroke: '#7c3aed' }, label: '读取记忆', labelStyle: { fontSize: 9 } },
  { id: 'e-memory-diagnose', source: 'memory', target: 'diagnose', animated: true, style: { stroke: '#7c3aed' } },
  { id: 'e-diagnose-generate', source: 'diagnose', target: 'generate', animated: true, style: { stroke: '#c75f1a' }, label: '画像', labelStyle: { fontSize: 9 } },
  { id: 'e-generate-review', source: 'generate', target: 'review', animated: true, style: { stroke: '#16a34a' }, label: '生成内容', labelStyle: { fontSize: 9 } },
  { id: 'e-review-generate', source: 'review', target: 'generate', animated: true, style: { stroke: '#dc2626', strokeDasharray: '5,5' }, label: '审核不通过→重试', labelStyle: { fontSize: 9, color: '#dc2626' } },
  { id: 'e-review-output', source: 'review', target: 'output', animated: true, style: { stroke: '#16a34a' }, label: '审核通过', labelStyle: { fontSize: 9 } },
  { id: 'e-output-memory', source: 'output', target: 'memory', animated: true, style: { stroke: '#7c3aed', strokeDasharray: '5,5' }, label: '更新记忆', labelStyle: { fontSize: 9 } },
]

export default function AgentFlow({ visible }: Props) {
  const defaultEdgeOptions = useMemo(() => ({ type: 'smoothstep' }), [])

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-[50%] min-h-[200px]' : 'h-0'}`}>
      <div className="h-full w-full border-b border-[#dad4cd]">
        <ReactFlow
          nodes={agentNodes}
          edges={agentEdges}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e8e2d9" gap={20} />
          <Controls position="bottom-right" />
          <MiniMap position="bottom-left" nodeColor="#c75f1a" maskColor="rgba(0,0,0,0.1)" style={{ width: 100, height: 70 }} />
        </ReactFlow>
      </div>
    </div>
  )
}
