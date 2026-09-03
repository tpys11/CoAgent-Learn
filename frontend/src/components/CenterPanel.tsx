import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Bot, MessagesSquare, Coins, CheckCircle2, Check, ChevronDown, Upload, SlidersHorizontal, AlertTriangle, Search, FileText, LayoutTemplate, Image as ImageIcon, Square, ArrowDownToLine, Timer } from 'lucide-react'
import type { Message, Project } from '../types'
import { LS, lsGet, lsSet, lsGetJSON } from '../storage'
import { api } from '../api'
import { resolveAuxCall } from '../models'
import { renderMd } from '../lib/mdRenderer'
import AssistantMessage, { type AssistantMessageProps } from './chat/AssistantMessage'

/** 档位模式：极速/思考/研究（用户时间-质量期望的表达），与「对话流程」区块一致 */
const TEMPLATE_OPTIONS = [
  { name: '极速', desc: '最短响应（1 秒内首字，500-800 字）' },
  { name: '思考', desc: '完整流程 + 轻量单审（800-1200 字）' },
  { name: '研究', desc: '完整流程 + 严格检测（多轮搜索）' },
]

/** 时间范围选项（顶条统计） */
const TIME_LABELS = ['本次', '今天', '本周', '本月', '今年', '总']

/** 取当前生效的主模型 key：厂家专 key 优先，兜底旧 apiKey 字段 */
const getApiKey = () => {
  const prov = lsGet(LS.provider, 'deepseek')
  const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
  return keys[prov] || lsGet(LS.apiKey, '')
}

/** 消息渲染（F8-S5 统一管线）：文件标记段先转占位符，markdown 渲染后回填卡片——
 *  其余文本走统一 markdown 管线（用户粘贴的公式/代码亦可正确显示；html:false 防 XSS）。 */
