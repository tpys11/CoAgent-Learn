import { useState, useCallback, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import CenterPanel from './components/CenterPanel'
import RightPanel from './components/RightPanel'
import DiagnosisModal from './components/DiagnosisModal'
import AgentModal from './components/AgentModal'
import SettingsModal, { ApiKeyPrompt } from './components/SettingsModal'
import AgentFlow from './components/AgentFlow'
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
  // 启动时应用保存的字体大小
  useEffect(() => {
    const saved = localStorage.getItem('coagent-fontSize')
    if (saved) document.documentElement.style.fontSize = saved + 'px'
  }, [])
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(
    () => !localStorage.getItem('coagent-apikey') && !localStorage.getItem('coagent-apikey-skipped')
  )
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [rightPanelWidth, setRightPanelWidth] = useState(260)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [flowVisible, setFlowVisible] = useState(false)
  const [flowMinimized, setFlowMinimized] = useState(false)
  const [flowAgents, setFlowAgents] = useState<string[]>([])
  const [flowActiveAgent, setFlowActiveAgent] = useState<string | null>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const btnDragged = useRef(false)
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
  const handleSendMessage = useCallback(async (text: string, settings?: Record<string, any>) => {
    if (!currentDialogueId) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsLoading(true)
    setFlowVisible(true); setFlowMinimized(false); setFlowAgents([]); setFlowActiveAgent(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), api_key: localStorage.getItem('coagent-apikey') || undefined, settings: settings || {} }),
      })
      const reader = res.body!.getReader(); const decoder = new TextDecoder()
      let finalReply = ''; const steps: any[] = []
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = JSON.parse(line.slice(6))
          if (data.type === 'step') {
            setFlowAgents(prev => prev.includes(data.agent) ? prev : [...prev, data.agent])
            setFlowActiveAgent(data.agent)
          }
          if (data.type === 'done') { finalReply = data.reply; steps.push(...(data.steps || [])) }
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: finalReply || '处理完成', steps }])
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
        <>
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
        </div>
        {/* 左侧拖拽手柄 */}
        <div onMouseDown={() => { dragging.current = 'left'; document.body.style.userSelect = 'none' }}
          className="w-1.5 h-full cursor-col-resize hover:bg-[#c75f1a]/30 flex-shrink-0 transition-colors" />
          {/* 折叠按钮：右侧 */}
          <button onClick={() => setSidebarCollapsed(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-[#dad4cd] text-gray-400 hover:text-[#c75f1a] text-xs shadow-sm flex-shrink-0 self-start mt-2"
            title="收起侧栏">◀</button>
        </>
      )}
      {/* 中间 */}
      <CenterPanel
        messages={messages} isLoading={isLoading} currentProject={currentProject}
        onSendMessage={handleSendMessage}
        statsCollapsed={statsCollapsed} onToggleStats={() => setStatsCollapsed(!statsCollapsed)}
      />
      {/* 右侧栏 */}
      {!rightCollapsed && (
        <>
          {/* 折叠按钮：左侧 */}
          <button onClick={() => setRightCollapsed(true)}
            className="w-5 h-5 flex items-center justify-center rounded bg-white border border-[#dad4cd] text-gray-400 hover:text-[#c75f1a] text-xs shadow-sm flex-shrink-0 self-start mt-2"
            title="收起右侧栏">▶</button>
          {/* 右侧拖拽手柄 */}
          <div onMouseDown={() => { dragging.current = 'right'; document.body.style.userSelect = 'none' }}
            className="w-1.5 h-full cursor-col-resize hover:bg-[#c75f1a]/30 flex-shrink-0 transition-colors" />
          <div style={{ width: rightPanelWidth, minWidth: 180 }} className="h-full flex-shrink-0 relative">
            <RightPanel />
          </div>
        </>
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

      {/* 浮动协作流画布 */}
      {flowVisible && !flowMinimized && (
        <div ref={flowRef} className="fixed z-40 bg-white rounded-2xl shadow-2xl border border-[#dad4cd] overflow-hidden"
             style={{ left: '50%', top: '4px', transform: 'translateX(-50%)', width: '68vw', height: '32vh', minWidth: 500, minHeight: 160 }}>
          <div
            className="flex items-center justify-between px-3 py-1.5 bg-[#faf8f5] border-b border-[#dad4cd] cursor-move select-none"
            onMouseDown={(e) => {
              e.preventDefault()
              const el = flowRef.current!; const rect = el.getBoundingClientRect()
              el.style.transition = 'none'
              const sx = e.clientX - rect.left; const sy = e.clientY - rect.top
              const onMove = (ev: MouseEvent) => { el.style.left = (ev.clientX - sx) + 'px'; el.style.top = (ev.clientY - sy) + 'px'; el.style.transform = 'none' }
              const onUp = () => { el.style.transition = ''; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
              window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
            }}>
            <span className="text-[11px] font-semibold text-gray-500">多智能体协作流</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { setFlowAgents([]); setFlowActiveAgent(null) }}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e8e2d9] text-gray-500 hover:text-[#b8952e] text-sm"
                title="刷新">↻</button>
              <button onClick={() => setFlowMinimized(true)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#e8e2d9] text-gray-500 hover:text-[#b8952e] font-bold">─</button>
            </div>
          </div>
          <div style={{ height: 'calc(100% - 32px)' }}>
            <AgentFlow visible={true} agents={flowAgents} activeAgent={flowActiveAgent} />
          </div>
          {/* 八向 resize 手柄 */}
          {['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(dir => {
            const cursors: Record<string, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize' }
            const pos: Record<string, React.CSSProperties> = {
              n:  { top: 0, left: 0, width: '100%', height: 5, cursor: 'ns-resize' },
              s:  { bottom: 0, left: 0, width: '100%', height: 5, cursor: 'ns-resize' },
              e:  { right: 0, top: 0, width: 5, height: '100%', cursor: 'ew-resize' },
              w:  { left: 0, top: 0, width: 5, height: '100%', cursor: 'ew-resize' },
              ne: { top: -1, right: -1, width: 8, height: 8, cursor: 'nesw-resize' },
              nw: { top: -1, left: -1, width: 8, height: 8, cursor: 'nwse-resize' },
              se: { bottom: -1, right: -1, width: 8, height: 8, cursor: 'nwse-resize' },
              sw: { bottom: -1, left: -1, width: 8, height: 8, cursor: 'nesw-resize' },
            }
            return (
              <div key={dir} className="absolute" style={pos[dir]}
                onMouseDown={(e) => {
                  e.preventDefault(); e.stopPropagation()
                  const el = flowRef.current!
                  const r = el.getBoundingClientRect()
                  const sx = e.clientX; const sy = e.clientY
                  const sw = r.width; const sh = r.height
                  const sl = r.left; const st = r.top
                  const onMove = (ev: MouseEvent) => {
                    const dx = ev.clientX - sx; const dy = ev.clientY - sy
                    if (dir.includes('e')) el.style.width = (sw + dx) + 'px'
                    if (dir.includes('w')) { el.style.width = (sw - dx) + 'px'; el.style.left = (sl + dx) + 'px'; el.style.transform = 'none' }
                    if (dir.includes('s')) el.style.height = (sh + dy) + 'px'
                    if (dir.includes('n')) { el.style.height = (sh - dy) + 'px'; el.style.top = (st + dy) + 'px'; el.style.transform = 'none' }
                  }
                  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                  window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
                }}
              />
            )
          })}
        </div>
      )}

      {/* 最小化按钮：右侧可拖动 */}
      {flowVisible && flowMinimized && (
        <button ref={btnRef} onClick={() => { if (!btnDragged.current) setFlowMinimized(false) }}
          onMouseDown={(e) => {
            e.preventDefault(); btnDragged.current = false
            const el = btnRef.current!; const rect = el.getBoundingClientRect()
            el.style.transition = 'none'
            const sx = e.clientX - rect.left; const sy = e.clientY - rect.top
            const onMove = (ev: MouseEvent) => { btnDragged.current = true; el.style.left = (ev.clientX - sx) + 'px'; el.style.top = (ev.clientY - sy) + 'px'; el.style.right = 'auto' }
            const onUp = () => { el.style.transition = ''; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
          }}
          className="fixed z-40 bg-[#fdf8ed] border border-[#c9a84c]/40 rounded-2xl shadow-md px-4 py-2 text-sm font-semibold text-[#8b6914] hover:border-[#b8952e] hover:shadow-lg cursor-grab active:cursor-grabbing select-none"
          style={{ right: '8px', top: '36px' }}>
          🔄 工作流程
        </button>
      )}
    </div>
  )
}
export default App
