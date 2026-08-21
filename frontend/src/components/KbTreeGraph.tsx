/**
 * 文档大纲节点树状图 v2.1（右栏「文档大纲」窗口专用）——抄 DeepTutor MemoryGraph 架构：
 * 布局引擎（纯函数算坐标）与 SVG 渲染/交互分离，全部手写、无图形库依赖。
 * 水平 tidy-tree：x = depth×LEVEL_W；叶子 y 按序排布，父节点 y = 子树叶子区间中点。
 * 整书渲染时注入虚拟根节点（书名主干），章节向右扇出，树形层级一目了然。
 * 节点 fill = 进度亮度（retrievability → accent/bg 线性混色）；
 * 交互：滚轮以光标为中心缩放 / pointer 拖拽平移 / hover 高亮祖先链+子树 / 画布右上角缩放控件；
 * 有子节点的点右侧带 ChevronRight 展开收起（折叠子树不参与布局，状态驱动重排）；
 * 卡片右上角 Maximize2 → 独立大弹窗（同生成资源弹窗模式）查看与操作整棵树。
 * 点击叶子/章节节点 → getKbNodeContent → 复用 KbReaderModal 居中弹窗看正文。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderTree, Maximize2, ZoomIn, ZoomOut, Maximize, X } from 'lucide-react'
import { api } from '../api'
import KbReaderModal from './KbReaderModal'

// ── 布局引擎（纯函数） ────────────────────────────────────────────────

interface LayoutNode {
  id: string
  name: string
  label: string
  /** 空串 = 虚拟根节点（不参与正文定位） */
  path: string
  depth: number
  parent: string | null
  hasKids: boolean
  x: number
  y: number
}
interface LayoutEdge { a: string; b: string }
interface LayoutResult {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  parentMap: Map<string, string | null>
  childrenMap: Map<string, string[]>
}

const LEVEL_W = 190 // 层间距（水平方向）
const ROW_H = 34    // 叶子行高（垂直方向）

