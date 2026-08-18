import { useState, useEffect, useRef } from 'react'
import { Send, Bot, MessagesSquare, Coins, CheckCircle2, Check, ChevronDown, Upload, Cpu, SlidersHorizontal, AlertTriangle, Search, FileText, LayoutTemplate, Image as ImageIcon, Square, ArrowDownToLine, Timer } from 'lucide-react'
import type { Message, Project } from '../types'
import { LS, lsGet, lsSet, lsGetJSON } from '../storage'
import { api } from '../api'
import AssistantMessage from './chat/AssistantMessage'

/** 档位模式：极速/思考/研究（用户时间-质量期望的表达），与「对话流程」区块一致 */
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

/** 时间范围选项（顶条统计） */
const TIME_LABELS = ['本次', '今天', '本周', '本月', '今年', '总']

/** 取当前生效的主模型 key：厂家专 key 优先，兜底旧 apiKey 字段 */
const getApiKey = () => {
  const prov = lsGet(LS.provider, 'deepseek')
  const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
  return keys[prov] || lsGet(LS.apiKey, '')
}

/** 消息渲染：文件标记段转成卡片，其余文本正常显示 */
const renderContent = function(content: string) {
  const html = content
    .replace(/【用户上传文件: ([^】]+)】[\s\S]*?(?=【用户上传文件:|$)/g,
      '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-hover);border-radius:8px;padding:2px 8px;font-size:12px;color:var(--text-muted);margin:2px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> $1</span>')
    .replace(/\n/g, '<br/>')
  return html
}


interface CenterPanelProps {
  messages: Message[]
  isLoading: boolean
  currentProject: Project | null
  dialogueId?: string | null
  onSendMessage: (text: string, settings?: Record<string, any>) => void
  onStop?: () => void
  /** 未填写主模型 key 时触发（由 App 弹出 key 输入框） */
  onRequestKey?: () => void
  statsCollapsed: boolean
  onToggleStats: () => void
  onOpenSettings?: () => void
  projectInitialized?: boolean
  draft?: string
  analyzeHint?: { label: string; project: string } | null
  onClearAnalyzeHint?: () => void
  onManualSetup?: () => void
  flowStatus?: string
  flowActiveAgent?: string | null
  flowAgents?: string[]
  /** 新对话学情画像合成中：禁用发送（后端 409 兜底） */
  profilePending?: boolean
}

