/**
 * 文档大纲节点树状图（右栏「文档大纲」窗口专用）——抄 DeepTutor Mermaid/ConceptGraphBlock 模式：
 * treeDocs 层级数据 → mermaid graph LR 源码 → mermaid 渲染 SVG。
 * 节点按进度亮度着色（retrievability 渐变 fill，对照 KbTree.colorOf 规则），
 * 点击节点 → getKbNodeContent → 复用 KbReaderModal 居中弹窗展示该章节正文。
 * MemoryView 仍用 KbTree 的 KnowledgeTree 缩进列表，本组件不替代它。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderTree, Loader2 } from 'lucide-react'
import { api } from '../api'
import KbReaderModal from './KbReaderModal'

// ---- mermaid 懒加载单例（DeepTutor Mermaid.tsx 模式：重活只在首次动态 import） ----
type MermaidModule = typeof import('mermaid')
let mermaidLoader: Promise<MermaidModule['default']> | null = null
function loadMermaid() {
  if (!mermaidLoader) mermaidLoader = import('mermaid').then(m => m.default)
  return mermaidLoader
}

/** 读 CSS 变量（每次渲染重读，主题切换后图表跟随；DeepTutor cssVar 模式） */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** css 颜色串 → [r,g,b]；支持 #rgb / #rrggbb / rgb(a) */
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

// ---- 树扁平化 + mermaid 源码构建 ----
interface FlatNode { id: string; name: string; label: string; path: string; parent: string | null }

/** 标签净化：mermaid [""] 内不允许的字符剥除，超长截断 */
function sanitizeLabel(name: string): string {
  const cleaned = (name || '')
    .replace(/["'`]/g, "'")
    .replace(/[[\](){}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned
}

function flattenTree(tree: any[]): FlatNode[] {
  const out: FlatNode[] = []
  let seq = 0
  const walk = (nodes: any[], parent: string | null, prefix: string) => {
    for (const n of nodes || []) {
      const name = String(n?.name || '').trim()
      if (!name) continue
      const id = 'n' + (++seq)
      out.push({ id, name, label: sanitizeLabel(name), path: prefix ? prefix + '/' + name : name, parent })
      walk(n.children || [], id, prefix ? prefix + '/' + name : name)
    }
  }
  walk(tree, null, '')
  return out
}

/** 进度亮度着色：命中规则与 KbTree.colorOf 一致（双向 includes），retrievability → accent/bg 线性混色 hex */
function brightnessStyles(nodes: FlatNode[], progressItems: any[]): Array<{ id: string; fill: string; color: string }> {
  const bg = parseColor(cssVar('--bg-panel', '#ffffff'))
  const accent = parseColor(cssVar('--accent', '#3b82f6'))
  const out: Array<{ id: string; fill: string; color: string }> = []
  for (const n of nodes) {
    const hit = (progressItems || []).find((it: any) => it.name && n.name && (n.name.includes(it.name) || it.name.includes(n.name)))
    if (!hit) continue
    const r = hit.retrievability || 0
    const p = 0.3 + 0.7 * r
    const mix: [number, number, number] = [
      accent[0] * p + bg[0] * (1 - p),
      accent[1] * p + bg[1] * (1 - p),
      accent[2] * p + bg[2] * (1 - p),
    ]
    const lum = (0.299 * mix[0] + 0.587 * mix[1] + 0.114 * mix[2]) / 255
    out.push({ id: n.id, fill: toHex(mix), color: lum >= 0.5 ? '#1f1d1b' : '#ffffff' })
  }
  return out
}

function buildMermaidSource(nodes: FlatNode[], styles: Array<{ id: string; fill: string; color: string }>): string {
  const lines: string[] = ['graph LR']
  for (const n of nodes) lines.push(`  ${n.id}["${n.label}"]`)
  for (const n of nodes) if (n.parent) lines.push(`  ${n.parent} --> ${n.id}`)
  for (const s of styles) lines.push(`  style ${s.id} fill:${s.fill},color:${s.color}`)
  return lines.join('\n')
}

let renderSeq = 0

/** 单份文档一张图：渲染 + 节点点击绑定 */
function DocGraph({ source, tree, progressItems, projectId, onOpen }: {
  source: string; tree: any[]; progressItems?: any[]; projectId?: string | null
  onOpen: (title: string, content: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errSrc, setErrSrc] = useState('')
  const nodes = useMemo(() => flattenTree(tree), [tree])
  const idMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const src = buildMermaidSource(nodes, brightnessStyles(nodes, progressItems || []))
    ;(async () => {
      try {
        const mermaid = await loadMermaid()
        if (cancelled) return
        // 每次渲染前应用主题变量（DeepTutor applyMermaidTheme 模式；已知取舍：
        // mermaid.initialize 为全局配置，会覆盖 KbReaderModal 模块级初始化的主题变量，仅视觉影响）
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          flowchart: { useMaxWidth: true, htmlLabels: false, curve: 'basis' },
          themeVariables: {
            primaryColor: cssVar('--bg-panel', '#ffffff'),
            primaryTextColor: cssVar('--text', '#1f1d1b'),
            primaryBorderColor: cssVar('--border-color', '#e5e5e5'),
            lineColor: cssVar('--text-dim', '#9ca3af'),
            secondaryColor: cssVar('--bg-hover', '#f5f5f5'),
            tertiaryColor: cssVar('--bg-panel', '#ffffff'),
            textColor: cssVar('--text', '#1f1d1b'),
            mainBkg: cssVar('--bg-panel', '#ffffff'),
          },
        })
        const id = 'kbtg-' + (++renderSeq)
        const { svg } = await mermaid.render(id, src)
        if (cancelled) return
        const el = containerRef.current
        if (!el) return
        el.innerHTML = svg
        // 节点点击绑定：mermaid v11 的 g.node id 形如 {renderId}-flowchart-nX-N（含渲染 id 前缀）
        el.querySelectorAll('g.node').forEach(g => {
          const m = /flowchart-(.+?)-\d+$/.exec(g.id || '')
          const node = m ? idMap.get(m[1]) : undefined
          if (!node) return
          ;(g as HTMLElement).style.cursor = 'pointer'
          g.addEventListener('click', () => {
            if (!projectId) return
            api.getKbNodeContent(projectId, source, node.path)
              .then(d => onOpen(node.path, (d && d.content) || '该章节暂无正文'))
              .catch(() => onOpen(node.path, '该章节暂无正文'))
          })
        })
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '图表渲染失败')
          setErrSrc(src)
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [nodes, progressItems, projectId, source, idMap, onOpen])

  return (
    <div className="border hairline rounded-xl px-3 py-2 bg-[var(--bg-input)] flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-dim">
        <FolderTree size={11} /> {source}
      </div>
      {loading && (
        <div className="flex items-center gap-1.5 text-[10px] text-dim py-2">
          <Loader2 size={11} className="animate-spin" /> 图谱渲染中…
        </div>
      )}
      {!loading && error && (
        <div className="my-1 p-2 rounded-lg border border-red-200 bg-red-50 text-[10px]">
          <p className="text-red-600 font-medium mb-1">图表渲染失败</p>
          <details>
            <summary className="cursor-pointer text-dim">查看源码</summary>
            <pre className="mt-1 p-1.5 rounded bg-[var(--bg-panel)] overflow-x-auto whitespace-pre-wrap">{errSrc}</pre>
          </details>
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-x-auto [&_svg]:max-w-full" />
    </div>
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
