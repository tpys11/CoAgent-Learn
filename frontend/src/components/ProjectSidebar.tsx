import { useEffect, useState } from 'react'
import { ArrowLeft, MessageSquare, FileText, X, Plus, ChevronDown } from 'lucide-react'

interface Dialogue { id: string; name: string }

/** 项目专属侧栏：项目记忆 / 项目资源 / 对话（不再与其他项目并列） */
export default function ProjectSidebar({ project, dialogues, currentDialogueId, onHome, onSelectDialogue, onCreateDialogue, onArchiveDialogue, onOpenMemory, onOpenResource }: {
  project: { id: string; name: string } | null
  dialogues: Dialogue[]
  currentDialogueId: string | null
  onHome: () => void
  onSelectDialogue: (id: string) => void
  onCreateDialogue: () => void
  onArchiveDialogue: (id: string) => void
  onOpenMemory: () => void
  onOpenResource: () => void
}) {
  const [memSummary, setMemSummary] = useState<Record<string, any>>({})
  const [kbDocs, setKbDocs] = useState<Array<{ source: string; chunks: number }>>([])
  // 区块折叠：记忆与进程 / 资源 / 对话（点击标题栏展开/收起，与右侧栏一致）
  const [collapsed, setCollapsed] = useState<Record<'memory' | 'resource' | 'chat', boolean>>({ memory: false, resource: false, chat: false })
  const toggle = (k: 'memory' | 'resource' | 'chat') => setCollapsed(prev => ({ ...prev, [k]: !prev[k] }))
  useEffect(() => {
    if (!project) { setMemSummary({}); setKbDocs([]); return }
    fetch('/api/project-memory/' + encodeURIComponent(project.id), { cache: 'no-store' })
      .then(r => r.json()).then(d => setMemSummary(d.memory || {})).catch(() => setMemSummary({}))
    fetch('/api/kb/' + encodeURIComponent(project.id), { cache: 'no-store' })
      .then(r => r.json()).then(d => setKbDocs(Array.isArray(d) ? d : [])).catch(() => setKbDocs([]))
  }, [project?.id])

  const memLines: Array<[string, string]> = []
  if (memSummary['目标']) memLines.push(['目标', String(memSummary['目标'])])
  if (memSummary['当前水平']) memLines.push(['当前水平', String(memSummary['当前水平'])])
  if (memSummary['偏好']) memLines.push(['偏好', Array.isArray(memSummary['偏好']) ? memSummary['偏好'].join('、') : String(memSummary['偏好'])])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶部：返回主页 + 项目名 */}
      <div className="p-3.5 border-b hairline flex flex-col gap-2.5 flex-shrink-0">
        <button onClick={onHome} className="flex items-center gap-1.5 text-[11px] text-dim hover:text-[var(--text)] transition-colors w-fit">
          <ArrowLeft size={13} /> 返回主页
        </button>
        <p className="text-sm font-bold truncate">{project?.name || '项目'}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {/* 记忆与进程：点击标题展开/收起 */}
        <div className="flex flex-col gap-2">
          <button onClick={() => toggle('memory')} className="flex items-center gap-1.5 text-xs font-semibold text-dim uppercase tracking-wider">
            记忆与进程
            <ChevronDown size={12} className={`transition-transform ${collapsed.memory ? '' : 'rotate-180'}`} />
          </button>
          {!collapsed.memory && (
            <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                {memLines.length === 0
                  ? '暂无记忆，对话后自动分析生成。'
                  : memLines.map(([k, v]) => `${k}：${v}`).join('；')}
              </p>
              <button onClick={onOpenMemory} className="text-[10px] font-semibold text-[var(--accent)] hover:underline ml-auto">
                查看更多
              </button>
            </div>
          )}
        </div>
        {/* 资源：点击标题展开/收起 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button onClick={() => toggle('resource')} className="flex items-center gap-1.5 text-xs font-semibold text-dim uppercase tracking-wider">
              资源
              <ChevronDown size={12} className={`transition-transform ${collapsed.resource ? '' : 'rotate-180'}`} />
            </button>
            {!collapsed.resource && (
              <button onClick={onOpenResource} className="text-[10px] px-2.5 py-1 rounded-lg bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors">上传资源</button>
            )}
          </div>
          {!collapsed.resource && (
            <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-1.5">
              {kbDocs.length === 0 ? (
                <p className="text-[10px] text-dim">暂无资源，点「上传资源」添加</p>
              ) : kbDocs.map(d => (
                <div key={d.source} className="flex items-center gap-2">
                  <FileText size={11} className="text-dim flex-shrink-0" />
                  <span className="text-[10px] truncate flex-1">{d.source}</span>
                  <span className="text-[9px] text-dim flex-shrink-0">{d.chunks}块</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 对话：点击标题展开/收起 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button onClick={() => toggle('chat')} className="flex items-center gap-1.5 text-xs font-semibold text-dim uppercase tracking-wider">
              对话
              <ChevronDown size={12} className={`transition-transform ${collapsed.chat ? '' : 'rotate-180'}`} />
            </button>
            {!collapsed.chat && (
              <button onClick={onCreateDialogue} className="text-[10px] px-2 py-1 rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 新建</button>
            )}
          </div>
          {!collapsed.chat && (
            <div className="flex flex-col gap-1">
              {dialogues.length === 0 ? (
                <p className="text-[10px] text-dim">暂无对话，新建一个开始</p>
              ) : dialogues.map(d => (
                <div key={d.id} className="group relative">
                  <button onClick={() => onSelectDialogue(d.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] text-left transition-colors ${d.id === currentDialogueId ? 'bg-[#1a1a1a] text-white' : 'hover:bg-[var(--bg-hover)]'}`}>
                    <MessageSquare size={11} className="flex-shrink-0 opacity-70" />
                    <span className="truncate flex-1">{d.name}</span>
                  </button>
                  <button onClick={() => onArchiveDialogue(d.id)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-dim opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all" title="归档对话">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
