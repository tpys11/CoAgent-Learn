import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Clock, Zap, Brain, Database } from 'lucide-react'
import type { Message, Project } from '../types'
import { MemoryModal, KnowledgeModal } from './InfoModals'

interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  onSendMessage: (text: string) => void
  statsCollapsed: boolean
  onToggleStats: () => void
}

export default function CenterPanel({ messages, isLoading, currentProject, onSendMessage, statsCollapsed, onToggleStats }: CenterPanelProps) {
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
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [showInputOpt, setShowInputOpt] = useState(false)
  const inputOptRef = useRef<HTMLDivElement>(null)
  const [inputOptMode, setInputOptMode] = useState(0) // 0=默认,1=详尽,2=不询问
  const inputOptLabels = ['默认模式', '详尽模式', '不询问模式']
  const inputOptDescs = ['问1-3个问题', 'AI判断足够了才停止', '直接生成不询问']
  const [webSearchMode, setWebSearchMode] = useState(0) // 0=默认,1=增强
  const [timeRange, setTimeRange] = useState('今天')
  const [showTimeRange, setShowTimeRange] = useState(false)
  const timeRangeRef = useRef<HTMLDivElement>(null)
  const timeLabels = ['本次', '今天', '本周', '本月', '今年', '总']

  const searchLabels = ['默认', '增强', '私有']
  const searchDescs = ['大模型自己决定', '优质信息·多轮搜索·自我检测', '纯粹检索上传的信息']

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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false)
      if (timeRangeRef.current && !timeRangeRef.current.contains(e.target as Node)) setShowTimeRange(false)
      if (inputOptRef.current && !inputOptRef.current.contains(e.target as Node)) setShowInputOpt(false)
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
      <div className={`transition-all ${statsCollapsed ? 'overflow-hidden h-0' : ''}`}>
        <div className="mx-1 mt-0 mb-1 px-3 py-2 bg-white border border-[#333] rounded-lg flex items-center gap-3 flex-shrink-0">
          {/* 时间范围 */}
          <div className="relative" ref={timeRangeRef}>
            <button onClick={() => setShowTimeRange(!showTimeRange)}
              className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-100 transition-colors">
              时间范围：<span className="text-[#c75f1a] font-semibold">{timeRange}</span> ▾
            </button>
            {showTimeRange && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-1 z-50 w-20">
                {timeLabels.map(label => (
                  <button key={label} onClick={() => { setTimeRange(label); setShowTimeRange(false) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${label === timeRange ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-gray-300">|</span>
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
      </div>
      {/* 折叠按钮：下方正中间 */}
      <div className="flex justify-center -mt-0.5 mb-1">
        <button onClick={onToggleStats}
          className="w-5 h-3 flex items-center justify-center rounded-b hover:bg-[#e8e2d9] text-gray-400 text-[10px] leading-none transition-colors"
          title={statsCollapsed ? '展开' : '收起'}>
          {statsCollapsed ? '▼' : '▲'}
        </button>
      </div>


      {/* Messages */}
      <div className={`overflow-y-auto px-4 py-3 flex flex-col gap-3 flex-1`}>
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
                <>
                  <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#dad4cd] flex flex-wrap gap-1">
                      {msg.steps.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200"
                          title={s.detail || s.agent}>
                          ✓ {s.agent}
                        </span>
                      ))}
                    </div>
                  )}
                </>
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
            title="管理全局性和项目级记忆"
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Brain size={12} className="text-purple-500" /> 记忆
          </button>
          {/* 知识库 */}
          <button onClick={() => setShowKnowledge(true)}
            title="查看RAG知识库状态和检索流程"
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Database size={12} className="text-green-500" /> 知识库
          </button>
          {/* 输入信息优化 */}
          <div className="relative" ref={inputOptRef}>
            <button
              onClick={() => { setShowInputOpt(!showInputOpt); setShowSearch(false); setShowFormat(false); setShowContent(false) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              📥 输入优化 ▾
            </button>
            {showInputOpt && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-1.5 z-10" style={{ width: 220 }}>
                {inputOptLabels.map((label, i) => (
                  <button key={label} onClick={() => { setInputOptMode(i) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === inputOptMode ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {inputOptDescs[i]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="w-px h-4 bg-[#d0d0d0]" />
          {/* 检索模式 — 上拉框 */}
          <div className="relative" ref={searchRef}>
            <button
              onClick={() => { setShowSearch(!showSearch); setShowFormat(false); setShowContent(false) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              检索与搜索 ▾
            </button>
            {showSearch && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-2 z-10" style={{ width: 240 }}>
                <div className="text-[10px] text-gray-400 mb-1">知识库检索：</div>
                {searchLabels.map((label, i) => (
                  <button key={label} onClick={() => { setSearchMode(i) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === searchMode ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-gray-400 ml-1">— {searchDescs[i]}</span>
                  </button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">联网搜索：</div>
                {[
                  ['默认', 'AI自己决定是否搜索'],
                  ['增强', '寻找优质信息源'],
                ].map(([label, desc], i) => (
                  <button key={label} onClick={() => setWebSearchMode(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === webSearchMode ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{label}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 输出形式 */}
          <div className="relative" ref={formatRef}>
            <button
              onClick={() => { setShowFormat(!showFormat); setShowContent(false) }}
              className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              输出形式 ▾
            </button>
            {showFormat && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-2 z-10" style={{ width: 260 }}>
                <div className="text-[10px] text-gray-400 mb-1">结构化程度：</div>
                {([
                  ['低结构化', '减少列表和表格，以段落为主'],
                  ['高结构化', '增加有序/无序列表和表格'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setOutputFormat(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputFormat ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">输出格式：</div>
                {([
                  ['MD文档', '包裹为完整Markdown文档输出'],
                  ['对话形式', '以对话消息形式直接输出'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setOutputStyle(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputStyle ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
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
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#dad4cd] rounded-lg shadow-lg p-2 z-10" style={{ width: 260 }}>
                <div className="text-[10px] text-gray-400 mb-1">思考链展示：</div>
                {([
                  ['关', '不展示思考链'],
                  ['开', '大模型思考时展示'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setThinking(i === 1)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${(i === 1) === thinking ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">输出量：</div>
                {([
                  ['精简', '只输出核心观点'],
                  ['适中', '观点加论证过程'],
                  ['拓展', '补充拓展性相关内容'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setOutputVolume(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputVolume ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
                ))}
                <div className="text-[10px] text-gray-400 mb-1 mt-2">学习深度：</div>
                {([
                  ['浅', '基础概念层面'],
                  ['中', '概念+原理层面'],
                  ['深', '原理+推导+前沿'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setDepth(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === depth ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
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
