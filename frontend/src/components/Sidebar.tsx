import { useState } from 'react'
import { Plus, Folder, FolderOpen, Trash2, Settings } from 'lucide-react'

interface SidebarProps {
  currentProject: string | null
  onSelect: (name: string) => void
}

export default function Sidebar({ currentProject, onSelect }: SidebarProps) {
  const [projects, setProjects] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`
    if (!projects.includes(name)) {
      setProjects([...projects, name])
      onSelect(name)
    }
    setNewName('')
    setShowCreate(false)
  }

  const handleDelete = (name: string) => {
    setProjects(projects.filter((p) => p !== name))
    if (currentProject === name) onSelect('')
  }

  return (
    <aside className="w-[240px] min-w-[240px] h-full bg-[#f0ebe4] border-r border-[#dad4cd] flex flex-col rounded-lg overflow-hidden">
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

        {projects.length === 0 ? (
          <p className="text-xs text-gray-400 px-3 py-4">暂无项目</p>
        ) : (
          projects.map((name) => (
            <div
              key={name}
              onClick={() => onSelect(name)}
              className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                name === currentProject
                  ? 'bg-[#fef3eb] text-[#c75f1a] font-semibold'
                  : 'hover:bg-[#e8e2d9]'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                {name === currentProject ? <FolderOpen size={16} /> : <Folder size={16} />}
                {name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(name) }}
                className="opacity-40 hover:opacity-100 hover:text-red-500 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t border-[#dad4cd] flex justify-end">
        <button className="p-1.5 rounded-lg hover:bg-[#e8e2d9] text-[#888] transition-colors" title="设置">
          <Settings size={18} />
        </button>
      </div>
    </aside>
  )
}
