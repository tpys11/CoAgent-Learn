/** 普通卡片网格 + 空状态（ResourceView 拆分子组件，5.1） */
import { ExternalLink, Download, Trash2, FolderOpen } from 'lucide-react'
import { ListItem } from './commons'

export function ResourceCardGrid({ items, onOpen, onUseItem, onDelete, onExport }: {
  items: ListItem[]
  onOpen: (item: ListItem) => void
  onUseItem?: (title: string, body: string, url?: string) => void
  onDelete: (item: ListItem) => void
  onExport: (item: ListItem) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {items.map(item => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            onClick={() => onOpen(item)}
            draggable={!!onUseItem}
            onDragStart={onUseItem ? (e) => { e.dataTransfer.setData('text/obs-item', JSON.stringify({ title: item.title, body: item.body || '', url: item.url || '' })); e.dataTransfer.effectAllowed = 'copy' } : undefined}
            className="group card-surface rounded-2xl p-6 flex flex-col gap-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)]"
          >
            <div className="flex items-start justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#1a1a1a] text-white flex items-center justify-center">
                <Icon size={20} />
              </span>
              <div className="flex items-center gap-1.5">
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="打开链接">
                    <ExternalLink size={15} />
                  </a>
                )}
                {item.kind !== 'tutorial' && item.body && (
                  <button onClick={(e) => { e.stopPropagation(); onExport(item) }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-[var(--accent)] transition-colors" title="导出为文件">
                    <Download size={15} />
                  </button>
                )}
                {item.deletable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(item) }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--bg-hover)] text-dim hover:bg-[var(--bg-active)] hover:text-red-500 transition-colors" title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-base font-semibold leading-snug">{item.title}</p>
          </div>
        )
      })}
    </div>
  )
}

/** 空状态 */
export function ResourceEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
        <FolderOpen size={22} className="text-dim" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
      <p className="text-xs text-dim mt-1.5">{hint}</p>
    </div>
  )
}