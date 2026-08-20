/** 知识库阅读器弹窗（5.1）：左侧标题树 + 右侧原文渲染 + 点击定位 / chunk 定位。
 * 全文来源：优先 props.content（生成类内容直给），否则按 source 调 /api/kb/{pid}/doc 重组。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, ChevronRight, Loader2, FileText } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import * as echarts from 'echarts'
import { api } from '../api'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })
let mmdSeq = 0
let ecSeq = 0

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const _fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const t = tokens[idx]
  if (t.info.trim() === 'mermaid') {
    const id = 'kr-mmd-' + (++mmdSeq)
    setTimeout(() => {
      mermaid.render(id, t.content).then(({ svg }) => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = svg
      }).catch(() => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = '<div class="text-red-500 text-[11px]">图表渲染失败</div>'
      })
    }, 0)
    return `<pre id="${id}" class="kr-mermaid">加载图表…</pre>`
  }
  if (t.info.trim() === 'echarts') {
    const id = 'kr-ec-' + (++ecSeq)
    setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      try {
        const option = JSON.parse(t.content)
        const old = echarts.getInstanceByDom(el)
        if (old) old.dispose()
        const chart = echarts.init(el)
        chart.setOption(option)
      } catch {
        el.innerHTML = '<pre class="text-[11px] overflow-x-auto">图表配置无法解析</pre>'
      }
    }, 0)
    return `<div id="${id}" class="kr-echarts" style="height:320px"></div>`
  }
  return _fence(tokens, idx, options, env, slf)
}
const renderMd = (t: string) => md.render(t || '')

interface TreeNode { name: string; children: TreeNode[] }

/** 标题树提取（对齐后端 knowledge_service._extract_tree：围栏内跳过 + 垃圾标题过滤） */
function extractTree(text: string): TreeNode[] {
  const tree: TreeNode[] = []
  const stack: Array<{ lvl: number; node: TreeNode }> = []
  let inFence = false
  for (const line of (text || '').split('\n')) {
    const s = line.trim()
    if (s.startsWith('```')) { inFence = !inFence; continue }
    if (inFence) continue
    const m = s.startsWith('#') ? /^(#{1,6})\s+(.+)$/.exec(s) : null
    if (m) {
      const lvl = m[1].length
      const name = m[2].trim()
      if (isJunkHeading(name)) continue
      const node: TreeNode = { name, children: [] }
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop()
      if (stack.length) stack[stack.length - 1].node.children.push(node)
      else tree.push(node)
      stack.push({ lvl, node })
    }
  }
  return tree
}

function isJunkHeading(name: string): boolean {
  const n = name.trim()
  if (!(n.length >= 2 && n.length <= 60)) return true
  if (n.startsWith('──') || n.startsWith('=>') || n.startsWith('=') || n.startsWith('|') || n.startsWith('//') || n.startsWith('#')) return true
  if (n.includes('://') || n.split('_').length - 1 > 4) return true
  return false
}

/** 标题归一化：去 markdown 链接/强调符号后比较（树名来自原文，DOM 标题来自渲染结果） */
const normHeading = (s: string) => (s || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim()

export default function KbReaderModal({ title, content, projectId, source, focusChunk, seq, onClose }: {
  title?: string
  content?: string
  projectId?: string | null
  source?: string
  focusChunk?: number | null
  seq?: number
  onClose: () => void
}) {
  const [doc, setDoc] = useState<string | null>(content ?? null)
  const [backendTree, setBackendTree] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selPath, setSelPath] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const bodyRef = useRef<HTMLDivElement>(null)

  // 拉取全文（content 已提供时直接使用，不再请求）；带竞态保护：快速切换 source 时丢弃旧响应
  useEffect(() => {
    let cancelled = false
    if (content != null) { setDoc(content); return }
    if (!source || !projectId) { setError('缺少文档信息'); return }
    setLoading(true); setError('')
    api.getKbDoc(projectId, source)
      .then(d => {
        if (cancelled) return
        if (d && d.status === 'ok') {
          setDoc(d.content || '')
          // 权威标题树（上传时从原文提取）；无则保留空，回退前端按行提取
          setBackendTree(Array.isArray(d.tree) && d.tree.length > 0 ? d.tree : null)
        } else setError(d && d.status === 'not_found' ? '文档不存在' : '加载失败')
      })
      .catch(() => { if (!cancelled) setError('加载失败，请检查后端服务') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [source, projectId, content])

  const tree = useMemo(() => backendTree ?? (doc ? extractTree(doc) : []), [backendTree, doc])

  // dangerouslySetInnerHTML 的对象引用必须稳定：React 19 updateProperties 按 prop 引用相等判断是否更新，
  // 若每次渲染新建对象字面量 → 引用不等 → setProp 无条件重写 innerHTML → 子节点全量重建
  // （滚动位置被重置、已加的高亮类被销毁）。doc 不变则复用同一对象，React 跳过 innerHTML 更新。
  const mdHtml = useMemo(() => ({ __html: renderMd(doc || '') }), [doc])

  /** 树路径 → 右侧标题元素（双指针：树先序遍历 × DOM 标题文档序，名称归一化前缀匹配——
   * 切块折叠使标题行可能带正文尾巴，DOM 标题文本是树名的超集） */
  const locateHeading = (path: string) => {
    const body = bodyRef.current
    if (!body) return
    const headings = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[]
    const map = new Map<string, HTMLElement>()
    let hi = 0
    const walk = (nodes: TreeNode[], prefix: string) => {
      for (const n of nodes) {
        const p = prefix ? prefix + '/' + n.name : n.name
        while (hi < headings.length && !normHeading(headings[hi].textContent || '').startsWith(normHeading(n.name))) hi++
        if (hi < headings.length) { map.set(p, headings[hi]); hi++ }
        walk(n.children, p)
      }
    }
    walk(tree, '')
    const el = map.get(path)
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      el.classList.remove('kr-heading-flash')
      void el.offsetWidth // 重启动画
      el.classList.add('kr-heading-flash')
    }
  }

  // chunk 定位（引用跳转 5.2）：等待 doc 渲染就绪后再定位，避免 doc 未加载完时找不到标题元素。
  // doc 从 null → content 会触发本 effect 重跑（依赖数组含 doc）。
  useEffect(() => {
    if (focusChunk == null || !source || !projectId) return
    if (!doc) return
    let cancelled = false
    api.getKbChunkNode(projectId, source, focusChunk).then(d => {
      if (cancelled || !d || d.status !== 'ok' || !d.path) return
      setSelPath(d.path)
      setCollapsed(prev => {
        const next = new Set(prev)
        const parts = d.path.split('/')
        let acc = ''
        for (const p of parts) { acc = acc ? acc + '/' + p : p; next.delete(acc) }
        return next
      })
      setTimeout(() => locateHeading(d.path), 150)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChunk, seq, doc])

  const renderTree = (nodes: TreeNode[], depth: number, prefix: string): ReactNode => (
    nodes.map(n => {
      const path = prefix ? prefix + '/' + n.name : n.name
      const hasKids = n.children.length > 0
      const isCollapsed = collapsed.has(path)
      const active = selPath === path
      return (
        <div key={path}>
          <button
            onClick={() => { setSelPath(path); locateHeading(path) }}
            className={`w-full flex items-center gap-1 text-left px-1.5 py-1 rounded-lg text-[11px] transition-colors ${active ? 'bg-[#1a1a1a] text-white' : 'hover:bg-[var(--bg-hover)]'}`}
            style={{ paddingLeft: 6 + depth * 12 }}
          >
            <span
              onClick={(e) => { e.stopPropagation(); setCollapsed(prev => { const nx = new Set(prev); if (nx.has(path)) nx.delete(path); else nx.add(path); return nx }) }}
              className={`flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'} ${hasKids ? 'cursor-pointer' : 'opacity-0'}`}
            >
              <ChevronRight size={12} />
            </span>
            <span className="truncate">{n.name}</span>
          </button>
          {hasKids && !isCollapsed && renderTree(n.children, depth + 1, path)}
        </div>
      )
    })
  )

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2 min-w-0">
            <FileText size={16} className="flex-shrink-0" />
            <span className="truncate">{title || source || '知识库文档'}</span>
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded flex-shrink-0"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-dim">
            <Loader2 size={14} className="animate-spin" /> 加载中…
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[11px] text-red-500">{error}</div>
        ) : doc ? (
          <div className="flex-1 flex min-h-0">
            {/* 左侧标题树 */}
            <div className="w-52 flex-shrink-0 border-r hairline overflow-y-auto p-2">
              {tree.length === 0 ? (
                <p className="text-[10px] text-dim px-1 py-2">无标题结构</p>
              ) : renderTree(tree, 0, '')}
            </div>
            {/* 右侧原文 */}
            <div className="flex-1 overflow-y-auto p-5" ref={bodyRef}>
              <div className="md-answer-body text-[12px] leading-relaxed" dangerouslySetInnerHTML={mdHtml} />
            </div>
          </div>
        ) : null}
        <style>{`
          .kr-mermaid { background: var(--bg-panel); border: 1px solid var(--border-color, #e5e5e5); border-radius: 10px; padding: 0.8em; text-align: center; overflow-x: auto; }
          .kr-echarts { width: 100%; }
          .md-answer-body img { max-width: 100%; border-radius: 10px; margin: 6px 0; }
          .kr-heading-flash { animation: krFlash 1.5s ease-out; border-radius: 6px; }
          @keyframes krFlash { 0% { background: rgba(255, 200, 0, 0.35); } 100% { background: transparent; } }
        `}</style>
      </div>
    </div>
  )
}