import { useState, useCallback, useRef, useEffect } from 'react'
import { PanelLeftOpen, PanelRightOpen, Github } from 'lucide-react'

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
  const [isLoading, setIsLoading] = useState(false)
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS)
  const [showSettings, setShowSettings] = useState(false)
  // 项目配置弹窗（Sidebar 项目三点进入：项目记忆 / 项目资源）
  const [showProjectConfig, setShowProjectConfig] = useState(false)
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
          if (first) setCurrentDialogueId(first.id)
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
  const [flowMindchain, setFlowMindchain] = useState<Array<{agent: string; content: string}>>([])
  const mindchainRef = useRef<Array<{agent: string; content: string}>>([])
  const sessionId = useRef(SESSION_ID)
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
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      .then(r => r.json())
      .then((d) => {
        const id = d.id
        setProjects(prev => [...prev, { id, name, simple: false }])
        setCurrentProjectId(id)
        // 不默认建对话（避免无画像对话）；由用户手动新建
        setWizard({ mode: 'project', id, name })
      })
  }, [])
  const handleDeleteProject = useCallback((id: string) => {
    if (!window.confirm('确定删除该项目及其所有对话/知识库/图谱？')) return
    fetch('/api/projects/' + id, { method: 'DELETE' })
      .then(() => {
        setProjects(prev => prev.filter(p => p.id !== id))
        setDialogues(prev => prev.filter(d => d.projectId !== id))
        if (currentProjectId === id) setCurrentProjectId(projects.find(p => p.id !== id)?.id ?? null)
      })
  }, [currentProjectId, projects])
  const handleRenameProject = useCallback((id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
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
    // 无画像（[简]）项目：不弹对话画像向导
    const proj = projects.find(p => p.id === projectId)
    if (!(proj && proj.simple)) {
      setWizard({ mode: 'dialogue', id: d.id, name: d.name })
    }
  }, [dialogues, projects])
  const handleSelectDialogue = useCallback((id: string) => { setCurrentDialogueId(id); setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = [] }, [])
  const handleArchiveDialogue = useCallback((id: string) => {
    if (!window.confirm('确定删除该对话？')) return
    fetch('/api/dialogues/' + id, { method: 'DELETE' })
      .then(() => {
        setDialogues(prev => prev.filter(d => d.id !== id))
        if (currentDialogueId === id) setCurrentDialogueId(null)
      })
  }, [currentDialogueId])
  const handleRenameDialogue = useCallback((id: string, name: string) => {
    if (name.trim()) setDialogues(prev => prev.map(d => d.id === id ? { ...d, name: name.trim() } : d))
  }, [])
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

  const handleSendMessage = useCallback(async (text: string, settings?: Record<string, any>) => {
    let did = currentDialogueId
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
    setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'user', content: text }] }))
    setIsLoading(true)
    setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = []
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
        const m = localStorage.getItem('coagent-model') || 'deepseek-pro'
        return (m === 'deepseek-chat' || m === 'deepseek-reasoner') ? 'deepseek-pro' : m
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
      // 合并默认对话参数（设置里可配）+ 记住上次设置
      const defSettings = (() => { try { return JSON.parse(localStorage.getItem('coagent-default-settings') || '{}') } catch { return {} } })()
      const lastSettings = (() => { try { return JSON.parse(localStorage.getItem('coagent-last-settings') || '{}') } catch { return {} } })()
      const mergedSettings = { ...defSettings, ...lastSettings, ...(settings || {}) }
      try { localStorage.setItem('coagent-last-settings', JSON.stringify(mergedSettings)) } catch {}
      // 请求超时（设置里可配 1-30s，默认 30）
      const timeoutMs = (Math.min(30, Math.max(1, parseInt(localStorage.getItem('coagent-timeout') || '30', 10) || 30))) * 1000
      const ctrl = new AbortController()
      timeoutTimer = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), session_id: sessionId.current, dialogue_id: currentDialogueId, project_id: currentProjectId, api_key: apiKey, model: model, base_url: providerBaseUrls[provider], settings: mergedSettings, mode: (mergedSettings && mergedSettings.chatMode) || 'kb', image: (mergedSettings && mergedSettings.image) || undefined, agents: agents }),
        signal: ctrl.signal,
      })
      const reader = res.body!.getReader(); const decoder = new TextDecoder()
      let finalReply = ''; const steps: any[] = []; let taskStats: any = null
      var _buf=""
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        _buf+=decoder.decode(value,{stream:true})
        var _lines=_buf.split(String.fromCharCode(10))
        _buf=_lines.pop()||""
        for (const line of _lines) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.type === 'step') {
            setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
            setFlowActiveAgent(data.agent)
          }
          if (data.type === 'thought_token') {
            setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
            setFlowActiveAgent(data.agent)
            setFlowMindchain(prev => {
              const cleanChunk = data.chunk.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').replace(/[{}\[\]"']/g, '')
              if (!cleanChunk.trim()) return prev
              const last = prev[prev.length - 1]
              let next
              if (last && last.agent === data.agent) {
                next = [...prev.slice(0, -1), { agent: data.agent, content: last.content + cleanChunk }]
              } else {
                next = [...prev, { agent: data.agent, content: cleanChunk }]
              }
              mindchainRef.current = next
              return next
            })
          }
          if (data.type === 'done') {
            finalReply = data.reply; steps.push(...(data.steps || [])); taskStats = data.task_stats || null
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
        // 调试模式：在回复底部追加各 Agent 耗时/token 摘要
        const debugOn = localStorage.getItem('coagent-debug') === '1'
        let debugLine = ''
        if (debugOn && taskStats && Object.keys(taskStats).length) {
          const NODE_CN: Record<string, string> = { plan: '规划', study_memory: '学情', kb: '知识库', generate: '生成', review: '审核' }
          const nodes = Object.entries(taskStats).filter(([k]) => k !== 'token_estimate')
          const total = nodes.reduce((s, [, v]: any) => s + (v.ms || 0), 0)
          debugLine = '⏱ ' + nodes.map(([k, v]: any) => `${NODE_CN[k] || k} ${v.ms}ms×${v.llm_calls || 1}`).join(' · ') + ` · 总计 ${total}ms · ~${taskStats.token_estimate || 0} tokens`
        }
        const thinkArr = mindchainRef.current.map(m => m.content)
        if (debugLine) thinkArr.push(debugLine)
        const finalContent = finalReply || '处理完成'
        // 打字机效果（设置开关）
        const typingOn = (() => { try { return (JSON.parse(localStorage.getItem('coagent-context-settings') || '{}') as any).typing === true } catch { return false } })()
        if (typingOn) {
          setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '', steps, think: thinkArr }] }))
          let i = 0
          const iv = setInterval(() => {
            i += 3
            const chunk = finalContent.slice(0, i)
            setAllMessages(prev => {
              const arr = [...(prev[did || ''] || [])]
              if (arr.length) arr[arr.length - 1] = { role: 'assistant', content: chunk, steps, think: thinkArr }
              return { ...prev, [did || '']: arr }
            })
            if (i >= finalContent.length) clearInterval(iv)
          }, 16)
        } else {
          setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: finalContent, steps, think: thinkArr }] }))
        }
      }catch(_ex){}
    } catch {
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '抱歉，请求失败。' }] }))
    } finally { clearTimeout(timeoutTimer); setIsLoading(false) }
  }, [currentDialogueId])
  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
  }, [])
  // 模板应用 / 导入：整体替换 Agent 团队配置
  const handleReplaceAgents = useCallback((next: AgentConfig[]) => {
    if (!Array.isArray(next) || next.length === 0) return
    setAgents(next)
  }, [])

  return (
    <div ref={appRef} className="flex flex-col h-screen w-screen bg-[#ffffff] text-[#1a1a1a] overflow-hidden">
      {/* 顶栏：wordmark + GitHub + 设置 */}
      <header className="h-12 flex-shrink-0 flex items-center gap-3 px-4">
        <span className="font-display text-[17px] tracking-wide select-none">CoAgent-Learn</span>
        <a href="https://github.com/tpys11/CoAgent-Learn" target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg icon-btn" title="GitHub: tpys11/CoAgent-Learn">
          <Github size={15} />
        </a>
        <span className="flex-1" />
</header>
      <div className="flex-1 flex min-h-0 pb-3 pr-3">
      {/* 最左侧细轨：三界面切换 */}
      <ActivityBar view={view} onChange={handleViewChange} onSettings={() => setShowSettings(true)} />
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)} className="flex-shrink-0 w-7 h-7 mt-3 ml-1.5 flex items-center justify-center rounded-lg icon-btn" title="展开侧栏">
          <PanelLeftOpen size={15} />
        </button>
      )}
      {view === 'tutorial' && <TutorialView />}
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
            onArchiveDialogue={handleArchiveDialogue}
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
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
        flowMindchain={flowMindchain}
          onOpenGuide={() => setShowGuide(true)}
          onOpenSettings={() => setShowSettings(true)}
        projectInitialized={currentProject?.initialized !== false}
        draft={prefillInput}
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
            <RightPanel messageCount={currentMessages.filter(m => m.role === 'assistant').length} projectId={currentProjectId} flowAgents={flowAgents} flowActiveAgent={flowActiveAgent} onCollapse={() => setRightCollapsed(true)} />
          </div>
        </>
      )}
      </>) : (
        <HomeView
          projects={projects}
          onEnter={(id) => { setCurrentProjectId(id); setChatOpen(true) }}
          onCreate={handleCreateProject}
          onDelete={handleDeleteProject}
          onNavigate={(v) => { setView(v as ViewKey); if (v === 'chat') setChatOpen(false) }}
        />
      ))}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} projectId={currentProjectId} />}
      {showProjectConfig && (
        <ProjectConfigModal
          projectId={projectKBId ?? currentProjectId}
          initialTab={projectConfigTab}
          onRequestModify={handleRequestModify}
          onRequestAnalyze={handleRequestAnalyze}
          onClose={() => setShowProjectConfig(false)}
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
    </div>
  )
}
export default App
