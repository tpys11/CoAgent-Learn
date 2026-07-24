import { Map, Search, Lightbulb, BookOpen } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Props {
  messageCount: number
}

const QUESTIONS = [
  { icon: Search, text: '这个概念的准确定义是什么？', type: '概念' },
  { icon: Lightbulb, text: '在实际项目中如何应用这个技术？', type: '场景' },
  { icon: BookOpen, text: '有没有推荐的进阶学习资源？', type: '学习' },
]

export default function RightPanel({ messageCount }: Props) {
  const [visible, setVisible] = useState(false)
  const [showIdx, setShowIdx] = useState(0)

  // 主窗口输出后自动显示追问
  useEffect(() => {
    if (messageCount > 0) {
      setVisible(true); setShowIdx(0)
      QUESTIONS.forEach((_, i) => {
        setTimeout(() => setShowIdx(i + 1), (i + 1) * 300)
      })
    }
  }, [messageCount])

  return (
    <aside className="w-full h-full bg-[#f0ebe4] flex flex-col overflow-hidden">
      <div className="p-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1"><Map size={14} /> 知识图谱</span>
        </div>
        <div className="h-[70px] w-full border border-dashed border-[#c75f1a]/50 bg-white rounded-lg flex items-center justify-center">
          <span className="text-xs text-gray-400">知识图谱预览</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col border-t border-[#dad4cd] overflow-hidden">
        <div className="px-3 py-2 flex-shrink-0">
          <span className="text-xs font-semibold">追问建议</span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-2 pb-2">
          {!visible ? (
            <p className="text-[11px] text-gray-400 text-center py-4">主窗口回复后自动生成</p>
          ) : (
            QUESTIONS.map((item, i) => (
              <div key={i} className={`transition-all duration-300 ${i < showIdx ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
                {i < showIdx && (
                  <button className="w-full text-left bg-white border border-[#dad4cd] rounded-xl rounded-bl-sm px-3 py-2.5 hover:border-[#c75f1a]/40 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon size={11} className="text-[#c75f1a]" />
                      <span className="text-[10px] text-gray-400">{item.type}</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{item.text}</p>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 追问输入框 */}
      <div className="p-2 flex-shrink-0 border-t border-[#dad4cd]">
        <div className="flex gap-1.5 items-end">
          <textarea placeholder="追问..." rows={1}
            className="flex-1 px-3 py-1.5 border border-[#c4beb6] rounded-lg bg-white text-xs outline-none resize-none focus:border-[#c75f1a]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault() }} />
          <button className="px-3 py-1.5 bg-[#c75f1a] text-white rounded-lg hover:bg-[#a84a10] transition-colors flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
