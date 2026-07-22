import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import DiagnosisModal from './components/DiagnosisModal'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Project {
  id: string
  name: string
}

function App() {
  const [projects, setProjects] = useState<Project[]>([
    { id: '1', name: '默认项目' },
  ])
  const [currentProjectId, setCurrentProjectId] = useState<string | null>('1')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDiagnosis, setShowDiagnosis] = useState(false)

  const currentProject = projects.find(p => p.id === currentProjectId) ?? null

  const handleCreateProject = useCallback((name: string) => {
    const id = Date.now().toString()
    const newProject: Project = { id, name: name || `项目 ${projects.length + 1}` }
    setProjects(prev => [...prev, newProject])
    setCurrentProjectId(id)
    setMessages([])
    setShowDiagnosis(true)
  }, [projects.length])

  const handleDeleteProject = useCallback((id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id))
    if (currentProjectId === id) {
      setCurrentProjectId(projects.length > 1 ? projects[0].id : null)
    }
  }, [currentProjectId, projects])

  const handleSelectProject = useCallback((id: string) => {
    setCurrentProjectId(id)
    setMessages([])
  }, [])

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentProjectId) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), project_id: currentProjectId ?? undefined }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '抱歉，回复为空。' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，请求失败，请检查后端服务是否运行。' }])
    } finally {
      setIsLoading(false)
    }
  }, [currentProjectId])

  return (
    <div className="flex h-screen w-screen bg-[#faf8f5] text-[#1a1a1a] p-2 gap-2">
      <Sidebar
        projects={projects}
        currentProjectId={currentProjectId}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onSelectProject={handleSelectProject}
      />
      <CenterPanel
        messages={messages}
        isLoading={isLoading}
        currentProject={currentProject}
        onSendMessage={handleSendMessage}
      />
      <RightPanel />

      {showDiagnosis && (
        <DiagnosisModal onClose={() => setShowDiagnosis(false)} />
      )}
    </div>
  )
}

export default App
