import { useState } from 'react'
import { Plus, Folder, FolderOpen, Trash2, Bot } from 'lucide-react'
import type { Project } from '../App'

interface SidebarProps {
  projects: Project[]
  currentProjectId: string | null
  onCreateProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onSelectProject: (id: string) => void
}

export default function Sidebar({
  projects, currentProjectId, onCreateProject, onDeleteProject, onSelectProject,
}: SidebarProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`
    onCreateProject(name)
    setNewName('')
    setShowCreate(false)
  }

  return (
    <aside className="w-[240px] min-w-[240px] h-full bg-[#f0ebe4] border-r border-[#dad4cd] flex flex-col rounded-lg overflow-hidden">
      {/* 品牌区域 */}
      <div className="p-3 flex items-center gap-2 border-b border-[#dad4cd]">
        <Bot size={20} className="text-[#c75f1a]" />
        <span className="text-sm font-bold text-[#1a1a1a]">CoAgent-Learn</span>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#888] px-1">项目</span>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 bg-[#c75f1a] text-white text-sm font-semibold rounded-lg hover:bg-[#a84a10] transition-colors"
        >
          <Plus size={16} /> 新建项目
        </button>

        {showCreate && (
          <div className="flex flex-col gap-2 p-3 bg-white border border-[#dad4cd] rounded-lg">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="项目名称"
              className="px-3 py-1.5 border border-[#c4beb6] rounded text-sm outline-none focus:border-[#c75f1a]"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="text-xs px-3 py-1 rounded hover:bg-gray-100">取消</button>
              <button onClick={handleCreate} className="text-xs px-3 py-1 bg-[#c75f1a] text-white rounded font-semibold">创建</button>
            </div>
          </div>
        )}

        <div className="border-t border-[#dad4cd] my-1" />

        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
              project.id === currentProjectId
                ? 'bg-[#fef3eb] text-[#c75f1a] font-semibold'
                : 'hover:bg-[#e8e2d9]'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              {project.id === currentProjectId ? <FolderOpen size={16} /> : <Folder size={16} />}
              {project.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id) }}
              className="opacity-40 hover:opacity-100 hover:text-red-500 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}
