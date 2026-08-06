import { useState, useEffect } from 'react'
import {
  Plus, Folder, Trash2, MessageSquare,
  Archive, ChevronDown, ChevronRight, Edit3, Settings, MoreHorizontal,
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

  return (
    <aside className="w-full h-full flex flex-col overflow-hidden relative">
      {/* 面板头：标题 + 新建 */}
      <div className="px-4 pt-4 pb-2 flex items-center flex-shrink-0">
        <span className="text-[11px] font-semibold text-dim uppercase tracking-widest flex-1">项目</span>
        <button
          onClick={() => setShowCreate(true)}
          className="w-7 h-7 flex items-center justify-center rounded-xl icon-btn"
          title="新建项目"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 项目 + 对话列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {showCreate && (
          <div className="flex gap-1.5 px-2 py-2">
            <input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="项目名称"
              className="flex-1 px-2.5 py-1.5 text-xs input-surface rounded-xl outline-none min-w-0"
            />
            <button onClick={handleCreate} className="px-3 py-1.5 text-xs btn-primary font-semibold">创建</button>
          </div>
        )}

        {projects.map((project) => {
          const isExpanded = expandedProjects.has(project.id)
          const projectDialogues = dialogues.filter(d => d.projectId === project.id && !d.archived)
          const isActive = project.id === currentProjectId

          return (
            <div key={project.id} className="mb-1">
              {/* 项目行 */}
              <div
                className={`flex items-center gap-1 px-2.5 py-2 cursor-pointer text-sm transition-all rounded-2xl ${
                  isActive ? 'card-surface text-[#1a1a1a]' : 'row-hover'
                } group`}
              >
                <span className="flex-shrink-0 text-dim" onClick={() => { onSelectProject(project.id); toggleExpand(project.id) }}>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
                <Folder size={14} className="flex-shrink-0 text-dim" />
                {/* 项目名：可编辑 */}
                {editingProject === project.id ? (
                  <input autoFocus value={projectEditName}
                    onChange={(e) => setProjectEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && projectEditName.trim()) { onRenameProject(project.id, projectEditName.trim()); setEditingProject(null) }
                      if (e.key === 'Escape') setEditingProject(null)
                    }}
                    onBlur={() => { if (projectEditName.trim()) onRenameProject(project.id, projectEditName.trim()); setEditingProject(null) }}
                    className="flex-1 px-1.5 py-0.5 text-[11px] input-surface rounded-lg outline-none min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 truncate text-xs font-medium" onClick={() => { onSelectProject(project.id); toggleExpand(project.id) }}>{project.name}</span>
                )}
                {/* 三点菜单 → 项目配置 */}
                <button onClick={(e) => { e.stopPropagation(); onProjectKnowledge?.(project.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg icon-btn flex-shrink-0" title="项目配置">
                  <MoreHorizontal size={13} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingProject(project.id); setProjectEditName(project.name) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg icon-btn flex-shrink-0" title="重命名">
                  <Edit3 size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); { setConfirmMsg('确定删除此项目及其所有对话？'); setConfirmAction(() => () => onDeleteProject(project.id)) } }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:text-red-500 flex-shrink-0" title="删除">
                  <Trash2 size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onSelectProject(project.id); onCreateDialogue(project.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg icon-btn flex-shrink-0" title="新建对话">
                  <Plus size={12} />
                </button>
              </div>

              {/* 对话列表 */}
              {isExpanded && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5">
                  {projectDialogues.length === 0 && (
                    <p className="text-[10px] text-dim px-2.5 py-1">暂无对话</p>
                  )}
                  {projectDialogues.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => onSelectDialogue(d.id)}
                      className={`group flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer text-xs transition-all rounded-xl ${
                        d.id === currentDialogueId
                          ? 'card-surface text-[#1a1a1a] font-medium'
                          : 'row-hover text-dim'
                      }`}
                    >
                      <MessageSquare size={11} className="flex-shrink-0" />
                      {editingDialogue === d.id ? (
                        <input
                          autoFocus value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { onRenameDialogue(d.id, editName); setEditingDialogue(null) }
                            if (e.key === 'Escape') setEditingDialogue(null)
                          }}
                          onBlur={() => { onRenameDialogue(d.id, editName); setEditingDialogue(null) }}
                          className="flex-1 px-1.5 py-0.5 text-[11px] input-surface rounded-lg outline-none min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate">{d.name}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingDialogue(d.id); setEditName(d.name) }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded icon-btn"
                        title="重命名"
                      >
                        <Edit3 size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); { setConfirmMsg('确定归档此对话？'); setConfirmAction(() => () => onArchiveDialogue(d.id)) } }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-yellow-600"
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

      {/* 资源列表 */}
      <div className="flex-shrink-0 px-2 pb-2">
        <div className="flex items-center gap-1 px-2.5 py-1.5 cursor-pointer rounded-xl row-hover" onClick={() => setExpandedResources(!expandedResources)}>
          <span className="flex-shrink-0 text-dim">{expandedResources ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="text-[11px] font-semibold text-dim uppercase tracking-widest flex-1">资源</span>
        </div>
        {expandedResources && (
          <div className="ml-2 flex flex-col gap-0.5">
            {resources.map(r => (
              <div key={r.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer text-xs row-hover rounded-xl text-dim">
                <span className="truncate">{r.name}</span>
              </div>
            ))}
            <button onClick={() => setShowSaveResource(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-dim hover:text-[#1a1a1a] rounded-xl row-hover">
              <Plus size={11} /> 保存资料
            </button>
          </div>
        )}
      </div>

      {/* 底部设置 */}
      <div className="px-3 py-2 flex justify-end flex-shrink-0">
        <button onClick={onSettings} className="w-8 h-8 flex items-center justify-center rounded-xl icon-btn" title="设置">
          <Settings size={15} />
        </button>
      </div>

      {/* 保存资料弹窗 */}
      {showSaveResource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) setShowSaveResource(false) }}>
          <div className="card-lift w-80 p-5" onMouseDown={e => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-3">保存资料</h3>
            <input value={resName} onChange={e => setResName(e.target.value)} placeholder="资料名称" className="w-full px-3 py-2 input-surface rounded-xl text-sm mb-2 outline-none" />
            <textarea value={resContent} onChange={e => setResContent(e.target.value)} placeholder="粘贴资料内容" rows={5} className="w-full px-3 py-2 input-surface rounded-xl text-sm outline-none resize-none mb-3" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveResource(false)} className="text-xs px-4 py-2 text-dim rounded-full row-hover">取消</button>
              <button onClick={saveResource} className="text-xs px-4 py-2 btn-primary font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 确认弹窗 */}
      {confirmMsg && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => { setConfirmMsg(""); setConfirmAction(null) }}>
          <div className="card-lift p-5 mx-4 text-sm" onClick={e => e.stopPropagation()}>
            <p className="mb-4">{confirmMsg}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirmMsg(""); setConfirmAction(null) }} className="px-4 py-2 text-xs text-dim rounded-full row-hover">取消</button>
              <button onClick={() => { confirmAction?.(); setConfirmMsg(""); setConfirmAction(null) }} className="px-4 py-2 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 font-semibold">确认</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