const _FILE_MARKER_RE = /【用户上传文件: ([^】]+)】[\s\S]*?(?=【用户上传文件:|$)/g
const _escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const _fileCardHtml = (marker: string) => {
  const name = /【用户上传文件: ([^】]+)】/.exec(marker)?.[1] || ''
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg-hover);border-radius:8px;padding:2px 8px;font-size:12px;color:var(--text-muted);margin:2px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${_escapeHtml(name)}</span>`
}
const renderContent = function(content: string) {
  const markers: string[] = []
  const masked = content.replace(_FILE_MARKER_RE, m => {
    markers.push(m)
    return `\n@F8FILE${markers.length - 1}@\n`
  })
  return renderMd(masked).replace(/@F8FILE(\d+)@/g, (_m, i) => _fileCardHtml(markers[Number(i)] || ''))
}

// ---------- B1：props 引用稳定化（memo 生效前提） ----------

// msg.special 默认选中 keys 的引用缓存：以 msg 对象为 key 的 WeakMap——
// 历史消息 msg 引用稳定（useChatStream 排水只替换末条）→ 派生数组引用稳定，
// 不再每次渲染新建数组打穿 memo（原 :356 行为等价：优先取用户勾选，缺省全选）。
const _defaultSpecialKeys = new WeakMap<object, string[]>()
// 非末条消息的 followups 常量（isLast 分支才消费；模块级常量保证引用恒定）
const _EMPTY_FOLLOWUPS: string[] = []

// ---------- B2：列表窗口化（视口附近全渲染，其余等高占位） ----------
// 陷阱防线：
//  - idx 语义：map 仍遍历全量 messages，占位行只是空 div，idx 恒为全量下标
//    （specialSel / dismissedSpecial / 追问三处状态数组按 idx 寻址不受影响）；
//  - 粘底：占位区只在「上滚展开」时变化，流式期窗口冻结、占位静态，
//    scrollHeight 只随尾部真实内容增长 → 8px 粘底判定与窗口化前等价；
//  - 窗口冻结：流式追加（len 单调 +1~2）绝不把已物化消息打回占位（否则
//    scrollHeight 中途变化 = 滚动条跳动 + 视口漂移）。
const WINDOW_N = 12          // 完整渲染的窗口条数（末尾恒在窗口内）
const WINDOW_STEP = 8        // 上滚展开批次
const EST_MSG_HEIGHT = 120   // 占位估算高度（px，实测中位水平）

/** 导出仅供测试（isFlowNode 同模式）：窗口起点随消息数变化的转移函数。
 *  len≤n 不开窗；批量载入（跳变 > step）或收缩（切对话/删消息）→ 重置为末尾 n 条；
 *  流式追加 → 冻结现值。 */
export function nextWindowStart(prevStart: number, prevLen: number, len: number, n: number, step: number): number {
  if (len <= n) return 0
  if (len > prevLen + step || len < prevLen) return Math.max(0, len - n)
  return prevStart
}
/** 导出仅供测试（isFlowNode 同模式） */
export const specialKeysOf = (msg: Message): string[] => {
  let keys = _defaultSpecialKeys.get(msg)
  if (!keys) {
    keys = (msg.special || []).map(x => x.key)
    _defaultSpecialKeys.set(msg, keys)
  }
  return keys
}

/** 导出仅供测试（isFlowNode 同模式）：逐消息 props 推导——渲染路径 map 内同样
 *  走本函数（spread 到 AssistantMessage），保证稳定性测试钉住的就是真实接线。
 *  同输入两次调用，返回的每个 prop 引用逐个 Object.is 相等 → memo 浅比较可
 *  跳过历史消息；流式期仅末条 msg 引用随帧变化 → 重渲染精确限制在 1 条。 */
export function buildMessageProps(
  msg: Message,
  idx: number,
  total: number,
  ctx: {
    isLoading: boolean
    flowActiveAgent: string | null | undefined
    flowStatus: string | undefined
    flowAgents: string[] | undefined
    specialSel: Record<number, string[]>
    dismissedSpecial: Set<number>
    followups: string[]
    onToggleSpecial: (msgIndex: number, key: string) => void
    onDismissSpecial: (msgIndex: number) => void
    onSendFollowup: (q: string) => void
    onManualSetup: (() => void) | undefined
    currentProject: Project | null
    onGenerateSpecial: ((keys: string[], content: string) => void) | undefined
  },
): AssistantMessageProps {
  // isLoading / flowActiveAgent / flowStatus / flowAgents / followups 仅在
  // streaming 或 isLast 分支被消费——非末条一律传常量：isLoading 翻转、step
  // 切换、追问加载完成都不再打穿历史消息的 memo（末条身份变更时 isLast 翻转
  // 本身已触发那一次重渲染，语义无损）。
  const isLast = idx === total - 1
  return {
    msg,
    msgIndex: idx,
    isLoading: isLast ? ctx.isLoading : false,
    isLast,
    flowActiveAgent: isLast ? ctx.flowActiveAgent : undefined,
    flowStatus: isLast ? ctx.flowStatus : undefined,
    flowAgents: isLast ? ctx.flowAgents : undefined,
    specialSelectedKeys: ctx.specialSel[idx] ?? specialKeysOf(msg),
    onToggleSpecial: ctx.onToggleSpecial,
    specialDismissed: ctx.dismissedSpecial.has(idx),
    onDismissSpecial: ctx.onDismissSpecial,
    followups: isLast ? ctx.followups : _EMPTY_FOLLOWUPS,
    onSendFollowup: ctx.onSendFollowup,
    onManualSetup: ctx.onManualSetup,
    currentProject: ctx.currentProject,
    onGenerateSpecial: ctx.onGenerateSpecial,
  }
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
  // B2：窗口起点——其上为等高占位，其下全渲染。onScroll 闭包一次性注册，经 ref 读最新值
  const [winStart, setWinStart] = useState(0)
  const winStartRef = useRef(0)
  winStartRef.current = winStart
  const expandingRef = useRef(false)
  const prevLenRef = useRef(0)
  const firstRenderedRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    setWinStart(s => nextWindowStart(s, prevLenRef.current, messages.length, WINDOW_N, WINDOW_STEP))
    prevLenRef.current = messages.length
  }, [messages])
  // B2：上滚展开一批（接近已物化区顶部时），以 scrollHeight 差值锚定视口防跳动。
  // 展开后若视口顶部仍贴近首条已渲染行（用户已顶到 scrollTop≈0，不再产生滚动
  // 事件）→ 链式继续展开，直到边界离开 600px 或占位清零。
  const expandWindow = () => {
    if (winStartRef.current <= 0 || expandingRef.current) return
    expandingRef.current = true
    const el = msgScrollRef.current
    const before = el?.scrollHeight ?? 0
    setWinStart(s => Math.max(0, s - WINDOW_STEP))
    requestAnimationFrame(() => {
      const el2 = msgScrollRef.current
      if (el2) el2.scrollTop += el2.scrollHeight - before
      const top = firstRenderedRef.current?.offsetTop
      if (el2 && winStartRef.current > 0 && top !== undefined && el2.scrollTop < top - 600) {
        expandingRef.current = false
        expandWindow()
        return
      }
      expandingRef.current = false
    })
  }
  // 资源生成建议卡片：各消息选中的形式 key（默认全选）+ 已忽略的消息 idx
  const [specialSel, setSpecialSel] = useState<Record<number, string[]>>({})
  const [dismissedSpecial, setDismissedSpecial] = useState<Set<number>>(new Set())
  // B1：全量 messages 的最新引用——稳定回调内按 idx 取当届消息，闭包不捕获数组
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // B1：特殊建议回调做成全局稳定引用（目标消息 idx 作参数传入）——memo 生效前提；
  // 默认全选 keys 从 messagesRef 现取当届消息，语义与原内联闭包一致
  const handleToggleSpecial = useCallback((msgIndex: number, key: string) => {
    setSpecialSel(prev => {
      const cur = prev[msgIndex] ?? specialKeysOf(messagesRef.current[msgIndex])
      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
      return { ...prev, [msgIndex]: next }
    })
  }, [])
  const handleDismissSpecial = useCallback((msgIndex: number) => {
    setDismissedSpecial(prev => new Set(prev).add(msgIndex))
  }, [])
  // B1：App 传入的 onManualSetup 是内联箭头（App 每帧重建）→ latest-ref 包一层，
  // 引用恒定且总是调用最新版本，语义不变
  const onManualSetupRef = useRef(onManualSetup)
  onManualSetupRef.current = onManualSetup
  const stableManualSetup = useCallback(() => { onManualSetupRef.current?.() }, [])
  useEffect(() => {
    const el = msgScrollRef.current
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = dist < 8
      setShowJumpBottom(dist > 160)
      // B2：视口顶部接近首条已渲染消息（<600px）→ 展开一批更早的消息。
      // 必须用「相对首条已渲染行」的判定：占位区可高达数千 px，绝对 scrollTop
      // 阈值在长历史下永远够不到。
      const top = firstRenderedRef.current?.offsetTop
      if (top !== undefined && el.scrollTop < top - 600) expandWindow()
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
  // 档位上拉框
  const [showTplMenu, setShowTplMenu] = useState(false)
  const tplRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (tplRef.current && !tplRef.current.contains(e.target as Node)) setShowTplMenu(false)
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
    })
    setInput('')
    setAttachments([])
  }

  // B1：sendFollowup / handleGenerateSpecial 的最新上下文引用——deps 里只要出现
  // App 传入的内联回调或低频状态，useCallback 就会逐帧换引用打穿 memo；改走
  // 空依赖 + latest-ref，引用恒定且行为（读当届值）不变
  const followCtxRef = useRef({ onSendMessage, onRequestKey, templateMode, autoMode, currentProject })
  followCtxRef.current = { onSendMessage, onRequestKey, templateMode, autoMode, currentProject }

  const sendFollowup = useCallback((q: string) => {
    const c = followCtxRef.current
    if (!getApiKey()) { c.onRequestKey?.(); return }
    c.onSendMessage(q, {
      template: c.templateMode,
      auto: c.autoMode,
    })
  }, [])

  /** 资源生成：按能力注册表逐项生成，并保存到「我的上传」 */
  const handleGenerateSpecial = useCallback(async (keys: string[], content: string) => {
    const c = followCtxRef.current
    if (!keys.length || !c.currentProject) return
    const apiKey = getApiKey()
    if (!apiKey) { c.onRequestKey?.(); return }
    const prov = lsGet(LS.provider, 'deepseek')
    // R-D S5：辅助调用改走注册表镜像（后端 S3 已改注册表决策，base_url/model 传参降级为自洽值）
    const aux = resolveAuxCall(prov, lsGet(LS.zenBaseUrl, ''), lsGet(LS.goBaseUrl, ''))
    const done: string[] = []
    for (const key of keys) {
      try {
        const r = await api.generateResource({ key, content, api_key: apiKey, base_url: aux.base_url, model: aux.model })
        if (r?.status === 'ok' && r.content) {
          await api.saveResource({ name: `生成·${r.label}`, content: r.content, project_id: c.currentProject.id, type: 'gen:' + key, append: true })
          done.push(r.label)
        }
      } catch {}
    }
    if (done.length) alert(`已生成：${done.join('、')}，已保存到「我的上传」`)
    else alert('资源生成失败，请检查 API Key')
  }, [])

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

          {/* 消息列表：用户色块靠右，AI 正文流。
              B1：props 统一经 buildMessageProps 推导（引用稳定）→ memo 跳过历史消息。
              B2：winStart 之上为等高占位（map 仍遍历全量数组，idx 恒为全量下标）。 */}
          {messages.map((msg, idx) => (
            idx < winStart ? (
              <div key={idx} data-placeholder="1" aria-hidden style={{ height: EST_MSG_HEIGHT, flexShrink: 0 }} />
            ) :
            msg.role === 'user' ? (
              <div key={idx} ref={idx === winStart ? (n => { firstRenderedRef.current = n }) : undefined} className="self-end max-w-[75%] card-surface px-4 py-3 text-sm leading-relaxed" style={{ borderBottomRightRadius: 6 }}>
                <div dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }} />
              </div>
            ) : (
              <div key={idx} ref={idx === winStart ? (n => { firstRenderedRef.current = n }) : undefined} className="w-full text-sm leading-7 animate-[fadeIn_0.25s_ease]">
                <AssistantMessage {...buildMessageProps(msg, idx, messages.length, {
                  isLoading,
                  flowActiveAgent,
                  flowStatus,
                  flowAgents,
                  specialSel,
                  dismissedSpecial,
                  followups,
                  onToggleSpecial: handleToggleSpecial,
                  onDismissSpecial: handleDismissSpecial,
                  onSendFollowup: sendFollowup,
                  onManualSetup: stableManualSetup,
                  currentProject,
                  onGenerateSpecial: handleGenerateSpecial,
                })} />
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
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".txt,.md,.py,.js,.ts,.json,.csv,.html,.css,.log,.yaml,.yml,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp" />
              <button onClick={() => fileInputRef.current && fileInputRef.current.click()} title="上传文件"
                className="w-8 h-8 flex items-center justify-center rounded-xl icon-btn border border-[var(--border-strong)] bg-[var(--bg-input)]">
                <Upload size={15} />
              </button>
              {/* 档位选择（豆包式：胶囊显示当前档位 + 弹出选项面板） */}
              <span className="flex-1" />
              <div className="relative" ref={tplRef}>
                <button
                  onClick={() => setShowTplMenu(!showTplMenu)}
                  className="h-7 px-2.5 rounded-full text-[11px] flex items-center gap-1.5 border border-[var(--border-strong)] bg-[var(--bg-input)] hover:bg-[var(--bg-hover)] transition-colors"
                  title="选择档位（极速/思考/研究）">
                  <LayoutTemplate size={13} /> {templateMode} <ChevronDown size={10} />
                </button>
                {showTplMenu && (
                  <div className="absolute bottom-full right-0 mb-1.5 card-lift p-1.5 z-10 flex flex-col gap-0.5" style={{ width: 120 }}>
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
