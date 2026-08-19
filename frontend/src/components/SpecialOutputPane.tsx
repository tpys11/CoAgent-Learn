import { useState, useEffect } from 'react'
import { FileText, Workflow, Network, ClipboardList, Wrench, Stethoscope, Send, Loader2 } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import { api } from '../api'
import { LS, lsGet, lsGetJSON } from '../storage'
import QuizViewer from './quiz/QuizViewer'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })
let mmdSeq = 0

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const _fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const t = tokens[idx]
  if (t.info.trim() === 'mermaid') {
    const id = 'rp-mmd-' + (++mmdSeq)
    setTimeout(() => {
      mermaid.render(id, t.content).then(({ svg }) => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = svg
      }).catch(() => {
        const el = document.getElementById(id)
        if (el) el.innerHTML = '<div class="text-red-500 text-[11px]">图表渲染失败</div>'
      })
    }, 0)
    return `<pre id="${id}" class="rp-mermaid">加载图表…</pre>`
  }
  return _fence(tokens, idx, options, env, slf)
}
const renderMd = (t: string) => md.render(t || '')

const ICONS: Record<string, any> = {
  report: FileText,
  flow: Workflow,
  tree: Network,
  quiz: ClipboardList,
  guide: Wrench,
  diagnosis: Stethoscope,
}

interface Capability { key: string; label: string; desc: string; output: string }
interface GenResult { key: string; label: string; output: string; content: string }
interface GenItem { id: string; name: string; content: string; created_at?: string }

/** 资源生成：能力注册表驱动的生成器（从后端 /api/resources/capabilities 拉取能力清单） */
export default function SpecialOutputPane({ projectId }: { projectId?: string | null }) {
  const [caps, setCaps] = useState<Capability[]>([])
  const [form, setForm] = useState('report')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GenResult | null>(null)
  const [history, setHistory] = useState<GenItem[]>([])

  useEffect(() => {
    api.listCapabilities().then(d => {
      const list: Capability[] = (d.capabilities || [])
      setCaps(list)
      if (list.length && !list.some(c => c.key === form)) setForm(list[0].key)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) { setHistory([]); return }
    api.listResources(projectId).then(d => {
      const rows: GenItem[] = (d.resources || []).filter(r => (r.type || '') === ('gen:' + form)).map(r => ({ id: r.id, name: r.name, content: r.content || '', created_at: r.created_at }))
      setHistory(rows)
    }).catch(() => setHistory([]))
  }, [form, projectId])

  const generate = async () => {
    if (!source.trim()) { alert('请先粘贴或输入源内容'); return }
    const prov = lsGet(LS.provider, 'deepseek')
    const keys = lsGetJSON<Record<string, string>>(LS.providerKeys, {})
    const apiKey = keys[prov] || lsGet(LS.apiKey, '')
    if (!apiKey) { alert('请先在设置中填写主模型 API Key'); return }
    const baseUrl = prov === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4' : 'https://api.deepseek.com/v1'
    const model = prov === 'zhipu' ? 'glm-4-flash' : 'deepseek-v4-flash'
    setLoading(true)
    try {
      const r = await api.generateResource({ key: form, content: source, api_key: apiKey, base_url: baseUrl, model })
      if (r?.status === 'ok') {
        setResult(r)
        if (projectId) {
          try {
            await api.saveResource({ name: `生成·${r.label}`, content: r.content, project_id: projectId, type: 'gen:' + form, append: true })
            api.listResources(projectId).then(d => {
              const rows: GenItem[] = (d.resources || []).filter(x => (x.type || '') === ('gen:' + form)).map(x => ({ id: x.id, name: x.name, content: x.content || '', created_at: x.created_at }))
              setHistory(rows)
            }).catch(() => {})
          } catch {}
        }
      } else {
        alert('生成失败：' + (r?.msg || '未知'))
      }
    } catch {
      alert('生成失败，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  const Icon = ICONS[form] || FileText
  const cur = caps.find(c => c.key === form)
  // 交互式测验优先组件渲染；组件解析失败（null）时回退 Markdown（兼容存量静态测试题）
  const quizEl = result && form === 'quiz' ? <QuizViewer content={result.content} /> : null

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="grid grid-cols-3 gap-1.5 px-3 pt-2.5 flex-shrink-0">
        {caps.map(c => {
          const CIcon = ICONS[c.key] || FileText
          return (
            <button key={c.key} onClick={() => { setForm(c.key); setResult(null) }} title={c.desc}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl aspect-[5/4] transition-colors ${form === c.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:opacity-80'}`}>
              <CIcon size={18} strokeWidth={1.8} />
              <span className="text-[9px] leading-none">{c.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
        <textarea
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="粘贴或输入要转换的源内容（例如一段讲解、一个流程、一组数据）…"
          rows={4}
          className="w-full px-2.5 py-2 input-surface rounded-xl text-xs outline-none resize-none"
        />
        <button onClick={generate} disabled={loading}
          className="self-end px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1a1a1a] text-white disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          生成 {cur?.label || ''}
        </button>

        {history.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold text-dim">已生成 · {cur?.label || ''}（{history.length}）</p>
            {history.map(h => (
              <button key={h.id}
                onClick={() => setResult({ key: form, label: cur?.label || form, output: cur?.output || 'markdown', content: h.content })}
                className="text-left px-2.5 py-1.5 rounded-lg border hairline text-[11px] hover:bg-[var(--bg-hover)] truncate">
                {h.name}
                {h.created_at ? <span className="text-[9px] text-dim ml-1.5">{(h.created_at || '').slice(0, 10)}</span> : null}
              </button>
            ))}
          </div>
        )}

        {result ? (
          <div className="mt-1 border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
            <p className="text-[10px] font-semibold text-dim mb-2 flex items-center gap-1">
              <Icon size={12} /> {result.label}
            </p>
            {quizEl ?? <div className="md-answer-body text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMd(result.content) }} />}
          </div>
        ) : (
          <div className="flex-1 min-h-[120px] border-2 border-dashed hairline rounded-2xl flex flex-col items-center justify-center gap-2 text-dim">
            <Icon size={28} strokeWidth={1.5} />
            <p className="text-xs font-semibold text-[var(--text)]">{cur?.label || '资源生成'}</p>
            <p className="text-[10px] text-center px-6 leading-relaxed">{cur?.desc || '从后端能力注册表加载…'}</p>
          </div>
        )}
      </div>

      <style>{`
        .rp-mermaid { background: var(--bg-panel); border: 1px solid var(--border-color, #e5e5e5); border-radius: 10px; padding: 0.8em; text-align: center; overflow-x: auto; }
      `}</style>
    </div>
  )
}
