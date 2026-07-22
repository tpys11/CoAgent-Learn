import { Map, Search, Lightbulb, BookOpen, Link2, PenTool, HelpCircle, Send } from 'lucide-react'
import { useState } from 'react'

interface FollowUpMsg {
  text: string
  icon: typeof Search
  type: string
}

const SUGGESTIONS: FollowUpMsg[] = [
  { icon: Search, text: '这个概念的准确定义是什么？', type: '概念' },
  { icon: Lightbulb, text: '在实际项目中如何应用这个技术？', type: '场景' },
  { icon: BookOpen, text: '有没有推荐的进阶学习资源？', type: '学习' },
  { icon: Link2, text: '这和之前学过的内容有什么联系？', type: '关联' },
  { icon: PenTool, text: '能给我一个动手练习的任务吗？', type: '实践' },
  { icon: HelpCircle, text: '出几道题检验一下我的理解？', type: '检验' },
]

export default function RightPanel() {
  const [msgs, setMsgs] = useState<FollowUpMsg[]>([])
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleShow = () => {
    setShowSuggestions(true)
    SUGGESTIONS.forEach((s, i) => {
      setTimeout(() => setMsgs(prev => [...prev, s]), i * 250)
    })
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setMsgs(prev => [...prev, { text, icon: Send, type: '追问' }])
    setInput('')
  }

  return (
    <aside className="w-full h-full bg-[#f0ebe4] flex flex-col overflow-hidden">
      {/* 知识图谱 */}
      <div className="p-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold flex items-center gap-1"><Map size={14} /> 知识图谱</span>
        </div>
        <div className="h-[70px] w-full border border-dashed border-[#c75f1a]/50 bg-white rounded-lg flex items-center justify-center">
          <span className="text-xs text-gray-400">知识图谱预览</span>
        </div>
      </div>

      {/* 追问对话区 */}
      <div className="flex-1 flex flex-col border-t border-[#dad4cd] overflow-hidden">
        <div className="px-3 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold">追问</span>
          {!showSuggestions && (
            <button onClick={handleShow} className="text-[10px] text-[#c75f1a] hover:underline">展开建议</button>
          )}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
          {!showSuggestions ? (
            <p className="text-[11px] text-gray-400 text-center py-4">点击「展开建议」查看追问</p>
          ) : (
            msgs.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 animate-[fadeIn_0.3s_ease] ${
                  msg.type === '追问' ? 'justify-end' : ''
                }`}
              >
                {msg.type !== '追问' && (
                  <div className="w-6 h-6 rounded-full bg-[#fef3eb] flex items-center justify-center flex-shrink-0 mt-1">
                    <msg.icon size={11} className="text-[#c75f1a]" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs ${
                    msg.type === '追问'
                      ? 'bg-[#fef3eb] border border-[#c75f1a]/25 rounded-br-sm'
                      : 'bg-white border border-[#dad4cd] rounded-bl-sm'
                  }`}
                >
                  {msg.type !== '追问' && (
                    <span className="text-[10px] text-[#c75f1a] font-medium">{msg.type}</span>
                  )}
                  <p className={`${msg.type !== '追问' ? 'mt-0.5' : ''} text-gray-700 leading-relaxed`}>{msg.text}</p>
                </div>
                {msg.type === '追问' && (
                  <div className="w-6 h-6 rounded-full bg-[#c75f1a] flex items-center justify-center flex-shrink-0 mt-1">
                    <Send size={10} className="text-white" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 输入框 */}
        <div className="p-2 flex-shrink-0">
          <div className="flex gap-1.5 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder="追问..."
              rows={1}
              className="flex-1 px-3 py-1.5 border border-[#c4beb6] rounded-lg bg-white text-xs outline-none resize-none focus:border-[#c75f1a]"
            />
            <button
              onClick={handleSend}
              className="px-3 py-1.5 bg-[#c75f1a] text-white rounded-lg hover:bg-[#a84a10] transition-colors flex-shrink-0"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
