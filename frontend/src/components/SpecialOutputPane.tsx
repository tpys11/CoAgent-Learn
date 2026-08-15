import { useState, useEffect, useRef } from 'react'
import { FileText, Network, Table as TableIcon, Volume2, ClipboardList, Sparkles, X, Save, Trash2, Eye, Layers, History } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'
import type { Message } from '../types'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => md.render(String(text || ''))

type FormKey = 'summary' | 'flashcards' | 'quiz' | 'mindmap' | 'table' | 'simulator' | 'audio'

const FORMS: Array<{ key: FormKey; label: string; icon: any; desc: string }> = [
  { key: 'summary', label: '总结', icon: FileText, desc: '汇总整个对话生成结构化总结' },
  { key: 'flashcards', label: '闪卡', icon: Layers, desc: '一问一答的抽认卡，点击翻面' },
  { key: 'quiz', label: '测验', icon: ClipboardList, desc: '选择题，交互式作答' },
  { key: 'mindmap', label: '思维导图', icon: Network, desc: '知识层级思维导图' },
  { key: 'table', label: '表格', icon: TableIcon, desc: '知识点/维度对比表格' },
  { key: 'simulator', label: '模拟器', icon: History, desc: '交互式仿真场景（待实现）' },
  { key: 'audio', label: '音频', icon: Volume2, desc: '音频概览（朗读 / 播客）' },
]

const SUPPORTED: FormKey[] = ['summary', 'flashcards', 'quiz', 'mindmap', 'table']
const TEXT_FORMS: FormKey[] = ['summary', 'mindmap', 'table']  // 文本形式：可边收边显示
const SAVED_KEY = 'coagent-special-saved'

type SavedItem = { id: number; form: FormKey; label: string; content: any; time: string }

/** 闪卡：翻面卡片 */
function FlashcardsView({ items }: { items: Array<{ front: string; back: string }> }) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set())
  const toggle = (i: number) => setFlipped(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((c, i) => (
        <div key={i} className="cursor-pointer" onClick={() => toggle(i)}>
          <div className={`border rounded-xl p-4 min-h-[110px] flex items-center justify-center text-center transition-all ${flipped.has(i) ? 'bg-[#1a1a1a] text-white border-transparent' : 'bg-[var(--bg-hover)]'}`}>
            <span className="text-sm leading-relaxed">{flipped.has(i) ? c.back : c.front}</span>
          </div>
          <p className="text-[10px] text-dim text-center mt-1.5">{flipped.has(i) ? '点击查看问题' : '点击翻面看答案'}</p>
        </div>
      ))}
    </div>
  )
}

