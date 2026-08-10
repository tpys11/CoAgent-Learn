import { useState } from 'react'
import { FolderTree, ChevronRight, ChevronDown } from 'lucide-react'

/**
 * 知识图谱（树状）：基于上传资料自身的标题层级（kb_tree，上传文档时从 markdown 标题提取）。
 * 节点颜色 = 基于对话估计的掌握状态：绿=掌握良好(≥0.9) 黄=一般(≥0.7) 红=薄弱/待复习；未提及节点灰色。
 * 记忆界面与右侧栏共用。
 */
function TreeNodeRow({ node, colorOf, depth, defaultOpen }: { node: any; colorOf: (name: string) => string; depth: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen || depth < 1)
  const hasKids = (node.children || []).length > 0
  const c = colorOf(node.name || '')
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 py-0.5 min-h-[22px]" style={{ paddingLeft: depth * 16 }}>
        {hasKids ? (
          <button onClick={() => setOpen(!open)} className="flex-shrink-0 text-dim hover:text-[var(--text)]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : <span className="w-[11px] flex-shrink-0" />}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
        <span className="text-[11px] leading-snug truncate" style={{ color: c === 'var(--text-dim)' ? 'var(--text-muted)' : 'var(--text)' }}>{node.name}</span>
      </div>
      {hasKids && open && (
        <div className="flex flex-col">
          {(node.children || []).map((kid: any, i: number) => (
            <TreeNodeRow key={i} node={kid} colorOf={colorOf} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

export function KnowledgeTree({ treeDocs, progressItems }: { treeDocs: Array<{ source: string; tree: any[] }>; progressItems?: any[] }) {
  // 掌握度颜色：节点名与知识点/难点名双向包含匹配；掌握越好颜色越深（主题色深浅），未提及灰色
  const colorOf = (name: string) => {
    const hit = (progressItems || []).find((it: any) => it.name && name && (name.includes(it.name) || it.name.includes(name)))
    if (!hit) return 'var(--text-dim)'
    const r = hit.retrievability || 0
    return `color-mix(in srgb, var(--accent) ${Math.round(30 + r * 70)}%, var(--bg-panel))`
  }
  const hasAny = (treeDocs || []).some(d => (d.tree || []).length > 0)
  if (!hasAny) {
    // 空态：小空树占位
    return (
      <div className="min-h-[120px] border border-dashed hairline rounded-xl p-4 flex items-center justify-center gap-4">
        <svg width="90" height="70" viewBox="0 0 90 70" fill="none">
          <circle cx="45" cy="12" r="7" stroke="#d4d4d4" strokeDasharray="3 3" />
          <path d="M45 19 V30 M45 30 H12 V44 M45 30 H78 V44" stroke="#d4d4d4" strokeDasharray="3 3" />
          <rect x="4" y="44" width="16" height="12" rx="3" stroke="#d4d4d4" strokeDasharray="3 3" />
          <rect x="70" y="44" width="16" height="12" rx="3" stroke="#d4d4d4" strokeDasharray="3 3" />
          <circle cx="45" cy="50" r="6" stroke="#d4d4d4" strokeDasharray="3 3" />
        </svg>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {(treeDocs || []).map(d => (
        <div key={d.source} className="border hairline rounded-xl px-3 py-2 bg-[var(--bg-input)] flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-dim mb-0.5">
            <FolderTree size={11} /> {d.source}
          </div>
          {(d.tree || []).map((n: any, i: number) => (
            <TreeNodeRow key={i} node={n} colorOf={colorOf} depth={0} defaultOpen={false} />
          ))}
        </div>
      ))}
    </div>
  )
}
