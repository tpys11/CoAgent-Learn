import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Clock, Zap, Brain, Database } from 'lucide-react'
import type { Message, Project } from '../types'
import { MemoryModal, KnowledgeModal } from './InfoModals'
import AgentFlow from './AgentFlow'

interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  onSendMessage: (text: string) => void
}

export default function CenterPanel({ messages, isLoading, currentProject, onSendMessage }: CenterPanelProps) {
  const [input, setInput] = useState('')
  const [time, setTime] = useState(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  const [searchMode, setSearchMode] = useState(0)
  const [showFormat, setShowFormat] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const formatRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [outputFormat, setOutputFormat] = useState(0)
  const [outputStyle, setOutputStyle] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [outputVolume, setOutputVolume] = useState(1)
  const [depth, setDepth] = useState(1)
  const [showMemory, setShowMemory] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)

  const searchLabels = ['默认', '增强', '私有']
  const searchDescs = ['大模型自己决定', '倾向优质信息', '仅检索上传资料']

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) setShowFormat(false)
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) setShowContent(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    onSendMessage(text)
    setInput('')
  }

  return (
    <main className="flex-1 h-full min-w-0 flex flex-col">
      {/* Stats bar */}
      <div className="mx-1 mt-0 mb-1 px-3 py-2 bg-white border border-[#333] rounded-lg flex items-center gap-3 flex-shrink-0">
        <Clock size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500">12h 36min</span>
        <span className="text-xs text-gray-400">专注时长</span>
        <span className="text-gray-300">|</span>
        <Zap size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500">48,230</span>
        <span className="text-xs text-gray-400">Tokens</span>
        <span className="flex-1" />
        <span className="text-xs text-gray-400">{time}</span>
      </div>

      {/* Agent 协作流画布 */}
      <AgentFlow visible={messages.length > 0} />

      {/* Messages */}
      <div className={`overflow-y-auto px-4 py-3 flex flex-col gap-3 ${messages.length > 0 ? 'flex-1' : 'flex-1'}`}>
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <Bot size={48} className="text-gray-300" />
            <h1 className="text-2xl font-bold">CoAgent-Learn</h1>
            <p className="text-sm text-gray-400">
              {currentProject
                ? `当前项目: ${currentProject.name}`
                : '选择或新建一个项目开始学习'}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'self-end bg-[#fef3eb] border border-[#c75f1a]/25 rounded-br-sm'
                  : 'self-start bg-transparent border border-transparent rounded-bl-sm'
              }`}
            >
              {msg.content === '' ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                  <span className="text-xs ml-1">思考中…</span>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="self-start px-4 py-2.5 text-sm text-gray-400 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            <span className="text-xs">思考中…</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        {/* Control bar — 自定义按钮 */}
        <div className="flex gap-2 px-3 py-1.5 mb-1 border border-[#d0d0d0] rounded-lg bg-white items-center">
          {/* 记忆系统 */}
          <button onClick={() => setShowMemory(true)}
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Brain size={12} className="text-purple-500" /> 记忆
          </button>
          {/* 知识库 */}
          <button onClick={() => setShowKnowledge(true)}
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Database size={12} className="text-green-500" /> 知识库
          </button>
          <span className="w-px h-4 bg-[#d0d0d0]" />
          {/* 检索模式 */}
          <button
            onClick={() => setSearchMode((searchMode + 1) % 3)}
            title={searchDescs[searchMode]}
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            检索模式：<span className="text-[#c75f1a] font-semibold">{searchLabels[searchMode]}</span>
          </button>

          {/* 输出形式 */}
          <div className="relative" ref={formatRef}>
            <button
              onClick={() => { setShowFormat(!showFormat); setShowContent(false) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              输出形式 ▾
            </button>
            {showFormat && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-2 w-44 z-10">
                <div className="text-[10px] text-gray-400 mb-1">语言组织：</div>
                {['自由', '结构化'].map((s, i) => (
                  <button key={s} onClick={() => setOutputFormat(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputFormat ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>{s}</button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">输出格式：</div>
                {['MD', '纯文本'].map((s, i) => (
                  <button key={s} onClick={() => setOutputStyle(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputStyle ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>{s}</button>
                ))}
              </div>
            )}
          </div>

          {/* 输出内容 */}
          <div className="relative" ref={contentRef}>
            <button
              onClick={() => { setShowContent(!showContent); setShowFormat(false) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              输出内容 ▾
            </button>
            {showContent && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-2 w-44 z-10">
                <div className="text-[10px] text-gray-400 mb-1">思考展示：</div>
                {['关', '开'].map((s, i) => (
                  <button key={s} onClick={() => setThinking(i === 1)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${(i === 1) === thinking ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>{s}</button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">输出量：</div>
                {['精简', '适中', '拓展'].map((s, i) => (
                  <button key={s} onClick={() => setOutputVolume(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputVolume ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>{s}</button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">学习深度：</div>
                {['浅', '中', '深'].map((s, i) => (
                  <button key={s} onClick={() => setDepth(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === depth ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>{s}</button>
                ))}
              </div>
            )}
          </div>
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
            disabled={isLoading}
            className="px-5 py-2 bg-[#c75f1a] text-white font-semibold rounded-lg hover:bg-[#a84a10] transition-colors flex items-center gap-1 text-sm disabled:opacity-50"
          >
            <Send size={14} /> 发送
          </button>
        </div>
      </div>

      {showMemory && <MemoryModal onClose={() => setShowMemory(false)} />}
      {showKnowledge && <KnowledgeModal onClose={() => setShowKnowledge(false)} />}
    </main>
  )
}