/** 测验：交互式选择题 */
function QuizView({ items }: { items: Array<{ question: string; options: string[]; answer: string }> }) {
  const [picked, setPicked] = useState<Record<number, string>>({})
  return (
    <div className="space-y-5">
      {items.map((q, i) => {
        const p = picked[i]
        return (
          <div key={i} className="border hairline rounded-xl p-4">
            <p className="text-sm font-semibold mb-2">{i + 1}. {q.question}</p>
            <div className="space-y-1.5">
              {(q.options || []).map((opt, oi) => {
                const letter = String.fromCharCode(65 + oi)
                const isPicked = p === letter
                const isRight = q.answer === letter
                let cls = 'border hairline text-left'
                if (p) {
                  if (isRight) cls = 'border-green-400 bg-green-50 text-left'
                  else if (isPicked) cls = 'border-red-300 bg-red-50 text-left'
                }
                return (
                  <button key={oi} disabled={!!p} onClick={() => setPicked(prev => ({ ...prev, [i]: letter }))}
                    className={`w-full px-3 py-2 rounded-lg text-xs transition-colors ${cls}`}>
                    <span className="font-semibold mr-1.5">{letter}.</span>{opt}
                  </button>
                )
              })}
            </div>
            {p && (
              <p className={`text-xs mt-2 ${p === q.answer ? 'text-green-600' : 'text-red-500'}`}>
                {p === q.answer ? '✓ 回答正确' : '✗ 正确答案：' + q.answer}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 思维导图：markmap 渲染 markdown 列表 */
function MindmapView({ markdown }: { markdown: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    try {
      const transformer = new Transformer()
      const { root } = transformer.transform(String(markdown || '- 空'))
      const mm = Markmap.create(ref.current, { autoFit: true }, root)
      return () => { try { mm.destroy() } catch {} }
    } catch {
      if (ref.current) ref.current.innerHTML = ''
    }
  }, [markdown])
  return <svg ref={ref} className="w-full" style={{ height: 420 }} />
}

/** 时间线 */
function TimelineView({ items }: { items: Array<{ time: string; event: string }> }) {
  return (
    <div className="pl-1">
      {(items || []).map((t, i) => (
        <div key={i} className="relative pl-5 pb-5 border-l-2 border-[var(--border-strong)] last:border-transparent">
          <span className="absolute left-[-7px] top-0.5 w-3 h-3 rounded-full bg-[#1a1a1a] ring-4 ring-[var(--bg-panel)]" />
          <p className="text-xs font-semibold text-[var(--accent)]">{t.time}</p>
          <p className="text-sm mt-1">{t.event}</p>
        </div>
      ))}
    </div>
  )
}

function renderResult(form: FormKey, content: any) {
  if (form === 'flashcards') return <FlashcardsView items={Array.isArray(content) ? content : []} />
  if (form === 'quiz') return <QuizView items={Array.isArray(content) ? content : []} />
  if (form === 'timeline') return <TimelineView items={Array.isArray(content) ? content : []} />
  if (form === 'mindmap') return <MindmapView markdown={String(content || '')} />
  return <div className="text-sm md-answer-body" dangerouslySetInnerHTML={{ __html: renderMd(String(content || '')) }} />
}

export default function SpecialOutputPane({ messages, projectId }: { messages: Message[]; projectId?: string | null }) {
  const [form, setForm] = useState<FormKey>('summary')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [modalForm, setModalForm] = useState<FormKey>('summary')
  const [showModal, setShowModal] = useState(false)
  const [saved, setSaved] = useState<SavedItem[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const loadSaved = () => {
    fetch('/api/special-creations?project_id=' + encodeURIComponent(projectId || 'default'), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setSaved((d.creations || []).map((x: any) => ({
        id: x.id, form: x.form, label: FORMS.find(f => f.key === x.form)?.label || x.form, content: x.content, time: x.created_at || '',
      }))))
      .catch(() => {})
  }
  useEffect(() => { loadSaved() }, [projectId])

  const doGenerate = async (f: FormKey) => {
    const convo = messages
      .filter(m => m.role !== 'thinking' && m.content && String(m.content).trim())
      .map(m => (m.role === 'user' ? '用户：' : 'AI：') + m.content)
      .join('\n').slice(-4000)
    if (!convo.trim()) { alert('当前对话还没有内容'); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setModalForm(f)
    setResult(null)
    setShowModal(true)
    setGenerating(true)
    try {
      const r = await fetch('/api/generate-special', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: convo, forms: [f], api_key: localStorage.getItem('coagent-apikey') || '' }),
        signal: ctrl.signal,
      })
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status)
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const d = JSON.parse(part.slice(6))
          if (d.type === 'token') {
            // 文本形式：边收边显示（打字机效果）；数组形式不实时显示
            if (TEXT_FORMS.includes(f)) {
              setResult(prev => (typeof prev === 'string' ? prev : '') + d.chunk)
            }
          } else if (d.type === 'done') {
            // done 带 form + result（text 是字符串，array 是数组）
            setResult(d.result ?? null)
          } else if (d.type === 'error') {
            alert('生成失败：' + (d.message || '未知'))
          }
        }
      }
    } catch (e: any) {
      if (e && e.name === 'AbortError') { /* 停止 */ }
      else alert('生成失败：' + e)
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const stopGenerate = () => { if (abortRef.current) abortRef.current.abort() }

  const saveResult = async () => {
    try {
      await fetch('/api/special-creations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId || 'default', form: modalForm, content: result }),
      })
      loadSaved()
      setShowModal(false)
      setResult(null)
    } catch (e) {
      alert('保存失败：' + e)
    }
  }

  const viewSaved = (item: SavedItem) => {
    setModalForm(item.form)
    setResult(item.content)
    setShowModal(true)
  }

  const removeSaved = (id: number) => {
    fetch('/api/special-creations/' + id, { method: 'DELETE' }).then(() => loadSaved()).catch(() => {})
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

      {/* 已保存的制作 */}
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

      {/* 弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" onClick={() => setShowModal(false)}>
          <div className="w-[82vw] max-w-4xl max-h-[85vh] flex flex-col bg-[var(--bg-panel)] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b hairline flex-shrink-0">
              <span className="text-sm font-semibold flex items-center gap-2">
                {(() => { const F = FORMS.find(f => f.key === modalForm); const I = F?.icon; return I ? <I size={15} /> : null })()}
                {FORMS.find(f => f.key === modalForm)?.label}
              </span>
              <div className="flex items-center gap-2">
                {generating ? (
                  <button onClick={stopGenerate} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors">停止</button>
                ) : result != null ? (
                  <button onClick={saveResult} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white text-xs font-semibold hover:bg-[#333333] transition-colors"><Save size={13} /> 保存</button>
                ) : null}
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-dim hover:bg-[var(--bg-hover)]"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {generating ? (
                TEXT_FORMS.includes(modalForm) && typeof result === 'string' && result ? (
                  <div className="text-sm md-answer-body" dangerouslySetInnerHTML={{ __html: renderMd(result) }} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-dim">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </span>
                    <span className="text-xs">正在生成「{FORMS.find(f => f.key === modalForm)?.label}」…</span>
                  </div>
                )
              ) : result != null ? renderResult(modalForm, result) : (
                <div className="text-xs text-dim text-center py-16">生成结果为空</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
