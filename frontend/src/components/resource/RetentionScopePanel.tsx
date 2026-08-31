/**
 * F9-S2 留存范围选择面板：上传完成后展示章节分类建议（正文 vs 小结/习题/附录/实验/总测试），
 * 用户可勾选入库范围（子树语义）、可改分类建议（直接改勾选）、可「仅保留正文」/「全选」；
 * 确认后调 /api/kb/{pid}/apply-scope 重入库，进度复用 upload-progress 轮询通道。
 * 纯逻辑抽成导出纯函数（flattenOutline/buildIncludeList）供测试直调。
 */
import { useMemo, useState } from 'react'
import { CheckSquare, Loader2, ListTree, Square } from 'lucide-react'
import { api } from '../../api'
import { categoryBadgeClass } from '../OutlineTree'

export interface ScopeNode {
  name: string
  children?: ScopeNode[]
  category?: string
}

export interface FlatSection {
  path: string          // "/" 连接的节点路径（与 kb_tree 既有 path 语义一致）
  name: string
  depth: number
  category: string      // 未标注时视作正文
  hasKids: boolean
}

/** 树拍平为勾选行（保序；路径用 / 连接，对齐 chunk-node/content 接口的 path 语义） */
export function flattenOutline(tree: ScopeNode[]): FlatSection[] {
  const out: FlatSection[] = []
  const walk = (nodes: ScopeNode[], prefix: string, depth: number) => {
    for (const n of nodes || []) {
      const name = String(n?.name || '').trim()
      if (!name) continue
      const path = prefix ? prefix + '/' + name : name
      out.push({ path, name, depth, category: n.category || '正文', hasKids: (n.children || []).length > 0 })
      walk(n.children || [], path, depth + 1)
    }
  }
  walk(tree || [], '', 0)
  return out
}

/** 勾选集合 → include 路径清单：勾祖先时不重复列子孙（后端子树语义） */
export function buildIncludeList(sections: FlatSection[], checked: Set<string>): string[] {
  return sections.filter(s => checked.has(s.path) && !sections.some(
    p => p.path !== s.path && checked.has(p.path) && s.path.startsWith(p.path + '/'))).map(s => s.path)
}

/** 仅保留正文：非正文类目自身及（未标注而视作正文的）其子孙一并排除——
 * 与后端 span 继承语义对齐（习题章下的题随父不入，防「仅保留正文」漏进习题内容） */
export function bodyOnlySelection(sections: FlatSection[]): Set<string> {
  const byPath = new Map(sections.map(s => [s.path, s]))
  const out = new Set<string>()
  for (const s of sections) {
    if (s.category !== '正文') continue
    const parts = s.path.split('/')
    let excluded = false
    for (let i = 1; i < parts.length; i++) {
      const anc = byPath.get(parts.slice(0, i).join('/'))
      if (anc && anc.category !== '正文') { excluded = true; break }
    }
    if (!excluded) out.add(s.path)
  }
  return out
}

export function RetentionScopePanel({ projectId, source, tree, apiKey, onApplied }: {
  projectId: string
  source: string
  tree: ScopeNode[]
  apiKey?: string
  onApplied: () => void
}) {
  const sections = useMemo(() => flattenOutline(tree), [tree])
  const [checked, setChecked] = useState<Set<string>>(() => new Set(sections.map(s => s.path)))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!sections.length) return null

  const toggle = (path: string) => setChecked(prev => {
    const nx = new Set(prev)
    if (nx.has(path)) nx.delete(path); else nx.add(path)
    return nx
  })
  const selectAll = () => setChecked(new Set(sections.map(s => s.path)))
  const selectBodyOnly = () => setChecked(bodyOnlySelection(sections))

  const apply = async () => {
    if (busy) return
    const include = buildIncludeList(sections, checked)
    if (!include.length) { setMsg('请至少勾选一个章节（或点「全选」）'); return }
    setBusy(true); setMsg('')
    try {
      const d = await api.applyKbScope(projectId, source, include, apiKey || '')
      if (d && d.status === 'processing') {
        // 进度复用 upload-progress 轮询（重入库是分钟级向量重算）；
        // 完成判定与 UploadPanel.pollProgress 同款：enhancing 收尾 OR embedding 满载稳定两拍
        // （KB_META_ENHANCE=0 的栈没有 enhancing 阶段——f9tmp E2E 实测漏判会假超时）
        const started = Date.now()
        let stable = 0
        const timer = setInterval(async () => {
          try {
            const p = await api.uploadProgress(projectId, source)
            if (p && p.status === 'error') { clearInterval(timer); setBusy(false); setMsg('重入库失败：' + (p.msg || '未知原因')); return }
            if (p && p.status === 'ok' && p.total) {
              const done = p.done || 0
              if (p.stage === 'enhancing' && done >= p.total) {
                clearInterval(timer); setBusy(false); setMsg('已按所选范围重新入库'); onApplied(); return
              }
              if (p.stage === 'embedding' && done >= p.total) {
                stable++
                if (stable >= 2) { clearInterval(timer); setBusy(false); setMsg('已按所选范围重新入库'); onApplied(); return }
              } else stable = 0
            }
            if (Date.now() - started > 10 * 60 * 1000) { clearInterval(timer); setBusy(false); setMsg('处理超时，请稍后在资源列表确认'); }
          } catch { /* 网络抖动继续轮询 */ }
        }, 1500)
      } else {
        setBusy(false)
        setMsg((d && d.msg) || '未能应用所选范围')
      }
    } catch (e: any) {
      setBusy(false)
      setMsg('应用失败：' + ((e && e.message) || '网络异常'))
    }
  }

  return (
    <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold flex items-center gap-1.5">
          <ListTree size={12} /> 留存范围选择<span className="text-[9px] font-normal text-dim">— {source}</span>
        </p>
        <div className="flex gap-1.5">
          <button onClick={selectBodyOnly} disabled={busy}
            className="px-2 py-0.5 text-[10px] rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] disabled:opacity-40">仅保留正文</button>
          <button onClick={selectAll} disabled={busy}
            className="px-2 py-0.5 text-[10px] rounded-lg border hairline text-dim hover:bg-[var(--bg-hover)] disabled:opacity-40">全选</button>
        </div>
      </div>
      <p className="text-[9px] text-dim">勾选=入库课程知识库（含子章节）；分类为识别建议，直接改勾选即可纠偏。</p>
      <div className="flex flex-col max-h-52 overflow-y-auto">
        {sections.map(s => (
          <label key={s.path}
            className="flex items-center gap-1.5 px-1 py-0.5 rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer"
            style={{ paddingLeft: 4 + s.depth * 14 }}>
            <button onClick={e => { e.preventDefault(); toggle(s.path) }} className="flex-shrink-0 text-dim hover:text-[var(--text)]">
              {checked.has(s.path) ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>
            <span className="text-[10.5px] truncate flex-1" title={s.path}>{s.name}</span>
            {s.category !== '正文' && (
              <span className={`text-[9px] flex-shrink-0 ${categoryBadgeClass(s.category)}`}>{s.category}</span>
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-dim">{msg}</span>
        <button onClick={apply} disabled={busy}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#1a1a1a] text-[10.5px] font-medium text-white disabled:opacity-40">
          {busy ? <Loader2 size={11} className="animate-spin" /> : null}
          {busy ? '重新入库中…' : `按勾选入库（${buildIncludeList(sections, checked).length} 节）`}
        </button>
      </div>
    </div>
  )
}
