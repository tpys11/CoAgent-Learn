import { useState } from 'react'
import { FileText, GitBranch, Table as TableIcon, BarChart3, Volume2, ClipboardList, Layers } from 'lucide-react'

type FormKey = 'report' | 'mindmap' | 'table' | 'chart' | 'audio' | 'quiz' | 'flash'

const FORMS: Array<{ key: FormKey; label: string; icon: any; desc: string }> = [
  { key: 'report', label: '报告', icon: FileText, desc: '汇总对话生成的讲义、实操指南与测试题' },
  { key: 'mindmap', label: '思维导图', icon: GitBranch, desc: '基于上传资料的层级结构，以思维导图展示' },
  { key: 'table', label: '表格', icon: TableIcon, desc: '知识点掌握度等数据以表格呈现' },
  { key: 'chart', label: '统计图', icon: BarChart3, desc: '学习趋势统计图' },
  { key: 'audio', label: '音频', icon: Volume2, desc: '音频概览（朗读 / 双人讨论播客形式）' },
  { key: 'quiz', label: '测试题', icon: ClipboardList, desc: '分阶测试题' },
  { key: 'flash', label: '闪卡', icon: Layers, desc: '闪卡（front / back 翻转复习）' },
]

/** 特殊形式输出：先以矩形占位（具体实现后续补充） */
export default function SpecialOutputPane() {
  const [form, setForm] = useState<FormKey>('report')
  const cur = FORMS.find(f => f.key === form) || FORMS[0]
  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* 形式标签条 */}
      <div className="flex flex-wrap gap-1 px-3 pt-2 flex-shrink-0">
        {FORMS.map(f => (
          <button key={f.key} onClick={() => setForm(f.key)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${form === f.key ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
            <f.icon size={11} /> {f.label}
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
