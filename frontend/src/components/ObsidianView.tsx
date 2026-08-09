import { useEffect, useMemo, useRef, useState } from 'react'
import MarkdownIt from 'markdown-it'
import container from 'markdown-it-container'
import katexPlugin from 'markdown-it-katex'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
import { BookOpen, FileText, FolderOpen, FolderClosed, List, Network } from 'lucide-react'

// ---------- 渲染引擎：markdown-it（与 Obsidian 同源）+ callout/mermaid/KaTeX/双链嵌入 ----------
mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })
let mmdSeq = 0

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
md.use(katexPlugin, { throwOnError: false, errorColor: '#d9534f' })

// Callout：> [!note] 标题（blockquote 形式，与 Obsidian 一致）
const calloutStack: number[] = []
const _quoteOpen = md.renderer.rules.blockquote_open
md.renderer.rules.blockquote_open = (tokens, idx, options, env, slf) => {
  const next = tokens[idx + 1]
  let m: RegExpMatchArray | null = null
  if (next && next.type === 'paragraph_open') {
    const inline = tokens[idx + 2]
    if (inline && inline.type === 'inline') m = inline.content.trim().match(/^\[!([^\]]+)\](.*)$/)
  }
  if (m) {
    const type = m[1].toLowerCase()
    const title = (m[2] || '').trim()
    if (tokens[idx + 2] && tokens[idx + 2].type === 'inline') tokens[idx + 2].content = '' // 标题行不显示
    calloutStack.push(1)
    return `<blockquote class="obs-callout obs-callout-${type}"><div class="obs-callout-title">${title || type}</div>`
  }
  calloutStack.push(0)
  return _quoteOpen ? _quoteOpen(tokens, idx, options, env, slf) : '<blockquote>'
}
const _quoteClose = md.renderer.rules.blockquote_close
md.renderer.rules.blockquote_close = (tokens, idx, options, env, slf) => {
  const isCallout = calloutStack.pop() === 1
  if (isCallout) return '</div></blockquote>'
  return _quoteClose ? _quoteClose(tokens, idx, options, env, slf) : '</blockquote>'
}

// Mermaid：```mermaid 代码块 → 异步渲染 SVG
const _fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const t = tokens[idx]
  if (t.info.trim() === 'mermaid') {
    const id = 'mmd-' + (++mmdSeq)
    setTimeout(() => {
      mermaid.render(id, t.content).then(({ svg }) => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = svg
      }).catch(() => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = '<div class="obs-mermaid-err">图表渲染失败</div>'
      })
    }, 0)
    return `<pre class="obs-mermaid" id="${id}">加载图表…</pre>`
  }
  return _fence(tokens, idx, options, env, slf)
}

// 双链 [[名称|别名]] 与嵌入 ![[名称]]
md.inline.ruler.before('escape', 'obs_wiki', (state, silent) => {
  const src = state.src.slice(state.pos)
  const m = src.match(/^(!?)\[\[([^\[\]]+?)(?:\|([^\[\]]*))?\]\]/)
  if (!m) return false
  if (!silent) {
    const embed = m[1] === '!'
    const name = m[2].trim()
    const alias = (m[3] || '').trim()
    if (embed) {
      const t1 = state.push('obs_embed_open', 'span', 1)
      t1.attrs = [['class', 'obs-embed'], ['data-wiki', name]]
      const t2 = state.push('obs_embed_body', '', 0)
      t2.content = `加载 ${name} …`
      state.push('obs_embed_close', 'span', -1)
    } else {
      const t1 = state.push('obs_wikilink_open', 'a', 1)
      t1.attrs = [['class', 'obs-wikilink'], ['data-wiki', name], ['href', '#']]
      const t2 = state.push('text', '', 0)
      t2.content = alias || name
      state.push('obs_wikilink_close', 'a', -1)
    }
  }
  state.pos += m[0].length
  return true
})

// ---------- IndexedDB：持久化目录句柄（刷新后自动恢复连接） ----------
const DB_NAME = 'coagent-fs'
const STORE = 'handles'
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1)
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE)
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => rej(rq.error)
  })
}
async function saveRootHandle(h: FileSystemDirectoryHandle) {
  const db = await idbOpen()
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(h, 'root')
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await idbOpen()
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly')
      const rq = tx.objectStore(STORE).get('root')
      rq.onsuccess = () => res(rq.result || null)
      rq.onerror = () => res(null)
    })
  } catch { return null }
}
async function clearRootHandle() {
  try {
    const db = await idbOpen()
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete('root')
      tx.oncomplete = () => res()
    })
  } catch { /* 忽略 */ }
}

