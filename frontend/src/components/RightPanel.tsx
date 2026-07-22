import { Map, Search, Lightbulb, BookOpen, Link2, PenTool, HelpCircle, MessageSquare } from 'lucide-react'
import { useState, useEffect } from 'react'

const FOLLOW_UPS = [
  { icon: Search, label: '这个概念的准确定义是什么？', type: '概念' },
  { icon: Lightbulb, label: '在实际项目中如何应用这个技术？', type: '场景' },
  { icon: BookOpen, label: '有没有推荐的进阶学习资源？', type: '学习' },
  { icon: Link2, label: '这和之前学过的内容有什么联系？', type: '关联' },
  { icon: PenTool, label: '能给我一个动手练习的任务吗？', type: '实践' },
  { icon: HelpCircle, label: '出几道题检验一下我的理解？', type: '检验' },
]

export default function RightPanel() {
  const [visibleFollowUps, setVisibleFollowUps] = useState<number[]>([])
  const [started, setStarted] = useState(false)

  // 逐个弹出追问建议
  useEffect(() => {
    if (started) {
      FOLLOW_UPS.forEach((_, i) => {
        setTimeout(() => {
          setVisibleFollowUps(prev => [...prev, i])
        }, i * 200)
      })
    }
  }, [started])

  return (
    <aside className="w-full h-full bg-[#f0ebe4] flex flex-col overflow-hidden">
      {/* 知识图谱 */}
      <div className="p-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1"><Map size={14} /> 知识图谱</span>
        </div>
        <div className="h-[90px] w-full border border-dashed border-[#c75f1a]/50 bg-white rounded-lg flex items-center justify-center">
          <span className="text-xs text-gray-400">知识图谱预览</span>
        </div>
      </div>

      {/* 第二对话窗口 — 追问建议 */}
      <div className="flex-1 flex flex-col overflow-hidden border-t border-[#dad4cd]">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1"><MessageSquare size={13} /> 追问建议</span>
          <button
            onClick={() => { setStarted(true); setVisibleFollowUps([]); setTimeout(() => setStarted(true), 50) }}
            className="text-[10px] text-gray-400 hover:text-[#c75f1a] transition-colors"
          >
            {started ? '刷新' : '展开'}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 px-3 pb-1">主窗口输出后自动分析内容提供追问</p>

        <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2">
          {!started ? (
            <p className="text-[10px] text-gray-400 text-center py-4">点击「展开」查看追问建议</p>
          ) : (
            FOLLOW_UPS.map((item, i) => (
              <div
                key={i}
                className={`transition-all duration-300 ${
                  visibleFollowUps.includes(i)
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-2'
                }`}
              >
                {visibleFollowUps.includes(i) && (
                  <button
                    className="w-full text-left bg-white border border-[#dad4cd] rounded-xl rounded-bl-sm px-3 py-2.5 hover:border-[#c75f1a]/40 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon size={11} className="text-[#c75f1a]" />
                      <span className="text-[10px] text-gray-400">{item.type}</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{item.label}</p>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
