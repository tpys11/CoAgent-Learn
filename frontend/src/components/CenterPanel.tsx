import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Clock, Zap, Brain, Settings, Download, BookOpen } from 'lucide-react'
import AgentFlow from './AgentFlow'
import { MemoryModal } from './InfoModals'
import type { Message, Project } from '../types'

interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  onSendMessage: (text: string, settings?: Record<string, any>) => void
  statsCollapsed: boolean
  onToggleStats: () => void
  showAgentFlow: boolean
  flowAgents: string[]
  flowActiveAgent: string | null
  flowMindchain: Array<{agent: string; content: string}>
  onAgentSettings?: () => void
  projectInitialized?: boolean
}

function CollapsibleThink({ think, defaultOpen, onToggle }: { think: string[]; defaultOpen: boolean; onToggle?: (open: boolean) => void }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => { setOpen(defaultOpen) }, [defaultOpen])
  const handleToggle = () => { setOpen(!open); onToggle?.(!open) }
  return (
    <div className="mt-2 pt-2 border-t border-[#e5e5e5]">
      <button onClick={handleToggle} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
        <span>{open ? '▾' : '▸'}</span> 思考过程
      </button>
      {open && <div className="mt-2 text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">{think.join('\n')}</div>}
    </div>
  )
}

