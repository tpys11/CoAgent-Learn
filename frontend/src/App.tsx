import { useState, useCallback, useRef, useEffect } from 'react'

// 模块级 session：页面刷新(JS重载)时重新生成一次；组件重挂载不改变
const SESSION_ID = (() => {
  const s = Math.random().toString(36).slice(2) + Date.now().toString(36)
  sessionStorage.setItem('coagent-s', s)
  return s
})()
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import DiagnosisModal from './components/DiagnosisModal'
import AgentSettingsModal from './components/AgentSettingsModal'
import SettingsModal, { ApiKeyPrompt } from './components/SettingsModal'
import { ProjectKnowledgeModal } from './components/InfoModals'
import ProfileWizard from './components/ProfileWizard'
import GuideModal from './components/GuideModal'
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
  const [showDiagnosis, setShowDiagnosis] = useState(false)
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS)
  const [showSettings, setShowSettings] = useState(false)
  const [showAgentSettings, setShowAgentSettings] = useState(false)
  const [showProjectKB, setShowProjectKB] = useState(false)
  const [projectKBId, setProjectKBId] = useState<string | null>(null)
  const [wizard, setWizard] = useState<{mode: 'project'|'dialogue'; id: string; name?: string} | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  // 启动时应用保存的字体大小
  useEffect(() => {
    const saved = localStorage.getItem('coagent-fontSize')
    if (saved) document.documentElement.style.fontSize = saved + 'px'
    const theme = localStorage.getItem('coagent-theme') || 'warm'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  // 从后端加载项目/对话（持久化）
  const [loaded, setLoaded] = useState(false)
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
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
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
  const [flowVisible, setFlowVisible] = useState(false)
  const [flowAgents, setFlowAgents] = useState<string[]>([])
  const [flowActiveAgent, setFlowActiveAgent] = useState<string | null>(null)
  const [flowMindchain, setFlowMindchain] = useState<Array<{agent: string; content: string}>>([])
  const mindchainRef = useRef<Array<{agent: string; content: string}>>([])
  const sessionId = useRef(SESSION_ID)
  const dragging = useRef<'left' | 'right' | 'flow' | null>(null)
  const appRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragging.current === 'left') setSidebarWidth(Math.max(180, Math.min(400, e.clientX - 8)))
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
        setProjects(prev => [...prev, { id, name }])
        setCurrentProjectId(id)
        const dId = generateId()
        setDialogues(prev => [...prev, { id: dId, name: '新对话', projectId: id, createdAt: new Date().toISOString(), archived: false }])
        setCurrentDialogueId(dId)
        setAllMessages(prev => ({ ...prev, [dId]: [] }))
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
    setShowProjectKB(true)
  }, [])

  const handleCreateDialogue = useCallback((projectId: string) => {
    const count = dialogues.filter(d => d.projectId === projectId && !d.archived).length
    const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId, createdAt: new Date().toISOString(), archived: false }
    setDialogues(prev => [...prev, d])
    setCurrentDialogueId(d.id)
    setAllMessages(prev => ({ ...prev, [d.id]: [] }))
    setWizard({ mode: 'dialogue', id: d.id, name: d.name })
  }, [dialogues])
  const handleSelectDialogue = useCallback((id: string) => { setCurrentDialogueId(id); setFlowVisible(false); setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = [] }, [])
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
  const handleSendMessage = useCallback(async (text: string, settings?: Record<string, any>) => {
    let did = currentDialogueId
    if (!did && currentProjectId) {
      // 自动创建对话
      const count = dialogues.filter(d => d.projectId === currentProjectId && !d.archived).length
      const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId: currentProjectId, createdAt: new Date().toISOString(), archived: false }
      setDialogues(prev => [...prev, d])
      did = d.id
      setCurrentDialogueId(d.id)
    }
    if (!did) return
    setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'user', content: text }] }))
    setIsLoading(true)
    setFlowVisible(true); setFlowAgents([]); setFlowActiveAgent(null); setFlowMindchain([]); mindchainRef.current = []
    // 超时保护：120s 无响应自动中止，避免一直转圈
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120000)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), session_id: sessionId.current, dialogue_id: currentDialogueId, project_id: currentProjectId, api_key: localStorage.getItem('coagent-apikey') || undefined, settings: settings || {}, mode: (settings && settings.chatMode) || 'kb', image: (settings && settings.image) || undefined }),
        signal: ctrl.signal,
      })
      const reader = res.body!.getReader(); const decoder = new TextDecoder()
      let finalReply = ''; const steps: any[] = []
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
          if (data.type === 'done') { finalReply = data.reply; steps.push(...(data.steps || [])) }
        }
      }
      try{
        if(_buf.trim()){var _blines=_buf.split(String.fromCharCode(10));for(var _bi=0;_bi<_blines.length;_bi++){var _bl=_blines[_bi];if(!_bl.startsWith("data: "))continue;try{var _bd=JSON.parse(_bl.slice(6));if(_bd.type==="done")finalReply=_bd.reply||finalReply}catch(_be){}}}
        setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: finalReply || '处理完成', steps, think: mindchainRef.current.map(m => m.content) }] }))
      }catch(_ex){}
    } catch {
      setAllMessages(prev => ({ ...prev, [did || '']: [...(prev[did || ''] || []), { role: 'assistant', content: '抱歉，请求失败。' }] }))
    } finally { clearTimeout(timer); setIsLoading(false) }
  }, [currentDialogueId])
  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
  }, [])

  return (
    <div ref={appRef} className="flex h-screen w-screen bg-[#ffffff] text-[#1a1a1a] p-2 gap-0">
      {/* 左侧栏折叠后展开按钮 */}
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)}
          className="flex-shrink-0 w-5 h-full flex items-center justify-center hover:bg-[#ededed] rounded text-gray-400">▶</button>
      )}
      {/* 左侧栏 */}
      {!sidebarCollapsed && (
        <>
          <div style={{ width: sidebarWidth, minWidth: 180 }} className="h-full flex-shrink-0 relative">
          <Sidebar
            projects={projects} dialogues={dialogues}
            currentProjectId={currentProjectId} currentDialogueId={currentDialogueId}
                        onCreateProject={handleCreateProject} onDeleteProject={handleDeleteProject}
            onSelectProject={handleSelectProject} onCreateDialogue={handleCreateDialogue}
            onSelectDialogue={handleSelectDialogue} onArchiveDialogue={handleArchiveDialogue}
            onRenameDialogue={handleRenameDialogue}
            onRenameProject={handleRenameProject}
            onProjectKnowledge={handleProjectKB}
            onSettings={() => setShowSettings(true)}
          />
        </div>
        {/* 左侧拖拽手柄 */}
        <div onMouseDown={() => { dragging.current = 'left'; document.body.style.userSelect = 'none' }}
          className="w-1.5 h-full cursor-col-resize hover:bg-[#1a1a1a]/30 flex-shrink-0 transition-colors" />
          {/* 折叠按钮：右侧 */}
          <button onClick={() => setSidebarCollapsed(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-[#e5e5e5] text-gray-400 hover:text-[#1a1a1a] text-xs shadow-sm flex-shrink-0 self-start mt-2"
            title="收起侧栏">◀</button>
        </>
      )}
      {/* 中间 */}
      <CenterPanel
        messages={currentMessages} isLoading={isLoading} currentProject={currentProject}
        onSendMessage={handleSendMessage}
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
        showAgentFlow={flowVisible}
        flowAgents={flowAgents} flowActiveAgent={flowActiveAgent}
        flowMindchain={flowMindchain}
        onAgentSettings={() => setShowAgentSettings(true)}
          onOpenGuide={() => setShowGuide(true)}
        projectInitialized={currentProject?.initialized !== false}
      />
      {/* 右侧栏 */}
      {!rightCollapsed && (
        <>
          {/* 折叠按钮：左侧 */}
          <button onClick={() => setRightCollapsed(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-[#e5e5e5] text-gray-400 hover:text-[#1a1a1a] text-xs shadow-sm flex-shrink-0 self-start mt-2"
            title="收起右侧栏">▶</button>
          {/* 右侧拖拽手柄 */}
          <div onMouseDown={() => { dragging.current = 'right'; document.body.style.userSelect = 'none' }}
            className="w-1.5 h-full cursor-col-resize hover:bg-[#1a1a1a]/30 flex-shrink-0 transition-colors" />
          <div style={{ width: rightPanelWidth, minWidth: 180 }} className="h-full flex-shrink-0 relative">
            <RightPanel messageCount={currentMessages.filter(m => m.role === 'assistant').length} projectId={currentProjectId} />
          </div>
        </>
      )}
      {/* 右侧折叠后展开按钮 */}
      {rightCollapsed && (
        <button onClick={() => setRightCollapsed(false)}
          className="flex-shrink-0 w-5 h-full flex items-center justify-center hover:bg-[#ededed] rounded text-gray-400">◀</button>
      )}

      {showDiagnosis && <DiagnosisModal onClose={() => setShowDiagnosis(false)} />}
      {showAgentSettings && <AgentSettingsModal agents={agents} onSave={handleSaveAgent} onClose={() => setShowAgentSettings(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showProjectKB && <ProjectKnowledgeModal projectId={projectKBId || undefined} onClose={() => setShowProjectKB(false)} />}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {wizard && <ProfileWizard mode={wizard.mode} projectName={wizard.name} onClose={() => setWizard(null)}
        onSave={(profile) => {
          const url = wizard.mode === 'project' ? '/api/projects/' + wizard.id + '/profile' : '/api/dialogues/' + wizard.id + '/profile'
          fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ profile }) })
          setWizard(null)
        }} />}
      {showApiKeyPrompt && <ApiKeyPrompt onClose={() => { setShowApiKeyPrompt(false); localStorage.setItem('coagent-apikey-skipped', '1') }} />}
    </div>
  )
}
export default App
