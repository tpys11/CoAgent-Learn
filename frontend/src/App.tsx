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
import { LS, lsGet, lsSet, lsGetJSON, lsSetJSON } from './storage'
import { api } from './api'
import { useChatStream } from './hooks/useChatStream'

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
// 项目 ID 固定：首次生成后存 localStorage，刷新复用（保证知识库/图谱数据不因刷新丢失）
const defaultProjectId = (() => {
  const old = lsGet(LS.defaultProject, '')
  if (old) return old
  const nid = generateId()
  lsSet(LS.defaultProject, nid)
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
      const s = lsGet(LS.agents, '')
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
  // 新对话学情画像合成状态：pending 期间禁发（后端 409 + 前端禁用发送按钮）
  const [profilePendingDialogue, setProfilePendingDialogue] = useState<string | null>(null)
  const profilePollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollProfileStatus = useCallback((did: string) => {
    if (profilePollTimer.current) clearInterval(profilePollTimer.current)
    setProfilePendingDialogue(did)
    const check = () => {
      api.getDialogueProfileStatus(did).then(d => {
        if (d.status === 'pending') return
        if (profilePollTimer.current) { clearInterval(profilePollTimer.current); profilePollTimer.current = null }
        setProfilePendingDialogue(prev => (prev === did ? null : prev))
      }).catch(() => {
        if (profilePollTimer.current) { clearInterval(profilePollTimer.current); profilePollTimer.current = null }
        setProfilePendingDialogue(prev => (prev === did ? null : prev))
      })
    }
    check()
    profilePollTimer.current = setInterval(check, 1500)
  }, [])
  const [view, setView] = useState<ViewKey>('chat')
  // 主页模式：view=chat 时默认显示主页（按项目展开），进入项目后才显示对话界面
  const [chatOpen, setChatOpen] = useState(false)
  // 记忆修改预填：从记忆界面跳转时，输入框以 [模块名] 引用并提示补充想法
  const [prefillInput, setPrefillInput] = useState('')
  // 审核引用跳转（5.2）：聊天里点击 [来源:xxx#chunk-N] → 跳记忆视图 focus 该 chunk 所在章节
  const [citationFocus, setCitationFocus] = useState<{ source: string; chunk: number; seq: number } | null>(null)
  // 事件委托：markdown 渲染出的 .citation-ref 元素（dangerouslySetInnerHTML 无法直接绑 onClick）
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const el = t && t.closest ? (t.closest('.citation-ref') as HTMLElement | null) : null
      if (!el) return
      const src = el.getAttribute('data-src') || ''
      const chunk = el.getAttribute('data-chunk')
      if (!src || !chunk) return
      setCitationFocus({ source: src, chunk: parseInt(chunk, 10), seq: Date.now() })
      setView('memory')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  // 项目记忆分析持久提示：从记忆界面跳转对话时显示（label 区分分析/修改基本情况）
  const [analyzeHint, setAnalyzeHint] = useState<{ label: string; project: string } | null>(null)
  // 首次进入：弹出项目介绍面板（localStorage 标记，只弹一次）
  const [showIntro, setShowIntro] = useState(() => !lsGet(LS.introSeen, ''))
  // 启动时应用保存的字体大小与主题（system 模式自动解析亮暗）
  useEffect(() => {
    const saved = lsGet(LS.fontSize, '')
    if (saved) document.documentElement.style.setProperty('--ui-font', saved + 'px')
    initTheme()
  }, [])

  // 从后端加载项目/对话（持久化）
  useEffect(() => {
    let cancelled = false
    api.listProjects()
      .then(async (d) => {
        if (cancelled) return
        const projs: Project[] = (d.projects || []).map((p: any) => ({ id: p.id, name: p.name, domain: p.domain || '' }))
        setProjects(projs)
        // 加载每个项目下的对话
        const allD: Dialogue[] = []
        for (const p of projs) {
          const d2 = await api.listProjectDialogues(p.id)
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
            api.getDialogueMessages(first.id)
              .then(dm => {
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
    () => !lsGet(LS.apiKey, '') && !lsGet(LS.apiKeySkipped, '')
  )
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(390)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const sessionId = useRef(SESSION_ID)
  // 第二对话 id：App 持有（主对话完成后为它生成横向拓展追问），传给 RightPanel 使用
  const secondDialogueIdRef = useRef('sd-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  const dragging = useRef<'left' | 'right' | 'flow' | null>(null)
  const appRef = useRef<HTMLDivElement>(null)

  // 主对话聊天流（发送 + SSE 解析 + 流式渲染节奏 + 停止/断线取回）已抽到 useChatStream
  const { sendMessage, stop, resetFlow, flowStatus, flowActiveAgent } = useChatStream({
    agents,
    currentProjectId,
    dialogues,
    currentDialogueId,
    setDialogues,
    setCurrentDialogueId,
    setAllMessages,
    setIsLoading,
    setShowApiKeyPrompt,
    sessionId,
    secondDialogueId: secondDialogueIdRef,
  })

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
        const d = await api.createProject({ name })
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
        api.createDialogue({ project_id: id, name: dia.name, id: did }).catch(() => {})
        pollProfileStatus(did)
        api.postDialogueMessage(did, { role: 'assistant', content: PROJECT_GUIDE(name) }).catch(() => {})
        setChatOpen(true)
      } catch (e) {
        alert('创建课程失败：' + ((e as any)?.message || '网络异常') + '，请检查后端服务。')
      }
    })()
  }, [])
  const handleDeleteProject = useCallback((id: string) => {
    // 删除确认由前端弹窗承担（主页删除弹窗已提示后果）
    api.deleteProject(id)
      .then(() => {
        setProjects(prev => prev.filter(p => p.id !== id))
        setDialogues(prev => prev.filter(d => d.projectId !== id))
        if (currentProjectId === id) { setCurrentProjectId(projects.find(p => p.id !== id)?.id ?? null); setCurrentDialogueId(null) }
      })
  }, [currentProjectId, projects])
  const handleRenameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    // 持久化到后端（PATCH）
    api.updateProject(id, { name }).catch(() => {})
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
    api.createDialogue({ project_id: projectId, name: d.name, id: d.id }).catch(() => {})
    pollProfileStatus(d.id)
    // 无画像（[简]）项目：不弹对话画像向导
    const proj = projects.find(p => p.id === projectId)
    if (!(proj && proj.simple)) {
      setWizard({ mode: 'dialogue', id: d.id, name: d.name })
    }
  }, [dialogues, projects])
  const loadDialogueMessages = useCallback((id: string) => {
    api.getDialogueMessages(id)
      .then(d => {
        const msgs = (d.messages || []).map((m: any) => ({ role: m.role, content: m.content || '', steps: m.steps, think: m.think }))
        setAllMessages(prev => ({ ...prev, [id]: msgs }))
      }).catch(() => {})
  }, [])
  const handleSelectDialogue = useCallback((id: string) => {
    setCurrentDialogueId(id)
    resetFlow()
    loadDialogueMessages(id)
  }, [loadDialogueMessages, resetFlow])
  const handleArchiveDialogue = useCallback((id: string) => {
    if (!window.confirm('确定归档该对话？')) return
    // 软归档（与自动清理一致），侧栏不再显示
    api.updateDialogue(id, { archived: true })
      .then(() => {
        setDialogues(prev => prev.map(d => d.id === id ? { ...d, archived: true } : d))
        if (currentDialogueId === id) setCurrentDialogueId(null)
      })
  }, [currentDialogueId])
  const handleRenameDialogue = useCallback((id: string, name: string) => {
    if (name.trim()) {
      setDialogues(prev => prev.map(d => d.id === id ? { ...d, name: name.trim() } : d))
      // 持久化到后端（POST /update {name}）
      api.updateDialogue(id, { name: name.trim() }).catch(() => {})
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
    api.deleteDialogue(t.id)
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
    setSidebarCollapsed(false)  // 进入对话界面自动展开课程侧栏
  }

  /** 项目记忆重新分析：跳转对话界面，显示持久提示「项目记忆分析」 */
  const handleRequestAnalyze = (projectName: string) => {
    setShowProjectConfig(false)
    setAnalyzeHint({ label: '项目记忆分析', project: projectName })
    setView('chat')
    setChatOpen(true)
    setSidebarCollapsed(false)
  }

  const handleViewChange = (v: ViewKey) => {
    setView(v)
    if (v === 'chat') setChatOpen(false) // 点「主页」回到主页
  }

  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => {
      const next = prev.map(a => a.id === updated.id ? updated : a)
      // 持久化：用户对项目介绍 Agent 设定的编辑刷新后保留
      lsSetJSON(LS.agents, next)
      return next
    })
  }, [])
  // 模板应用 / 导入：整体替换 Agent 团队配置
  const handleReplaceAgents = useCallback((next: AgentConfig[]) => {
    if (!Array.isArray(next) || next.length === 0) return
    setAgents(next)
    lsSetJSON(LS.agents, next)
  }, [])

  return (
    <div ref={appRef} className="flex flex-col h-screen w-screen bg-[#ffffff] text-[#1a1a1a] overflow-hidden">
      <div className="flex-1 flex min-h-0 pt-3 pb-3 pr-3">
      {/* 最左侧细轨：主页时展开加宽，点开课程/离开主页自动折叠为仅图标 */}
      <ActivityBar view={view} onChange={handleViewChange} expanded={view === 'chat' && !chatOpen}
        onSettings={() => setShowSettings(true)} />
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)} className="flex-shrink-0 w-7 h-7 mt-3 ml-1.5 flex items-center justify-center rounded-lg icon-btn" title="展开侧栏">
          <PanelLeftOpen size={15} />
        </button>
      )}
      {view === 'tutorial' && <TutorialView agents={agents} onSave={handleSaveAgent} onReplace={handleReplaceAgents} projectId={currentProjectId} />}
      {view === 'resources' && <ResourceView projectId={currentProjectId} />}
      {view === 'memory' && <MemoryView projectId={currentProjectId} onRequestModify={handleRequestModify} onRequestAnalyze={handleRequestAnalyze} focus={citationFocus} />}
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
        profilePending={profilePendingDialogue === currentDialogueId}
        onSendMessage={sendMessage}
        onStop={stop}
        onRequestKey={() => setShowApiKeyPrompt(true)}
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
          onOpenSettings={() => setShowSettings(true)}
        projectInitialized={currentProject?.initialized !== false}
        draft={prefillInput}
        flowStatus={flowStatus}
        flowActiveAgent={flowActiveAgent}
        onManualSetup={() => {
          if (!currentProjectId) return
          const done = lsGetJSON<string[]>(LS.manualSetupDone, [])
          if (done.includes(currentProjectId)) return  // 已完成初次手动填写，后续只能对话填写
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
          onEnter={(id) => { setCurrentProjectId(id); setChatOpen(true); setSidebarCollapsed(false) }}
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
      {wizard && <ProfileWizard mode={wizard.mode} projectName={wizard.name} onClose={() => {
        // 跳过：项目标记为无画像（simple），名字加 [简]，后续对话不弹向导
        if (wizard.mode === 'project') {
          api.saveProjectProfile(wizard.id, {})
          api.updateProject(wizard.id, { name: '[简] ' + (wizard.name || ''), simple: true })
          setProjects(prev => prev.map(p => p.id === wizard.id ? { ...p, name: '[简] ' + p.name, simple: true } : p))
        }
        setWizard(null)
      }}
        onSave={(profile) => {
          if (wizard.mode === 'project') api.saveProjectProfile(wizard.id, profile)
          else api.saveDialogueProfile(wizard.id, profile)
          setWizard(null)
        }} />}
      {showApiKeyPrompt && <ApiKeyPrompt provider={lsGet(LS.provider, 'deepseek')} onClose={() => { setShowApiKeyPrompt(false); lsSet(LS.apiKeySkipped, '1') }} />}
      {showIntro && <IntroPanel onClose={() => { setShowIntro(false); lsSet(LS.introSeen, '1') }} />}
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
