import { useState } from 'react'
import { FileText, Workflow, Network, Table as TableIcon, BarChart3, ClipboardList } from 'lucide-react'

type FormKey = 'report' | 'flow' | 'tree' | 'table' | 'chart' | 'quiz'

const FORMS: Array<{ key: FormKey; label: string; icon: any; desc: string }> = [
  { key: 'report', label: '报告', icon: FileText, desc: '汇总对话生成的讲解、测试题等学习内容' },
  { key: 'flow', label: '流程图', icon: Workflow, desc: '流程步骤图' },
  { key: 'tree', label: '树状图', icon: Network, desc: '基于上传资料的层级树状展示' },
  { key: 'table', label: '表格', icon: TableIcon, desc: '知识点掌握度等数据以表格呈现' },
  { key: 'chart', label: '统计图', icon: BarChart3, desc: '学习趋势统计图' },
  { key: 'quiz', label: '测试题', icon: ClipboardList, desc: '分阶测试题' },
]

/** 资源生成：先以矩形占位（具体实现后续补充） */
export default function SpecialOutputPane() {
  const [form, setForm] = useState<FormKey>('report')
  const cur = FORMS.find(f => f.key === form) || FORMS[0]
  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* 形式选项：正方形宫格（图标+名称竖排） */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-2.5 flex-shrink-0">
        {FORMS.map(f => (
          <button key={f.key} onClick={() => setForm(f.key)} title={f.desc}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl aspect-square transition-colors ${form === f.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:opacity-80'}`}>
            <f.icon size={18} strokeWidth={1.8} />
            <span className="text-[9px] leading-none">{f.label}</span>
          </button>
        ))}
      </div>
      {/* 内容区：矩形占位 */}
      <div className="flex-1 min-h-0 p-3">
        <div className="w-full h-full min-h-[220px] border-2 border-dashed hairline rounded-2xl flex flex-col items-center justify-center gap-2 text-dim">
          <cur.icon size={28} strokeWidth={1.5} />
          <p className="text-xs font-semibold text-[var(--text)]">{cur.label}</p>
          <p className="text-[10px] text-center px-6 leading-relaxed">{cur.desc}</p>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)]">待实现</span>
        </div>
      </div>
    </div>
  )
}
