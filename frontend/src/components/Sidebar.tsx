import { useState } from 'react'
import {
  Plus, Folder, FolderOpen, Trash2, Bot, MessageSquare,
  Archive, ChevronDown, ChevronRight, Edit3, Check, Settings,
} from 'lucide-react'
import type { Project, Dialogue, AgentConfig } from '../types'

interface SidebarProps {
  projects: Project[]
  dialogues: Dialogue[]
  currentProjectId: string | null
  currentDialogueId: string | null
  agents: AgentConfig[]
  onCreateProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onSelectProject: (id: string) => void
  onCreateDialogue: (projectId: string, name?: string) => void
  onSelectDialogue: (id: string) => void
  onArchiveDialogue: (id: string) => void
  onRenameDialogue: (id: string, name: string) => void
  onSelectAgent: (agent: AgentConfig) => void
  onSettings: () => void
}

export default function Sidebar({
  projects, dialogues, currentProjectId, currentDialogueId, agents,
  onCreateProject, onDeleteProject, onSelectProject,
  onCreateDialogue, onSelectDialogue, onArchiveDialogue, onRenameDialogue,
  onSelectAgent, onSettings,
}: SidebarProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(projects.map(p => p.id)))
  const [editingDialogue, setEditingDialogue] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const toggleExpand = (id: string) => {
    const next = new Set(expandedProjects)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpandedProjects(next)
  }

  const handleCreate = () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`
    onCreateProject(name)
    setNewName('')
    setShowCreate(false)
  }

  /** 顶部：品牌 + 新建 */
  const renderHeader = () => (
    <div className="p-3 flex items-center gap-2 border-b border-[#dad4cd]">
      <Bot size={20} className="text-[#c75f1a]" />
      <span className="text-sm font-bold flex-1">CoAgent-Learn</span>
      <button
        onClick={() => setShowCreate(true)}
        className="p-1 rounded hover:bg-[#e8e2d9] text-gray-400 hover:text-[#c75f1a]"
        title="新建项目"
      >
        <Plus size={16} />
      </button>
    </div>
  )

  /** 项目列表 + 对话窗口（仿 workbuddy） */
  const renderProjects = () => (
    <div className="flex-1 overflow-y-auto">
      {showCreate && (
        <div className="flex gap-1 px-3 py-2">
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="项目名称"
            className="flex-1 px-2 py-1 text-xs border border-[#c4beb6] rounded outline-none focus:border-[#c75f1a]"
          />
          <button onClick={handleCreate} className="px-2 py-1 text-xs bg-[#c75f1a] text-white rounded font-semibold">创建</button>
        </div>
      )}

      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.id)
        const projectDialogues = dialogues.filter(d => d.projectId === project.id && !d.archived)
        const isActive = project.id === currentProjectId

        return (
          <div key={project.id}>
            {/* 项目行 */}
            <div
              onClick={() => { onSelectProject(project.id); toggleExpand(project.id) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                isActive ? 'bg-[#fef3eb] text-[#c75f1a]' : 'hover:bg-[#e8e2d9]'
              }`}
            >
              <span className="flex-shrink-0">
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {isActive ? <FolderOpen size={14} /> : <Folder size={14} />}
              <span className="flex-1 truncate text-xs font-medium">{project.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); toggleExpand(project.id); onCreateDialogue(project.id) }}
                className="opacity-0 group-hover:opacity-100 hover:text-[#c75f1a] p-0.5"
                title="新建对话"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id) }}
                className="opacity-30 hover:opacity-100 hover:text-red-500 p-0.5"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* 对话窗口列表 */}
            {isExpanded && (
              <div className="ml-4 border-l border-[#dad4cd]">
                {projectDialogues.length === 0 && (
                  <p className="text-[10px] text-gray-400 px-3 py-1">暂无对话</p>
                )}
                {projectDialogues.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onSelectDialogue(d.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer text-xs transition-colors ${
                      d.id === currentDialogueId
                        ? 'bg-[#fef3eb] text-[#c75f1a] font-medium'
                        : 'hover:bg-[#e8e2d9] text-gray-600'
                    }`}
                  >
                    <MessageSquare size={11} />
                    {editingDialogue === d.id ? (
                      <input
                        autoFocus value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { onRenameDialogue(d.id, editName); setEditingDialogue(null) }
                          if (e.key === 'Escape') setEditingDialogue(null)
                        }}
                        onBlur={() => { onRenameDialogue(d.id, editName); setEditingDialogue(null) }}
                        className="flex-1 px-1 py-0 text-[11px] border border-[#c75f1a] rounded outline-none bg-white"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate">{d.name}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDialogue(d.id); setEditName(d.name) }}
                      className="opacity-0 hover:opacity-100 p-0.5 hover:text-[#c75f1a]"
                      title="重命名"
                    >
                      <Edit3 size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchiveDialogue(d.id) }}
                      className="opacity-0 hover:opacity-100 p-0.5 hover:text-yellow-600"
                      title="归档"
                    >
                      <Archive size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  /** Agent 列表 */
  const renderAgents = () => (
    <div className="border-t border-[#dad4cd] max-h-[50%] overflow-y-auto flex-shrink-0">
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#888]">Agent</div>
      {agents.map((agent) => (
        <div
          key={agent.id}
          onClick={() => onSelectAgent(agent)}
          className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs hover:bg-[#e8e2d9] transition-colors text-gray-600"
        >
          <span>{agent.icon}</span>
          <span className="truncate">{agent.name}</span>
        </div>
      ))}
      <div className="px-3 py-1.5 border-t border-[#dad4cd] flex justify-end">
        <button
          onClick={onSettings}
          className="p-1.5 rounded-lg hover:bg-[#e8e2d9] text-[#888] hover:text-[#c75f1a] transition-colors"
          title="设置"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )

  return (
    <aside className="w-full h-full bg-[#f0ebe4] border-r border-[#dad4cd] flex flex-col rounded-lg overflow-hidden">
      {renderHeader()}
      {renderProjects()}
      {renderAgents()}
    </aside>
  )
}