export default function CenterPanel({ messages, isLoading, currentProject, onSendMessage, statsCollapsed, onToggleStats, showAgentFlow, flowAgents, flowActiveAgent, flowMindchain, onAgentSettings, projectInitialized }: CenterPanelProps) {
  const [input, setInput] = useState('')
  const [showMemory, setShowMemory] = useState(false)
  const [thinking, setThinking] = useState(true)
  const [searchMode, setSearchMode] = useState(0)
  const [webSearchMode, setWebSearchMode] = useState(0)
  const [outputFormat, setOutputFormat] = useState(0)
  const [outputStyle, setOutputStyle] = useState(0)
  const [outputVolume, setOutputVolume] = useState(1)
  const [depth, setDepth] = useState(1)
  const [inputOptMode, setInputOptMode] = useState(0)
  const [timeRange, setTimeRange] = useState('本次')
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showFormat, setShowFormat] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [showInputOpt, setShowInputOpt] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const formatRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const inputOptRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!isLoading && flowMindchain.length > 0) setThinkingCollapsed(true) }, [isLoading, flowMindchain.length])
  useEffect(() => { const fn = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false); if (formatRef.current && !formatRef.current.contains(e.target as Node)) setShowFormat(false); if (contentRef.current && !contentRef.current.contains(e.target as Node)) setShowContent(false); if (inputOptRef.current && !inputOptRef.current.contains(e.target as Node)) setShowInputOpt(false) }; document.addEventListener('mousedown', fn); return () => document.removeEventListener('mousedown', fn) }, [])

  const handleSend = () => { if (!input.trim()) return; onSendMessage(input.trim(), { searchMode, webSearchMode, outputFormat, outputStyle, thinking, outputVolume, depth, inputOptMode }); setInput('') }
  const time = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  const exportMarkdown = () => {
    const md = messages.map(m => `### ${m.role === 'user' ? '🧑 用户' : '🤖 CoAgent'}\n\n${m.content}\n`).join('\n')
    const header = `# CoAgent-Learn 对话记录\n\n**项目**: ${currentProject?.name || '无'}\n**时间**: ${new Date().toLocaleString()}\n\n---\n\n`
    const blob = new Blob([header + md], { type: 'text/markdown' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `coagent-${Date.now()}.md`; a.click()
  }

  const searchLabels = ['默认', '增强', '私有']; const searchDescs = ['大模型自己决定', '大部分来源于知识库，少部分来源于外部', '完全从知识库中检索']
  const inputOptLabels = ['默认模式', '详尽模式', '不询问模式']; const inputOptDescs = ['问1-3个问题', 'AI判断足够了才停止', '跳过信息优化']

  return (
    <main className="flex-1 flex flex-col min-w-0 h-full bg-[#ffffff] overflow-hidden">
      {/* Stats Bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b border-[#e5e5e5] ${statsCollapsed ? 'h-8 overflow-hidden' : 'h-14'} transition-all duration-200 flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <div className="relative"><button onClick={() => setTimeRange(prev => ({'本次':'今天','今天':'本周','本周':'本月','本月':'今年','今年':'总','总':'本次'} as any)[prev])} className="text-xs font-semibold px-2 py-0.5 rounded hover:bg-[#f0f0f0]">{timeRange}</button></div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><Clock size={12} /><span>0h</span></div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><Zap size={12} /><span>0 tokens</span></div>
        </div>
        <span className="flex-1" />
        {/* Export button */}
        {messages.length > 0 && (
          <button onClick={exportMarkdown} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-[#1a1a1a] mr-2 transition-colors" title="导出对话">
            <Download size={12} /> 导出
          </button>
        )}
        <span className="text-xs text-gray-400">{time}</span>
      </div>
      <div className="flex justify-center -mt-0.5 mb-1">
        <button onClick={onToggleStats} className="w-5 h-3 flex items-center justify-center rounded-b hover:bg-[#ededed] text-gray-400 text-[10px] leading-none transition-colors" title={statsCollapsed ? '展开' : '收起'}>{statsCollapsed ? '▼' : '▲'}</button>
      </div>

      {/* Messages */}
      <div className={`overflow-y-auto px-4 py-3 flex flex-col gap-3 ${messages.length > 0 ? 'flex-1' : 'max-h-[50%] flex-shrink-0'}`}>
        {showAgentFlow && <div className="mb-2 bg-white border border-[#e5e5e5] rounded-xl overflow-hidden flex-shrink-0" style={{ height: '28vh', minHeight: 150 }}><AgentFlow visible={true} agents={flowAgents} activeAgent={flowActiveAgent} /></div>}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <Bot size={48} className="text-gray-300" />
            <h1 className="text-2xl font-bold">CoAgent-Learn</h1>
            <p className="text-sm text-gray-400">{currentProject ? `当前项目: ${currentProject.name}` : '选择或新建一个项目开始学习'}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'self-end bg-[#f0f0f0] border border-[#1a1a1a]/25 rounded-br-sm' : msg.role === 'thinking' ? 'self-start bg-[#ffffff] border border-[#e5e5e5] rounded-bl-sm italic' : 'self-start bg-transparent border border-transparent rounded-bl-sm'}`}>
              {msg.content === '' ? (
                <div className="flex items-center gap-2 text-gray-400"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" /><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} /><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} /><span className="text-xs ml-1">思考中…</span></div>
              ) : (
                <>
                  <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#e5e5e5] flex flex-wrap gap-1">
                      {msg.steps.map((s, i) => (<span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200" title={s.detail || s.agent}>✓ {s.agent}</span>))}
                    </div>
                  )}
                  {msg.think && msg.think.length > 0 && (
                    <CollapsibleThink think={msg.think} defaultOpen={idx === messages.length - 1 && thinkingCollapsed === false} />
                  )}
                </>
              )}
            </div>
          ))
        )}
        {flowMindchain.length > 0 && (
          <div className="self-start bg-[#ffffff] border border-[#e5e5e5] rounded-2xl rounded-bl-sm max-w-[80%] overflow-hidden">
            <button onClick={() => setThinkingCollapsed(!thinkingCollapsed)} className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-[#f5f5f5] transition-colors">
              <span className="flex items-center gap-1.5 text-gray-500">{isLoading && <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />}{isLoading ? '思考中…' : '✓ 思考过程'}</span>
              <span className="text-gray-400">{thinkingCollapsed || isLoading ? '▸ 展开' : '▾ 收起'}</span>
            </button>
            {!thinkingCollapsed && (
              <div className="px-4 pb-3 flex flex-col gap-2 border-t border-[#e5e5e5] pt-2 max-h-60 overflow-y-auto">
                {flowMindchain.map((item, i) => (
                  <div key={i} className="animate-[fadeIn_0.2s_ease]">
                    <div className="text-[11px] font-semibold text-[#666666] mb-0.5">{item.agent}</div>
                    <div className="text-[11px] leading-relaxed text-gray-500 whitespace-pre-wrap pl-2 border-l-2 border-[#e5e5e5]">{item.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={`${messages.length === 0 ? 'flex-1 flex items-end justify-center pb-[12vh]' : 'flex-shrink-0'}`}>
        <div className="px-8 pb-4 pt-2 flex flex-col items-center gap-2 w-full max-w-xl mx-auto">
          {projectInitialized === false ? (
            <div className="w-full px-3 py-2 border border-dashed border-orange-400 rounded-lg bg-orange-50 text-xs text-orange-600 flex items-center gap-2"><span>⚠️</span> 项目未初始化</div>
          ) : (
            <>
          <div className="w-full flex gap-2 items-end">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} placeholder="输入你的问题..." rows={2} className="flex-1 px-4 py-3 border border-[#d0d0d0] rounded-xl bg-white text-sm outline-none resize-none focus:border-[#1a1a1a] focus:ring-[3px] focus:ring-[#1a1a1a]/10 shadow-sm" />
            <button onClick={handleSend} disabled={isLoading} className="px-5 py-3 bg-[#1a1a1a] text-white font-semibold rounded-xl hover:bg-[#333333] transition-colors flex items-center gap-1 text-sm disabled:opacity-50"><Send size={14} /></button>
          </div>
          <div className="flex gap-3 text-[11px] text-gray-400">
            <button className="flex items-center gap-1 hover:text-gray-600 transition-colors"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>上传文件夹</button>
            <button className="flex items-center gap-1 hover:text-gray-600 transition-colors"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>选择模型</button>
            <button className="flex items-center gap-1 hover:text-gray-600 transition-colors"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>更多设置</button>
          </div>
            </>
          )}
        </div>
      </div>

      {showMemory && <MemoryModal onClose={() => setShowMemory(false)} />}
    </main>
  )
}
