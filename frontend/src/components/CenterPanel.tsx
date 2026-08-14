import { useState, useEffect, useRef, useMemo } from 'react'
import { Send, Bot, Lightbulb, MessagesSquare, Coins, CheckCircle2, Check, ChevronDown, Upload, Cpu, SlidersHorizontal, AlertTriangle, Search, FileText, LayoutTemplate, Image as ImageIcon, PenLine, Square, ArrowDownToLine, Timer } from 'lucide-react'
import type { Message, Project } from '../types'
import MarkdownIt from 'markdown-it'

// ---------- 思维链渲染：markdown-it 轻量渲染（html:false 防 XSS，换行生效）----------
const mdThink = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => mdThink.render(text || '')

// markdown 渲染结果缓存：历史消息 content 不变，命中即跳过 markdown-it 全量解析（流式 flush 每帧触发全列表重渲染时的性能关键）
const _mdCache = new Map<string, string>()
const renderMdCached = (text: string) => {
  const key = text || ''
  let h = _mdCache.get(key)
  if (h === undefined) {
    h = renderMd(key)
    if (_mdCache.size > 300) {
      // 简单上限：超出删最老（Map 迭代顺序 = 插入顺序）
      const first = _mdCache.keys().next().value
      if (first !== undefined) _mdCache.delete(first)
    }
    _mdCache.set(key, h)
  }
  return h
}

/** 思维链标题净化：只显示 agent 名称，去掉内部阶段后缀与伪标题。
 * 内部阶段名（学习助手·规划/生成）、历史旧名（主Agent·规划/生成）、极速档伪标题（综合概述性记忆）
 * 统一显示为"学习助手"；内部名仍用于"正在干什么"状态匹配。 */
const displayAgent = (name: string) => {
  if (typeof name !== 'string') return name
  let base = name
  // 去掉 ·规划 / ·生成 阶段后缀
  const m = base.match(/^(.*?)·(规划|生成)$/)
  if (m) base = m[1]
  // 历史旧名 / 极速档伪标题 → 学习助手
  if (base === '主 Agent' || base === '主Agent' || base === '综合概述性记忆') return '学习助手'
  return base
}


interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  dialogueId?: string | null
  onSendMessage: (text: string, settings?: Record<string, any>) => void
  onStop?: () => void
  /** 需求澄清（reasonix 式）：思维链内选项点击回调；option=null 表示直接生成 */
  onClarifyPick?: (option: string | null) => void
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