function sanitizeLabel(name: string): string {
  const cleaned = (name || '').replace(/["'`[\]{}<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 24 ? cleaned.slice(0, 24) + '…' : cleaned
}

/** 水平 tidy-tree：后序遍历，叶子按序占一行，内部节点 y=子树叶子区间中点。
 * collapsedPaths 中的路径视为叶子（其子树不参与布局）——展开/收起驱动重排。 */
export function layoutTree(tree: any[], collapsedPaths?: Set<string>): LayoutResult {
  const nodes: LayoutNode[] = []
  const edges: LayoutEdge[] = []
  const parentMap = new Map<string, string | null>()
  const childrenMap = new Map<string, string[]>()
  let leafCursor = 0
  let seq = 0

  const walk = (items: any[], depth: number, parent: string | null, prefix: string): [number, number] => {
    let first = -1
    let last = -1
    for (const item of items || []) {
      const rawName = String(item?.name || '').trim()
      if (!rawName) continue
      const id = 'n' + (++seq)
      const allKids = Array.isArray(item?.children) ? item.children.filter((k: any) => k && String(k.name || '').trim()) : []
      // 虚拟根（__vroot）不进路径前缀，其子节点路径从零级开始；折叠键与节点 path 一致
      const isVRoot = !!(item as any).__vroot
      const nodePath = prefix ? prefix + '/' + rawName : rawName
      const foldKey = isVRoot ? '' : nodePath
      const folded = collapsedPaths?.has(foldKey)
      const kids = folded ? [] : allKids
      const path = foldKey
      parentMap.set(id, parent)
      if (parent) {
        const arr = childrenMap.get(parent) || []
        arr.push(id)
        childrenMap.set(parent, arr)
      }
      let y: number
      if (kids.length) {
        const range = walk(kids, depth + 1, id, path)
        y = (range[0] + range[1]) / 2
        if (first < 0) first = range[0]
        last = range[1]
      } else {
        y = leafCursor * ROW_H + ROW_H / 2 + 8
        leafCursor++
        if (first < 0) first = y
        last = y
      }
      nodes.push({
        id, name: rawName, label: sanitizeLabel(rawName), path, depth,
        parent, hasKids: allKids.length > 0 || isVRoot, x: depth * LEVEL_W + 10, y,
      })
      if (parent) edges.push({ a: parent, b: id })
    }
    return [first, last]
  }
  walk(tree || [], 0, null, '')

  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0)
  const width = maxDepth * LEVEL_W + LEVEL_W + 60
  const height = Math.max(leafCursor * ROW_H + 20, 80)
  return { nodes, edges, width, height, parentMap, childrenMap }
}

// ── 颜色：进度亮度（规则对齐 KbTree.colorOf，输出具体 hex 供 SVG fill） ──

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
function parseColor(s: string): [number, number, number] {
  const t = (s || '').trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t)
  if (hex) {
    const h = hex[1]
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(t)
  if (rgb) {
    const p = rgb[1].split(',').map(x => parseFloat(x.trim()))
    return [p[0] || 0, p[1] || 0, p[2] || 0]
  }
  return [255, 255, 255]
}
const toHex = (c: [number, number, number]) =>
  '#' + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')

function brightnessFill(name: string, progressItems: any[]): { fill: string; color: string } | null {
  const hit = (progressItems || []).find((it: any) => it.name && name && (name.includes(it.name) || it.name.includes(name)))
  if (!hit) return null
  const r = hit.retrievability || 0
  const p = 0.3 + 0.7 * r
  const bg = parseColor(cssVar('--bg-panel', '#ffffff'))
  const accent = parseColor(cssVar('--accent', '#3b82f6'))
  const mix: [number, number, number] = [
    accent[0] * p + bg[0] * (1 - p),
    accent[1] * p + bg[1] * (1 - p),
    accent[2] * p + bg[2] * (1 - p),
  ]
  const lum = (0.299 * mix[0] + 0.587 * mix[1] + 0.114 * mix[2]) / 255
  return { fill: toHex(mix), color: lum >= 0.5 ? '#1f1d1b' : '#ffffff' }
}

// ── 视口交互（MemoryGraph 公式：光标中心缩放 + pointer 拖拽平移） ──────

interface ViewState { scale: number; tx: number; ty: number }
const INITIAL_VIEW: ViewState = { scale: 1, tx: 0, ty: 0 }

// ── 树画布：SVG 渲染 + 全部交互（mini/modal 两处复用，实例各自独立视口与缩放控件） ──

function TreeCanvas({ source, tree, progressItems, projectId, onOpen }: {
  source: string; tree: any[]; progressItems?: any[]; projectId?: string | null
  onOpen: (title: string, content: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origTx: number; origTy: number } | null>(null)
  const [view, setView] = useState<ViewState>(INITIAL_VIEW)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 展开/收起：折叠路径按叶子布局；默认全展开呈现完整树状（可点箭头收起聚焦）
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set())

  const layout = useMemo(() => layoutTree(tree, collapsedPaths), [tree, collapsedPaths])
  const nodeById = useMemo(() => new Map(layout.nodes.map(n => [n.id, n])), [layout])
  const togglePath = useCallback((p: string) => {
    setCollapsedPaths(prev => {
      const nx = new Set(prev)
      if (nx.has(p)) nx.delete(p)
      else nx.add(p)
      return nx
    })
  }, [])

  // 高亮集合：active 节点 + 祖先链 + 全部子孙
  const highlight = useMemo(() => {
    const active = selectedId ?? hoverId
    if (!active) return null
    const set = new Set<string>([active])
    let cur: string | null = active
    while (cur) {
      const p: string | null = layout.parentMap.get(cur) ?? null
      if (p) set.add(p)
      cur = p
    }
    const queue = [active]
    while (queue.length) {
      const id = queue.shift() as string
      for (const kid of layout.childrenMap.get(id) || []) {
        if (!set.has(kid)) { set.add(kid); queue.push(kid) }
      }
    }
    return set
  }, [layout, selectedId, hoverId])

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let scale = Math.min(rect.width / layout.width, rect.height / layout.height) * 0.95
    if (!isFinite(scale) || scale <= 0) scale = 1
    setView({
      scale,
      tx: (rect.width - layout.width * scale) / 2,
      ty: (rect.height - layout.height * scale) / 2,
    })
  }, [layout])

  useEffect(() => { fit() }, [fit])

  const zoomBy = useCallback((factor: number) => {
    const el = containerRef.current
    const rect = el?.getBoundingClientRect()
    if (!rect) return
    setView(v => {
      const next = Math.min(4, Math.max(0.35, v.scale * factor))
      const px = rect.width / 2
      const py = rect.height / 2
      const k = next / v.scale
      return { scale: next, tx: px - k * (px - v.tx), ty: py - k * (py - v.ty) }
    })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const el = containerRef.current
    const rect = el?.getBoundingClientRect()
    if (!rect) return
    setView(v => {
      const factor = Math.exp(-e.deltaY * 0.001)
      const next = Math.min(4, Math.max(0.35, v.scale * factor))
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const k = next / v.scale
      return { scale: next, tx: px - k * (px - v.tx), ty: py - k * (py - v.ty) }
    })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 只在背景按下时开始拖拽——让节点点击冒泡不受影响
    if ((e.target as HTMLElement).closest('[data-node],[data-toggle]')) return
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty }
    setSelectedId(null)
  }, [view])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    setView(v => ({ ...v, tx: d.origTx + (e.clientX - d.startX), ty: d.origTy + (e.clientY - d.startY) }))
  }, [])

  const endDrag = useCallback(() => { dragRef.current = null }, [])

  const nodeClick = useCallback((id: string) => {
    setSelectedId(id)
    const node = nodeById.get(id)
    if (!node || !projectId || !node.path) return // 虚拟根/无路径不查正文
    api.getKbNodeContent(projectId, source, node.path)
      .then(d => onOpen(node.path, (d && d.content) || '该章节暂无正文'))
      .catch(() => onOpen(node.path, '该章节暂无正文'))
  }, [nodeById, projectId, source, onOpen])

  const nodeIndex = useMemo(() => new Map(layout.nodes.map(n => [n.id, n])), [layout])
  const fills = useMemo(() => {
    const m = new Map<string, { fill: string; color: string }>()
    for (const n of layout.nodes) {
      const f = brightnessFill(n.name, progressItems || [])
      if (f) m.set(n.id, f)
    }
    return m
  }, [layout, progressItems])

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {/* 边：水平贝塞尔 */}
          <g pointerEvents="none">
            {layout.edges.map(e => {
              const s = nodeIndex.get(e.a)
              const t = nodeIndex.get(e.b)
              if (!s || !t) return null
              const dim = highlight !== null && !(highlight.has(e.a) && highlight.has(e.b))
              const mx = (s.x + t.x) / 2
              return (
                <path
                  key={e.a + '>' + e.b}
                  d={`M ${s.x} ${s.y} C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`}
                  stroke="var(--border-color, #c8c8c8)"
                  strokeWidth={dim ? 0.8 : 1.4}
                  strokeOpacity={dim ? 0.18 : 0.75}
                  fill="none"
                />
              )
            })}
          </g>
          {/* 节点：圆点 + 展开收起箭头（有子节点时）+ 标签 */}
          <g>
            {layout.nodes.map(n => {
              const f = fills.get(n.id)
              const isActive = n.id === (selectedId ?? hoverId)
              const dim = highlight !== null && !highlight.has(n.id)
              const isCollapsed = collapsedPaths.has(n.path) && n.hasKids
              return (
                <g key={n.id} data-node={n.id} opacity={dim ? 0.16 : 1}>
                  <circle cx={n.x} cy={n.y} r={isActive ? 7 : 5} fill={f ? f.fill : 'var(--bg-panel)'}
                    stroke={f ? 'transparent' : 'var(--text-dim, #9ca3af)'} strokeWidth={f ? 0 : 1.2}
                    pointerEvents="all" style={{ cursor: 'pointer' }}
                    onPointerEnter={() => setHoverId(n.id)}
                    onPointerLeave={() => setHoverId(cur => (cur === n.id ? null : cur))}
                    onClick={() => nodeClick(n.id)} />
                  {n.hasKids && (
                    <g data-toggle={n.path} style={{ cursor: 'pointer' }}
                      onPointerDown={e => e.stopPropagation()}
                      onPointerEnter={() => setHoverId(n.id)}
                      onPointerLeave={() => setHoverId(cur => (cur === n.id ? null : cur))}
                      onClick={e => { e.stopPropagation(); togglePath(n.path) }}>
                      <rect x={n.x + 5} y={n.y - 8} width={15} height={16} fill="transparent" />
                      <path d={`M ${n.x + 9} ${n.y - 3.5} L ${n.x + 13} ${n.y} L ${n.x + 9} ${n.y + 3.5}`}
                        stroke="var(--text-dim)" strokeWidth={1.6} fill="none"
                        strokeLinecap="round" strokeLinejoin="round"
                        transform={isCollapsed ? '' : `rotate(90 ${(n.x + 11).toFixed(1)} ${n.y})`} />
                    </g>
                  )}
                  <text x={n.hasKids ? n.x + 22 : n.x + 10} y={n.y} fontSize={11.5}
                    fontWeight={isActive ? 600 : 400}
                    fill={isActive ? 'var(--accent)' : 'var(--text)'} dominantBaseline="central"
                    style={{ userSelect: 'none', cursor: 'pointer' }}
                    onClick={() => nodeClick(n.id)}>{n.label}</text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
      {/* 缩放控件：画布右上角 */}
      <div className="absolute right-2 top-2 flex flex-col gap-0.5 rounded-lg border hairline bg-[var(--bg-panel)]/95 p-0.5 shadow-sm">
        <button onClick={() => zoomBy(1.25)} title="放大" className="w-6 h-6 grid place-items-center text-dim hover:text-[var(--text)]"><ZoomIn size={12} /></button>
        <button onClick={() => zoomBy(1 / 1.25)} title="缩小" className="w-6 h-6 grid place-items-center text-dim hover:text-[var(--text)]"><ZoomOut size={12} /></button>
        <button onClick={fit} title="适配窗口" className="w-6 h-6 grid place-items-center text-dim hover:text-[var(--text)]"><Maximize size={11} /></button>
      </div>
    </div>
  )
}

// ── 单份文档一棵图：卡片头（标题+放大按钮） + 迷你画布 + 独立大弹窗 ──

function DocGraph({ source, tree, progressItems, projectId, onOpen }: {
  source: string; tree: any[]; progressItems?: any[]; projectId?: string | null
  onOpen: (title: string, content: string) => void
}) {
  const [maximized, setMaximized] = useState(false)
  // 虚拟根：书名作主干，章节向右扇出成树形（根路径为空串，不参与正文定位）
  const vTree = useMemo(() => [{ name: source, children: tree || [], __vroot: true }], [tree, source])

  return (
    <>
      <div className="border hairline rounded-xl bg-[var(--bg-input)] flex flex-col overflow-hidden" data-docgraph={source}>
        <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-dim min-w-0">
            <FolderTree size={11} className="flex-shrink-0" /> <span className="truncate">{source}</span>
          </span>
          <button onClick={() => setMaximized(true)} title="放大查看"
            className="w-6 h-6 grid place-items-center rounded-lg border hairline text-dim hover:text-[var(--text)] flex-shrink-0">
            <Maximize2 size={11} />
          </button>
        </div>
        <div className="relative w-full h-[240px]">
          <TreeCanvas source={source} tree={vTree} progressItems={progressItems} projectId={projectId} onOpen={onOpen} />
        </div>
      </div>

      {/* 放大弹窗：独立大画布，查看与操作整棵树 */}
      {maximized && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={() => setMaximized(false)}>
          <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden relative"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b hairline flex-shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2 min-w-0">
                <FolderTree size={16} className="flex-shrink-0" />
                <span className="truncate">文档大纲 · {source}</span>
              </h3>
              <button onClick={() => setMaximized(false)} title="关闭" className="p-1 hover:bg-[var(--bg-hover)] rounded flex-shrink-0"><X size={18} /></button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <TreeCanvas source={source} tree={vTree} progressItems={progressItems} projectId={projectId} onOpen={onOpen} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function KnowledgeTreeGraph({ treeDocs, progressItems, projectId }: {
  treeDocs: Array<{ source: string; tree: any[] }>; progressItems?: any[]; projectId?: string | null
}) {
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null)
  const openModal = useCallback((title: string, content: string) => setModal({ title, content }), [])
  const docs = (treeDocs || []).filter(d => (d.tree || []).length > 0)

  if (docs.length === 0) {
    // 空态：与 KbTree 同款虚线占位
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
      {docs.map(d => (
        <DocGraph key={d.source} source={d.source} tree={d.tree} progressItems={progressItems} projectId={projectId} onOpen={openModal} />
      ))}
      {modal && (
        <KbReaderModal title={modal.title} content={modal.content} projectId={projectId ?? null} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
