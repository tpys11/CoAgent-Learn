import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

function App() {
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])

  const handleSend = useCallback(async (text: string) => {
    if (!currentProject) return
    const userMsg: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    // TODO: connect to FastAPI backend
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: `收到你的问题：「${text}」\n\nAgent 功能即将接入。` },
    ])
  }, [currentProject])

  const handleProjectSelect = useCallback((name: string) => {
    setCurrentProject(name)
    setMessages([])
  }, [])

  return (
    <div className="flex h-screen w-screen bg-[#faf8f5] text-[#1a1a1a] p-2 gap-2">
      <Sidebar
        currentProject={currentProject}
        onSelect={handleProjectSelect}
      />
      <CenterPanel
        currentProject={currentProject}
        messages={messages}
        onSend={handleSend}
      />
      <RightPanel />
    </div>
  )
}

export default App
