import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import DiagnosisModal from './components/DiagnosisModal'
import AgentModal from './components/AgentModal'
import type { Project, Dialogue, AgentConfig, Message } from './types'
import { DEFAULT_AGENTS } from './types'

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

const defaultProjectId = generateId()

function App() {
  const [projects, setProjects] = useState<Project[]>([
    { id: defaultProjectId, name: '默认项目' },
  ])
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

  const currentProject = projects.find(p => p.id === currentProjectId) ?? null

  // ---- Project CRUD ----
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
    if (currentProjectId === id) {
      const remaining = projects.filter(p => p.id !== id)
      setCurrentProjectId(remaining[0]?.id ?? null)
    }
  }, [currentProjectId, projects])

  const handleSelectProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    const firstDialogue = dialogues.find(d => d.projectId === id && !d.archived)
    if (firstDialogue) setCurrentDialogueId(firstDialogue.id)
  }, [dialogues])

  // ---- Dialogue CRUD ----
  const handleCreateDialogue = useCallback((projectId: string) => {
    const count = dialogues.filter(d => d.projectId === projectId && !d.archived).length
    const d: Dialogue = { id: generateId(), name: `对话 ${count + 1}`, projectId, createdAt: new Date().toISOString(), archived: false }
    setDialogues(prev => [...prev, d])
    setCurrentDialogueId(d.id)
    setMessages([])
  }, [dialogues])

  const handleSelectDialogue = useCallback((id: string) => {
    setCurrentDialogueId(id)
  }, [])

  const handleArchiveDialogue = useCallback((id: string) => {
    setDialogues(prev => prev.map(d => d.id === id ? { ...d, archived: true } : d))
  }, [])

  const handleRenameDialogue = useCallback((id: string, name: string) => {
    if (name.trim()) setDialogues(prev => prev.map(d => d.id === id ? { ...d, name: name.trim() } : d))
  }, [])

  // ---- Messages ----
  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentDialogueId) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '抱歉，回复为空。' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，请求失败，请检查后端服务。' }])
    } finally {
      setIsLoading(false)
    }
  }, [currentDialogueId])

  // ---- Agent ----
  const handleSaveAgent = useCallback((updated: AgentConfig) => {
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAgent(null)
  }, [])

  return (
    <div className="flex h-screen w-screen bg-[#faf8f5] text-[#1a1a1a] p-2 gap-2">
      <Sidebar
        projects={projects}
        dialogues={dialogues}
        currentProjectId={currentProjectId}
        currentDialogueId={currentDialogueId}
        agents={agents}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onSelectProject={handleSelectProject}
        onCreateDialogue={handleCreateDialogue}
        onSelectDialogue={handleSelectDialogue}
        onArchiveDialogue={handleArchiveDialogue}
        onRenameDialogue={handleRenameDialogue}
        onSelectAgent={setSelectedAgent}
      />
      <CenterPanel
        messages={messages}
        isLoading={isLoading}
        currentProject={currentProject}
        onSendMessage={handleSendMessage}
      />
      <RightPanel />

      {showDiagnosis && <DiagnosisModal onClose={() => setShowDiagnosis(false)} />}
      {selectedAgent && (
        <AgentModal agent={selectedAgent} onSave={handleSaveAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  )
}

export default App
