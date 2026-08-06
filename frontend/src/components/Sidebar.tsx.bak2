import { useState, useEffect } from 'react'
import {
  Plus, Folder, FolderOpen, Trash2, MessageSquare,
  Archive, ChevronDown, ChevronRight, Edit3, Settings, MoreHorizontal, Bot,
} from 'lucide-react'
import type { Project, Dialogue } from '../types'

interface Resource { id: string; name: string }

interface SidebarProps {
  projects: Project[]
  dialogues: Dialogue[]
  currentProjectId: string | null
  currentDialogueId: string | null
  onCreateProject: (name: string) => void
  onDeleteProject: (id: string) => void
  onSelectProject: (id: string) => void
  onCreateDialogue: (projectId: string, name?: string) => void
  onSelectDialogue: (id: string) => void
  onArchiveDialogue: (id: string) => void
  onRenameDialogue: (id: string, name: string) => void
  onRenameProject: (id: string, name: string) => void
  onProjectKnowledge?: (projectId: string) => void
  onSettings: () => void
}

export default function Sidebar({
  projects, dialogues, currentProjectId, currentDialogueId,
  onCreateProject, onDeleteProject, onSelectProject,
  onCreateDialogue, onSelectDialogue, onArchiveDialogue, onRenameDialogue,
  onRenameProject,
  onProjectKnowledge,
  onSettings,
}: SidebarProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(projects.map(p => p.id)))
  const [editingDialogue, setEditingDialogue] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [projectEditName, setProjectEditName] = useState('')
  
  const [confirmMsg, setConfirmMsg] = useState("")
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [expandedResources, setExpandedResources] = useState(true)
  const [showSaveResource, setShowSaveResource] = useState(false)
  const [resName, setResName] = useState('')
  const [resContent, setResContent] = useState('')

  // 加载资源
  useEffect(() => {
    if (!currentProjectId) return
    fetch('/api/resources?project_id=' + encodeURIComponent(currentProjectId), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setResources(d.resources || []))
      .catch(() => {})
  }, [currentProjectId])

  const saveResource = () => {
    if (!resName.trim() || !currentProjectId) return
    fetch('/api/resources', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: resName.trim(), content: resContent, project_id: currentProjectId }) })
      .then(() => { setShowSaveResource(false); setResName(''); setResContent('')
        fetch('/api/resources?project_id=' + encodeURIComponent(currentProjectId)).then(r => r.json()).then(d => setResources(d.resources || [])) })
  }

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
    <div className="p-3 flex items-center gap-2 border-b border-[#e5e5e5]">
      <Bot size={20} className="text-[#1a1a1a]" />
      <span className="text-sm font-bold flex-1">CoAgent-Learn</span>
      <button
        onClick={() => setShowCreate(true)}
        className="p-1 rounded hover:bg-[#ededed] text-gray-400 hover:text-[#1a1a1a]"
        title="新建项目"
      >
        <Plus size={16} />
      </button>
    </div>
  )


  /** 项目列表 + 对话窗口（仿 workbuddy） */
  const renderProjects = () => (
    <div className="overflow-y-auto flex-shrink-0" style={{ maxHeight: '40%' }}>
      {showCreate && (
        <div className="flex gap-1 px-3 py-2">
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="项目名称"
            className="flex-1 px-2 py-1 text-xs border border-[#d0d0d0] rounded outline-none focus:border-[#1a1a1a]"
          />
          <button onClick={handleCreate} className="px-2 py-1 text-xs bg-[#1a1a1a] text-white rounded font-semibold">创建</button>
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
              className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer text-sm transition-colors ${
                isActive ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'hover:bg-[#ededed]'
              } group`}
            >
              <span className="flex-shrink-0" onClick={() => { onSelectProject(project.id); toggleExpand(project.id) }}>
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {isActive ? <FolderOpen size={14} className="flex-shrink-0" /> : <Folder size={14} className="flex-shrink-0" />}
              {/* 项目名：可编辑 */}
              {editingProject === project.id ? (
                <input autoFocus value={projectEditName}
                  onChange={(e) => setProjectEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && projectEditName.trim()) { onRenameProject(project.id, projectEditName.trim()); setEditingProject(null) }
                    if (e.key === 'Escape') setEditingProject(null)
                  }}
                  onBlur={() => { if (projectEditName.trim()) onRenameProject(project.id, projectEditName.trim()); setEditingProject(null) }}
                  className="flex-1 px-1 py-0 text-[11px] border border-[#1a1a1a] rounded outline-none bg-white min-w-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate text-xs font-medium" onClick={() => { onSelectProject(project.id); toggleExpand(project.id) }}>{project.name}</span>
              )}
              {/* 三点菜单 → 直接打开项目配置窗口 */}
              <button onClick={(e) => { e.stopPropagation(); onProjectKnowledge?.(project.id) }}
                className="opacity-50 hover:opacity-100 p-0.5 hover:text-[#1a1a1a] flex-shrink-0" title="项目配置">
                <MoreHorizontal size={13} />
              </button>
              {/* 编辑按钮 */}
              <button onClick={(e) => { e.stopPropagation(); setEditingProject(project.id); setProjectEditName(project.name) }}
                className="opacity-50 hover:opacity-100 p-0.5 hover:text-[#1a1a1a] flex-shrink-0" title="重命名">
                <Edit3 size={10} />
              </button>
              {/* 删除按钮 */}
              <button onClick={(e) => { e.stopPropagation(); { setConfirmMsg('确定删除此项目及其所有对话？'); setConfirmAction(() => () => onDeleteProject(project.id)) } }}
                className="opacity-50 hover:opacity-100 hover:text-red-500 p-0.5 flex-shrink-0">
                <Trash2 size={11} />
              </button>
              {/* 新建对话 */}
              <button onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); onCreateDialogue(project.id) }}
                className="opacity-50 hover:opacity-100 hover:text-[#1a1a1a] p-0.5 flex-shrink-0" title="新建对话">
                <Plus size={12} />
              </button>
            </div>

            {/* 对话窗口列表 */}
            {isExpanded && (
              <div className="ml-4 border-l border-[#e5e5e5]">
                {projectDialogues.length === 0 && (
                  <p className="text-[10px] text-gray-400 px-3 py-1">暂无对话</p>
                )}
                {projectDialogues.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onSelectDialogue(d.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 cursor-pointer text-xs transition-colors ${
                      d.id === currentDialogueId
                        ? 'bg-[#f0f0f0] text-[#1a1a1a] font-medium'
                        : 'hover:bg-[#ededed] text-gray-600'
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
                        className="flex-1 px-1 py-0 text-[11px] border border-[#1a1a1a] rounded outline-none bg-white"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate">{d.name}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDialogue(d.id); setEditName(d.name) }}
                      className="opacity-40 hover:opacity-100 p-0.5 hover:text-[#1a1a1a]"
                      title="重命名"
                    >
                      <Edit3 size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); { setConfirmMsg('确定归档此对话？'); setConfirmAction(() => () => onArchiveDialogue(d.id)) } }}
                      className="opacity-40 hover:opacity-100 p-0.5 hover:text-yellow-600"
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

  /** 资源列表 */
  const renderResources = () => (
    <div className="border-t border-[#e5e5e5] flex-shrink-0">
      <div className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-[#ededed]" onClick={() => setExpandedResources(!expandedResources)}>
        <span className="flex-shrink-0">{expandedResources ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        <span className="text-xs font-semibold flex-1">资源</span>
      </div>
      {expandedResources && (
        <div className="ml-4 border-l border-[#e5e5e5]">
          {resources.map(r => (
            <div key={r.id}
              className="flex items-center gap-1.5 px-3 py-1 cursor-pointer text-xs hover:bg-[#ededed] text-gray-600">
              <span>{r.name}</span>
            </div>
          ))}
          <button onClick={() => setShowSaveResource(true)} className="flex items-center gap-1 px-3 py-1 text-xs text-gray-400 hover:text-[#1a1a1a]">
            ＋ 保存资料
          </button>
        </div>
      )}
      {showSaveResource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) setShowSaveResource(false) }}>
          <div className="bg-white rounded-2xl shadow-xl w-80 p-4" onMouseDown={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-2">保存资料</h3>
            <input value={resName} onChange={e => setResName(e.target.value)} placeholder="资料名称" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 outline-none" />
            <textarea value={resContent} onChange={e => setResContent(e.target.value)} placeholder="粘贴资料内容" rows={5} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none resize-none mb-2" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveResource(false)} className="text-xs px-3 py-1.5 text-gray-500">取消</button>
              <button onClick={saveResource} className="text-xs px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (

    <aside className="w-full h-full bg-[#f5f5f5] border-r border-[#e5e5e5] flex flex-col rounded-lg overflow-hidden relative">
      {renderHeader()}
      {renderProjects()}
      <div className="flex-1" />
      <div className="absolute left-0 right-0" style={{ top: "50%", marginTop: -12 }}>
        {renderResources()}
      </div>
      <div className="px-3 py-1.5 border-t border-[#e5e5e5] flex justify-end">
        <button onClick={onSettings} className="p-1.5 rounded-lg hover:bg-[#ededed] text-[#888] hover:text-[#1a1a1a] transition-colors" title="设置">
          <Settings size={16} />
        </button>
      </div>
      {confirmMsg && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setConfirmMsg(""); setConfirmAction(null) }}>
          <div className="bg-white rounded-xl shadow-lg p-4 mx-4 text-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-3 text-gray-700">{confirmMsg}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmMsg(""); setConfirmAction(null) }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">取消</button>
              <button onClick={() => { confirmAction?.(); setConfirmMsg(""); setConfirmAction(null) }} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600">确认</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
