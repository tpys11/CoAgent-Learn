/**
 * F9-S4 统一大纲树渲染组件——对话左栏 / 对话右栏（文档大纲窗）/ 阅读器侧栏三处共用，
 * 与 F13 react-pdf Outline 共用同一事实源（kb_tree：S1 书签优先三通道产物，S3 层级化字段）。
 *
 * 职责只做「层级大纲渲染」：展开/收起、选中高亮、分类徽章（S2）、页码标记（S1 书签通道）、
 * 可选掌握度着色（记忆视图语义由调用方注入 colorOf）。点击语义（定位/打开阅读器/展示正文）
 * 由各挂载点通过 onSelect 自决——组件不关心。
 * 纯逻辑抽导出纯函数（flattenOutlineRows / initialExpandedPaths / categoryBadgeClass）供测试直调。
 */
import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

export interface OutlineNode {
  name: string
  children?: OutlineNode[]
  id?: string          // F9-S3 层级化稳定 id
  parent?: string
  level?: number
  page?: number        // F9-S1 书签通道起始页码
  category?: string    // F9-S2 切割分类（正文/小结/习题/实验/总测试/附录）
}

export interface OutlineRow {
  path: string         // "/" 连接路径（与 chunk-node/content 接口一致）
  name: string
  depth: number
  hasKids: boolean
  category?: string
  page?: number
}

export function nodePath(prefix: string, name: string): string {
  return prefix ? prefix + '/' + name : name
}

/** 树拍平为行（先序保序）——展开初始化与测试共用 */
export function flattenOutlineRows(tree: OutlineNode[]): OutlineRow[] {
  const out: OutlineRow[] = []
  const walk = (nodes: OutlineNode[], prefix: string, depth: number) => {
    for (const n of nodes || []) {
      const name = String(n?.name || '').trim()
      if (!name) continue
      const kids = n.children || []
      const path = nodePath(prefix, name)
      out.push({ path, name, depth, hasKids: kids.length > 0, category: n.category, page: n.page })
      walk(kids, path, depth + 1)
    }
  }
  walk(tree || [], '', 0)
  return out
}

/** 深度 ≤ maxDepth 的节点默认展开（阅读器首屏可见章级；左栏/右栏默认收起传 0） */
export function initialExpandedPaths(rows: OutlineRow[], maxDepth: number): Set<string> {
  return new Set(rows.filter(r => r.hasKids && r.depth < maxDepth).map(r => r.path))
}

/** 分类徽章配色（单一事实源：留存范围面板与大纲树共用）——非正文类目给暖色提示 */
export function categoryBadgeClass(category?: string): string {
  switch (category) {
    case '小结': case '习题': return 'text-amber-600'
    case '实验': return 'text-sky-600'
    case '总测试': return 'text-rose-600'
    default: return 'text-dim' // 正文/附录/未标注
  }
}

export function OutlineTree({ tree, selPath, onSelect, defaultExpandDepth = 0, colorOf, showBadges = true, compact = false }: {
  tree: OutlineNode[]
  selPath?: string | null
  onSelect?: (path: string) => void
  defaultExpandDepth?: number
  colorOf?: (name: string) => string
  showBadges?: boolean
  compact?: boolean
}) {
  const rows = useMemo(() => flattenOutlineRows(tree), [tree])
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpandedPaths(rows, defaultExpandDepth))
  const toggle = (path: string) => setExpanded(prev => {
    const nx = new Set(prev)
    if (nx.has(path)) nx.delete(path); else nx.add(path)
    return nx
  })
  const indent = (d: number) => (compact ? 4 + d * 11 : 6 + d * 14)
  return (
    <div className="flex flex-col">
      {rows.map(r => {
        const open = expanded.has(r.path)
        const dot = colorOf ? colorOf(r.name) : 'var(--text-dim)'
        const active = selPath === r.path
        return (
          <div key={r.path} className="flex items-center gap-1 py-0.5 min-h-[20px] group" style={{ paddingLeft: indent(r.depth) }}>
            <button onClick={() => toggle(r.path)}
              className={`flex-shrink-0 text-dim hover:text-[var(--text)] ${r.hasKids ? '' : 'invisible'}`}
              title={open ? '收起' : '展开'}>
              {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
            <button onClick={() => onSelect && onSelect(r.path)}
              className={"text-left hover:underline flex-1 min-w-0 truncate " + (compact ? 'text-[10.5px]' : 'text-[11px]') + (active ? ' font-semibold' : '')}
              style={{ color: dot === 'var(--text-dim)' ? 'var(--text-muted)' : 'var(--text)' }}
              title={r.path}>
              {r.name}
            </button>
            {showBadges && r.category && r.category !== '正文' && (
              <span className={`text-[9px] flex-shrink-0 ${categoryBadgeClass(r.category)}`}>{r.category}</span>
            )}
            {r.page != null && (
              <span className="text-[9px] text-dim flex-shrink-0" title="书签页码">p{r.page}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
