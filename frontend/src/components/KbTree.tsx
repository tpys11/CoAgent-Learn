import { useState, useEffect, useRef } from 'react'
import { FolderTree, ChevronRight, ChevronDown, FileText, Loader2 } from 'lucide-react'
import { api } from '../api'
import { MiniMD } from './memoryView/MiniMD'

/**
 * 文档大纲（树状）：基于上传资料自身的标题层级（kb_tree，上传文档时从 markdown 标题提取）。
 * 节点颜色 = 基于对话估计的掌握状态：绿=掌握良好(≥0.9) 黄=一般(≥0.7) 红=薄弱/待复习；未提及节点灰色。
 * 节点点击 → 调节点正文接口 → 行下方展开内容面板（复用 MiniMD）。
 * 记忆界面与右侧栏共用。
 */
function TreeNodeRow({ node, colorOf, depth, defaultOpen, path, selPath, onSelect, focusPath }: {
  node: any; colorOf: (name: string) => string; depth: number; defaultOpen: boolean
  path: string; selPath?: string | null; onSelect?: (p: string) => void; focusPath?: string | null
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 1)
  // 引用跳转 focus（5.2）：命中路径时展开祖先节点
  useEffect(() => {
    if (focusPath && (path === focusPath || focusPath.startsWith(path + '/'))) setOpen(true)
  }, [focusPath])
  const hasKids = (node.children || []).length > 0
  const c = colorOf(node.name || '')
  const selected = selPath === path
  return (
    <div className="flex flex-col" data-kb-path={path}>
      <div className="flex items-center gap-1.5 py-0.5 min-h-[22px] group" style={{ paddingLeft: depth * 16 }}>
        {hasKids ? (
          <button onClick={() => setOpen(!open)} className="flex-shrink-0 text-dim hover:text-[var(--text)]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : <span className="w-[11px] flex-shrink-0" />}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
        <button
          onClick={() => onSelect && onSelect(path)}
          className={"text-[11px] leading-snug truncate text-left hover:underline flex-1 min-w-0" + (selected ? " font-semibold" : "")}
          style={{ color: c === 'var(--text-dim)' ? 'var(--text-muted)' : 'var(--text)' }}
          title="查看章节正文"
        >{node.name}</button>
      </div>
      {hasKids && open && (
        <div className="flex flex-col">
          {(node.children || []).map((kid: any, i: number) => (
            <TreeNodeRow key={i} node={kid} colorOf={colorOf} depth={depth + 1} defaultOpen={defaultOpen}
              path={path + '/' + kid.name} selPath={selPath} onSelect={onSelect} focusPath={focusPath} />
          ))}
        </div>
      )}
    </div>
  )
}

export function KnowledgeTree({ treeDocs, progressItems, projectId, focus }: {
  treeDocs: Array<{ source: string; tree: any[] }>; progressItems?: any[]; projectId?: string | null
  focus?: { source: string; chunk: number; seq: number } | null
}) {
  // 掌握度颜色：节点名与知识点/难点名双向包含匹配；掌握越好颜色越深（主题色深浅），未提及灰色
  const colorOf = (name: string) => {
    const hit = (progressItems || []).find((it: any) => it.name && name && (name.includes(it.name) || it.name.includes(name)))
    if (!hit) return 'var(--text-dim)'
    const r = hit.retrievability || 0
    return `color-mix(in srgb, var(--accent) ${Math.round(30 + r * 70)}%, var(--bg-panel))`
  }
  // 选中节点内容面板
  const [sel, setSel] = useState<{ source: string; path: string } | null>(null)
  const [panel, setPanel] = useState<{ content: string; chunkIndex: number | null; loading: boolean } | null>(null)
  const selectNode = (source: string, path: string) => {
    setSel({ source, path })
    if (!projectId) { setPanel(null); return }
    setPanel({ content: '', chunkIndex: null, loading: true })
    api.getKbNodeContent(projectId, source, path)
      .then(d => setPanel({ content: (d && d.content) || '', chunkIndex: (d && d.chunk_index != null) ? d.chunk_index : null, loading: false }))
      .catch(() => setPanel({ content: '', chunkIndex: null, loading: false }))
  }
  const hasAny = (treeDocs || []).some(d => (d.tree || []).length > 0)
  // 引用跳转（5.2）：focus 变化 → chunk-node 接口定位节点 → 展开路径 + 选中 + 滚动到该行
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const prevFocusSeq = useRef(0)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!focus || !projectId || focus.seq === prevFocusSeq.current) return
    prevFocusSeq.current = focus.seq
    const doc = (treeDocs || []).find(d => d.source === focus.source)
    if (!doc) return
    api.getKbChunkNode(projectId, focus.source, focus.chunk).then(d => {
      if (!d || d.status !== 'ok' || !d.path) return
      setFocusPath(d.path)
      setSel({ source: focus.source, path: d.path })
      selectNode(focus.source, d.path)
      if (focusTimer.current) clearTimeout(focusTimer.current)
      focusTimer.current = setTimeout(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-kb-path]'))
        const row = rows.find(r => r.getAttribute('data-kb-path') === d.path)
        if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 150)
    }).catch(() => {})
  }, [focus, projectId, treeDocs])
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
            <TreeNodeRow key={i} node={n} colorOf={colorOf} depth={0} defaultOpen={false}
              path={n.name}
              selPath={sel ? sel.source === d.source ? sel.path : null : null}
              onSelect={(p) => selectNode(d.source, p)}
              focusPath={focusPath} />
          ))}
          {sel && sel.source === d.source && (
            <div className="mt-1.5 border-t hairline pt-1.5">
              {panel && panel.loading ? (
                <div className="flex items-center gap-1.5 text-[10px] text-dim py-1">
                  <Loader2 size={11} className="animate-spin" /> 章节正文加载中…
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-dim">
                    <FileText size={11} /> {sel.path}
                    {panel && panel.chunkIndex != null && <span className="text-[9px]">chunk #{panel.chunkIndex}</span>}
                  </div>
                  <div className="max-h-40 overflow-auto pr-1">
                    {panel && panel.content ? <MiniMD text={panel.content} /> : <span className="text-[10px] text-dim">该章节暂无正文</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}