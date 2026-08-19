import { useEffect, useState } from 'react'
import { ArrowLeft, MessageSquare, FileText, X, Plus, SlidersHorizontal, Pencil, PanelLeftClose, ChevronDown, ChevronRight, FolderOpen, FolderClosed } from 'lucide-react'
import { LS, lsGetJSON, lsSetJSON } from '../storage'
import { api } from '../api'

interface Dialogue { id: string; name: string; archived?: boolean }
interface KbTreeNode { name: string; children: KbTreeNode[]; content?: string }
interface KbDoc { source: string; chunks: number; preview: string; tree: KbTreeNode[] }

/** 课程专属侧栏：课程记忆 / 课程资源 / 对话（不再与其他课程并列） */
function KbTreeItem({ node, depth }: { node: KbTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasKids = node.children && node.children.length > 0
  return (
    <div>
      <button onClick={() => hasKids && setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 py-1 rounded-lg text-[11px] hover:bg-[var(--bg-hover)] transition-colors"
        style={{ paddingLeft: depth * 14 + 8 }}>
        {hasKids
          ? (expanded ? <ChevronDown size={11} className="text-dim flex-shrink-0" /> : <ChevronRight size={11} className="text-dim flex-shrink-0" />)
          : <FileText size={11} className="text-dim flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded && node.children?.map((c, i) => (
        <KbTreeItem key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  )
}
export default function ProjectSidebar({ project, dialogues, currentDialogueId, kbRefreshKey = 0, onHome, onSelectDialogue, onCreateDialogue, onRenameDialogue, onDeleteDialogue, onOpenMemory, onOpenResource, onCollapse }: {
  project: { id: string; name: string } | null
  dialogues: Dialogue[]
  currentDialogueId: string | null
  kbRefreshKey?: number
  onHome: () => void
  onSelectDialogue: (id: string) => void
  onCreateDialogue: () => void
  onRenameDialogue: (id: string, name: string) => void
  onDeleteDialogue: (id: string) => void
  onOpenMemory: () => void
  onOpenResource: () => void
  onCollapse: () => void
}) {
  const [memSummary, setMemSummary] = useState<Record<string, any>>({})
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([])
  // 栏目展示开关（与右侧栏一致，持久化）
  const [visible, setVisible] = useState<Record<'memory' | 'resource' | 'chat', boolean>>(() => {
    return { memory: true, resource: true, chat: true, ...lsGetJSON<Record<string, boolean>>(LS.projectSidebarV, {}) }
  })
  const [showSettings, setShowSettings] = useState(false)
  // 正在行内重命名的对话 id
  const [editingId, setEditingId] = useState<string | null>(null)
  const toggleVisible = (k: 'memory' | 'resource' | 'chat') => {
    setVisible(prev => {
      const next = { ...prev, [k]: !prev[k] }
      lsSetJSON(LS.projectSidebarV, next)
      return next
    })
  }
  const SECTIONS: Array<{ key: 'memory' | 'resource' | 'chat'; label: string }> = [
    { key: 'memory', label: '记忆与进程' },
    { key: 'resource', label: '资源' },
    { key: 'chat', label: '对话' },
  ]
  useEffect(() => {
    if (!project) { setMemSummary({}); setKbDocs([]); return }
    api.getProjectMemory(project.id)
      .then(d => setMemSummary(d.memory || {})).catch(() => setMemSummary({}))
    api.getKb(project.id)
      .then(d => setKbDocs(Array.isArray(d) ? d : [])).catch(() => setKbDocs([]))
  }, [project?.id, kbRefreshKey])

  const memLines: Array<[string, string]> = []
  if (memSummary['目标']) memLines.push(['目标', String(memSummary['目标'])])
  if (memSummary['当前水平']) memLines.push(['当前水平', String(memSummary['当前水平'])])
  if (memSummary['偏好']) memLines.push(['偏好', Array.isArray(memSummary['偏好']) ? memSummary['偏好'].join('、') : String(memSummary['偏好'])])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部：返回主页 + 课程名 + 展示设置/折叠按钮 */}
      <div className="p-3.5 border-b hairline flex flex-col gap-2.5 flex-shrink-0">
        <button onClick={onHome} className="flex items-center gap-1.5 text-[11px] text-dim hover:text-[var(--text)] transition-colors w-fit">
          <ArrowLeft size={13} /> 返回主页
        </button>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold truncate">{project?.name || '课程'}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="relative">
              <button onClick={() => setShowSettings(!showSettings)} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="左侧栏展示设置">
                <SlidersHorizontal size={13} />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 card-lift p-2 z-30 w-48">
                  <p className="text-[10px] font-semibold text-dim uppercase tracking-wider px-2 mb-1">在此处展示</p>
                  {SECTIONS.map(s => (
                    <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg row-hover cursor-pointer">
                      <input type="checkbox" checked={visible[s.key]} onChange={() => toggleVisible(s.key)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[11px]">{s.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button onClick={onCollapse} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn" title="收起侧栏">
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {/* 记忆与进程：常开，右上角 ✕ 关闭（顶部「展示设置」可重新打开） */}
        {visible.memory && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-dim uppercase tracking-wider">记忆与进程</span>
            <button onClick={() => toggleVisible('memory')} className="p-1 rounded-md text-dim hover:text-red-500 transition-colors" title="关闭此模块（可在上方「展示设置」重新打开）">
              <X size={12} />
            </button>
          </div>
          {true && (
            <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col h-[100px] overflow-hidden">
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)] line-clamp-3">
                {memLines.length === 0
                  ? '暂无记忆，对话后自动分析生成。'
                  : memLines.map(([k, v]) => `${k}：${v}`).join('；')}
              </p>
              <button onClick={onOpenMemory} className="text-[10px] font-semibold text-[var(--accent)] hover:underline ml-auto mt-auto">
                查看更多
              </button>
            </div>
          )}
        </div>
        )}
        {/* 资源：常开，右上角 ✕ 关闭（顶部「展示设置」可重新打开） */}
        {visible.resource && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-dim uppercase tracking-wider">资源</span>
            <button onClick={() => toggleVisible('resource')} className="p-1 rounded-md text-dim hover:text-red-500 transition-colors" title="关闭此模块（可在上方「展示设置」重新打开）">
              <X size={12} />
            </button>
          </div>
          {true && (
            <div className="border hairline rounded-xl p-2 bg-[var(--bg-panel)] flex flex-col">
              {kbDocs.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] px-1.5 py-1">暂无资源，可上传文件或加入系统资源。</p>
              ) : (
                <>
                  <div className="flex flex-col max-h-[30vh] overflow-y-auto">
                    {kbDocs.map(d => (
                      <div key={d.source}>
                        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg text-[11px] font-medium hover:bg-[var(--bg-hover)] transition-colors" title={d.source}>
                          <FolderClosed size={12} className="text-dim flex-shrink-0" />
                          <span className="truncate flex-1">{d.source}</span>
                          <span className="text-[9px] text-dim flex-shrink-0">{d.chunks}</span>
                        </div>
                        {d.tree && d.tree.length > 0 && (
                          <div className="ml-2">
                            {d.tree.map((n, i) => <KbTreeItem key={i} node={n} depth={1} />)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-dim px-1.5 pt-1">共 {kbDocs.length} 份文档</p>
                </>
              )}
              <button onClick={onOpenResource} className="text-[10px] font-semibold text-[var(--accent)] hover:underline ml-auto mt-1">
                查看更多
              </button>
            </div>
          )}
        </div>
        )}
        {/* 对话：常开，右上角 ✕ 关闭（顶部「展示设置」可重新打开） */}
        {visible.chat && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-dim uppercase tracking-wider">对话</span>
            <div className="flex items-center gap-1">
              <button onClick={onCreateDialogue} className="text-[10px] px-2 py-1 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 新建</button>
              <button onClick={() => toggleVisible('chat')} className="p-1 rounded-md text-dim hover:text-red-500 transition-colors" title="关闭此模块（可在上方「展示设置」重新打开）">
                <X size={12} />
              </button>
            </div>
          </div>
          {true && (
            <div className="flex flex-col gap-1">
              {(() => {
                const active = dialogues.filter(d => !d.archived)
                if (active.length === 0) return <p className="text-[10px] text-dim">暂无对话，新建一个开始</p>
                return active.map(d => (
                <div key={d.id} className="group relative">
                  {editingId === d.id ? (
                    <input autoFocus defaultValue={d.name}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { onRenameDialogue(d.id, (e.target as HTMLInputElement).value); setEditingId(null) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={(e) => { onRenameDialogue(d.id, e.target.value); setEditingId(null) }}
                      className="w-full px-2 py-1.5 rounded-lg text-[11px] border hairline outline-none bg-[var(--bg-input)]" />
                  ) : (
                  <>
                  <button onClick={() => onSelectDialogue(d.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors ${d.id === currentDialogueId ? 'bg-[#1a1a1a] text-white' : 'hover:bg-[var(--bg-hover)]'}`}>
                    <MessageSquare size={11} className="flex-shrink-0 opacity-70" />
                    <span className="truncate flex-1">{d.name}</span>
                  </button>
                  {/* 重命名/删除：持久化显示（不依赖 hover） */}
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button onClick={() => setEditingId(d.id)} className="p-1.5 rounded-md text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors" title="重命名">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => onDeleteDialogue(d.id)} className="p-1.5 rounded-md text-dim hover:bg-red-50 hover:text-red-500 transition-colors" title="删除对话">
                      <X size={14} />
                    </button>
                  </div>
                  </>
                  )}
                </div>
              ))
              })()}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