export default function CenterPanel({ messages, isLoading, currentProject, dialogueId, onSendMessage, onStop, onRequestKey, statsCollapsed, onToggleStats, onOpenSettings, projectInitialized, draft, analyzeHint, onClearAnalyzeHint, onManualSetup, flowStatus, flowActiveAgent, flowAgents, profilePending }: CenterPanelProps) {
  const [input, setInput] = useState('')
  // 记忆修改预填：draft 变化时写入输入框（从记忆界面跳转）
  useEffect(() => { if (draft) setInput(draft) }, [draft])
  // 上次会话保存的三条追问（进入对话时展示，抢占注意力）
  const [followups, setFollowups] = useState<string[]>([])
  const loadFollowups = () => {
    if (!dialogueId) { setFollowups([]); return }
    api.getDialogueFollowups(dialogueId)
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
  // 资源生成建议卡片：各消息选中的形式 key（默认全选）+ 已忽略的消息 idx
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
    api.getStats(currentProject.id)
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
      api.fileToText(fd)
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
  const [selectedProvider, setSelectedProvider] = useState(() => lsGet(LS.provider, 'deepseek'))
  const [selectedModel, setSelectedModel] = useState(() => {
    const m = lsGet(LS.model, 'deepseek-v4-flash')
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
    const t = lsGet(LS.template, '思考')
    // 旧模板名映射新档位（兼容历史 localStorage）
    const MAP: Record<string, string> = { '基础': '思考', '检索增强': '思考', '快速': '极速', '输出增强': '思考' }
    const n = MAP[t] || t
    return ['极速', '思考', '研究'].includes(n) ? n : '思考'
  })
  // Auto：AI 根据输入自动选择模板/模式（开启后手动设置按钮禁用）
  const [autoMode, setAutoMode] = useState(() => lsGet(LS.auto, '0') === '1')
  // 模型 Auto：AI 根据输入自动选择模型（模型选择上拉栏内开关）
  const [modelAuto, setModelAuto] = useState(() => lsGet(LS.modelAuto, '0') === '1')
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
  const handleSend = () => {
    if (isLoading) return  // 生成中：发送按钮已变为"停止"，Enter 等途径不触发新消息（避免并行流）
    if (profilePending) return  // 新对话学情画像合成中：禁发（后端 409 兜底）
    const text = input.trim()
    if (!text && attachments.length === 0) return
    // 未填主模型 key：弹框提醒，保留输入不发送
    if (!getApiKey()) { onRequestKey?.(); return }
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
    if (!getApiKey()) { onRequestKey?.(); return }
    onSendMessage(q, {
      template: templateMode,
      auto: autoMode,
      modelAuto: modelAuto,
    })
  }

  /** 资源生成：按能力注册表逐项生成，并保存到「我的上传」 */
  const handleGenerateSpecial = async (keys: string[], content: string) => {
    if (!keys.length || !currentProject) return
    const apiKey = getApiKey()
    if (!apiKey) { onRequestKey?.(); return }
    const prov = lsGet(LS.provider, 'deepseek')
    const baseUrl = prov === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4' : 'https://api.deepseek.com/v1'
    const model = prov === 'zhipu' ? 'glm-4-flash' : 'deepseek-v4-flash'
    const done: string[] = []
    for (const key of keys) {
      try {
        const r = await api.generateResource({ key, content, api_key: apiKey, base_url: baseUrl, model })
        if (r?.status === 'ok' && r.content) {
          await api.saveResource({ name: `生成·${r.label}`, content: r.content, project_id: currentProject.id, type: 'gen:' + key, append: true })
          done.push(r.label)
        }
      } catch {}
    }
    if (done.length) alert(`已生成：${done.join('、')}，已保存到「我的上传」`)
    else alert('资源生成失败，请检查 API Key')
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
                {TIME_LABELS.map(label => (
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
                <AssistantMessage
                  msg={msg}
                  isLoading={isLoading}
                  isLast={idx === messages.length - 1}
                  flowActiveAgent={flowActiveAgent}
                  flowStatus={flowStatus}
                  flowAgents={flowAgents}
                  specialSelectedKeys={specialSel[idx] ?? (msg.special || []).map(x => x.key)}
                  onToggleSpecial={(key) => setSpecialSel(prev => {
                    const cur = prev[idx] ?? (msg.special || []).map(x => x.key)
                    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
                    return { ...prev, [idx]: next }
                  })}
                  specialDismissed={dismissedSpecial.has(idx)}
                  onDismissSpecial={() => setDismissedSpecial(prev => new Set(prev).add(idx))}
                  followups={followups}
                  onSendFollowup={sendFollowup}
                  onManualSetup={onManualSetup}
                  currentProject={currentProject}
                  onGenerateSpecial={handleGenerateSpecial}
                />
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
                        onClick={() => { setTemplateMode(t.name); lsSet(LS.template, t.name); setShowTplMenu(false) }}
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
                      <button onClick={() => { const next = !modelAuto; setModelAuto(next); lsSet(LS.modelAuto, next ? '1' : '0') }}
                        className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${modelAuto ? 'bg-[#1a1a1a]' : 'bg-[#d9d9d9]'}`}
                        title="Auto 开关（自动选择模型）">
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${modelAuto ? 'translate-x-4' : ''}`} />
                      </button>
                    </div>
                    {/* 模型并列平铺（不按厂家分组） */}
                    <div className="flex flex-col gap-0.5">
                      {MODEL_PROVIDERS.flatMap(p => p.models.map(m => ({ name: m, provider: p.id }))).map(x => (
                        <button key={x.name}
                          onClick={() => { setSelectedProvider(x.provider); setSelectedModel(x.name); lsSet(LS.provider, x.provider); lsSet(LS.model, x.name) }}
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
                className={"w-9 h-9 ml-2 flex items-center justify-center rounded-full" + (isLoading ? " bg-red-500 hover:bg-red-600 text-white" : " btn-primary") + (profilePending ? " opacity-40 cursor-not-allowed" : "")}
                title={isLoading ? "停止生成" : (profilePending ? "学情画像生成中，稍候…" : "发送")}
                disabled={profilePending}
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
