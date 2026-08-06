import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Clock, Zap, Brain, Settings } from 'lucide-react'
import type { Message, Project } from '../types'
import { MemoryModal } from './InfoModals'
import AgentFlow from './AgentFlow'


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
  onOpenGuide?: () => void
  projectInitialized?: boolean
}

export default function CenterPanel({ messages, isLoading, currentProject, onSendMessage, statsCollapsed, onToggleStats, showAgentFlow, flowAgents, flowActiveAgent, flowMindchain, onAgentSettings, onOpenGuide, projectInitialized }: CenterPanelProps) {
  const [input, setInput] = useState('')
  const [chatMode, setChatMode] = useState<'kb'|'free'>('kb')
  const msgScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = msgScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, flowMindchain, isLoading])
  const [stats, setStats] = useState<{dialogue_count: number; tokens_estimate: number; metrics: any}>({dialogue_count: 0, tokens_estimate: 0, metrics: null})
  useEffect(() => {
    if (!currentProject) return
    fetch('/api/stats?project_id=' + encodeURIComponent(currentProject.id), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
  }, [currentProject])
  const [attachments, setAttachments] = useState<Array<{name: string; content: string; isImage?: boolean}>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 处理单个文件（拖拽/点击共用）
  const processFile = function(f: File) {
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { alert('文件过大（>2MB），请裁剪后上传'); return }
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const textExts = ['txt','md','py','js','ts','json','csv','html','css','log','yaml','yml']
    if (textExts.includes(ext)) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = (reader.result as string) || ''
        setAttachments(prev => [...prev, { name: f.name, content: text }])
      }
      reader.readAsText(f)
    } else if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = String(reader.result || '').split(',')[1] || ''
        setAttachments(prev => [...prev, { name: f.name, content: b64, isImage: true }])
      }
      reader.readAsDataURL(f)
    } else if (['pdf','docx','pptx'].includes(ext)) {
      const fd = new FormData()
      fd.append('file', f)
      fetch('/api/file-to-text', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
          if (d.status === 'ok') setAttachments(prev => [...prev, { name: f.name, content: d.text || '' }])
          else alert('无法解析文件：' + (d.msg || '未知'))
        })
        .catch(() => alert('文件解析失败'))
    } else {
      alert('不支持的格式：' + f.name)
    }
  }

  const [dragOver, setDragOver] = useState(false)
  const handleDropFile = function(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const fs = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
    fs.forEach(processFile)
  }

  const handleFileSelect = function(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { alert('文件过大（>2MB），请裁剪后上传'); return }
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const textExts = ['txt','md','py','js','ts','json','csv','html','css','log','yaml','yml']
    if (textExts.includes(ext)) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = (reader.result as string) || ''
        setAttachments(prev => [...prev, { name: f.name, content: text }])
      }
      reader.readAsText(f)
    } else if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
      const reader = new FileReader()
      reader.onload = () => {
        const b64 = String(reader.result || '').split(',')[1] || ''
        setAttachments(prev => [...prev, { name: f.name, content: b64, isImage: true }])
      }
      reader.readAsDataURL(f)
    } else if (['pdf','docx','pptx'].includes(ext)) {
      // 二进制文件：先发后端解析成文本
      const fd = new FormData()
      fd.append('file', f)
      fetch('/api/file-to-text', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
          if (d.status === 'ok') {
            setAttachments(prev => [...prev, { name: f.name, content: d.text || '' }])
          } else {
            alert('无法解析文件：' + (d.msg || '未知'))
          }
        })
        .catch(() => alert('文件解析失败'))
    } else {
      alert('不支持的格式：' + f.name)
    }
  }

  const removeAttachment = function(name: string) {
    setAttachments(prev => prev.filter(a => a.name !== name))
  }
  const [flowCollapsed, setFlowCollapsed] = useState(false)
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
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true)
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
  useEffect(() => { if (!isLoading && flowMindchain.length > 0) setThinkingCollapsed(true) }, [isLoading, flowMindchain.length])

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

  // 消息渲染：文件标记段转成卡片，其余文本正常显示
  const renderContent = function(content: string) {
    const html = content
      .replace(/【用户上传文件: ([^】]+)】[\s\S]*?(?=【用户上传文件:|$)/g,
        '<span style="display:inline-flex;align-items:center;gap:4px;background:#f5f5f5;border:1px solid #e5e5e5;border-radius:6px;padding:2px 8px;font-size:12px;color:#555;margin:2px">📄 $1</span>')
      .replace(/\n/g, '<br/>')
    return html
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    let full = text
    const NL = String.fromCharCode(10)
    const imgAtts = attachments.filter(a => a.isImage)
    const txtAtts = attachments.filter(a => !a.isImage)
    // 图片附件先识图
    let imgDesc = ''
    if (imgAtts.length > 0) {
      try {
        const r = await fetch('/api/vision', { method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ image: imgAtts[0].content, prompt: '请描述这张图片的内容' }) })
        const d = await r.json()
        imgDesc = d.description || ''
      } catch (e) { imgDesc = '(图片识别失败)' }
    }
    const parts: string[] = []
    txtAtts.forEach(a => parts.push('【用户上传文件: ' + a.name + '】' + NL + a.content))
    if (imgAtts.length > 0) parts.push('【用户上传图片: ' + imgAtts[0].name + '】' + NL + '图片内容描述：' + imgDesc)
    if (parts.length > 0) full = text ? text + NL + NL + parts.join(NL + NL) : parts.join(NL + NL)
    onSendMessage(full, {
      chatMode: chatMode,
      searchMode: searchLabels[searchMode],
      outputFormat: outputFormat === 0 ? '低结构化' : '高结构化',
      outputStyle: outputStyle === 0 ? 'MD文档' : '对话形式',
      thinking: thinking ? '开' : '关',
      outputVolume: ['精简', '适中', '拓展'][outputVolume],
      depth: ['浅', '中', '深'][depth],
      inputOptMode: inputOptLabels[inputOptMode],
      webSearchMode: webSearchMode === 0 ? '默认' : '增强',
    })
    setInput('')
    setAttachments([])
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
              时间范围：<span className="text-[#1a1a1a] font-semibold">{timeRange}</span> ▾
            </button>
            {showTimeRange && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-1 z-50 w-20">
                {timeLabels.map(label => (
                  <button key={label} onClick={() => { setTimeRange(label); setShowTimeRange(false) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${label === timeRange ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-gray-300">|</span>
          <Clock size={14} className="text-gray-400" />

          <span className="flex-1" />
          <span className="text-xs text-gray-400">{time}</span>
          <span className="text-gray-300" />
          <span className="text-xs font-semibold text-gray-500">💬 {stats.dialogue_count}</span>
          <span className="text-xs text-gray-400">对话</span>
          <span className="text-gray-300" />
          <span className="text-xs font-semibold text-gray-500">🔑 {(stats.tokens_estimate || 0).toLocaleString()}</span>
          <span className="text-xs text-gray-400">Tokens</span>
          {stats.metrics && stats.metrics.hallucination && (
            <>
              <span className="text-gray-300" />
              <span className="text-xs font-semibold text-gray-500">✅ 幻觉{stats.metrics.hallucination.rate || 0}%</span>
              <span className="text-xs text-gray-400">适配{stats.metrics.adaptation ? stats.metrics.adaptation.rate || 0 : '-'}%</span>
              <span className="text-xs text-gray-400">覆盖{stats.metrics.coverage ? stats.metrics.coverage.rate || 0 : '-'}%</span>
            </>
          )}
          <span className="flex-1" />
          <button onClick={() => onOpenGuide?.()} className="text-[11px] px-2 py-0.5 rounded hover:bg-gray-100 text-gray-500" title="使用指南">📖 指南</button>
        </div>
      </div>
      {/* 折叠按钮：下方正中间 */}
      <div className="flex justify-center -mt-0.5 mb-1">
        <button onClick={onToggleStats}
          className="w-5 h-3 flex items-center justify-center rounded-b hover:bg-[#ededed] text-gray-400 text-[10px] leading-none transition-colors"
          title={statsCollapsed ? '展开' : '收起'}>
          {statsCollapsed ? '▼' : '▲'}
        </button>
      </div>


      {/* Messages */}
      <div ref={msgScrollRef} className={`overflow-y-auto px-4 py-3 flex flex-col gap-3 ${messages.length > 0 ? 'flex-1' : 'max-h-[50%] flex-shrink-0'}`}>
        {/* Agent 思考过程 */}
        {showAgentFlow && !flowCollapsed && (
          <div className="mb-2 bg-white border border-[#e5e5e5] rounded-xl overflow-hidden flex-shrink-0" style={{ height: '28vh', minHeight: 150 }}>
            <div className="flex items-center justify-between px-3 py-1 bg-[#fafafa] border-b border-[#e5e5e5]">
              <span className="text-xs text-gray-500 font-medium">Agent 执行流程</span>
              <button onClick={() => setFlowCollapsed(true)} className="text-xs text-gray-400 hover:text-gray-600">▲ 收起</button>
            </div>
            <AgentFlow visible={true} agents={flowAgents} activeAgent={flowActiveAgent} />
          </div>
        )}
        {showAgentFlow && flowCollapsed && (
          <div className="mb-2 flex justify-center">
            <button onClick={() => setFlowCollapsed(false)} className="text-xs text-gray-400 bg-white border border-[#e5e5e5] rounded-full px-3 py-1">▾ Agent 流程</button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex-1" />
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'self-end bg-[#f0f0f0] border border-[#1a1a1a]/25 rounded-br-sm'
                  : msg.role === 'thinking'
                  ? 'self-start bg-[#ffffff] border border-[#e5e5e5] rounded-bl-sm italic'
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
                  <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#e5e5e5] flex flex-wrap gap-1">
                      {msg.steps.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200"
                          title={s.detail || s.agent}>
                          ✓ {s.agent}
                        </span>
                      ))}
                    </div>
                  )}
                  {msg.think && msg.think.length > 0 && (
                    <CollapsibleThink think={msg.think} />
                  )}
                </>
              )}
            </div>
          ))
        )}
        {flowMindchain.length > 0 && (
          <div className="self-start bg-[#ffffff] border border-[#e5e5e5] rounded-2xl rounded-bl-sm max-w-[80%] overflow-hidden">
            <button onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-[#f5f5f5] transition-colors">
              <span className="flex items-center gap-1.5 text-gray-500">
                {isLoading && <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />}
                {isLoading ? '思考中…' : '✓ 思考过程'}
              </span>
              <span className="text-gray-400">{thinkingCollapsed || isLoading ? '▸ 展开' : '▾ 收起'}</span>
            </button>
            {!thinkingCollapsed && (
              <div className="px-4 pb-3 flex flex-col gap-2 border-t border-[#e5e5e5] pt-2 max-h-60 overflow-y-auto">
                {flowMindchain.map((item, i) => (
                  <div key={i} className="animate-[fadeIn_0.2s_ease]">
                    <div className="text-[11px] font-semibold text-[#666666] mb-0.5">{item.agent}</div>
                    <div className="text-[11px] leading-relaxed text-gray-500 whitespace-pre-wrap pl-2 border-l-2 border-[#e5e5e5]">
                      {item.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      
      {/* Welcome */}
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-3 pb-6 -mt-4">
          <Bot size={40} className="text-gray-300" />
          <h1 className="text-xl font-bold text-gray-700">CoAgent-Learn</h1>
          <p className="text-xs text-gray-400">
            {currentProject ? `当前项目: ${currentProject.name}` : '选择或新建一个项目开始学习'}
          </p>
        </div>
      )}

{/* Input area */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        {/* Control bar — 自定义按钮 */}
        <div className="flex gap-2 px-3 py-1.5 mb-1 border border-[#d0d0d0] rounded-lg bg-white items-center">
          {/* Agent 设置 */}
          <button onClick={() => onAgentSettings?.()}
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Settings size={12} /> Agent设置
          </button>
          <span className="w-px h-4 bg-[#d0d0d0]" />
          {/* 记忆系统 */}
          <button onClick={() => setShowMemory(true)}
            className="text-[11px] px-2 py-1 rounded hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Brain size={12} className="text-purple-500" /> 记忆
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
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-1.5 z-10" style={{ width: 220 }}>
                {inputOptLabels.map((label, i) => (
                  <button key={label} onClick={() => { setInputOptMode(i) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === inputOptMode ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-2 z-10" style={{ width: 240 }}>
                <div className="text-[10px] text-gray-400 mb-1">知识库检索：</div>
                {searchLabels.map((label, i) => (
                  <button key={label} onClick={() => { setSearchMode(i) }}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === searchMode ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === webSearchMode ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-2 z-10" style={{ width: 260 }}>
                <div className="text-[10px] text-gray-400 mb-1">结构化程度：</div>
                {([
                  ['低结构化', '减少列表和表格，以段落为主'],
                  ['高结构化', '增加有序/无序列表和表格'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setOutputFormat(i)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputFormat ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputStyle ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-2 z-10" style={{ width: 260 }}>
                <div className="text-[10px] text-gray-400 mb-1">思考链展示：</div>
                {([
                  ['关', '不展示思考链'],
                  ['开', '大模型思考时展示'],
                ] as const).map(([s, desc], i) => (
                  <button key={s} onClick={() => setThinking(i === 1)}
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${(i === 1) === thinking ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === outputVolume ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
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
                    className={`text-[11px] px-2 py-1 rounded w-full text-left ${i === depth ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-gray-50'}`}>
                    <span className="font-medium">{s}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5">— {desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input area — 页面正中间 */}
      <div className={`${messages.length === 0 ? 'flex-1 flex items-center justify-center' : 'flex-shrink-0'}`}>
        <div className="px-8 pb-4 pt-2 flex flex-col items-center gap-2 w-full max-w-xl mx-auto">
          {projectInitialized === false ? (
            <div className="w-full max-w-xl px-3 py-2 border border-dashed border-orange-400 rounded-lg bg-orange-50 text-xs text-orange-600 flex items-center gap-2">
              <span>⚠️</span> 项目未初始化
            </div>
          ) : (
            <>
          <div className="w-full max-w-xl flex flex-col gap-2"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDropFile}
            style={{ outline: dragOver ? '2px dashed #1a1a1a' : 'none', borderRadius: 12 }}>
            {dragOver && (
              <div className="text-[11px] text-center text-[#1a1a1a] bg-[#f0f0f0]/60 py-2 rounded-lg mb-1">📥 松开鼠标上传文件（支持图片/文本/PDF/Word/PPT）</div>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map(a => (
                  <span key={a.name} className="inline-flex items-center gap-1.5 bg-white border border-[#d0d0d0] rounded-lg px-2.5 py-1.5 text-xs text-gray-700 shadow-sm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    {a.isImage ? '🖼 ' : '📄 '}{a.name}
                    <button onClick={() => removeAttachment(a.name)} className="text-gray-400 hover:text-red-500 transition-colors ml-1" title="删除">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="w-full flex gap-2 items-end">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp" />
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} title="上传文件"
              className="px-2.5 py-3 border border-[#d0d0d0] rounded-xl bg-white text-gray-400 hover:text-[#1a1a1a] hover:border-[#1a1a1a]/40 transition-colors flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder="输入你的问题..."
              rows={2}
              className="flex-1 px-4 py-3 border border-[#d0d0d0] rounded-xl bg-white text-sm outline-none resize-none focus:border-[#1a1a1a] focus:ring-[3px] focus:ring-[#1a1a1a]/10 shadow-sm"
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="px-5 py-3 bg-[#1a1a1a] text-white font-semibold rounded-xl hover:bg-[#333333] transition-colors flex items-center gap-1 text-sm disabled:opacity-50"
            >
              <Send size={14} />
            </button>
            </div>
          </div>
                    {/* 模式开关 + 选择模型 */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-gray-400">模式：</span>
            <button onClick={() => setChatMode('kb')}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${chatMode === 'kb' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>🧠 知识库模式</button>
            <button onClick={() => setChatMode('free')}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${chatMode === 'free' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-gray-600 border-gray-200'}`}>🌐 默认模式</button>
            <span className="text-gray-300">|</span>
            <button className="text-gray-400 hover:text-gray-600 transition-colors" title="选择模型（暂未开放）">⚙️ 选择模型 ▾</button>
          </div>            </>
          )}
        </div>
      </div>
      </div>

      {showMemory && <MemoryModal onClose={() => setShowMemory(false)} />}
    </main>
  )
}

function CollapsibleThink({ think }: { think: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 pt-2 border-t border-[#e5e5e5]">
      <button onClick={() => setOpen(!open)} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
        <span>{open ? '▾' : '▸'}</span> 思考过程
      </button>
      {open && (
        <div className="mt-2 text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {think.join('\n')}
        </div>
      )}
    </div>
  )
}
