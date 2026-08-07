import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Settings, X, Lightbulb, MessagesSquare, Coins, CheckCircle2, ChevronDown, Upload, Cpu, SlidersHorizontal, Check, AlertTriangle, Search, FileText, Image as ImageIcon } from 'lucide-react'
import type { Message, Project } from '../types'


interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  dialogueId?: string | null
  onSendMessage: (text: string, settings?: Record<string, any>) => void
  statsCollapsed: boolean
  onToggleStats: () => void
  flowMindchain: Array<{agent: string; content: string}>
  onOpenGuide?: () => void
  projectInitialized?: boolean
}

export default function CenterPanel({ messages, isLoading, currentProject, dialogueId, onSendMessage, statsCollapsed, onToggleStats, flowMindchain, onOpenGuide, projectInitialized }: CenterPanelProps) {
  const [input, setInput] = useState('')
  const [chatMode, setChatMode] = useState<'kb'|'free'>('kb')
  // 上次会话保存的三条追问（进入对话时展示，抢占注意力）
  const [followups, setFollowups] = useState<string[]>([])
  const loadFollowups = () => {
    if (!dialogueId) { setFollowups([]); return }
    fetch('/api/dialogues/' + encodeURIComponent(dialogueId) + '/followups', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setFollowups(Array.isArray(d.questions) ? d.questions.slice(0, 3) : []))
      .catch(() => {})
  }
  useEffect(() => { loadFollowups() }, [dialogueId])
  // 回答结束后台线程生成新追问，延迟拉取一次
  const prevLoading = useRef(isLoading)
  useEffect(() => {
    if (prevLoading.current && !isLoading) {
      const t1 = setTimeout(loadFollowups, 5000)
      const t2 = setTimeout(loadFollowups, 12000)
      prevLoading.current = isLoading
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevLoading.current = isLoading
  }, [isLoading])
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
  const [dragOver, setDragOver] = useState(false)
  const handleDropFile = function(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    const fs = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
    fs.forEach(processFile)
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgB64Ref = useRef('')

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

  const handleFileSelect = function(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (f) processFile(f)
  }

  const removeAttachment = function(name: string) {
    setAttachments(prev => prev.filter(a => a.name !== name))
  }
  const [time, setTime] = useState(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  const [searchMode, setSearchMode] = useState(1)
  const [showFormat, setShowFormat] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const formatRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [outputFormat, setOutputFormat] = useState(0)
  const [outputStyle, setOutputStyle] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [outputVolume, setOutputVolume] = useState(1)
  const [depth, setDepth] = useState(1)
  const [thinkingCollapsed, setThinkingCollapsed] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [showModelModal, setShowModelModal] = useState(false)
  // 模型厂家配置
  const MODEL_PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-pro', 'deepseek-flash'] },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-mini'] },
    { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
    { id: 'zhipu', name: '智谱GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'] },
    { id: 'moonshot', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
    { id: 'doubao', name: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-pro-32k', 'doubao-lite-32k'] },
  ]
  const [selectedProvider, setSelectedProvider] = useState(() => localStorage.getItem('coagent-provider') || 'deepseek')
  const [selectedModel, setSelectedModel] = useState(() => {
    const m = localStorage.getItem('coagent-model') || 'deepseek-pro'
    return (m === 'deepseek-chat' || m === 'deepseek-reasoner') ? 'deepseek-pro' : m
  })
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('coagent-provider-keys') || '{}') } catch { return {} }
  })
  const [modelKeyInput, setModelKeyInput] = useState(() => (JSON.parse(localStorage.getItem('coagent-provider-keys') || '{}') || {})['deepseek'] || '')
  const searchRef = useRef<HTMLDivElement>(null)
  const [showInputOpt, setShowInputOpt] = useState(false)
  const inputOptRef = useRef<HTMLDivElement>(null)
  const [inputOptMode, setInputOptMode] = useState(0) // 0=默认,1=详尽,2=不询问
  const inputOptLabels = ['默认模式', '详尽模式', '不询问模式']
  const [webSearchMode, setWebSearchMode] = useState(0) // 0=默认,1=增强
  const [timeRange, setTimeRange] = useState('今天')
  const [showTimeRange, setShowTimeRange] = useState(false)
  const timeRangeRef = useRef<HTMLDivElement>(null)
  const timeLabels = ['本次', '今天', '本周', '本月', '今年', '总']

  const searchLabels = ['自由', '知识库']

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
        '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-hover);border-radius:8px;padding:2px 8px;font-size:12px;color:var(--text-muted);margin:2px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> $1</span>')
      .replace(/\n/g, '<br/>')
    return html
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text && attachments.length === 0) return
    let full = text
    let image: string | undefined
    if (attachments.length > 0) {
      const NL = String.fromCharCode(10)
      const imgAtts = attachments.filter(a => a.isImage)
      const txtAtts = attachments.filter(a => !a.isImage)
      const parts: string[] = []
      txtAtts.forEach(a => parts.push('【用户上传文件: ' + a.name + '】' + NL + a.content))
      if (imgAtts.length > 0) parts.push('【用户上传图片: ' + imgAtts[0].name + '】')
      full = text ? text + NL + NL + parts.join(NL + NL) : parts.join(NL + NL)
      image = imgAtts.length > 0 ? imgAtts[0].content : undefined
    }
    onSendMessage(full, {
      image: image,
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
    imgB64Ref.current = ''
  }

  const sendFollowup = (q: string) => {
    onSendMessage(q, {
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
  }

  return (
    <main className="flex-1 h-full min-w-0 flex flex-col panel rounded-3xl overflow-hidden">
      {/* 面板顶条：统计与入口（无盒子，细字号一行） */}
      <div className={`transition-all flex-shrink-0 ${statsCollapsed ? 'overflow-hidden h-0' : ''}`}>

        <div className="h-11 px-5 flex items-center gap-3 text-dim">
          <div className="relative" ref={timeRangeRef}>
            <button onClick={() => setShowTimeRange(!showTimeRange)}
              className="text-[11px] px-2 py-1 rounded-lg row-hover transition-colors flex items-center gap-1">
              时间范围：<span className="text-[#1a1a1a] font-semibold">{timeRange}</span> <ChevronDown size={10} />
            </button>
            {showTimeRange && (
              <div className="absolute top-full left-0 mt-1 card-lift p-1 z-50 w-20">
                {timeLabels.map(label => (
                  <button key={label} onClick={() => { setTimeRange(label); setShowTimeRange(false) }}
                    className={`text-[11px] px-2 py-1 rounded-lg text-left ${label === timeRange ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="w-px h-3.5 bg-[#e5e5e5]" />
          <span className="text-[11px] tabular-nums">{time}</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-[11px]"><MessagesSquare size={12} /> {stats.dialogue_count} 对话</span>
          <span className="w-px h-3.5 bg-[#e5e5e5]" />
          <span className="flex items-center gap-1 text-[11px] tabular-nums"><Coins size={12} /> {(stats.tokens_estimate || 0).toLocaleString()} Tokens</span>
          {stats.metrics && stats.metrics.hallucination && (
            <>
              <span className="w-px h-3.5 bg-[#e5e5e5]" />
              <span className="flex items-center gap-1 text-[11px]"><CheckCircle2 size={12} /> 幻觉{stats.metrics.hallucination.rate || 0}% · 适配{stats.metrics.adaptation ? stats.metrics.adaptation.rate || 0 : '-'}% · 覆盖{stats.metrics.coverage ? stats.metrics.coverage.rate || 0 : '-'}%</span>
            </>
          )}
          <span className="flex-1" />
<button onClick={onToggleStats} className="w-6 h-6 flex items-center justify-center rounded-lg row-hover text-[10px]" title="收起">▲</button>
        </div>
      </div>
      {statsCollapsed && (
        <div className="flex justify-center flex-shrink-0">
          <button onClick={onToggleStats} className="text-[10px] text-dim hover:text-[#1a1a1a] px-3 py-0.5 rounded-b-lg row-hover" title="展开统计条">▼</button>
        </div>
      )}

      {/* 消息流：内容限宽居中 */}
      <div ref={msgScrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
          {/* 欢迎屏 */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 animate-[fadeIn_0.4s_ease]">
              <div className="w-14 h-14 rounded-3xl card-surface flex items-center justify-center">
                <Bot size={26} className="text-dim" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-3xl tracking-wide">CoAgent-Learn</h1>
              {!currentProject && <p className="text-xs text-dim">选择或新建一个项目开始学习</p>}
            </div>
          )}

          {/* 消息列表：用户色块靠右，AI 正文流 */}
          {messages.map((msg, idx) => (
            msg.role === 'user' ? (
              <div key={idx} className="self-end max-w-[75%] card-surface px-4 py-3 text-sm leading-relaxed" style={{ borderBottomRightRadius: 6 }}>
                <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
              </div>
            ) : (
              <div key={idx} className="w-full text-sm leading-7 animate-[fadeIn_0.25s_ease]">
                {msg.content === '' ? (
                  <div className="flex items-center gap-2 text-dim">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    <span className="text-xs ml-1">思考中…</span>
                  </div>
                ) : (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {msg.steps.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"
                            title={s.detail || s.agent}>
                            <Check size={9} /> {s.agent}
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
            )
          ))}

          {/* 思考过程 */}
          {flowMindchain.length > 0 && (
            <div className="card-surface overflow-hidden">
              <button onClick={() => setThinkingCollapsed(!thinkingCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs row-hover transition-colors">
                <span className="flex items-center gap-1.5 text-dim">
                  {isLoading && <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />}
                  {isLoading ? '思考中…' : <><CheckCircle2 size={12} /> 思考过程</>}
                </span>
                <span className="text-dim">{thinkingCollapsed || isLoading ? '▸ 展开' : '▾ 收起'}</span>
              </button>
              {!thinkingCollapsed && (
                <div className="px-4 pb-3 flex flex-col gap-2 border-t hairline pt-2 max-h-60 overflow-y-auto">
                  {flowMindchain.map((item, i) => (
                    <div key={i} className="animate-[fadeIn_0.2s_ease]">
                      <div className="text-[11px] font-semibold mb-0.5">{item.agent}</div>
                      <div className="text-[11px] leading-relaxed text-dim whitespace-pre-wrap pl-2 border-l-2 hairline">
                        {item.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部：追问 chips + 浮动输入坞 */}
      <div className="flex-shrink-0 px-6 pb-5">
        <div className="flex flex-col gap-2.5">
          {/* 上次会话保存的三条追问：胶囊抢占注意力 */}
          {followups.length > 0 && !isLoading && messages.length > 0 && (
            <div className="flex flex-col gap-1.5 items-start animate-[fadeIn_0.3s_ease]">
              <p className="text-[11px] text-dim font-medium flex items-center gap-1 px-1"><Lightbulb size={12} /> 继续追问</p>
              {followups.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendFollowup(q)}
                  className="chip text-left text-[13px] px-4 py-2 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {projectInitialized === false ? (
            <div className="px-3 py-2 border border-dashed border-orange-400 rounded-xl bg-orange-50 text-xs text-orange-600 flex items-center gap-2">
              <AlertTriangle size={13} /> 项目未初始化
            </div>
          ) : (
          <>
          {/* 附件 */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map(a => (
                <span key={a.name} className="chip inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dim">
                  {a.isImage ? <ImageIcon size={11} /> : <FileText size={11} />}
                  {a.name}
                  <button onClick={() => removeAttachment(a.name)} className="hover:text-red-500 transition-colors ml-0.5" title="删除">✕</button>
                </span>
              ))}
            </div>
          )}

          {/* 浮动输入坞 */}
          <div className="card-lift p-3 flex flex-col gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDropFile}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder={dragOver ? '松开以上传文件/图片' : '输入你的问题...'}
              rows={2}
              className="w-full px-2 py-1 bg-transparent text-sm outline-none resize-none"
              style={{ background: 'transparent' }}
            />
            {/* 坞内工具行 */}
            <div className="flex items-center gap-0.5">
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx" />
              <button onClick={() => fileInputRef.current && fileInputRef.current.click()} title="上传文件"
                className="w-8 h-8 flex items-center justify-center rounded-xl icon-btn border border-[var(--border-strong)] bg-[var(--bg-input)]">
                <Upload size={15} />
              </button>
              {/* 输入信息优化 */}
              <div className="relative" ref={inputOptRef}>
                <button
                  onClick={() => { setShowInputOpt(!showInputOpt); setShowSearch(false); setShowFormat(false); setShowContent(false) }}
                  className="h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)]"
                >
                  <SlidersHorizontal size={13} /> <ChevronDown size={9} />
                </button>
                {showInputOpt && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-1.5 z-10" style={{ width: 190 }}>
                    {inputOptLabels.map((label, i) => (
                      <button key={label} onClick={() => { setInputOptMode(i) }}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === inputOptMode ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{label}</span>
              
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 检索与搜索 */}
              <div className="relative" ref={searchRef}>
                <button
                  onClick={() => { setShowSearch(!showSearch); setShowFormat(false); setShowContent(false) }}
                  className="h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)]"
                >
                  <Search size={13} /> <ChevronDown size={9} />
                </button>
                {showSearch && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 205 }}>
                    <div className="text-[10px] text-dim mb-1">知识库检索：</div>
                    {searchLabels.map((label, i) => (
                      <button key={label} onClick={() => { setSearchMode(i); setChatMode(i === 1 ? 'kb' : 'free') }}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === searchMode ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{label}</span>
              
                      </button>
                    ))}
                    <div className="text-[10px] text-dim mb-1 mt-2">联网搜索：</div>
                    {[
                      ['自由', 'AI自己决定是否搜索'],
                      ['增强', '寻找优质信息源'],
                    ].map(([label, desc], i) => (
                      <button key={label} onClick={() => setWebSearchMode(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === webSearchMode ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 输出形式 */}
              <div className="relative" ref={formatRef}>
                <button
                  onClick={() => { setShowFormat(!showFormat); setShowContent(false) }}
                  className="h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)]"
                >
                  输出形式 <ChevronDown size={9} />
                </button>
                {showFormat && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 220 }}>
                    <div className="text-[10px] text-dim mb-1">结构化程度：</div>
                    {([
                      ['低结构化', '减少列表和表格，以段落为主'],
                      ['高结构化', '增加有序/无序列表和表格'],
                    ] as const).map(([s, desc], i) => (
                      <button key={s} onClick={() => setOutputFormat(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === outputFormat ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{s}</span>
                      </button>
                    ))}
                    <div className="text-[10px] text-dim mb-1 mt-2">输出格式：</div>
                    {([
                      ['MD文档', '包裹为完整Markdown文档输出'],
                      ['对话形式', '以对话消息形式直接输出'],
                    ] as const).map(([s, desc], i) => (
                      <button key={s} onClick={() => setOutputStyle(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === outputStyle ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* 输出内容 */}
              <div className="relative" ref={contentRef}>
                <button
                  onClick={() => { setShowContent(!showContent); setShowFormat(false) }}
                  className="h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)]"
                >
                  输出内容 <ChevronDown size={9} />
                </button>
                {showContent && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 220 }}>
                    <div className="text-[10px] text-dim mb-1">思考链展示：</div>
                    {([
                      ['关', '不展示思考链'],
                      ['开', '大模型思考时展示'],
                    ] as const).map(([s, desc], i) => (
                      <button key={s} onClick={() => setThinking(i === 1)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${(i === 1) === thinking ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{s}</span>
                      </button>
                    ))}
                    <div className="text-[10px] text-dim mb-1 mt-2">输出量：</div>
                    {([
                      ['精简', '只输出核心观点'],
                      ['适中', '观点加论证过程'],
                      ['拓展', '补充拓展性相关内容'],
                    ] as const).map(([s, desc], i) => (
                      <button key={s} onClick={() => setOutputVolume(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === outputVolume ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{s}</span>
                      </button>
                    ))}
                    <div className="text-[10px] text-dim mb-1 mt-2">学习深度：</div>
                    {([
                      ['浅', '基础概念层面'],
                      ['中', '概念+原理层面'],
                      ['深', '原理+推导+前沿'],
                    ] as const).map(([s, desc], i) => (
                      <button key={s} onClick={() => setDepth(i)}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left ${i === depth ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="w-px h-4 bg-[#e5e5e5] mx-1" />
              <span className="flex-1" />
              <button
                onClick={() => setShowModelModal(true)}
                className="h-9 px-3 rounded-xl input-surface text-[11px] flex items-center gap-1.5 hover:opacity-90 transition-colors"
                title="模型设置">
                <Cpu size={14} /> 模型
              </button>
              <button
                onClick={handleSend}
                disabled={isLoading}
                className="w-9 h-9 btn-primary flex items-center justify-center disabled:opacity-50"
                title="发送"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* 模型设置弹窗：按厂家分组 */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowModelModal(false) }}>
          <div className="card-lift w-[420px] max-h-[85vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] flex-shrink-0">
              <h3 className="font-display text-lg">模型设置</h3>
              <button onClick={() => setShowModelModal(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex flex-col gap-3">
              {MODEL_PROVIDERS.map(p => (
                <div key={p.id} className={`border rounded-xl p-3 transition-colors ${selectedProvider === p.id ? 'border-[#1a1a1a]/40 bg-[#fafafa]' : 'border-[#e5e5e5]'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold">{p.name}</span>
                    <span className="text-[10px] text-dim">{p.baseUrl}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {p.models.map(m => (
                      <button key={m}
                        onClick={() => { setSelectedProvider(p.id); setSelectedModel(m); localStorage.setItem('coagent-provider', p.id); localStorage.setItem('coagent-model', m) }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-medium ${selectedProvider === p.id && selectedModel === m ? 'btn-primary' : 'row-hover'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="password"
                      value={providerKeys[p.id] || ''}
                      onChange={(e) => { const next = { ...providerKeys, [p.id]: e.target.value }; setProviderKeys(next); localStorage.setItem('coagent-provider-keys', JSON.stringify(next)) }}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder={`${p.name} API Key`}
                      className="flex-1 px-2.5 py-1.5 input-surface rounded-lg text-xs outline-none"
                    />
                    {selectedProvider === p.id && (
                      <button
                        onClick={() => setShowModelModal(false)}
                        className="px-3 py-1.5 btn-primary text-xs font-semibold rounded-lg flex-shrink-0">
                        使用此模型
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-dim px-4 pb-3 flex-shrink-0">各厂家 API Key 分别保存在浏览器本地；选择模型后发送消息即使用对应厂家接口。</p>
          </div>
        </div>
      )}
    </main>
  )
}

function CollapsibleThink({ think }: { think: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} className="text-[11px] text-dim hover:text-[#1a1a1a] flex items-center gap-1">
        <span>{open ? '▾' : '▸'}</span> 思考过程
      </button>
      {open && (
        <div className="mt-2 text-[11px] text-dim leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto pl-2 border-l-2 hairline">
          {think.join('\n')}
        </div>
      )}
    </div>
  )
}
