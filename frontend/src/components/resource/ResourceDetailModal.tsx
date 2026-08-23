/** 详情模态（ResourceView 拆分子组件，5.1） */
import { ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { ListItem } from './commons'

export function ResourceDetailModal({ detail, onClose, onUseItem, onDelete }: {
  detail: ListItem
  onClose: () => void
  onUseItem?: (title: string, body: string, url?: string) => void
  onDelete: (item: ListItem) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2">
            <detail.icon size={16} /> {detail.title}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-[11px] text-dim mb-3">{detail.sub}</p>
          {detail.url && (
            <a href={detail.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 mb-4 text-sm font-medium text-white rounded-xl shadow-soft hover:scale-105 transition-transform"
              style={{ background: 'var(--accent)' }}>
              <ExternalLink size={14} /> 打开链接
            </a>
          )}
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-muted)]">{detail.body}</div>
        </div>
        <div className="flex gap-2 justify-between items-center px-5 py-3 border-t border-[var(--border-color)] flex-shrink-0">
          {detail.kind === 'wiki' ? (
            <span className="text-[11px] text-dim">百科词条 · 由系统内置</span>
          ) : <span />}
          <div className="flex items-center gap-2">
            {onUseItem && detail.body && (
              <button onClick={() => onUseItem(detail.title, detail.body, detail.url)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white rounded-xl shadow-soft hover:scale-105 transition-transform"
                style={{ background: 'var(--accent)' }}>
                <Plus size={14} /> 加入课程
              </button>
            )}
            {detail.deletable && (
              <button onClick={() => onDelete(detail)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                <Trash2 size={14} /> 删除
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}