export default function CenterPanel({ messages, isLoading, currentProject, dialogueId, onSendMessage, onStop, onClarifyPick, statsCollapsed, onToggleStats, onOpenGuide, onOpenSettings, projectInitialized, draft, analyzeHint, onClearAnalyzeHint, onManualSetup, flowStatus, flowActiveAgent }: CenterPanelProps) {
  const [input, setInput] = useState('')
  // 记忆修改预填：draft 变化时写入输入框（从记忆界面跳转）
  useEffect(() => { if (draft) setInput(draft) }, [draft])
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
  // stick-to-bottom：仅在用户完全贴紧底部时自动跟随流式内容（容差 8px 防滚动抖动）；用户上滑查看历史则停止跟随，可自由滑动
  const stickToBottomRef = useRef(true)
  // 上滑超过阈值时显示"回到底部"悬浮按钮
  const [showJumpBottom, setShowJumpBottom] = useState(false)
  // 特殊形式输出建议卡片：各消息选中的形式 key（默认全选）+ 已忽略的消息 idx
  const [specialSel, setSpecialSel] = useState<Record<number, string[]>>({})
  const [dismissedSpecial, setDismissedSpecial] = useState<Set<number>>(new Set())
  useEffect(() => {
    const el = msgScrollRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = dist < 8
      setShowJumpBottom(dist > 160)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  const jumpToBottom = () => {
    const el = msgScrollRef.current
    if (!el) return
    stickToBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
  useEffect(() => {
    const el = msgScrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, isLoading])
  const [stats, setStats] = useState<{dialogue_count: number; tokens_estimate: number; total_duration_seconds: number; metrics: any}>({dialogue_count: 0, tokens_estimate: 0, total_duration_seconds: 0, metrics: null })
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
  const [showModelModal, setShowModelModal] = useState(false)
  // 档位模式：极速/思考/研究（用户时间-质量期望的表达），与「对话流程」区块一致
const TEMPLATE_OPTIONS = [
  { name: '极速', desc: '最短响应（1 秒内首字，500-800 字）' },
  { name: '思考', desc: '完整流程 + 轻量单审（800-1200 字）' },
  { name: '研究', desc: '完整流程 + 严格检测（多轮搜索）' },
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
  const [templateMode, setTemplateMode] = useState(() => {
    const t = localStorage.getItem('coagent-template') || '思考'
    // 旧模板名映射新档位（兼容历史 localStorage）
    const MAP: Record<string, string> = { '基础': '思考', '检索增强': '思考', '快速': '极速', '输出增强': '思考' }
    const n = MAP[t] || t
    return ['极速', '思考', '研究'].includes(n) ? n : '思考'
  })
  // Auto：AI 根据输入自动选择模板/模式（开启后手动设置按钮禁用）
  const [autoMode, setAutoMode] = useState(() => localStorage.getItem('coagent-auto') === '1')
  // 模型 Auto：AI 根据输入自动选择模型（模型选择上拉栏内开关）
  const [modelAuto, setModelAuto] = useState(() => localStorage.getItem('coagent-model-auto') === '1')
  // 档位上拉框
  const [showTplMenu, setShowTplMenu] = useState(false)
  const tplRef = useRef<HTMLDivElement>(null)
  // 模型选择上拉小窗
  const modelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setShowTplMenu(false)
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setShowModelModal(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const [timeRange, setTimeRange] = useState('今天')
  const [showTimeRange, setShowTimeRange] = useState(false)
  const timeRangeRef = useRef<HTMLDivElement>(null)
  const timeLabels = ['本次', '今天', '本周', '本月', '今年', '总']

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    }, 10000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (timeRangeRef.current && !timeRangeRef.current.contains(e.target as Node)) setShowTimeRange(false)
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
    if (isLoading) return  // 生成中：发送按钮已变为"停止"，Enter 等途径不触发新消息（避免并行流）
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
      template: templateMode,
      auto: autoMode,
      modelAuto: modelAuto,
    })
    setInput('')
    setAttachments([])
  }

  const sendFollowup = (q: string) => {
    onSendMessage(q, {
      template: templateMode,
      auto: autoMode,
      modelAuto: modelAuto,
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
          <span className="w-px h-3.5 bg-[#e5e5e5]" />
          <span className="flex items-center gap-1 text-[11px] tabular-nums"><Timer size={12} /> {stats.total_duration_seconds >= 3600 ? (stats.total_duration_seconds / 3600).toFixed(1) + ' 小时' : Math.round(stats.total_duration_seconds / 60) + ' 分钟'} 专注</span>
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

      {/* 消息流：内容限宽居中（外层 relative 用于"回到底部"悬浮按钮定位） */}
      <div className="relative flex-1 min-h-0">
      <div ref={msgScrollRef} className="h-full overflow-y-auto">
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
                {(() => {
                  const isLast = idx === messages.length - 1
                  const streaming = isLoading && isLast
                  return (
                    <>
                      {/* 思考过程区块（DeepSeek 式：流式展开逐字 / 完成自动折叠为一行，统一组件消除跳变） */}
                      {msg.think && msg.think.length > 0 && (
                        <div className="mb-3">
                          <ReasoningBlock items={msg.think} streaming={streaming} activeAgent={flowActiveAgent} activeStatus={flowStatus} onClarifyPick={onClarifyPick} />
                        </div>
                      )}
                      {/* 回答正文：流式逐字纯文本（绝不 markdown）/ 完成一次性 markdown 渲染 */}
                      {streaming
                        ? (msg.content ? <StreamingMd text={msg.content} streaming /> : null)
                        : (msg.content ? <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: renderMdCached(msg.content) }} /> : null)}
                      {/* 流式等待指示器（回答尚未开始流式时显示） */}
                      {streaming && !msg.content && (
                        <div className="flex items-center gap-2 text-dim">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                          <span className="text-xs ml-1">{flowActiveAgent ? '处理中…' : (flowStatus || '思考中…')}</span>
                        </div>
                      )}
                      {/* 完成态附加内容 */}
                      {!streaming && (
                        <>
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
                          {/* 特殊形式输出建议（模型判断）：弹出选项——是否生成 / 生成哪些 */}
                          {msg.special && msg.special.length > 0 && !dismissedSpecial.has(idx) && (
                            <div className="mt-2.5 border hairline rounded-xl px-3 py-2.5 bg-[var(--bg-panel)]">
                              <p className="text-[10px] font-semibold text-dim mb-1.5">模型建议：内容可生成以下形式</p>
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {msg.special.map(s => {
                                  const sel = (specialSel[idx] ?? msg.special!.map(x => x.key)).includes(s.key)
                                  return (
                                    <button key={s.key}
                                      onClick={() => setSpecialSel(prev => {
                                        const cur = prev[idx] ?? msg.special!.map(x => x.key)
                                        const next = sel ? cur.filter(k => k !== s.key) : [...cur, s.key]
                                        return { ...prev, [idx]: next }
                                      })}
                                      className={"chip text-left text-[11px] px-2.5 py-1 transition-all" + (sel ? '' : ' opacity-40')}>
                                      {s.label}
                                    </button>
                                  )
                                })}
                              </div>
                              <div className="flex items-center justify-end gap-3">
                                <button onClick={() => {
                                  const picked = specialSel[idx] ?? msg.special!.map(x => x.key)
                                  const names = msg.special!.filter(x => picked.includes(x.key)).map(x => x.label)
                                  if (names.length) alert(`「${names.join('」「')}」生成功能待实现（下一步开发）`)
                                  setDismissedSpecial(prev => new Set(prev).add(idx))
                                }}
                                  className="text-[10px] font-semibold text-[var(--accent)] hover:underline">生成所选</button>
                                <button onClick={() => setDismissedSpecial(prev => new Set(prev).add(idx))}
                                  className="text-[10px] text-dim hover:text-[var(--text)]">忽略</button>
                              </div>
                            </div>
                          )}
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
                          {isLast && followups.length > 0 && !isLoading && (
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
                    </>
                  )
                })()}
              </div>
            )
          ))}

        </div>
      </div>
      {/* 上滑后悬浮"回到底部"按钮：点击平滑回到最新消息并恢复自动跟随 */}
      {showJumpBottom && (
        <button onClick={jumpToBottom}
          className="absolute bottom-20 right-8 w-9 h-9 rounded-full flex items-center justify-center bg-white border hairline shadow-lg hover:shadow-xl text-dim hover:text-[#1a1a1a] transition-all z-10"
          title="回到最新消息">
          <ArrowDownToLine size={16} />
        </button>
      )}
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
              name="chat-input"
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
              {/* 档位选择（豆包式：胶囊显示当前档位 + 弹出选项面板） */}
              <div className="relative" ref={tplRef}>
                <button
                  onClick={() => setShowTplMenu(!showTplMenu)}
                  className="h-7 px-2.5 rounded-full text-[11px] flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] transition-colors"
                  title="选择档位（极速/思考/研究）">
                  <LayoutTemplate size={13} /> {templateMode} <ChevronDown size={10} />
                </button>
                {showTplMenu && (
                  <div className="absolute bottom-full left-0 mb-1.5 card-lift p-1.5 z-10 flex flex-col gap-0.5" style={{ width: 120 }}>
                    {TEMPLATE_OPTIONS.map(t => (
                      <button key={t.name}
                        onClick={() => { setTemplateMode(t.name); localStorage.setItem('coagent-template', t.name); setShowTplMenu(false) }}
                        className={`text-left px-2.5 py-1.5 rounded-lg w-full flex items-center gap-1.5 text-[12px] font-medium ${templateMode === t.name ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                        {t.name}
                        {templateMode === t.name && <Check size={12} className="text-[var(--accent)] ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                onClick={isLoading ? (onStop || handleSend) : handleSend}
                className={"w-9 h-9 ml-2 flex items-center justify-center rounded-full" + (isLoading ? " bg-red-500 hover:bg-red-600 text-white" : " btn-primary")}
                title={isLoading ? "停止生成" : "发送"}
              >
                {isLoading ? <Square size={14} /> : <Send size={15} />}
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

/** 流式 markdown 渐进渲染（reasonix 同款方案）：
 * - 流式中：把文本按"稳定段落边界"（双换行 / 标题行前换行）切成 稳定前缀+尾段——
 *   稳定前缀渲染 markdown（useMemo 按段缓存，非逐字重解析），正在输入的尾段纯文本。
 *   流式中就有标题/加粗/列表格式感，且每段只解析一次，无"每 token 全量解析"的卡顿。
 * - 完成：整体一次性 markdown 渲染（尾段此时也稳定了），与流式态视觉连续、无跳变 */
function StreamingMd({ text, streaming }: { text: string; streaming?: boolean }) {
  // 稳定边界：最后一个双换行；或最后一个"换行+标题行"边界（标题已完整时立即定型）
  const stableEnd = useMemo(() => {
    if (!streaming) return -1
    let e = text.lastIndexOf('\n\n')
    for (let i = text.length - 1; i > e && i >= 0; i--) {
      if (text[i] === '\n' && text[i + 1] === '#') { e = i; break }
    }
    return e < 0 ? -1 : e + 2
  }, [text, streaming])
  const stable = stableEnd > 0 ? text.slice(0, stableEnd) : ''
  const tail = stableEnd > 0 ? text.slice(stableEnd) : text
  const html = useMemo(() => {
    if (streaming) return stable ? renderMdCached(stable) : ''
    return text ? renderMdCached(text) : ''
  }, [streaming, stable, text])
  if (!streaming) {
    if (html) return <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: html }} />
    return <div className="whitespace-pre-wrap break-words">{text}</div>
  }
  return (
    <div>
      {html ? <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      {tail ? <div className="whitespace-pre-wrap break-words">{tail}</div> : null}
    </div>
  )
}

/** 思考过程区块（DeepSeek 式独立区块）：
 * - 流式中（streaming=true）：展开，plain 纯文本逐字（保帧率），活跃状态挂标题
 * - 完成/历史（streaming=false）：自动折叠为一行「▸ 思考过程 · 已完成」，点击展开看 markdown
 * - 流式→完成不卸载组件，仅 open state 从展开切到折叠，消除「一次性出现又消失」跳变
 * - 同名 Agent（规划→生成）合并为一个「学习助手」分段；多段时才显示分段小标题 */
function ReasoningBlock({ items, streaming, activeAgent, activeStatus, onClarifyPick }: { items: Array<{ agent: string; content: string; clarify?: { question: string; options: string[] } }> | string[]; streaming?: boolean; activeAgent?: string | null; activeStatus?: string; onClarifyPick?: (option: string | null) => void }) {
  // 合并连续同名 agent（规划→生成→学习助手）+ 过滤运行统计（独立显示在回答下方）
  const merged = useMemo(() => {
    const list = (items || []).map(it => typeof it === 'string' ? { agent: '', content: it } : it)
      .filter(it => it.agent !== '运行统计')
    return list.reduce<Array<{ agent: string; content: string; clarify?: { question: string; options: string[] } }>>((acc, it) => {
      const dn = displayAgent(it.agent)
      const last = acc[acc.length - 1]
      if (last && dn && displayAgent(last.agent) === dn) {
        if (it.clarify) last.clarify = it.clarify
        if (it.content) last.content = (last.content ? last.content + '\n' : '') + it.content
        return acc
      }
      acc.push({ agent: it.agent, content: it.content, ...(it.clarify ? { clarify: it.clarify } : {}) })
      return acc
    }, [])
  }, [items])
  // 展开/折叠：流式中强制展开；完成（streaming true→false）自动折叠为一行；用户可手动切换
  const [open, setOpen] = useState(true)
  const prevStreaming = useRef(streaming)
  // 含澄清选项的条目：完成态也必须展开（用户必须能看到并点击选项）——除非用户手动折叠
  const hasClarify = merged.some(it => !!(it as any).clarify)
  useEffect(() => {
    if (streaming) { setOpen(true); return }
    if (prevStreaming.current && !streaming) setOpen(hasClarify)  // 完成：默认折叠；含澄清则展开
    prevStreaming.current = streaming
  }, [streaming])
  if (merged.length === 0) return null
  const toggle = () => { if (!streaming) setOpen(o => !o) }  // 流式中不响应折叠（保持展开逐字）
  return (
    <div className="reasoning-block">
      <button onClick={toggle} className="flex items-center gap-1 reasoning-title hover:opacity-80 transition-opacity text-left w-full">
        <span className="text-[9px] flex-shrink-0">{open ? '▾' : '▸'}</span>
        <span>思考过程</span>
        {streaming
          ? <span className="ml-1 font-normal text-[10px]">{activeStatus || '思考中…'}</span>
          : <span className="ml-1 font-normal text-[10px] text-dim">已完成</span>}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          {merged.map((it, i) => (
            <div key={i} className="animate-[fadeIn_0.15s_ease]">
              {it.agent && merged.length > 1 && (
                <div className="text-[11px] font-semibold mb-0.5 text-[var(--text)]">{displayAgent(it.agent)}</div>
              )}
              <div className="text-[11px] leading-relaxed text-dim">
                {/* 需求澄清（reasonix 式）：思维链内直接提问，选项点击后同一轮流程内继续 */}
                {(it as any).clarify ? (
                  <div className="flex flex-col gap-1.5 py-1">
                    <p className="text-[11px] font-medium text-[var(--text)]">🤔 {(it as any).clarify.question}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {((it as any).clarify.options as string[]).map(o => (
                        <button key={o} onClick={() => onClarifyPick && onClarifyPick(o)}
                          className="chip text-left text-[11px] px-2.5 py-1 transition-all hover:opacity-80">
                          {o}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => onClarifyPick && onClarifyPick(null)}
                      className="text-[10px] text-dim hover:text-[var(--text)] w-fit">直接生成（跳过澄清）</button>
                  </div>
                ) : streaming ? (
                  <div className="whitespace-pre-wrap break-words">{it.content}</div>
                ) : (
                  <div className="md-think-body" dangerouslySetInnerHTML={{ __html: renderMdCached(it.content) }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

