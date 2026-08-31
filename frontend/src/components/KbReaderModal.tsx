/** 知识库阅读器弹窗（5.1）：左侧标题树 + 右侧原文渲染 + 点击定位 / chunk 定位。
 * 全文来源：优先 props.content（生成类内容直给），否则按 source 调 /api/kb/{pid}/doc 重组。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronRight, Loader2, FileText } from 'lucide-react'
import { renderMd } from '../lib/mdRenderer'
import { api } from '../api'
import { OutlineTree } from './OutlineTree'

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

// ---- 上传文档清洗管道（仅 API 拉取的 chunk 重组全文；生成类 props.content 直给不清洗） ----
const NOISE_RES = [
  /^第\s*[0-9一二三四五六七八九十百]+\s*页$/, // 独立页码行
  /^[0-9]{1,4}$/, // 纯数字行（页眉页脚残留）
  /^https?:\/\/\S+$/, // 纯 URL 行
  /^[─━=_\-•·*~\s]{4,}$/, // 分隔装饰行
]
function isNoiseLine(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/[\uFFFD]/.test(t)) return true // 乱码替换符
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t)) return true // 控制字符
  return NOISE_RES.some(re => re.test(t))
}
function isProseLine(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/^(#{1,6}\s|[-*+]\s|>\s|\||```)/.test(t)) return false // 标题/列表/引用/表格/围栏
  if (/^\d+[.)]\s/.test(t)) return false // 有序列表
  return true
}
/** 去噪行 + 散文每 ≤3 句强制分段（标题/列表/表格/围栏原样保留） */
function cleanContent(text: string): string {
  const out: string[] = []
  let inFence = false
  let proseBuf: string[] = []
  const flushProse = () => {
    if (!proseBuf.length) return
    const joined = proseBuf.join('')
    const sentences = joined.split(/(?<=[。！？!?；;])/).filter(s => s.length > 0)
    for (let i = 0; i < sentences.length; i += 3) {
      out.push(sentences.slice(i, i + 3).join(''))
      out.push('')
    }
    proseBuf = []
  }
  for (const line of (text || '').split('\n')) {
    if (line.trim().startsWith('```')) { flushProse(); inFence = !inFence; out.push(line); continue }
    if (inFence) { out.push(line); continue }
    if (isNoiseLine(line)) continue
    // 巨型伪标题：切块器把整段内容粘进标题行（>150 字符的 # 行），剥掉无意义的 # 让其按散文分段
    const tt = line.trim()
    if (/^#{1,6}\s/.test(tt) && tt.length > 150) { flushProse(); proseBuf.push(tt.replace(/^#{1,6}\s/, '').trim()); continue }
    if (isProseLine(line)) { proseBuf.push(line.trim()); continue }
    flushProse()
    out.push(line)
  }
  flushProse()
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/** 语义分块：真实标题（≤150 字符的 h1/h2）开新块；无标题/超大块时按段落体积分块兜底
 * （切块器会把换行折叠、整节内容粘成一行，纯标题切分会产生空壳块，故必须体积兜底） */
const CHUNK_TARGET = 900
function splitSections(text: string): Array<{ title: string; body: string }> {
  const chunks: Array<{ title: string; body: string }> = []
  let cur: { title: string; lines: string[]; len: number } | null = null
  let inFence = false
  const close = () => {
    if (!cur) return
    const body = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    let title = cur.title
    cur = null
    if (!body) return
    if (!title) {
      const first = body.split('\n').find(l => l.trim()) || ''
      title = first.replace(/^[#>\-*+\d.)\s"']*/, '').trim().slice(0, 26) || '正文'
    }
    chunks.push({ title, body })
  }
  const open = (title: string) => { close(); cur = { title, lines: [], len: 0 } }
  for (const line of (text || '').split('\n')) {
    const t = line.trim()
    if (t.startsWith('```')) {
      inFence = !inFence
      if (!cur) cur = { title: '', lines: [], len: 0 }
      cur.lines.push(line); cur.len += line.length
      continue
    }
    if (!inFence && /^#{1,2}\s+\S/.test(t) && t.length <= 150) { open(t.replace(/^#{1,2}\s+/, '').trim()); continue }
    if (!cur) cur = { title: '', lines: [], len: 0 }
    cur.lines.push(line); cur.len += line.length
    if (!t && cur.len >= CHUNK_TARGET) close()
    else if (cur.len >= CHUNK_TARGET * 3) close()
  }
  close()
  return chunks
}

/** 标题归一化：去 markdown 链接/强调符号后比较（树名来自原文，DOM 标题来自渲染结果） */
const normHeading = (s: string) => (s || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim()

export default function KbReaderModal({ title, content, projectId, source, focusChunk, seq, onClose, extraAction }: {
  title?: string
  content?: string
  projectId?: string | null
  source?: string
  focusChunk?: number | null
  seq?: number
  onClose: () => void
  /** 闭环六：header 附加动作（如资源编辑会话的「AI 修改」入口）；缺省不渲染，既有调用方零感知 */
  extraAction?: { label: string; icon?: any; onClick: () => void }
}) {
  const [doc, setDoc] = useState<string | null>(content ?? null)
  const [backendTree, setBackendTree] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selPath, setSelPath] = useState<string | null>(null)
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
          // original=上传原文（markdown 换行完好，排版原样呈现）；reassembled=chunk 重组脏文本（清洗+折叠兜底）
          const og = d.origin === 'original' ? 'original' : 'reassembled'
          setOrigin(og)
          setDoc(og === 'original' ? (d.content || '') : cleanContent(d.content || ''))
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

  // API 拉取路径：reassembled（重组脏文本）按 h1/h2 分节折叠面板（首个默认展开）；
  // original（上传原文）与生成类直给路径保持单块渲染，作者排版原样呈现
  const isDirect = content != null
  const [origin, setOrigin] = useState<'original' | 'reassembled'>('reassembled')
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]))
  const sections = useMemo(() => (doc == null || isDirect || origin !== 'reassembled') ? [] : splitSections(doc), [doc, isDirect, origin])
  const sectionHtmls = useMemo(() => sections.map(s => ({ __html: renderMd(s.body) })), [sections])
  const toggleSection = (i: number) => setExpandedSections(prev => { const nx = new Set(prev); if (nx.has(i)) nx.delete(i); else nx.add(i); return nx })

  /** 树路径 → 右侧标题元素（双指针：树先序遍历 × DOM 标题文档序，名称归一化前缀匹配——
   * 切块折叠使标题行可能带正文尾巴，DOM 标题文本是树名的超集。
   * 分节面板把 h1/h2 变成了面板头按钮（data-sec-title），一并纳入文档序匹配） */
  const locateHeading = (path: string): boolean => {
    const body = bodyRef.current
    if (!body) return false
    const headings = Array.from(body.querySelectorAll('h1,h2,h3,h4,h5,h6,[data-sec-title]')) as HTMLElement[]
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
    if (!el) return false
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    el.classList.remove('kr-heading-flash')
    void el.offsetWidth // 重启动画
    el.classList.add('kr-heading-flash')
    return true
  }

  /** 定位（带轮询重试）：内容标题恒在 DOM（单流渲染），轮询只为等首次渲染完成 */
  const locateWithRetry = (path: string) => {
    let attempts = 0
    const tryLocate = () => {
      attempts++
      if (locateHeading(path)) return
      if (attempts < 20) setTimeout(tryLocate, 150)
    }
    setTimeout(tryLocate, 100)
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
      // 定位（内容标题恒在 DOM，轮询只为等首次渲染完成）
      let attempts = 0
      const tryLocate = () => {
        attempts++
        if (locateHeading(d.path)) return
        if (attempts < 20) setTimeout(tryLocate, 150)
      }
      setTimeout(tryLocate, 100)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChunk, seq, doc])

  // F9-S4：左栏大纲换统一组件（展开由组件内部管理）；点章名=选中+滚动定位

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-[var(--bg-panel)] rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] flex-shrink-0">
          <h3 className="text-base font-bold flex items-center gap-2 min-w-0">
            <FileText size={16} className="flex-shrink-0" />
            <span className="truncate">{title || source || '知识库文档'}</span>
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {extraAction && (
              <button onClick={extraAction.onClick}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#1a1a1a] text-white hover:opacity-85 transition-opacity">
                {extraAction.icon ? <extraAction.icon size={12} /> : null} {extraAction.label}
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-[var(--bg-hover)] rounded flex-shrink-0"><X size={18} /></button>
          </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-dim">
            <Loader2 size={14} className="animate-spin" /> 加载中…
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-[11px] text-red-500">{error}</div>
        ) : doc ? (
          <div className="flex-1 flex min-h-0">
            {/* 左侧标题树：F9-S4 统一大纲组件（同左栏/右栏事实源与渲染） */}
            <div className="w-52 flex-shrink-0 border-r hairline overflow-y-auto p-2">
              {tree.length === 0 ? (
                <p className="text-[10px] text-dim px-1 py-2">无标题结构</p>
              ) : (
                <OutlineTree tree={tree} selPath={selPath} compact showBadges
                  onSelect={(p) => { setSelPath(p); locateWithRetry(p) }} />
              )}
            </div>
            {/* 右侧原文：original/生成类直给单块渲染；reassembled（重组脏文本）按 h1/h2 折叠面板分块 */}
            <div className="flex-1 overflow-y-auto p-5" ref={bodyRef}>
              {isDirect || origin === 'original' ? (
                <div className="md-answer-body text-[12px] leading-relaxed" dangerouslySetInnerHTML={mdHtml} />
              ) : (
                <div className="flex flex-col gap-2">
                  {sections.map((s, i) => (
                    <div key={i} className="border hairline rounded-xl overflow-hidden bg-[var(--bg-panel)]">
                      {s.title && (
                        <button
                          data-sec-title={s.title}
                          onClick={() => toggleSection(i)}
                          className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-[12px] font-semibold hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <span className={`flex-shrink-0 transition-transform ${expandedSections.has(i) ? 'rotate-90' : ''}`}>
                            <ChevronRight size={12} />
                          </span>
                          <span className="truncate">{s.title}</span>
                        </button>
                      )}
                      {expandedSections.has(i) && (
                        <div className="px-3 pb-2 md-answer-body text-[12px] leading-relaxed" dangerouslySetInnerHTML={sectionHtmls[i]} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <style>{`
          .md-answer-body img { max-width: 100%; border-radius: 10px; margin: 6px 0; }
          .kr-heading-flash { animation: krFlash 1.5s ease-out; border-radius: 6px; }
          @keyframes krFlash { 0% { background: rgba(255, 200, 0, 0.35); } 100% { background: transparent; } }
        `}</style>
      </div>
    </div>
  )
}