// ---------- 文件树 ----------
interface TreeNode { name: string; path: string; kind: 'file' | 'dir'; children?: TreeNode[] }
async function walkDir(dir: FileSystemDirectoryHandle, path: string, depth: number): Promise<TreeNode[]> {
  if (depth > 10) return []
  const out: TreeNode[] = []
  for await (const [name, h] of (dir as any).entries()) {
    if (h.kind === 'directory') {
      const kids = await walkDir(h, path + '/' + name, depth + 1)
      if (kids.length) out.push({ name, path: path + '/' + name, kind: 'dir', children: kids })
    } else if (name.endsWith('.md')) {
      out.push({ name, path: path + '/' + name, kind: 'file' })
    }
  }
  out.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1)
  return out
}
async function readFile(h: FileSystemDirectoryHandle, relPath: string): Promise<string> {
  const parts = relPath.split('/').filter(Boolean)
  let cur: any = h
  for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p)
  const fh = await cur.getFileHandle(parts[parts.length - 1])
  const f = await fh.getFile()
  return f.text()
}

function TreeItem({ node, open, onToggle, onOpen, depth }: {
  node: TreeNode
  open: Set<string>
  onToggle: (p: string) => void
  onOpen: (n: TreeNode) => void
  depth: number
}) {
  const isDir = node.kind === 'dir'
  const expanded = open.has(node.path)
  return (
    <div>
      <button onClick={() => isDir ? onToggle(node.path) : onOpen(node)}
        className={`w-full flex items-center gap-1.5 pr-2 py-1.5 rounded-lg text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${!isDir ? 'text-[var(--text-muted)]' : 'font-medium'}`}
        style={{ paddingLeft: depth * 14 + 8 }}>
        {isDir
          ? (expanded ? <FolderOpen size={13} className="text-dim flex-shrink-0" /> : <FolderClosed size={13} className="text-dim flex-shrink-0" />)
          : <FileText size={12} className="text-dim flex-shrink-0" />}
        <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
      </button>
      {isDir && expanded && node.children?.map(c => (
        <TreeItem key={c.path} node={c} open={open} onToggle={onToggle} onOpen={onOpen} depth={depth + 1} />
      ))}
    </div>
  )
}

