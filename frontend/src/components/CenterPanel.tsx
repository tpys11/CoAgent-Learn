import { useState } from 'react'
import { Send, Bot } from 'lucide-react'
import type { Message } from '../App'

interface CenterPanelProps {
  currentProject: string | null
  messages: Message[]
  onSend: (text: string) => void
}

export default function CenterPanel({ currentProject, messages, onSend }: CenterPanelProps) {
  const [input, setInput] = useState('')

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput('')
  }

  return (
    <main className="flex-1 h-full min-w-0 flex flex-col">
      {/* Stats bar */}
      <div className="mx-1 mt-0 mb-1 px-3 py-2 bg-white border border-[#333] rounded-lg flex items-center gap-3 text-sm flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500">12h 36min</span>
        <span className="text-xs text-gray-400">专注时长</span>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-semibold text-gray-500">48,230</span>
        <span className="text-xs text-gray-400">Tokens</span>
        <span className="flex-1" />
        <span className="text-xs text-gray-400">00:00</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <Bot size={48} className="text-gray-300" />
            <h1 className="text-2xl font-bold">CoAgent-Learn</h1>
            <p className="text-sm text-gray-400">
              {currentProject
                ? `当前项目: ${currentProject}`
                : '选择或新建一个项目开始学习'}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'self-end bg-[#fef3eb] border border-[#c75f1a]/25 rounded-br-sm'
                  : 'self-start bg-transparent border border-transparent rounded-bl-sm'
              }`}
            >
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-1 pb-2 pt-1">
        {/* Settings row */}
        <div className="flex gap-2 px-3 py-1.5 mb-1 border border-[#d0d0d0] rounded-lg bg-white items-center">
          <select className="text-[11px] bg-white border border-[#c4beb6] rounded px-2 py-1 outline-none">
            <option>默认检索</option><option>增强检索</option><option>私有检索</option>
          </select>
          <select className="text-[11px] bg-white border border-[#c4beb6] rounded px-2 py-1 outline-none">
            <option>自由格式</option><option>结构化</option>
          </select>
          <select className="text-[11px] bg-white border border-[#c4beb6] rounded px-2 py-1 outline-none">
            <option>简洁</option><option>适中</option><option>深入</option>
          </select>
          <select className="text-[11px] bg-white border border-[#c4beb6] rounded px-2 py-1 outline-none">
            <option>思考:关</option><option>思考:开</option>
          </select>
        </div>

        {/* Input row */}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder="输入你的问题...（Shift+Enter 换行）"
            rows={2}
            className="flex-1 px-3 py-2 border border-[#c4beb6] rounded-lg bg-white text-sm outline-none resize-none focus:border-[#c75f1a] focus:ring-[3px] focus:ring-[#c75f1a]/10"
          />
          <button
            onClick={handleSend}
            className="px-5 py-2 bg-[#c75f1a] text-white font-semibold rounded-lg hover:bg-[#a84a10] transition-colors flex items-center gap-1 text-sm"
          >
            <Send size={14} /> 发送
          </button>
        </div>
      </div>
    </main>
  )
}
