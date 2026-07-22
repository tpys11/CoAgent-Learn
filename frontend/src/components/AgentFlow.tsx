import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface Props { visible: boolean }

const agentNodes: Node[] = [
  // ===== 输入环节 =====
  { id: 'input', type: 'default', position: { x: 30, y: 120 },
    data: { label: '📥 输入信息\n处理 Agent' },
    style: { background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 600, width: 130, textAlign: 'center' } },
  { id: 'dispatch', type: 'default', position: { x: 200, y: 120 },
    data: { label: '🎯 调度 Agent' },
    style: { background: '#fef3eb', border: '2px solid #c75f1a', borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 600, width: 130, textAlign: 'center' } },

  // ===== 核心逻辑环节 =====
  { id: 'memory', type: 'default', position: { x: 400, y: 10 },
    data: { label: '🧠 记忆管理' },
    style: { background: '#f5f3ff', border: '2px solid #7c3aed', borderRadius: 10, padding: 8, fontSize: 10, fontWeight: 600, width: 110, textAlign: 'center' } },
  { id: 'diagnose', type: 'default', position: { x: 400, y: 90 },
    data: { label: '🔍 学情诊断' },
    style: { background: '#fef3eb', border: '2px solid #c75f1a', borderRadius: 10, padding: 8, fontSize: 10, fontWeight: 600, width: 110, textAlign: 'center' } },
  { id: 'kb', type: 'default', position: { x: 400, y: 170 },
    data: { label: '📚 知识库管理' },
    style: { background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: 8, fontSize: 10, fontWeight: 600, width: 110, textAlign: 'center' } },
  { id: 'search', type: 'default', position: { x: 400, y: 250 },
    data: { label: '🔎 搜索' },
    style: { background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 10, padding: 8, fontSize: 10, fontWeight: 600, width: 110, textAlign: 'center' } },

  // ===== 输出环节 =====
  { id: 'generate', type: 'default', position: { x: 570, y: 90 },
    data: { label: '📤 信息整理\n与生成 Agent' },
    style: { background: '#eff6ff', border: '2px solid #2563eb', borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 600, width: 140, textAlign: 'center' } },
  { id: 'review', type: 'default', position: { x: 750, y: 90 },
    data: { label: '⚖️ 审核裁判' },
    style: { background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 10, padding: 8, fontSize: 11, fontWeight: 600, width: 110, textAlign: 'center' } },
]

const agentEdges: Edge[] = [
  // 输入环节
  { id: 'e1', source: 'input', target: 'dispatch', animated: true, style: { stroke: '#16a34a' }, label: '处理后输入', labelStyle: { fontSize: 9 } },
  // 核心环节
  { id: 'e2', source: 'dispatch', target: 'memory', animated: true, style: { stroke: '#7c3aed' }, label: '读记忆', labelStyle: { fontSize: 8 } },
  { id: 'e3', source: 'dispatch', target: 'diagnose', animated: true, style: { stroke: '#c75f1a' }, label: '分配', labelStyle: { fontSize: 8 } },
  { id: 'e4', source: 'dispatch', target: 'kb', animated: true, style: { stroke: '#16a34a' }, label: '分配', labelStyle: { fontSize: 8 } },
  { id: 'e5', source: 'dispatch', target: 'search', animated: true, style: { stroke: '#16a34a' }, label: '分配', labelStyle: { fontSize: 8 } },
  { id: 'e6', source: 'diagnose', target: 'generate', animated: true, style: { stroke: '#c75f1a' }, label: '画像→生成', labelStyle: { fontSize: 8 } },
  { id: 'e7', source: 'kb', target: 'generate', animated: true, style: { stroke: '#16a34a' }, label: '检索→生成', labelStyle: { fontSize: 8 } },
  { id: 'e8', source: 'search', target: 'generate', animated: true, style: { stroke: '#16a34a' }, label: '搜索→生成', labelStyle: { fontSize: 8 } },
  // 输出环节
  { id: 'e9', source: 'generate', target: 'review', animated: true, style: { stroke: '#2563eb' }, label: '提交审核', labelStyle: { fontSize: 8 } },
  { id: 'e10', source: 'review', target: 'generate', animated: true, style: { stroke: '#dc2626', strokeDasharray: '5,5' }, label: '不通过→重试', labelStyle: { fontSize: 8, color: '#dc2626' } },
  // 输出后更新记忆
  { id: 'e11', source: 'review', target: 'memory', animated: true, style: { stroke: '#7c3aed', strokeDasharray: '5,5' }, label: '通过后→更新记忆', labelStyle: { fontSize: 8 } },
]

export default function AgentFlow({ visible }: Props) {
  const defaultEdgeOptions = useMemo(() => ({ type: 'smoothstep' }), [])

  return (
    <div className={`transition-all duration-300 overflow-hidden ${visible ? 'h-[50%] min-h-[200px]' : 'h-0'}`}>
      <div className="h-full w-full border-b border-[#dad4cd] relative">
        {/* 三部分标签 */}
        <div className="absolute top-1 left-[80px] text-[10px] font-semibold text-green-600 bg-white/80 px-1.5 py-0.5 rounded z-10">输入环节</div>
        <div className="absolute top-1 left-[430px] text-[10px] font-semibold text-[#c75f1a] bg-white/80 px-1.5 py-0.5 rounded z-10">核心逻辑</div>
        <div className="absolute top-1 left-[630px] text-[10px] font-semibold text-blue-600 bg-white/80 px-1.5 py-0.5 rounded z-10">输出环节</div>
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
