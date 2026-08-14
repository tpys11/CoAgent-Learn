import { useState, useCallback, useRef, useEffect } from 'react'
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react'

// 模块级 session：页面刷新(JS重载)时重新生成一次；组件重挂载不改变
const SESSION_ID = (() => {
  const s = Math.random().toString(36).slice(2) + Date.now().toString(36)
  sessionStorage.setItem('coagent-s', s)
  return s
})()
import ProjectSidebar from './components/ProjectSidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import SettingsModal, { ApiKeyPrompt } from './components/SettingsModal'
import ProjectConfigModal from './components/ProjectConfigModal'
import ObsidianView from './components/ObsidianView'
import HomeView from './components/HomeView'
import ProfileWizard from './components/ProfileWizard'
import GuideModal from './components/GuideModal'
import ActivityBar, { type ViewKey } from './components/ActivityBar'
import TutorialView from './components/TutorialView'
import ResourceView from './components/ResourceView'
import MemoryView from './components/MemoryView'
import KnowledgeView from './components/KnowledgeView'
import AgentsView from './components/AgentsView'
import IntroPanel from './components/IntroPanel'
import { initTheme } from './theme'
import type { Project, Dialogue, AgentConfig, Message } from './types'
import { DEFAULT_AGENTS } from './types'

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
// 项目 ID 固定：首次生成后存 localStorage，刷新复用（保证知识库/图谱数据不因刷新丢失）
const defaultProjectId = (() => {
  const k = 'coagent-default-project'
  const old = localStorage.getItem(k)
  if (old) return old
  const nid = generateId()
  localStorage.setItem(k, nid)
  return nid
})()

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(null)
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({})
  const currentMessages = (currentDialogueId ? allMessages[currentDialogueId] : []) || []

  // 静态创建课程引导（新建课程后直接进入对话展示）
  const PROJECT_GUIDE = (name: string) => `🎓 **课程创建成功！**

已经为你创建课程「${name}」，接下来花一分钟完善它：

**1. 命名**：想叫什么名字？直接告诉我，例如「Python 数据分析实战」
**2. 简述**：一句话说说课程目标——你想最终学会什么？
**3. 上传资源**：在「资源」界面上传相关资料/文档，我会基于这些资料讲解
**4. 上传目的**：告诉我学习目的（求职 / 兴趣 / 考试 / 项目需要…），我会调整讲解的深度与方式
**5. 时间**：每周能投入多少时间？学习周期打算多长？

从第 1 项开始回复我即可，我会一步步帮你完善这门课程。`
  const [isLoading, setIsLoading] = useState(false)
  const [agents, setAgents] = useState<AgentConfig[]>(() => {
    // 项目介绍 Agent 设定持久化：用户编辑后刷新保留（缺省用内置 DEFAULT_AGENTS）
    try {
      const s = localStorage.getItem('coagent-agents')
      if (s) {
        const arr = JSON.parse(s)
        if (Array.isArray(arr) && arr.length > 0 && arr.every((a: any) => a && typeof a === 'object' && a.id)) return arr as AgentConfig[]
      }
    } catch { /* 忽略损坏数据 */ }
    return DEFAULT_AGENTS
  })
  const [showSettings, setShowSettings] = useState(false)
  // 项目配置弹窗（Sidebar 项目三点进入：项目记忆 / 项目资源）
  const [showProjectConfig, setShowProjectConfig] = useState(false)
  // 初次创建手动填写模式（仅首次可手动填写，保存后标记完成）
  const [manualSetupOnly, setManualSetupOnly] = useState(false)
  // 弹窗默认页签（记忆与进程 / 资源）
  const [projectConfigTab, setProjectConfigTab] = useState<'memory' | 'resource'>('memory')
  const [projectKBId, setProjectKBId] = useState<string | null>(null)
  const [wizard, setWizard] = useState<{mode: 'project'|'dialogue'; id: string; name?: string} | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [view, setView] = useState<ViewKey>('chat')
  // 主页模式：view=chat 时默认显示主页（按项目展开），进入项目后才显示对话界面
  const [chatOpen, setChatOpen] = useState(false)
  // 记忆修改预填：从记忆界面跳转时，输入框以 [模块名] 引用并提示补充想法
  const [prefillInput, setPrefillInput] = useState('')
  // 项目记忆分析持久提示：从记忆界面跳转对话时显示（label 区分分析/修改基本情况）
  const [analyzeHint, setAnalyzeHint] = useState<{ label: string; project: string } | null>(null)
  // 首次进入：弹出项目介绍面板（localStorage 标记，只弹一次）
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('coagent-intro-seen'))
  // 启动时应用保存的字体大小与主题（system 模式自动解析亮暗）
  useEffect(() => {
    const saved = localStorage.getItem('coagent-fontSize')
    if (saved) document.documentElement.style.setProperty('--ui-font', saved + 'px')
    initTheme()
  }, [])

  // 从后端加载项目/对话（持久化）
  useEffect(() => {
    let cancelled = false
    fetch('/api/projects')
      .then(r => r.json())
      .then(async (d) => {
        if (cancelled) return
        const projs: Project[] = (d.projects || []).map((p: any) => ({ id: p.id, name: p.name, domain: p.domain || '' }))
        setProjects(projs)
        // 加载每个项目下的对话
        const allD: Dialogue[] = []
        for (const p of projs) {
          const r2 = await fetch('/api/projects/' + p.id + '/dialogues')
          const d2 = await r2.json()
          ;(d2.dialogues || []).forEach((dd: any) => allD.push({ id: dd.id, name: dd.name, projectId: p.id, createdAt: dd.created_at || '', archived: false }))
        }
        if (cancelled) return
        setDialogues(allD)
        // 默认选中第一个项目
        if (projs.length > 0) {
          setCurrentProjectId(projs[0].id)
          const first = allD.find(d => d.projectId === projs[0].id)
          if (first) {
            setCurrentDialogueId(first.id)
            // 加载默认对话的历史消息
            fetch('/api/dialogues/' + first.id + '/messages', { cache: 'no-store' })
              .then(r => r.json()).then(dm => {
                if (cancelled) return
                const msgs = (dm.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
                setAllMessages(prev => ({ ...prev, [first.id]: msgs }))
              }).catch(() => {})
          }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(
    () => !localStorage.getItem('coagent-apikey') && !localStorage.getItem('coagent-apikey-skipped')
  )
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(390)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [flowAgents, setFlowAgents] = useState<string[]>([])
  const [flowActiveAgent, setFlowActiveAgent] = useState<string | null>(null)
  // 当前对话状态文案（等待模型响应/正在规划/正在阅读/正在思考/正在审核…）
  const [flowStatus, setFlowStatus] = useState('')
  // 需求澄清（reasonix 式）：澄清条目直接写进思维链（"学习助手·规划"下弹选项），选择后同一轮流程内继续
  const clarifyContinueRef = useRef(false)
  // 最近一次发送的用户消息（澄清选项点击后拼回原问题继续）
  const lastUserMsgRef = useRef('')
  const [flowMindchain, setFlowMindchain] = useState<Array<{agent: string; content: string}>>([])
  const mindchainRef = useRef<Array<{agent: string; content: string}>>([])
  const activeDidRef = useRef<string | null>(null)
  // 本次回答是否已通过 answer_token 流式显示（是则 done 后直接替换，不二次打字机）
  const streamedRef = useRef(false)
  // 流式渲染节奏（rAF 帧循环）：token 到达只累积，每帧 flush 一次——渲染固定在帧边界，
  // 消除"网络批量到达 + React 自动批处理"导致的回答一段一段出现
  const pendingAnswerRef = useRef('')
  const pendingMindRef = useRef<{ agent: string; char: string } | null>(null)
  const rafScheduledRef = useRef(false)
  // 手动停止：abort 控制器 + 用户停止标记 + 生成请求 id（POST /api/chat/stop 通知后端取消生成）
  const abortCtrlRef = useRef<AbortController | null>(null)
  const userStoppedRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  // 围栏状态机（后端拆字推送后，``` 围栏逐字到达）：围栏内内容丢弃
  const fenceBufRef = useRef('')
  const fenceInRef = useRef(false)
  const sessionId = useRef(SESSION_ID)
  // 第二对话 id：App 持有（主对话完成后为它生成横向拓展追问），传给 RightPanel 使用
  const secondDialogueIdRef = useRef('sd-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  const dragging = useRef<'left' | 'right' | 'flow' | null>(null)
  const appRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current === 'left') setSidebarWidth(Math.max(180, Math.min(400, e.clientX - 64)))
      if (dragging.current === 'right') setRightPanelWidth(Math.max(180, Math.min(400, window.innerWidth - e.clientX - 8)))
    }
    const onMouseUp = () => {
      dragging.current = null
      if (appRef.current) appRef.current.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [])

  const currentProject = projects.find(p => p.id === currentProjectId) ?? null
  const handleCreateProject = useCallback((name: string) => {
    (async () => {
      try {
        const r = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        const d = await r.json()
        const id = d.id
        setProjects(prev => [...prev, { id, name, simple: false }])
        setCurrentProjectId(id)
        // 创建默认对话并直接进入对话界面，对话内展示静态创建课程引导（命名/简述/资源/目的/时间）
        const did = generateId()
        const dia: Dialogue = { id: did, name: '对话 1', projectId: id, createdAt: new Date().toISOString(), archived: false }
        setDialogues(prev => [...prev, dia])
        setCurrentDialogueId(did)
        setAllMessages(prev => ({ ...prev, [did]: [{ role: 'assistant' as const, content: PROJECT_GUIDE(name) }] }))
        // 落库：对话 + 静态引导消息（刷新后保留）
        fetch('/api/dialogues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: id, name: dia.name, id: did }) }).catch(() => {})
        fetch('/api/dialogues/' + did + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'assistant', content: PROJECT_GUIDE(name) }) }).catch(() => {})
        setChatOpen(true)
      } catch (e) {
        alert('创建课程失败：' + ((e as any)?.message || '网络异常') + '，请检查后端服务。')
      }
    })()
  }, [])
  const handleDeleteProject = useCallback((id: string) => {
    // 删除确认由前端弹窗承担（主页删除弹窗已提示后果）
    fetch('/api/projects/' + id, { method: 'DELETE' })
      .then(() => {
        setProjects(prev => prev.filter(p => p.id !== id))
        setDialogues(prev => prev.filter(d => d.projectId !== id))
        if (currentProjectId === id) { setCurrentProjectId(projects.find(p => p.id !== id)?.id ?? null); setCurrentDialogueId(null) }
      })
  }, [currentProjectId, projects])
  const handleRenameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    // 持久化到后端（PATCH）
    fetch('/api/projects/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).catch(() => {})
  }, [])

  const handleSelectProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    const first = dialogues.find(d => d.projectId === id && !d.archived)
    if (first) setCurrentDialogueId(first.id)
  }, [dialogues])

  const handleProjectKB = useCallback((id: string) => {
    setProjectKBId(id)
    setShowProjectConfig(true)
  }, [])

  const handleCreateDialogue = useCallback((projectId: string) => {
    const count = dialogues.filter(d => d.projectId === projectId && !d.archived).length
    const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId, createdAt: new Date().toISOString(), archived: false }
    setDialogues(prev => [...prev, d])
    setCurrentDialogueId(d.id)
    setAllMessages(prev => ({ ...prev, [d.id]: [] }))
    // 落库：后端创建对话（刷新后保留）
    fetch('/api/dialogues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, name: d.name, id: d.id }) }).catch(() => {})
    // 无画像（[简]）项目：不弹对话画像向导
    const proj = projects.find(p => p.id === projectId)
    if (!(proj && proj.simple)) {
      setWizard({ mode: 'dialogue', id: d.id, name: d.name })
    }
  }, [dialogues, projects])
  const loadDialogueMessages = useCallback((id: string) => {
    fetch('/api/dialogues/' + id + '/messages', { cache: 'no-store' })
      .then(r => r.json()).then(d => {
        const msgs = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
        setAllMessages(prev => ({ ...prev, [id]: msgs }))
      }).catch(() => {})
  }, [])
  const handleSelectDialogue = useCallback((id: string) => {
    setCurrentDialogueId(id); setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = []
    loadDialogueMessages(id)
  }, [loadDialogueMessages])
  const handleArchiveDialogue = useCallback((id: string) => {
    if (!window.confirm('确定归档该对话？')) return
    // 软归档（与自动清理一致），侧栏不再显示
    fetch('/api/dialogues/' + id + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })
      .then(() => {
        setDialogues(prev => prev.map(d => d.id === id ? { ...d, archived: true } : d))
        if (currentDialogueId === id) setCurrentDialogueId(null)
      })
  }, [currentDialogueId])
  const handleRenameDialogue = useCallback((id: string, name: string) => {
    if (name.trim()) {
      setDialogues(prev => prev.map(d => d.id === id ? { ...d, name: name.trim() } : d))
      // 持久化到后端（POST /update {name}）
      fetch('/api/dialogues/' + id + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).catch(() => {})
    }
  }, [])
  // 对话删除：自定义确认弹窗（删除此处的对话记忆；课程记忆与生成的资源保留）
  const [deleteDialogueTarget, setDeleteDialogueTarget] = useState<{ id: string; name: string } | null>(null)
  const handleDeleteDialogue = useCallback((id: string) => {
    const d = dialogues.find(x => x.id === id)
    setDeleteDialogueTarget({ id, name: (d && d.name) || '对话' })
  }, [dialogues])
  const confirmDeleteDialogue = useCallback(() => {
    const t = deleteDialogueTarget
    if (!t) return
    setDeleteDialogueTarget(null)
    fetch('/api/dialogues/' + t.id, { method: 'DELETE' })
      .then(() => {
        setDialogues(prev => prev.filter(d => d.id !== t.id))
        setAllMessages(prev => { const n = { ...prev }; delete n[t.id]; return n })
        if (currentDialogueId === t.id) setCurrentDialogueId(null)
      })
      .catch(() => {})
  }, [deleteDialogueTarget, currentDialogueId])
  /** 记忆修改：跳转主对话界面，输入框预填 [模块名] 引用 + 修改引导（可指定项目） */
  const handleRequestModify = (label: string, pid?: string) => {
    setShowProjectConfig(false)
    if (pid) setCurrentProjectId(pid)
    setPrefillInput(`[${label}] 请帮我分析并修改这个记忆模块，我的想法：`)
    setView('chat')
    setChatOpen(true)
  }

  /** 项目记忆重新分析：跳转对话界面，显示持久提示「项目记忆分析」 */
  const handleRequestAnalyze = (projectName: string) => {
    setShowProjectConfig(false)
    setAnalyzeHint({ label: '项目记忆分析', project: projectName })
    setView('chat')
    setChatOpen(true)
  }

  const handleViewChange = (v: ViewKey) => {
    setView(v)
    if (v === 'chat') setChatOpen(false) // 点「主页」回到主页
  }

  /** 替换最后一条 assistant 消息：发送时插入的空占位（content=''）被结果替换，避免重复气泡。
   * 极速档的 answer_token 会先流式把占位 content 填满，done 时仍是同一条 → 必须原地替换而非 push */
  const upsertLastAssistant = (prev: Message[], msg: Message) => {
    const arr = [...prev]
    const last = arr[arr.length - 1]
    if (last && last.role === 'assistant') {
      arr[arr.length - 1] = msg
    } else {
      arr.push(msg)
    }
    return arr
  }
  // 每帧 flush 一次累积的流式字符（回答正文 + 思维链），渲染节奏固定在 rAF 帧边界
  const flushStreamPending = () => {
    rafScheduledRef.current = false
    const pa = pendingAnswerRef.current
    if (pa) {
      pendingAnswerRef.current = ''
      setAllMessages(prev => {
        const arr = prev[activeDidRef.current || ''] || []
        const lastMsg = arr[arr.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, content: (lastMsg.content || '') + pa }] }
        }
        return prev
      })
    }
    const pm = pendingMindRef.current
    if (pm) {
      pendingMindRef.current = null
      setFlowMindchain(prev => {
        const last = prev[prev.length - 1]
        const next = (last && last.agent === pm.agent)
          ? [...prev.slice(0, -1), { agent: pm.agent, content: last.content + pm.char }]
          : [...prev, { agent: pm.agent, content: pm.char }]
        mindchainRef.current = next
        return next
      })
      setAllMessages(prev => {
        const arr = prev[activeDidRef.current || ''] || []
        const lastMsg = arr[arr.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
          return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, think: mindchainRef.current }] }
        }
        return prev
      })
    }
  }
  const scheduleStreamFlush = () => {
    if (rafScheduledRef.current) return
    rafScheduledRef.current = true
    requestAnimationFrame(flushStreamPending)
  }

  const handleSendMessage = useCallback(async (text: string, settings?: Record<string, any>) => {
    let did = currentDialogueId
    // 澄清继续模式：复用当前占位消息继续（不新建消息、不清空思维链），流程在同一轮内衔接
    const continuing = clarifyContinueRef.current
    clarifyContinueRef.current = false
    lastUserMsgRef.current = text.trim()
    if (!did && currentProjectId) {
      // 自动创建对话
      const count = dialogues.filter(d => d.projectId === currentProjectId && !d.archived).length
      const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId: currentProjectId, createdAt: new Date().toISOString(), archived: false }
      setDialogues(prev => [...prev, d])
      did = d.id
      setCurrentDialogueId(d.id)
      // 对话自动清理：保留最近 N 条未归档对话（设置里可配，0=关闭）
      try {
        const lim = parseInt(localStorage.getItem('coagent-dialogue-limit') || '0', 10)
        if (lim > 0) {
          const active = dialogues.filter(x => x.projectId === currentProjectId && !x.archived)
          const excess = active.length - (lim - 1)
          if (excess > 0) {
            const sorted = [...active].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
            sorted.slice(0, excess).forEach(x => {
              fetch('/api/dialogues/' + x.id + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) }).catch(() => {})
              setDialogues(prev => prev.map(y => y.id === x.id ? { ...y, archived: true } : y))
            })
          }
        }
      } catch {}
    }
    if (!did) return
    if (!continuing) {
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'user', content: text }] }))
      // 立即插入空 assistant 占位：界面马上显示"思考中…"，结果到达后替换（思维链实时展示于底部卡片）
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '' }] }))
    }
    setIsLoading(true)
    if (!continuing) { setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = [] }
    setFlowStatus('正在等待模型响应…')
    setFlowActiveAgent(null)
    streamedRef.current = false
    userStoppedRef.current = false
    requestIdRef.current = null
    fenceBufRef.current = ''
    fenceInRef.current = false
    activeDidRef.current = did || null
    // 自动命名：对话名为「对话 N」时，按首条消息内容改名
    const curDlg = dialogues.find(d => d.id === did)
    if (curDlg && /^对话 \d+$/.test(curDlg.name)) {
      const nm = text.trim().slice(0, 14) || curDlg.name
      fetch('/api/dialogues/' + did + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nm }) }).catch(() => {})
      setDialogues(prev => prev.map(x => x.id === did ? { ...x, name: nm } : x))
    }
    let timeoutTimer: any = null
    try {
      // 读取所选模型厂家配置
      const provKeys = (() => { try { return JSON.parse(localStorage.getItem('coagent-provider-keys') || '{}') } catch { return {} } })()
      const provider = localStorage.getItem('coagent-provider') || 'deepseek'
      const model = (() => {
        // DeepSeek 官方模型名已升级 v4：兼容 localStorage 里的旧值（deepseek-chat/reasoner/pro/flash）
        const m = localStorage.getItem('coagent-model') || 'deepseek-v4-pro'
        const alias: Record<string, string> = {
          'deepseek-chat': 'deepseek-v4-pro',
          'deepseek-reasoner': 'deepseek-v4-pro',
          'deepseek-pro': 'deepseek-v4-pro',
          'deepseek-flash': 'deepseek-v4-flash',
        }
        return alias[m] || m
      })()
      const providerBaseUrls: Record<string, string> = {
        deepseek: 'https://api.deepseek.com/v1',
        openai: 'https://api.openai.com/v1',
        qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        zhipu: 'https://open.bigmodel.cn/api/paas/v4',
        moonshot: 'https://api.moonshot.cn/v1',
        doubao: 'https://ark.cn-beijing.volces.com/api/v3',
      }
      const apiKey = provKeys[provider] || localStorage.getItem('coagent-apikey') || undefined
      // 合并设置：上下文(历史条数/记忆层级/打字机) + 对话后动作(自动保存/追问) + 上次设置 + 本次设置
      const ctxSettings = (() => { try { return JSON.parse(localStorage.getItem('coagent-context-settings') || '{}') } catch { return {} } })()
      // 上下文策略固定：流式逐字输出 / 历史 10 条 / 记忆 L2（不随 localStorage 旧值变化）
      ctxSettings.typing = true
      ctxSettings.historyLimit = 10
      ctxSettings.memoryLayer = 'L2'
      const postActions = (() => { try { return JSON.parse(localStorage.getItem('coagent-post-actions') || '{}') } catch { return {} } })()
      const lastSettings = (() => { try { return JSON.parse(localStorage.getItem('coagent-last-settings') || '{}') } catch { return {} } })()
      const mergedSettings = { ...ctxSettings, ...postActions, ...lastSettings, ...(settings || {}) }
      try { localStorage.setItem('coagent-last-settings', JSON.stringify(mergedSettings)) } catch {}
      // 超时：首字节超时（无任何数据到达 timeoutMs 则中止）+ 流中空闲超时（每收到数据重置，60s 无数据才断）
      const timeoutMs = (Math.min(120, Math.max(1, parseInt(localStorage.getItem('coagent-timeout') || '30', 10) || 30))) * 1000
      const ctrl = new AbortController()
      abortCtrlRef.current = ctrl
      let firstByte = true
      const resetTimer = () => {
        clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(() => ctrl.abort(), firstByte ? timeoutMs : 60000)
      }
      resetTimer()
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), session_id: sessionId.current, dialogue_id: did, project_id: currentProjectId, api_key: apiKey, model: model, base_url: providerBaseUrls[provider], settings: mergedSettings, image: (mergedSettings && mergedSettings.image) || undefined, agents: agents, extra_followup_did: secondDialogueIdRef.current, extra_followup_focus: 'expand', clarified: continuing }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '⚠️ 请求失败（HTTP ' + res.status + '），请检查后端服务与 API Key。' }] }))
        return
      }
      const reader = res.body!.getReader(); const decoder = new TextDecoder()
      let finalReply = ''; const steps: any[] = []; let taskStats: any = null; let flowError = ''
      // 特殊形式输出建议（模型判断）：done 事件注入，随最终消息展示
      let special: Array<{ key: string; label: string }> = []
      var _buf=""
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        resetTimer()
        if (firstByte && value && value.length) firstByte = false
        _buf+=decoder.decode(value,{stream:true})
        var _lines=_buf.split(String.fromCharCode(10))
        _buf=_lines.pop()||""
        for (const line of _lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.type === 'start') { requestIdRef.current = data.request_id || null; continue }
          if (data.type === 'clarify') {
            // 需求澄清（reasonix 式）：把澄清问题+选项写进思维链"学习助手·规划"条目（不结束流程、不删占位消息）；
            // 用户点选项后同一轮流程内继续（复用占位消息与思维链）
            const item: any = { agent: '学习助手·规划', content: '', clarify: { question: data.question || '请明确你的需求', options: Array.isArray(data.options) ? data.options : [] } }
            setFlowMindchain(prev => { const next = [...prev, item]; mindchainRef.current = next; return next })
            setAllMessages(prev => {
              const arr = [...(prev[did || ''] || [])]
              const last = arr[arr.length - 1]
              if (last && last.role === 'assistant' && last.content === '') {
                arr[arr.length - 1] = { ...last, think: mindchainRef.current }
              }
              return { ...prev, [did || '']: arr }
            })
            continue
          }
          if (data.type === 'error') {
            flowError = data.message || '请求出错'
            continue
          }
          if (data.type === 'step') {
            setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
            setFlowActiveAgent(data.agent)
            // 状态文案（纯动作，显示在思维链中该 Agent 标题后面）
            if (data.agent === '学习助手·规划') {
              setFlowStatus('正在规划…')
            } else if (data.agent === '学习助手·生成') {
              setFlowStatus('正在思考生成…')
            } else if (data.agent === '学情与记忆管理') {
              setFlowStatus('正在阅读记忆…')
            } else if (data.agent === '知识库管理') {
              setFlowStatus('正在检索知识库…')
            } else if (data.agent === '审核') {
              setFlowStatus('正在审核…')
            } else {
              setFlowStatus('处理中…')
            }
            // Agent 标题立即出现在思维链（内容由后续 thought_token 逐字填充）
            setFlowMindchain(prev => {
              const last = prev[prev.length - 1]
              if (last && last.agent === data.agent) return prev
              const next = [...prev, { agent: data.agent, content: '' }]
              mindchainRef.current = next
              return next
            })
          }
          if (data.type === 'thought_token') {
            setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
            setFlowActiveAgent(data.agent)
            // 后端已拆字推送（每事件 1 字）：空白字符（换行等）必须保留；``` 围栏段用状态机丢弃（防 json 围栏显示）
            const c = data.chunk || ''
            if (c === '`') {
              fenceBufRef.current += '`'
              if (fenceBufRef.current.length >= 3) { fenceInRef.current = !fenceInRef.current; fenceBufRef.current = '' }
              continue
            }
            fenceBufRef.current = ''
            if (fenceInRef.current) continue  // 围栏内内容丢弃
            if (!c) continue  // 空串跳过，绝不能中断 SSE 解析循环
            // 累积到 rAF 帧循环：每帧 flush 一次，渲染节奏固定（消除网络批量到达导致的"一段一段"）
            pendingMindRef.current = { agent: data.agent, char: c }
            scheduleStreamFlush()
          }
          if (data.type === 'answer_token') {
            const ch = data.chunk || ''
            if (ch) {
              streamedRef.current = true
              // simple 流程无 step 事件：回答开始流式即更新状态（避免一直显示"等待模型响应"）
              setFlowStatus('正在输出回答…')
              // 累积到 rAF 帧循环：每帧 flush 一次（同上）
              pendingAnswerRef.current += ch
              scheduleStreamFlush()
            }
          }
          if (data.type === 'done') {
            finalReply = data.reply; steps.push(...(data.steps || [])); taskStats = data.task_stats || null
            // 特殊形式输出建议（模型判断）：key → label 映射，随最终消息展示
            const SPECIAL_LABELS: Record<string, string> = { report: '报告', flow: '流程图', tree: '树状图', table: '表格', chart: '统计图', audio: '音频', quiz: '测试题' }
            special = Array.isArray(data.special_suggestions)
              ? (data.special_suggestions as string[]).map(k => ({ key: k, label: SPECIAL_LABELS[k] || k })).filter(s => s.label)
              : []
            setFlowStatus('')
            setFlowActiveAgent(null)
            // 最终同步一次占位消息 think（降频期间可能滞后）
            setAllMessages(prev => {
              const arr = prev[activeDidRef.current || ''] || []
              const lastMsg = arr[arr.length - 1]
              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
                return { ...prev, [activeDidRef.current || '']: [...arr.slice(0, -1), { ...lastMsg, think: mindchainRef.current }] }
              }
              return prev
            })
            // 通知第二对话：主对话已完成，可拉取同步生成的横向拓展追问
            try { window.dispatchEvent(new Event('side-followups-ready')) } catch (e) {}
            // 思维链兜底：后端返回完整 mindchain（各节点思考），流式片段缺失/不完整时覆盖
            const mc: Array<{ agent: string; content: string }> = data.mindchain || []
            if (mc.length > 0 && mc.length >= mindchainRef.current.length) {
              mindchainRef.current = mc
              setFlowMindchain(mc)
            }
          }
        }
      }
      try{
        if(_buf.trim()){var _blines=_buf.split(String.fromCharCode(10));for(var _bi=0;_bi<_blines.length;_bi++){var _bl=_blines[_bi];if(!_bl.startsWith("data: "))continue;try{var _bd=JSON.parse(_bl.slice(6));if(_bd.type==="done"){finalReply=_bd.reply||finalReply;taskStats=_bd.task_stats||taskStats;var _mc=_bd.mindchain||[];if(_mc.length>0&&_mc.length>=mindchainRef.current.length){mindchainRef.current=_mc;setFlowMindchain(_mc)}}}catch(_be){}}}
        // 运行统计：各 Agent 耗时/token 摘要（回答下方展示）
        let debugLine = ''
        if (taskStats && Object.keys(taskStats).length) {
          const NODE_CN: Record<string, string> = { plan: '规划', study_memory: '学情', kb: '知识库', generate: '生成', review: '审核' }
          const nodes = Object.entries(taskStats).filter(([k]) => k !== 'token_estimate')
          const total = nodes.reduce((s, [, v]: any) => s + (v.ms || 0), 0)
          debugLine = '⏱ ' + nodes.map(([k, v]: any) => `${NODE_CN[k] || k} ${v.ms}ms×${v.llm_calls || 1}`).join(' · ') + ` · 总计 ${total}ms · ~${taskStats.token_estimate || 0} tokens`
        }
        const thinkArr = mindchainRef.current
        if (debugLine) thinkArr.push({ agent: "运行统计", content: debugLine })
        const finalContent = finalReply || (flowError ? '⚠️ ' + flowError : '处理完成')
        // 打字机效果（设置开关）
        const typingOn = true  // 流式逐字输出固定开启
        if (typingOn && streamedRef.current) {
          // 回答已通过 answer_token 流式显示：直接替换为完整内容（markdown 渲染），不再二次打字机
          setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: finalContent, steps, think: thinkArr, special }) }))
        } else if (typingOn) {
          setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: '', steps, think: thinkArr, special }) }))
          let i = 0
          const iv = setInterval(() => {
            i += 3
            const chunk = finalContent.slice(0, i)
            setAllMessages(prev => {
              const arr = [...(prev[did || ''] || [])]
              if (arr.length) arr[arr.length - 1] = { role: 'assistant', content: chunk, steps, think: thinkArr, special }
              return { ...prev, [did || '']: arr }
            })
            if (i >= finalContent.length) clearInterval(iv)
          }, 16)
        } else {
          setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: finalContent, steps, think: thinkArr, special }) }))
        }
      }catch(_ex){}
    } catch (e: any) {
      if (userStoppedRef.current) {
        // 用户手动停止：保留已流式显示的内容为最终消息 + 标记（后端已取消且不落库，仅前端展示；输入框立即可继续提问）
        setAllMessages(prev => {
          const arr = [...(prev[did || ''] || [])]
          if (arr.length) {
            const last = arr[arr.length - 1]
            if (last.role === 'assistant') {
              arr[arr.length - 1] = { ...last, content: ((last.content || '').trim() ? last.content + '\n\n' : '') + '⏹ 已停止生成', think: mindchainRef.current }
            }
          }
          return { ...prev, [did || '']: arr }
        })
      } else {
        // 非用户意愿断线（超时/网络中断）：后端线程继续跑完并落库，前端重连轮询取回结果（文档：客户端重连可取结果）
        setAllMessages(prev => ({ ...prev, [did || '']: upsertLastAssistant(prev[did || ''] || [], { role: 'assistant', content: '⚠️ 网络中断，正在后台继续生成并自动取回结果…' }) }))
        let polled = false
        const poll = async () => {
          if (polled) return
          try {
            const r = await fetch('/api/dialogues/' + encodeURIComponent(did || '') + '/messages', { cache: 'no-store' })
            const d = await r.json()
            const msgs = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
            const last = msgs[msgs.length - 1]
            // 后端已把最终 assistant 消息落库（非占位、非"（系统未生成内容）"）→ 取回替换
            if (last && last.role === 'assistant' && last.content && last.content !== '（系统未生成内容）') {
              polled = true
              setAllMessages(prev => ({ ...prev, [did || '']: msgs }))
              return
            }
          } catch (e) {}
          // 未就绪：继续轮询（共约 90s，覆盖复杂生成）
          if (!polled) setTimeout(poll, 3000)
        }
        setTimeout(poll, 4000)  // 后端落库需要时间，先等 4s 再开始轮询
      }
    } finally { clearTimeout(timeoutTimer); setIsLoading(false); abortCtrlRef.current = null }
  }, [currentDialogueId, agents, dialogues, currentProjectId])
  // 手动停止生成：前端中断 SSE 流 + 通知后端取消（后端置位 cancel_event 后中断 LLM、不落库不后处理；已流式内容保留展示）
  const handleStopGeneration = useCallback(() => {
    userStoppedRef.current = true
    try { if (abortCtrlRef.current) abortCtrlRef.current.abort() } catch (e) {}
    if (requestIdRef.current) {
      fetch('/api/chat/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestIdRef.current }) }).catch(() => {})
    }
  }, [])
  // 需求澄清选项点击（reasonix 式）：同一轮流程内继续——复用占位消息与思维链，以"原问题+选择"继续生成
  const handleClarifyPick = useCallback((option: string | null) => {
    const original = lastUserMsgRef.current || ''
    if (!original) return
    clarifyContinueRef.current = true
    handleSendMessage(option ? `${original}\n（我选择：${option}）` : original, { clarified: true })
  }, [handleSendMessage])
  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => {
      const next = prev.map(a => a.id === updated.id ? updated : a)
      // 持久化：用户对项目介绍 Agent 设定的编辑刷新后保留
      try { localStorage.setItem('coagent-agents', JSON.stringify(next)) } catch { /* 忽略 */ }
      return next
    })
  }, [])
  // 模板应用 / 导入：整体替换 Agent 团队配置
  const handleReplaceAgents = useCallback((next: AgentConfig[]) => {
    if (!Array.isArray(next) || next.length === 0) return
    setAgents(next)
    try { localStorage.setItem('coagent-agents', JSON.stringify(next)) } catch { /* 忽略 */ }
  }, [])

  return (
    <div ref={appRef} className="flex flex-col h-screen w-screen bg-[#ffffff] text-[#1a1a1a] overflow-hidden">
      <div className="flex-1 flex min-h-0 pt-3 pb-3 pr-3">
      {/* 最左侧细轨：三界面切换 */}
      <ActivityBar view={view} onChange={handleViewChange} expanded
        onSettings={() => setShowSettings(true)} />
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)} className="flex-shrink-0 w-7 h-7 mt-3 ml-1.5 flex items-center justify-center rounded-lg icon-btn" title="展开侧栏">
          <PanelLeftOpen size={15} />
        </button>
      )}
      {view === 'tutorial' && <TutorialView agents={agents} onSave={handleSaveAgent} onReplace={handleReplaceAgents} projectId={currentProjectId} />}
      {view === 'resources' && <ResourceView projectId={currentProjectId} />}
      {view === 'memory' && <MemoryView projectId={currentProjectId} onRequestModify={handleRequestModify} onRequestAnalyze={handleRequestAnalyze} />}
      {view === 'knowledge' && <KnowledgeView projectId={projectKBId ?? currentProjectId} onClose={() => { setView('chat'); setChatOpen(true) }} />}
      {view === 'agents' && <AgentsView agents={agents} onSave={handleSaveAgent} onReplace={handleReplaceAgents} projectId={currentProjectId} />}
      {view === 'obsidian' && <ObsidianView />}
      {view === 'chat' && (chatOpen ? (<>
      {/* 左侧栏（tonal 面板） */}
      {!sidebarCollapsed && (
        <>
          <div style={{ width: sidebarWidth, minWidth: 200 }} className="h-full flex-shrink-0 relative panel rounded-3xl overflow-hidden">
          <ProjectSidebar
            project={projects.find(p => p.id === currentProjectId) || null}
            dialogues={dialogues}
            currentDialogueId={currentDialogueId}
            onHome={() => setChatOpen(false)}
            onSelectDialogue={handleSelectDialogue}
            onCreateDialogue={() => currentProjectId && handleCreateDialogue(currentProjectId)}
            onRenameDialogue={handleRenameDialogue}
            onDeleteDialogue={handleDeleteDialogue}
            onOpenMemory={() => { setProjectConfigTab('memory'); setShowProjectConfig(true) }}
            onOpenResource={() => { setProjectConfigTab('resource'); setShowProjectConfig(true) }}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        </div>
        {/* 左侧拖拽手柄 */}
        <div onMouseDown={() => { dragging.current = 'left'; document.body.style.userSelect = 'none' }}
          className="w-2 h-full cursor-col-resize flex-shrink-0 group flex items-center justify-center" >
          <span className="w-1 h-10 rounded-full bg-[#d0d0d0] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
</>
      )}
      {/* 中间 */}
      <CenterPanel
        messages={currentMessages} isLoading={isLoading} currentProject={currentProject}
        dialogueId={currentDialogueId}
        onSendMessage={handleSendMessage}
        onStop={handleStopGeneration}
        onClarifyPick={handleClarifyPick}
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
          onOpenGuide={() => setShowGuide(true)}
          onOpenSettings={() => setShowSettings(true)}
        projectInitialized={currentProject?.initialized !== false}
        draft={prefillInput}
        flowStatus={flowStatus}
        flowActiveAgent={flowActiveAgent}
        onManualSetup={() => {
          if (!currentProjectId) return
          try {
            const done = JSON.parse(localStorage.getItem('coagent-manual-setup-done') || '[]')
            if (done.includes(currentProjectId)) return  // 已完成初次手动填写，后续只能对话填写
          } catch { /* 忽略 */ }
          setManualSetupOnly(true)
          setProjectConfigTab('memory')
          setShowProjectConfig(true)
        }}
        analyzeHint={analyzeHint}
        onClearAnalyzeHint={() => setAnalyzeHint(null)}
      />
      {/* 右侧栏 */}
      {rightCollapsed && (
        <button onClick={() => setRightCollapsed(false)} className="flex-shrink-0 w-7 h-7 mt-3 mr-1.5 flex items-center justify-center rounded-lg icon-btn" title="展开侧栏">
          <PanelRightOpen size={15} />
        </button>
      )}
      {!rightCollapsed && (
        <>
{/* 右侧拖拽手柄 */}
          <div onMouseDown={() => { dragging.current = 'right'; document.body.style.userSelect = 'none' }}
            className="w-2 h-full cursor-col-resize flex-shrink-0 group flex items-center justify-center">
            <span className="w-1 h-10 rounded-full bg-[#d0d0d0] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div style={{ width: rightPanelWidth, minWidth: 260 }} className="h-full flex-shrink-0 relative panel rounded-3xl overflow-hidden">
            <RightPanel messageCount={currentMessages.filter(m => m.role === 'assistant').length} projectId={currentProjectId} sideDialogueId={secondDialogueIdRef.current} onCollapse={() => setRightCollapsed(true)} />
          </div>
        </>
      )}
      </>) : (
        <HomeView
          projects={projects}
          onEnter={(id) => { setCurrentProjectId(id); setChatOpen(true) }}
          onCreate={handleCreateProject}
          onDelete={handleDeleteProject}
          onRename={handleRenameProject}
        />
      ))}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} projectId={currentProjectId} />}
      {showProjectConfig && (
        <ProjectConfigModal
          projectId={projectKBId ?? currentProjectId}
          projectName={(projectKBId ? projects.find(x => x.id === projectKBId) : currentProject)?.name || ''}
          initialTab={projectConfigTab}
          initialOnly={manualSetupOnly}
          onSaved={() => setManualSetupOnly(false)}
          onRequestModify={handleRequestModify}
          onRequestAnalyze={handleRequestAnalyze}
          onClose={() => { setShowProjectConfig(false); setManualSetupOnly(false) }}
        />
      )}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {wizard && <ProfileWizard mode={wizard.mode} projectName={wizard.name} onClose={() => {
        // 跳过：项目标记为无画像（simple），名字加 [简]，后续对话不弹向导
        if (wizard.mode === 'project') {
          fetch('/api/projects/' + wizard.id + '/profile', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ profile: {} }) })
          fetch('/api/projects/' + wizard.id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: '[简] ' + (wizard.name || ''), simple: true }) })
          setProjects(prev => prev.map(p => p.id === wizard.id ? { ...p, name: '[简] ' + p.name, simple: true } : p))
        }
        setWizard(null)
      }}
        onSave={(profile) => {
          const url = wizard.mode === 'project' ? '/api/projects/' + wizard.id + '/profile' : '/api/dialogues/' + wizard.id + '/profile'
          fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ profile }) })
          setWizard(null)
        }} />}
      {showApiKeyPrompt && <ApiKeyPrompt onClose={() => { setShowApiKeyPrompt(false); localStorage.setItem('coagent-apikey-skipped', '1') }} />}
      {showIntro && <IntroPanel onClose={() => { setShowIntro(false); localStorage.setItem('coagent-intro-seen', '1') }} />}
      {/* 删除对话确认弹窗 */}
      {deleteDialogueTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setDeleteDialogueTarget(null)}>
          <div className="card-lift rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold">删除对话「{deleteDialogueTarget.name}」？</p>
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              这样会删除此处的对话记忆，<br />
              保存到课程中的记忆不会删除，<br />
              这个对话生成的资源也不会删除。
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleteDialogueTarget(null)}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium border hairline row-hover transition-colors">取消</button>
              <button onClick={confirmDeleteDialogue}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default App