/** 树状图展开：缩进 + 竖直连接线 + 每行横向短线（父子层级连线可见） */
function TreeChart({ node, open, onToggle, onOpen }: {
  node: TreeNode
  open: Set<string>
  onToggle: (p: string) => void
  onOpen: (n: TreeNode) => void
}) {
  const isDir = node.kind === 'dir'
  const expanded = open.has(node.path)
  return (
    <div className="tree-node">
      <button onClick={() => isDir ? onToggle(node.path) : onOpen(node)}
        className={`tree-row w-full flex items-center gap-1.5 pr-2 py-1.5 rounded-lg text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${!isDir ? 'text-[var(--text-muted)]' : 'font-medium'}`}>
        {isDir
          ? (expanded ? <FolderOpen size={13} className="text-dim flex-shrink-0" /> : <FolderClosed size={13} className="text-dim flex-shrink-0" />)
          : <FileText size={12} className="text-dim flex-shrink-0" />}
        <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
      </button>
      {isDir && expanded && node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map(c => (
            <TreeChart key={c.path} node={c} open={open} onToggle={onToggle} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Obsidian 界面：连接本机 Obsidian 库文件夹（File System Access API，零后端），文件树 + 文章阅读 */
export default function ObsidianView() {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [rootName, setRootName] = useState('')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState<{ path: string; content: string } | null>(null)
  // 展开方式：列表（缩进列表）/ 树状图（带连接线），持久化记忆
  const [expandMode, setExpandMode] = useState<'list' | 'tree'>(() => localStorage.getItem('coagent-obsidian-mode') === 'tree' ? 'tree' : 'list')
  const articleRef = useRef<HTMLDivElement>(null)

  // 恢复上次连接
  useEffect(() => {
    loadRootHandle().then(async h => {
      if (!h) return
      try {
        setRootHandle(h)
        setRootName(h.name)
        setTree(await walkDir(h, '', 0))
      } catch { /* 句柄失效则忽略 */ }
    })
  }, [])

  const connect = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: 'read' })
      setRootHandle(h)
      setRootName(h.name)
      await saveRootHandle(h)
      setTree(await walkDir(h, '', 0))
      setOpen(new Set())
    } catch { /* 用户取消 */ }
  }
  const disconnect = async () => {
    await clearRootHandle()
    setRootHandle(null)
    setTree([])
    setCurrent(null)
  }
  const toggle = (p: string) => {
    setOpen(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }
  const switchMode = (m: 'list' | 'tree') => {
    setExpandMode(m)
    localStorage.setItem('coagent-obsidian-mode', m)
  }
  const openFile = async (node: TreeNode) => {
    if (!rootHandle) return
    setCurrent({ path: node.path, content: '加载中…' })
    try {
      const text = await readFile(rootHandle, node.path)
      setCurrent({ path: node.path, content: text })
    } catch {
      setCurrent({ path: node.path, content: '读取失败' })
    }
  }

  // 名称索引：双链/嵌入按名称定位文件
  const nameIndex = useMemo(() => {
    const map = new Map<string, TreeNode>()
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'file') map.set(n.name.replace(/\.md$/, ''), n)
        if (n.children) walk(n.children)
      }
    }
    walk(tree)
    return map
  }, [tree])

  const html = current ? (md.render(current.content) as string) : ''

  // 嵌入懒加载：文章渲染后扫描 .obs-embed 元素，读取目标文件并渲染
  useEffect(() => {
    if (!current || !rootHandle || !articleRef.current) return
    const root = articleRef.current
    root.querySelectorAll('.obs-embed[data-loaded!="1"]').forEach(async el => {
      const name = el.getAttribute('data-wiki') || ''
      el.setAttribute('data-loaded', '1')
      const node = nameIndex.get(name)
      if (!node) {
        el.innerHTML = `<div class="obs-embed-head">${name}</div><div class="obs-embed-err">未找到笔记「${name}」</div>`
        return
      }
      try {
        const text = await readFile(rootHandle, node.path)
        el.innerHTML = `<div class="obs-embed-head">${name}</div><div class="obs-embed-body">${md.render(text)}</div>`
      } catch {
        el.innerHTML = `<div class="obs-embed-head">${name}</div><div class="obs-embed-err">读取失败</div>`
      }
    })
  }, [current, html, rootHandle, nameIndex])

  // 双链点击：打开目标笔记
  const onArticleClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('.obs-wikilink') as HTMLElement | null
    if (a) {
      e.preventDefault()
      const name = a.getAttribute('data-wiki') || ''
      const node = nameIndex.get(name)
      if (node) openFile(node)
      else a.title = '未找到笔记「' + name + '」'
    }
  }

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左侧：连接 + 文件树 */}
      <div className="w-72 bg-[var(--bg-sidebar)] border-r hairline flex flex-col flex-shrink-0">
        <div className="p-3 border-b hairline flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><BookOpen size={15} /> Obsidian</h2>
          {rootHandle && (
            <button onClick={disconnect} className="text-[10px] text-dim hover:text-red-500 px-2 py-1 rounded-lg hover:bg-[var(--bg-hover)]">断开</button>
          )}
        </div>
        {!rootHandle ? (
          <div className="p-4 flex flex-col gap-3">
            <button onClick={connect}
              className="py-3 rounded-xl text-xs font-semibold text-white shadow-soft transition-transform hover:scale-105"
              style={{ background: 'var(--accent)' }}>
              连接 Obsidian 文件夹
            </button>
            <p className="text-[10px] text-dim leading-relaxed">选择电脑上的 Obsidian 库文件夹，文件树与文章将直接展示。</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b hairline text-[11px] font-medium truncate">{rootName}</div>
            {/* 展开方式切换 */}
            <div className="px-3 py-1.5 border-b hairline flex items-center gap-1">
              <button onClick={() => switchMode('list')}
                className={`px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors ${expandMode === 'list' ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
                <List size={11} /> 列表
              </button>
              <button onClick={() => switchMode('tree')}
                className={`px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1 transition-colors ${expandMode === 'tree' ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
                <Network size={11} /> 树状图
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {tree.length === 0 ? (
                <p className="text-[11px] text-dim text-center py-6">未找到 .md 文件</p>
              ) : expandMode === 'list' ? (
                tree.map(n => (
                  <TreeItem key={n.path} node={n} open={open} onToggle={toggle} onOpen={openFile} depth={0} />
                ))
              ) : (
                <div className="tree-root">
                  {tree.map(n => (
                    <TreeChart key={n.path} node={n} open={open} onToggle={toggle} onOpen={openFile} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* 右侧：文章阅读 */}
      <div className="flex-1 overflow-y-auto">
        {current ? (
          <article ref={articleRef} onClick={onArticleClick}
            className="max-w-3xl mx-auto px-10 py-8 obsidian-prose" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-dim">选择左侧文章查看</div>
        )}
      </div>
      <style>{`
        .tree-children {
          margin-left: 11px;
          padding-left: 12px;
          border-left: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
        }
        .tree-children > .tree-node > .tree-row {
          position: relative;
        }
        .tree-children > .tree-node > .tree-row::before {
          content: '';
          position: absolute;
          left: -12px;
          top: 50%;
          width: 12px;
          height: 1px;
          background: var(--border-color);
        }
        .obsidian-prose { font-size: 15px; line-height: 1.75; color: var(--text); word-break: break-word; }
        .obsidian-prose h1, .obsidian-prose h2, .obsidian-prose h3, .obsidian-prose h4, .obsidian-prose h5, .obsidian-prose h6 {
          font-weight: 700; margin: 1.6em 0 0.6em; line-height: 1.4;
        }
        .obsidian-prose h1 { font-size: 1.7em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
        .obsidian-prose h2 { font-size: 1.4em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25em; }
        .obsidian-prose h3 { font-size: 1.2em; }
        .obsidian-prose h4 { font-size: 1.05em; }
        .obsidian-prose p { margin: 0.7em 0; }
        .obsidian-prose ul, .obsidian-prose ol { margin: 0.7em 0; padding-left: 1.6em; }
        .obsidian-prose li { margin: 0.25em 0; }
        .obsidian-prose blockquote { border-left: 3px solid var(--accent); margin: 0.9em 0; padding: 0.1em 1em; color: var(--text-muted); background: color-mix(in srgb, var(--accent) 5%, var(--bg-panel)); border-radius: 0 8px 8px 0; }
        .obsidian-prose code { font-family: ui-monospace, monospace; font-size: 0.88em; background: var(--bg-hover); padding: 0.15em 0.4em; border-radius: 4px; }
        .obsidian-prose pre { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.9em 1.1em; overflow-x: auto; margin: 0.9em 0; }
        .obsidian-prose pre code { background: none; padding: 0; font-size: 0.85em; }
        .obsidian-prose a { color: var(--accent); text-decoration: underline; }
        .obsidian-prose table { border-collapse: collapse; margin: 0.9em 0; width: 100%; }
        .obsidian-prose th, .obsidian-prose td { border: 1px solid var(--border-color); padding: 0.4em 0.8em; font-size: 0.92em; }
        .obsidian-prose th { background: var(--bg-hover); }
        .obsidian-prose hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5em 0; }
        .obsidian-prose img { max-width: 100%; border-radius: 8px; }
        .obsidian-prose strong { font-weight: 700; }
        .obsidian-prose del { color: var(--text-muted); }
        /* Callout（与 Obsidian 一致） */
        .obs-callout { margin: 1em 0; border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; background: color-mix(in srgb, var(--accent) 6%, var(--bg-panel)); padding: 0.7em 1em; }
        .obs-callout-title { font-weight: 700; font-size: 0.95em; margin-bottom: 0.35em; text-transform: capitalize; }
        .obs-callout-body > p:first-child:empty { display: none; }
        .obs-callout-warning { border-left-color: #f59e0b; }
        .obs-callout-tip, .obs-callout-success, .obs-callout-check { border-left-color: #10b981; }
        .obs-callout-danger, .obs-callout-error, .obs-callout-fail { border-left-color: #ef4444; }
        .obs-callout-info, .obs-callout-question { border-left-color: #3b82f6; }
        /* 双链与嵌入 */
        .obs-wikilink { color: var(--accent); text-decoration: underline; cursor: pointer; }
        .obs-wikilink:hover { text-decoration: none; background: color-mix(in srgb, var(--accent) 10%, transparent); border-radius: 3px; }
        .obs-embed { display: block; border: 1px solid var(--border-color); border-left: 3px solid var(--accent); border-radius: 8px; margin: 0.8em 0; padding: 0.5em 0.9em 0.6em; background: var(--bg-panel); }
        .obs-embed-head { font-size: 0.78em; font-weight: 600; color: var(--text-muted); margin-bottom: 0.3em; }
        .obs-embed-err { font-size: 0.85em; color: #d9534f; }
        .obs-embed-body > :first-child { margin-top: 0.3em; }
        .obs-embed-body .obs-embed { border-left-width: 2px; }
        /* Mermaid */
        .obs-mermaid { background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 10px; padding: 1em; text-align: center; overflow-x: auto; }
        .obs-mermaid-err { color: #d9534f; font-size: 0.85em; }
      `}</style>
    </div>
  )
}
