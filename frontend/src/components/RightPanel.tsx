import { Map, Search, Lightbulb, BookOpen, Link2, PenTool, HelpCircle } from 'lucide-react'

const FOLLOW_UPS = [
  { icon: Search, label: '查看相关概念' },
  { icon: Lightbulb, label: '具体应用场景' },
  { icon: BookOpen, label: '深入学习此主题' },
  { icon: Link2, label: '建立知识连接' },
  { icon: PenTool, label: '实践练习' },
  { icon: HelpCircle, label: '检验理解' },
]

export default function RightPanel() {
  return (
    <aside className="w-[260px] min-w-[260px] h-full bg-[#f0ebe4] border-l border-[#dad4cd] flex flex-col rounded-lg overflow-hidden">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1"><Map size={14} /> 知识图谱</span>
        </div>
        <div className="h-[90px] w-full border border-dashed border-[#c75f1a]/50 bg-white rounded-lg flex items-center justify-center">
          <span className="text-xs text-gray-400">知识图谱预览</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden border-t border-[#dad4cd]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold">追问建议</span>
        </div>
        <p className="text-[10px] text-gray-400 px-3 pb-1">主窗口输出后自动分析内容提供追问</p>

        <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-1">
          {FOLLOW_UPS.map((item, i) => (
            <button
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-[#e8e2d9] transition-colors text-gray-600"
            >
              <item.icon size={13} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
