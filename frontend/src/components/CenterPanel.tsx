import { useState, useEffect, useRef } from 'react'
import { Send, Bot, Lightbulb, MessagesSquare, Coins, CheckCircle2, ChevronDown, Upload, Cpu, SlidersHorizontal, AlertTriangle, Search, FileText, LayoutTemplate, Image as ImageIcon, PenLine } from 'lucide-react'
import type { Message, Project } from '../types'
import MarkdownIt from 'markdown-it'

// ---------- 思维链渲染：markdown-it 轻量渲染（html:false 防 XSS，换行生效）----------
const mdThink = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => mdThink.render(text || '')


interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  dialogueId?: string | null
  onSendMessage: (text: string, settings?: Record<string, any>) => void
  statsCollapsed: boolean
  onToggleStats: () => void
  onOpenGuide?: () => void
  onOpenSettings?: () => void
  projectInitialized?: boolean
  draft?: string
  analyzeHint?: { label: string; project: string } | null
  onClearAnalyzeHint?: () => void
  onManualSetup?: () => void
  flowStatus?: string
  flowActiveAgent?: string | null
}

export default function CenterPanel({ messages, isLoading, currentProject, dialogueId, onSendMessage, statsCollapsed, onToggleStats, onOpenGuide, onOpenSettings, projectInitialized, draft, analyzeHint, onClearAnalyzeHint, onManualSetup, flowStatus, flowActiveAgent }: CenterPanelProps) {
  const [input, setInput] = useState('')
  // 记忆修改预填：draft 变化时写入输入框（从记忆界面跳转）
  useEffect(() => { if (draft) setInput(draft) }, [draft])
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
  // stick-to-bottom：仅在用户位于底部附近时自动跟随流式内容；用户上滑查看历史则停止跟随，可自由滑动
  const stickToBottomRef = useRef(true)
  useEffect(() => {
    const el = msgScrollRef.current
    if (!el) return
    const onScroll = () => {
      stickToBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 60
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const el = msgScrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, isLoading])
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
  const [outputVolume, setOutputVolume] = useState(1)
  const [depth, setDepth] = useState(1)
  const [showSearch, setShowSearch] = useState(false)
  const [showModelModal, setShowModelModal] = useState(false)
  // 模板模式：与「模板与编排」预设模板一致
const TEMPLATE_OPTIONS = [
  { name: '基础', desc: '默认编排' },
  { name: '检索增强', desc: '知识库管理调用子 Agent 整理资料' },
  { name: '快速', desc: '生成用快模型' },
  { name: '输出增强', desc: '主 Agent 调用子 Agent 产出结构化内容' },
]

/** 模型厂家配置（仅保留最常用：DeepSeek / 智谱GLM） */
  const MODEL_PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4-flash'] },
    { id: 'zhipu', name: '智谱GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'] },
  ]
  const [selectedProvider, setSelectedProvider] = useState(() => localStorage.getItem('coagent-provider') || 'deepseek')
  const [selectedModel, setSelectedModel] = useState(() => {
    const m = localStorage.getItem('coagent-model') || 'deepseek-v4-pro'
    const alias: Record<string, string> = {
      'deepseek-chat': 'deepseek-v4-pro',
      'deepseek-reasoner': 'deepseek-v4-pro',
      'deepseek-pro': 'deepseek-v4-pro',
      'deepseek-flash': 'deepseek-v4-flash',
    }
    return alias[m] || m
  })
  // 模板模式（与模板与编排预设一致）
  const [templateMode, setTemplateMode] = useState(() => { const t = localStorage.getItem('coagent-template') || '基础'; return ['基础', '检索增强', '快速', '输出增强'].includes(t) ? t : '基础' })
  // Auto：AI 根据输入自动选择模板/模式（开启后手动设置按钮禁用）
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem('coagent-auto') === '1')
  // 模型 Auto：AI 根据输入自动选择模型（模型选择上拉栏内开关）
  const [modelAuto, setModelAuto] = useState(() => localStorage.getItem('coagent-model-auto') === '1')
  // 使用模板：开启后工具栏显示「模板选择」按钮
  const [useTemplate, setUseTemplate] = useState(() => localStorage.getItem('coagent-use-template') !== '0')
  // 细节设定：开启后工具栏显示细节按钮（输入询问/检索模式/输出形式）
  const [useDetail, setUseDetail] = useState(() => localStorage.getItem('coagent-use-detail') !== '0')
  // 对话模式上拉框
  const [showDlgMenu, setShowDlgMenu] = useState(false)
  const dlgRef = useRef<HTMLDivElement>(null)
  const [showTplMenu, setShowTplMenu] = useState(false)
  const tplRef = useRef<HTMLDivElement>(null)
  // 模型选择上拉小窗
  const modelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setShowTplMenu(false)
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setShowModelModal(false)
      if (dlgRef.current && !dlgRef.current.contains(e.target as Node)) setShowDlgMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const searchRef = useRef<HTMLDivElement>(null)
  const [showInputOpt, setShowInputOpt] = useState(false)
  const inputOptRef = useRef<HTMLDivElement>(null)
  const [inputOptMode, setInputOptMode] = useState(0) // 0=开启优化,1=关闭优化
  const inputOptLabels = ['开启', '关闭']
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
      template: templateMode,
      auto: autoMode,
      modelAuto: modelAuto,
      searchMode: searchLabels[searchMode],
      outputFormat: outputFormat === 0 ? '低结构化' : '高结构化',
      outputStyle: outputStyle === 0 ? 'MD文档' : '对话形式',
      thinking: '开',
      outputVolume: ['精简', '适中', '拓展'][outputVolume],
      depth: ['浅', '中', '深'][depth],
      inputOptMode: inputOptMode === 0 ? '默认模式' : '不询问模式',
      webSearchMode: webSearchMode === 0 ? '默认' : '增强',
    })
    setInput('')
    setAttachments([])
  }

  const sendFollowup = (q: string) => {
    onSendMessage(q, {
      chatMode: chatMode,
      template: templateMode,
      auto: autoMode,
      modelAuto: modelAuto,
      searchMode: searchLabels[searchMode],
      outputFormat: outputFormat === 0 ? '低结构化' : '高结构化',
      outputStyle: outputStyle === 0 ? 'MD文档' : '对话形式',
      thinking: '开',
      outputVolume: ['精简', '适中', '拓展'][outputVolume],
      depth: ['浅', '中', '深'][depth],
      inputOptMode: inputOptMode === 0 ? '默认模式' : '不询问模式',
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
        </div>
      </div>
      {/* 收起/展开按钮：固定在统计条下方正中央，收起与展开位置一致 */}
      <div className="flex justify-center flex-shrink-0">
        <button onClick={onToggleStats}
          className="text-[10px] text-dim hover:text-[#1a1a1a] px-3 py-0.5 rounded-b-lg row-hover"
          title={statsCollapsed ? '展开统计条' : '收起统计条'}>
          {statsCollapsed ? '▼' : '▲'}
        </button>
      </div>

      {/* 消息流：内容限宽居中 */}
      <div ref={msgScrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
          {/* 持久提示：课程记忆分析/基本情况修改（从记忆界面跳转进入时显示） */}
          {analyzeHint && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border hairline"
              style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
              <span className="text-xs font-semibold flex-shrink-0">{analyzeHint.label} · {analyzeHint.project}</span>
              <button onClick={onClearAnalyzeHint} className="ml-auto flex-shrink-0 text-dim hover:text-[var(--text)] text-xs px-1">✕</button>
            </div>
          )}
          {/* 欢迎屏 */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 animate-[fadeIn_0.4s_ease]">
              <div className="w-14 h-14 rounded-3xl card-surface flex items-center justify-center">
                <Bot size={26} className="text-dim" strokeWidth={1.5} />
              </div>
              <h1 className="font-display text-3xl tracking-wide">CoAgent-Learn</h1>
              {!currentProject && <p className="text-xs text-dim">选择或新建一个课程开始学习</p>}
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
                  <div>
                    {/* 实时思维链：以对话形式推送（Agent 小标题+内容，随消息流滚动，不限定框；plain 纯文本渲染保帧率） */}
                    {msg.think && msg.think.length > 0 && (
                      <div className="mb-2"><ThinkBlock items={msg.think} plain activeAgent={flowActiveAgent} activeStatus={flowStatus} /></div>
                    )}
                    <div className="flex items-center gap-2 text-dim">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      <span className="text-xs ml-1">{flowActiveAgent ? '处理中…' : (flowStatus || '思考中…')}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 思考过程（按 Agent 逐个折叠）在输出内容上方 */}
                    {msg.think && msg.think.length > 0 && (
                      <AgentThinkList think={msg.think} />
                    )}
                    <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
                    {/* 运行统计：回答下面、追问上面，直接展开显示 */}
                    {(() => {
                      const stat = (msg.think || []).find(t => typeof t !== 'string' && (t as any).agent === '运行统计')
                      if (!stat) return null
                      return (
                        <div className="mt-2.5 text-[10px] leading-relaxed text-dim border hairline rounded-lg px-3 py-2 bg-[var(--bg-panel)]">
                          {(stat as any).content}
                        </div>
                      )
                    })()}
                    {/* 新建课程引导消息：右下角「手动初始化」按钮（仅初次创建、未完成手动填写时显示） */}
                    {msg.content.includes('课程创建成功') && onManualSetup && !(currentProject && (() => {
                      try { return (JSON.parse(localStorage.getItem('coagent-manual-setup-done') || '[]') as string[]).includes(currentProject.id) } catch { return false }
                    })()) && (
                      <div className="mt-3 flex justify-end">
                        <button onClick={onManualSetup}
                          className="text-[11px] px-3 py-1.5 rounded-lg border hairline text-dim hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1">
                          <PenLine size={11} /> 手动初始化
                        </button>
                      </div>
                    )}
                    {/* 继续追问：附着于该条 AI 输出下方（豆包样式，仅最后一条输出） */}
                    {idx === messages.length - 1 && followups.length > 0 && !isLoading && (
                      <div className="mt-3 flex flex-col gap-1.5 animate-[fadeIn_0.3s_ease]">
                        <p className="text-[11px] text-dim font-medium flex items-center gap-1"><Lightbulb size={12} /> 继续追问 · 推进学习目标</p>
                        <div className="flex flex-wrap gap-1.5">
                          {followups.map((q, k) => (
                            <button key={k} onClick={() => sendFollowup(q)}
                              className="chip text-left text-[12px] px-3 py-1.5 transition-all">
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          ))}

        </div>
      </div>

      {/* 底部：追问 chips + 浮动输入坞 */}
      <div className="flex-shrink-0 px-6 pb-5">
        <div className="flex flex-col gap-2.5">
          {projectInitialized === false ? (
            <div className="px-3 py-2 border border-dashed border-orange-400 rounded-xl bg-orange-50 text-xs text-orange-600 flex items-center gap-2">
              <AlertTriangle size={13} /> 课程未初始化
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
              {/* 模板选择（挨着上传按钮右边，顶部带「使用模板」开关） */}
              {/* 对话模式：上拉框控制 Auto / 模板选择 / 细节设定 三个开关 */}
              <div className="relative ml-2" ref={dlgRef}>
                <button
                  onClick={() => setShowDlgMenu(!showDlgMenu)}
                  className="h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)]"
                  title="对话模式">
                  <SlidersHorizontal size={13} /> 对话模式 <ChevronDown size={9} />
                </button>
                {showDlgMenu && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-1.5 z-10" style={{ width: 125 }}>
                    <div className="flex items-center justify-between gap-1 px-1 py-1.5 border-b border-[#e5e5e5]">
                      <span className="text-[11px] font-medium">Auto</span>
                      <button onClick={() => { const next = !autoMode; setAutoMode(next); localStorage.setItem('coagent-auto', next ? '1' : '0'); if (next) { setUseTemplate(false); localStorage.setItem('coagent-use-template', '0'); setUseDetail(false); localStorage.setItem('coagent-use-detail', '0') } }}
                        className={`w-8 h-4.5 rounded-full relative transition-colors flex-shrink-0 ${autoMode ? 'bg-[#1a1a1a]' : 'bg-[#d9d9d9]'}`} style={{ height: 18 }}
                        title="Auto（AI 自动推断模板/细节）">
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${autoMode ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1 py-1.5 border-b border-[#e5e5e5]">
                      <span className="text-[11px] font-medium">模板选择</span>
                      <button onClick={() => { const next = !useTemplate; setUseTemplate(next); localStorage.setItem('coagent-use-template', next ? '1' : '0'); if (next) { setAutoMode(false); localStorage.setItem('coagent-auto', '0'); setUseDetail(false); localStorage.setItem('coagent-use-detail', '0') } }}
                        className={`w-8 h-4.5 rounded-full relative transition-colors flex-shrink-0 ${useTemplate ? 'bg-[#1a1a1a]' : 'bg-[#d9d9d9]'}`} style={{ height: 18 }}
                        title="开启后对话框显示模板选择按钮">
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${useTemplate ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-1 px-1 py-1.5">
                      <span className="text-[11px] font-medium">细节设定</span>
                      <button onClick={() => { const next = !useDetail; setUseDetail(next); localStorage.setItem('coagent-use-detail', next ? '1' : '0'); if (next) { setAutoMode(false); localStorage.setItem('coagent-auto', '0'); setUseTemplate(false); localStorage.setItem('coagent-use-template', '0') } }}
                        className={`w-8 h-4.5 rounded-full relative transition-colors flex-shrink-0 ${useDetail ? 'bg-[#1a1a1a]' : 'bg-[#d9d9d9]'}`} style={{ height: 18 }}
                        title="开启后对话框显示细节按钮（输入询问/检索模式/输出形式/输出内容）">
                        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${useDetail ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* 模板选择（使用模板滑块开启时显示） */}
              {useTemplate && (
              <div className="relative" ref={tplRef}>
                <button
                  onClick={() => setShowTplMenu(!showTplMenu)}
                  className={`h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)] ${autoMode ? 'opacity-40' : ''}`}
                  title="模板模式（均衡/质量优先/响应更快）">
                  <LayoutTemplate size={13} /> 模板选择 <ChevronDown size={9} />
                </button>
                {showTplMenu && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-1.5 z-10" style={{ width: 125 }}>
                    {TEMPLATE_OPTIONS.map(t => (
                      <button key={t.name}
                        onClick={() => { setTemplateMode(t.name); localStorage.setItem('coagent-template', t.name); setShowTplMenu(false) }}
                        className={`text-[11px] px-2 py-1.5 rounded-lg text-left w-full ${templateMode === t.name ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                        <span className="font-medium">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
              {/* 细节设定（滑块开启时显示） */}
              {useDetail && (<>
              <div className="relative" ref={inputOptRef}>
                <button
                  onClick={() => { setShowInputOpt(!showInputOpt); setShowSearch(false); setShowFormat(false); setShowContent(false) }}
                  disabled={autoMode}
                  className={`h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)] ${autoMode ? 'opacity-40' : ''}`}
                >
                  <SlidersHorizontal size={13} /> 输入优化 <ChevronDown size={9} />
                </button>
                {showInputOpt && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-1.5 z-10" style={{ width: 100 }}>
                    {inputOptLabels.map((label, i) => (
                      <button key={label} onClick={() => { setInputOptMode(i) }}
                        className={`text-[11px] px-2 py-1 rounded-lg text-left w-full ${i === inputOptMode ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
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
                  disabled={autoMode}
                  className={`h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)] ${autoMode ? 'opacity-40' : ''}`}
                >
                  <Search size={13} /> 检索模式 <ChevronDown size={9} />
                </button>
                {showSearch && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 165 }}>
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
                  disabled={autoMode}
                  className={`h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)] ${autoMode ? 'opacity-40' : ''}`}
                >
                  输出形式 <ChevronDown size={9} />
                </button>
                {showFormat && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 165 }}>
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
              {/* 输出内容（思考链固定开启，仅输出量/学习深度可选） */}
              <div className="relative" ref={contentRef}>
                <button
                  onClick={() => { setShowContent(!showContent); setShowFormat(false) }}
                  disabled={autoMode}
                  className={`h-7 px-1.5 rounded-lg icon-btn text-[11px] flex items-center gap-1 border border-[var(--border-strong)] bg-[var(--bg-input)] ${autoMode ? 'opacity-40' : ''}`}
                >
                  输出内容 <ChevronDown size={9} />
                </button>
                {showContent && (
                  <div className="absolute bottom-full left-0 mb-1 card-lift p-2 z-10" style={{ width: 175 }}>
                    <div className="text-[10px] text-dim mb-1">输出量：</div>
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
              </>)}
              <span className="w-px h-4 bg-[#e5e5e5] mx-1" />
              <span className="flex-1" />
              <div className="relative" ref={modelRef}>
                <button
                  onClick={() => setShowModelModal(!showModelModal)}
                  className="h-9 px-3 rounded-xl input-surface text-[11px] flex items-center gap-1.5 hover:opacity-90 transition-colors"
                  title="模型选择">
                  <Cpu size={14} /> 模型 <ChevronDown size={9} />
                </button>
                {showModelModal && (
                  <div className="absolute bottom-full right-0 mb-1 card-lift p-2 z-10" style={{ width: 175 }}>
                    <div className="flex items-center justify-between gap-2 px-1 py-1.5 mb-1 border-b border-[#e5e5e5]">
                      <span className="text-[11px] font-medium">Auto</span>
                      <button onClick={() => { const next = !modelAuto; setModelAuto(next); localStorage.setItem('coagent-model-auto', next ? '1' : '0') }}
                        className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${modelAuto ? 'bg-[#1a1a1a]' : 'bg-[#d9d9d9]'}`}
                        title="Auto 开关（自动选择模型）">
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${modelAuto ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                    {/* 模型并列平铺（不按厂家分组） */}
                    <div className="flex flex-col gap-0.5">
                      {MODEL_PROVIDERS.flatMap(p => p.models.map(m => ({ name: m, provider: p.id }))).map(x => (
                        <button key={x.name}
                          onClick={() => { setSelectedProvider(x.provider); setSelectedModel(x.name); localStorage.setItem('coagent-provider', x.provider); localStorage.setItem('coagent-model', x.name) }}
                          className={`text-[11px] px-2 py-1.5 rounded-lg text-left ${selectedProvider === x.provider && selectedModel === x.name ? 'row-active text-[#1a1a1a]' : 'row-hover'}`}>
                          <span className="font-medium">{x.name}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setShowModelModal(false); onOpenSettings && onOpenSettings() }}
                      className="w-full mt-1.5 pt-2 border-t border-[#e5e5e5] text-[10px] text-[var(--accent)] hover:underline flex items-center justify-center gap-1">
                      API 配置
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={isLoading}
                className="w-9 h-9 ml-2 btn-primary flex items-center justify-center disabled:opacity-50"
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
    </main>
  )
}

/** 思维链内容块：Agent 小标题 + 内容（以对话形式推送，不限定高度框）。
 * 折叠交互：新 Agent 默认展开；点击标题手动折叠/展开；Agent 执行完（活跃切换到下一个）自动折叠。
 * plain=true 时用纯文本渲染（实时逐字阶段）；完成态用 markdown 渲染。 */
function ThinkBlock({ items, plain, activeAgent, activeStatus }: { items: Array<{ agent: string; content: string }> | string[]; plain?: boolean; activeAgent?: string | null; activeStatus?: string }) {
  const list = (items || []).map(it => typeof it === 'string' ? { agent: '', content: it } : it)
  if (list.length === 0) return null
  // 每个条目的展开状态（按 index，新条目默认展开）
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})
  // 记录每个 Agent 最新条目的 index（用于活跃切换时自动折叠）
  const lastIdxRef = useRef<Record<string, number>>({})
  list.forEach((it, i) => { if (it.agent) lastIdxRef.current[it.agent] = i })
  const prevActive = useRef<string | null | undefined>(activeAgent)
  useEffect(() => {
    // Agent 执行完（活跃 agent 切换）：前一个自动折叠
    if (prevActive.current && prevActive.current !== activeAgent) {
      const idx = lastIdxRef.current[prevActive.current]
      if (idx !== undefined) setOpenMap(prev => ({ ...prev, [idx]: false }))
    }
    prevActive.current = activeAgent
  }, [activeAgent])
  const toggle = (i: number) => setOpenMap(prev => ({ ...prev, [i]: !(prev[i] ?? true) }))
  return (
    <div className="flex flex-col gap-2">
      {list.map((it, i) => (
        <div key={i} className="animate-[fadeIn_0.15s_ease]">
          {it.agent && (
            <button onClick={() => toggle(i)} className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 hover:opacity-80 transition-opacity text-left">
              {/* 折叠箭头：▾ 展开 / ▸ 折叠 */}
              <span className="text-dim text-[9px] flex-shrink-0">{openMap[i] === false ? '▸' : '▾'}</span>
              <span>{it.agent}</span>
              {/* 正在干什么：显示在 Agent 标题后面（仅当前活跃的 Agent） */}
              {it.agent === activeAgent && activeStatus && (
                <span className="ml-1 font-normal text-[10px] text-dim">{activeStatus}</span>
              )}
            </button>
          )}
          {openMap[i] !== false && (
            <div className="text-[11px] leading-relaxed text-dim pl-2 border-l-2 hairline">
              {plain ? (
                <div className="whitespace-pre-wrap break-words">{it.content}</div>
              ) : (
                <div className="md-think-body" dangerouslySetInnerHTML={{ __html: renderMd(it.content) }} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** 思考过程（按 Agent 逐个折叠）：每个 Agent 一行折叠头，点击展开该 Agent 的思考内容；
 * 未展开时显示内容预览；展开后 markdown 渲染。 */
function AgentThinkList({ think }: { think?: Array<{ agent: string; content: string }> | string[] }) {
  const [openSet, setOpenSet] = useState<Set<number>>(new Set())
  const items = (think || []).map((it, i) => (typeof it === 'string' ? { agent: '', content: it, i } : { ...it, i }))
    .filter(it => it.agent !== '运行统计')  // 运行统计独立显示在回答下方
  if (items.length === 0) return null
  const toggle = (i: number) => setOpenSet(prev => {
    const n = new Set(prev)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })
  return (
    <div className="mb-3 flex flex-col gap-0.5">
      {items.map(it => (
        <div key={it.i} className="flex flex-col">
          <button onClick={() => toggle(it.i)}
            className="flex items-center gap-1.5 py-0.5 text-[11px] font-semibold hover:opacity-80 transition-opacity text-left">
            <span className="flex-shrink-0">{it.agent || '思考'}</span>
            {/* 右侧小箭头：点击展开该 Agent 的思考内容 */}
            <span className={`text-dim text-[9px] transition-transform ${openSet.has(it.i) ? 'rotate-90' : ''}`}>▸</span>
          </button>
          {openSet.has(it.i) && (
            <div className="pl-1">
              <ThinkBlock items={[{ agent: '', content: it.content }]} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
