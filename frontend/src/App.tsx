import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import DiagnosisModal from './components/DiagnosisModal'
import AgentModal from './components/AgentModal'
import SettingsModal, { ApiKeyPrompt } from './components/SettingsModal'
import type { Project, Dialogue, AgentConfig, Message } from './types'
import { DEFAULT_AGENTS } from './types'

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }
const defaultProjectId = generateId()

function App() {
  const [projects, setProjects] = useState<Project[]>([{ id: defaultProjectId, name: '默认项目' }])
  const [dialogues, setDialogues] = useState<Dialogue[]>([
    { id: generateId(), name: '新对话', projectId: defaultProjectId, createdAt: new Date().toISOString(), archived: false },
  ])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(defaultProjectId)
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(dialogues[0].id)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDiagnosis, setShowDiagnosis] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [agents, setAgents] = useState<AgentConfig[]>(DEFAULT_AGENTS)
  const [showSettings, setShowSettings] = useState(false)
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(
    () => !localStorage.getItem('coagent-apikey') && !localStorage.getItem('coagent-apikey-skipped')
  )
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(260)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const dragging = useRef<'left' | 'right' | null>(null)
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
    const id = generateId()
    setProjects(prev => [...prev, { id, name }])
    setCurrentProjectId(id)
    const dId = generateId()
    setDialogues(prev => [...prev, { id: dId, name: '新对话', projectId: id, createdAt: new Date().toISOString(), archived: false }])
    setCurrentDialogueId(dId)
    setMessages([])
    setShowDiagnosis(true)
  }, [])
  const handleDeleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id))
    setDialogues(prev => prev.filter(d => d.projectId !== id))
    if (currentProjectId === id) setCurrentProjectId(projects.filter(p => p.id !== id)[0]?.id ?? null)
  }, [currentProjectId, projects])
  const handleSelectProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    const first = dialogues.find(d => d.projectId === id && !d.archived)
    if (first) setCurrentDialogueId(first.id)
  }, [dialogues])
  const handleCreateDialogue = useCallback((projectId: string) => {
    const count = dialogues.filter(d => d.projectId === projectId && !d.archived).length
    const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId, createdAt: new Date().toISOString(), archived: false }
    setDialogues(prev => [...prev, d])
    setCurrentDialogueId(d.id)
    setMessages([])
  }, [dialogues])
  const handleSelectDialogue = useCallback((id: string) => { setCurrentDialogueId(id) }, [])
  const handleArchiveDialogue = useCallback((id: string) => {
    setDialogues(prev => prev.map(d => d.id === id ? { ...d, archived: true } : d))
  }, [])
  const handleRenameDialogue = useCallback((id: string, name: string) => {
    if (name.trim()) setDialogues(prev => prev.map(d => d.id === id ? { ...d, name: name.trim() } : d))
  }, [])
  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentDialogueId) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsLoading(true)
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text.trim() }) })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '抱歉，回复为空。' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，请求失败。' }])
    } finally { setIsLoading(false) }
  }, [currentDialogueId])
  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAgent(null)
  }, [])

  return (
    <div ref={appRef} className="flex h-screen w-screen bg-[#faf8f5] text-[#1a1a1a] p-2 gap-0">
      {/* 左侧栏折叠后展开按钮 */}
      {sidebarCollapsed && (
        <button onClick={() => setSidebarCollapsed(false)}
          className="flex-shrink-0 w-5 h-full flex items-center justify-center hover:bg-[#e8e2d9] rounded text-gray-400">▶</button>
      )}
      {/* 左侧栏 */}
      {!sidebarCollapsed && (
        <div style={{ width: sidebarWidth, minWidth: 180 }} className="h-full flex-shrink-0 relative">
          <Sidebar
            projects={projects} dialogues={dialogues}
            currentProjectId={currentProjectId} currentDialogueId={currentDialogueId}
            agents={agents}
            onCreateProject={handleCreateProject} onDeleteProject={handleDeleteProject}
            onSelectProject={handleSelectProject} onCreateDialogue={handleCreateDialogue}
            onSelectDialogue={handleSelectDialogue} onArchiveDialogue={handleArchiveDialogue}
            onRenameDialogue={handleRenameDialogue}
            onSelectAgent={setSelectedAgent} onSettings={() => setShowSettings(true)}
          />
          {/* 折叠按钮：右上角 */}
          <button onClick={() => setSidebarCollapsed(true)}
            className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded hover:bg-[#e8e2d9] text-gray-400 text-xs z-10"
            title="收起侧栏">◀</button>
        </div>
      )}
      {/* 左侧拖拽手柄 */}
      {!sidebarCollapsed && (
        <div onMouseDown={() => { dragging.current = 'left'; document.body.style.userSelect = 'none' }}
          className="w-1.5 h-full cursor-col-resize hover:bg-[#c75f1a]/30 flex-shrink-0 transition-colors" />
      )}
      {/* 中间 */}
      <CenterPanel
        messages={messages} isLoading={isLoading} currentProject={currentProject}
        onSendMessage={handleSendMessage}
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
      />
      {/* 右侧拖拽手柄 */}
      {!rightCollapsed && (
        <div onMouseDown={() => { dragging.current = 'right'; document.body.style.userSelect = 'none' }}
          className="w-1.5 h-full cursor-col-resize hover:bg-[#c75f1a]/30 flex-shrink-0 transition-colors" />
      )}
      {/* 右侧栏 */}
      {!rightCollapsed && (
        <div style={{ width: rightPanelWidth, minWidth: 180 }} className="h-full flex-shrink-0 relative">
          <RightPanel />
          {/* 折叠按钮：左上角 */}
          <button onClick={() => setRightCollapsed(true)}
            className="absolute top-2 left-2 w-5 h-5 flex items-center justify-center rounded hover:bg-[#e8e2d9] text-gray-400 text-xs z-10"
            title="收起右侧栏">▶</button>
        </div>
      )}
      {/* 右侧折叠后展开按钮 */}
      {rightCollapsed && (
        <button onClick={() => setRightCollapsed(false)}
          className="flex-shrink-0 w-5 h-full flex items-center justify-center hover:bg-[#e8e2d9] rounded text-gray-400">◀</button>
      )}

      {showDiagnosis && <DiagnosisModal onClose={() => setShowDiagnosis(false)} />}
      {selectedAgent && <AgentModal agent={selectedAgent} onSave={handleSaveAgent} onClose={() => setSelectedAgent(null)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showApiKeyPrompt && <ApiKeyPrompt onClose={() => { setShowApiKeyPrompt(false); localStorage.setItem('coagent-apikey-skipped', '1') }} />}
    </div>
  )
}
export default App
