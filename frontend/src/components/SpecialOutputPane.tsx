import { useState, useEffect, useRef } from 'react'
import { FileText, Workflow, Network, Table as TableIcon, BarChart3, Volume2, ClipboardList, Sparkles, X, Save, Trash2, Eye } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'
import type { Message } from '../types'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => md.render(text || '')

type FormKey = 'report' | 'flow' | 'tree' | 'table' | 'chart' | 'audio' | 'quiz'

const FORMS: Array<{ key: FormKey; label: string; icon: any; desc: string }> = [
  { key: 'report', label: '报告', icon: FileText, desc: '汇总整个对话生成结构化报告' },
  { key: 'flow', label: '流程图', icon: Workflow, desc: '流程步骤图' },
  { key: 'tree', label: '树状图', icon: Network, desc: '知识层级树状展示' },
  { key: 'table', label: '表格', icon: TableIcon, desc: '知识点/维度以表格呈现' },
  { key: 'chart', label: '统计图', icon: BarChart3, desc: '学习趋势统计图' },
  { key: 'audio', label: '音频', icon: Volume2, desc: '音频概览（朗读 / 播客）' },
  { key: 'quiz', label: '测试题', icon: ClipboardList, desc: '分阶测试题' },
]

const SUPPORTED: FormKey[] = ['report', 'flow', 'tree', 'table', 'quiz']
const SAVED_KEY = 'coagent-special-saved'

type SavedItem = { id: number; form: FormKey; label: string; content: string; time: string }

function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const id = 'mm-' + Math.random().toString(36).slice(2, 9)
    mermaid.render(id, String(code)).then(({ svg }) => {
      if (!cancelled && ref.current) {
        ref.current.innerHTML = svg
        const svgEl = ref.current.querySelector('svg')
        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox')
          const vbW = vb ? parseFloat(vb.split(/\s+/)[2]) : 0
          if (vbW) svgEl.setAttribute('width', String(vbW))
          svgEl.style.setProperty('max-width', 'none', 'important')
        }
      }
    }).catch(() => {
      if (ref.current) ref.current.innerHTML = '<div style="color:#d9534f;font-size:12px">图表渲染失败</div>'
    })
    return () => { cancelled = true }
  }, [code])
  return <div ref={ref} className="overflow-x-auto" />
}

/** 渲染某种形式的结果 */
function renderResult(form: FormKey, content: string) {
  if (form === 'flow') return <Mermaid code={content} />
  if (form === 'tree') return <div className="text-sm whitespace-pre-wrap leading-relaxed font-mono">{String(content)}</div>
  return <div className="text-sm md-answer-body" dangerouslySetInnerHTML={{ __html: renderMd(String(content)) }} />
}

export default function SpecialOutputPane({ messages }: { messages: Message[] }) {
  const [form, setForm] = useState<FormKey>('report')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState('')
  const [modalForm, setModalForm] = useState<FormKey>('report')
  const [showModal, setShowModal] = useState(false)
  const [saved, setSaved] = useState<SavedItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
  })
  const abortRef = useRef<AbortController | null>(null)
  const cur = FORMS.find(f => f.key === form) || FORMS[0]

  const persistSaved = (next: SavedItem[]) => {
    setSaved(next)
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)) } catch {}
  }

  const doGenerate = async (f: FormKey) => {
    const convo = messages
      .filter(m => m.role !== 'thinking' && m.content && String(m.content).trim())
      .map(m => (m.role === 'user' ? '用户：' : 'AI：') + m.content)
      .join('\n').slice(-4000)
    if (!convo.trim()) { alert('当前对话还没有内容'); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenerating(true)
    try {
      const r = await fetch('/api/generate-special', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: convo, forms: [f], api_key: localStorage.getItem('coagent-apikey') || '' }),
        signal: ctrl.signal,
      })
      const d = await r.json()
      if (d.status === 'ok') {
        setResult(d.results?.[f] || '')
        setModalForm(f)
        setShowModal(true)
      } else {
        alert('生成失败：' + (d.msg || '未知'))
      }
    } catch (e: any) {
      if (e && e.name === 'AbortError') { /* 用户停止 */ }
      else alert('生成失败：' + e)
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const stopGenerate = () => { if (abortRef.current) abortRef.current.abort() }

  const saveResult = () => {
    const item: SavedItem = { id: Date.now(), form: modalForm, label: FORMS.find(f => f.key === modalForm)?.label || modalForm, content: result, time: new Date().toLocaleString() }
    persistSaved([item, ...saved])
    setShowModal(false)
    setResult('')
  }

  const viewSaved = (item: SavedItem) => {
    setModalForm(item.form)
    setResult(item.content)
    setShowModal(true)
  }

  const removeSaved = (id: number) => {
    persistSaved(saved.filter(s => s.id !== id))
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* 形式宫格 */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-2.5 flex-shrink-0">
        {FORMS.map(f => {
          const unsupported = !SUPPORTED.includes(f.key)
          return (
            <button key={f.key} onClick={() => { if (!unsupported) doGenerate(f.key) }} title={f.desc}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl aspect-square transition-colors ${form === f.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:opacity-80'} ${unsupported ? 'opacity-40 cursor-not-allowed' : ''}`}>
              <f.icon size={18} strokeWidth={1.8} />
              <span className="text-[9px] leading-none">{f.label}</span>
            </button>
          )
        })}
      </div>

      {/* 已保存的制作（下面区域） */}
      <div className="flex-1 min-h-0 flex flex-col p-3">
        <p className="text-[10px] font-bold text-dim uppercase tracking-wider mb-2 flex-shrink-0">已保存的制作</p>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {saved.length === 0 ? (
            <div className="text-[11px] text-dim text-center py-10 leading-relaxed">点击上方形式生成，保存后会显示在这里</div>
          ) : (
            saved.map(item => (
              <div key={item.id} className="group flex items-center gap-2 border hairline rounded-xl px-3 py-2 mb-1.5 bg-[var(--bg-panel)]">
                <span className="text-[11px] font-semibold flex-1 truncate">{item.label}</span>
                <span className="text-[9px] text-dim flex-shrink-0">{item.time}</span>
                <button onClick={() => viewSaved(item)} title="查看" className="opacity-0 group-hover:opacity-100 p-1 rounded text-dim hover:text-[var(--accent)]"><Eye size={12} /></button>
                <button onClick={() => removeSaved(item.id)} title="删除" className="opacity-0 group-hover:opacity-100 p-1 rounded text-dim hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 弹窗展示生成结果 */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" onClick={() => setShowModal(false)}>
          <div className="w-[82vw] max-w-4xl max-h-[85vh] flex flex-col bg-[var(--bg-panel)] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b hairline flex-shrink-0">
              <span className="text-sm font-semibold flex items-center gap-2">
                {(() => { const F = FORMS.find(f => f.key === modalForm); const I = F?.icon; return I ? <I size={15} /> : null })()}
                {FORMS.find(f => f.key === modalForm)?.label}
              </span>
              <div className="flex items-center gap-2">
                {generating && <span className="text-[11px] text-dim">生成中…</span>}
                <button onClick={saveResult} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white text-xs font-semibold hover:bg-[#333333] transition-colors">
                  <Save size={13} /> 保存
                </button>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-dim hover:bg-[var(--bg-hover)]"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {result ? renderResult(modalForm, result) : (
                <div className="text-xs text-dim text-center py-16">生成结果为空</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
