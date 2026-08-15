import { useState, useEffect, useRef } from 'react'
import { FileText, Workflow, Network, Table as TableIcon, BarChart3, Volume2, ClipboardList, Sparkles } from 'lucide-react'
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

/** 后端当前支持的生成形式 */
const SUPPORTED: FormKey[] = ['report', 'flow', 'tree', 'table', 'quiz']

/** mermaid 流程图渲染：代码 -> SVG */
function Mermaid({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const id = 'mm-' + Math.random().toString(36).slice(2, 9)
    mermaid.render(id, code).then(({ svg }) => {
      if (!cancelled && ref.current) ref.current.innerHTML = svg
    }).catch(() => {
      if (ref.current) ref.current.innerHTML = '<div style="color:#d9534f;font-size:12px">图表渲染失败</div>'
    })
    return () => { cancelled = true }
  }, [code])
  return <div ref={ref} className="overflow-x-auto flex justify-center" />
}

/** 特殊形式输出：基于整个对话生成（报告/流程图/树状图/表格/测试题），结果按形式缓存 */
export default function SpecialOutputPane({ messages }: { messages: Message[] }) {
  const [form, setForm] = useState<FormKey>('report')
  const [results, setResults] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const cur = FORMS.find(f => f.key === form) || FORMS[0]
  const isSupported = SUPPORTED.includes(form)
  const curResult = results[form] || ''

  const doGenerate = async () => {
    const convo = messages
      .filter(m => m.role !== 'thinking' && m.content && String(m.content).trim())
      .map(m => (m.role === 'user' ? '用户：' : 'AI：') + m.content)
      .join('\n')
    if (!convo.trim()) { alert('当前对话还没有内容'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/generate-special', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: convo, forms: [form], api_key: localStorage.getItem('coagent-apikey') || '' }),
      })
      const d = await r.json()
      if (d.status === 'ok') {
        const val = d.results?.[form] || ''
        setResults(prev => ({ ...prev, [form]: val }))
      } else {
        alert('生成失败：' + (d.msg || '未知'))
      }
    } catch (e) {
      alert('生成失败：' + e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* 形式选项：正方形宫格 */}
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-2.5 flex-shrink-0">
        {FORMS.map(f => (
          <button key={f.key} onClick={() => setForm(f.key)} title={f.desc}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl aspect-square transition-colors ${form === f.key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'bg-[var(--bg-hover)] text-dim hover:opacity-80'}`}>
            <f.icon size={18} strokeWidth={1.8} />
            <span className="text-[9px] leading-none">{f.label}</span>
          </button>
        ))}
      </div>
      {/* 内容区 */}
      <div className="flex-1 min-h-0 p-3 flex flex-col gap-2 overflow-hidden">
        {isSupported ? (
          <>
            <button onClick={doGenerate} disabled={loading}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-semibold hover:bg-[#333333] transition-colors disabled:opacity-50 flex-shrink-0">
              <Sparkles size={13} /> {loading ? '生成中…' : (curResult ? '重新生成「' + cur.label + '」' : '基于整个对话生成「' + cur.label + '」')}
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {curResult ? (
                form === 'flow'
                  ? <Mermaid code={curResult} />
                  : <div className="text-xs md-answer-body" dangerouslySetInnerHTML={{ __html: renderMd(curResult) }} />
              ) : (
                <div className="text-xs text-dim text-center pt-10 leading-relaxed">选择上方形式，点「生成」基于整个对话生成{cur.label}</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 border-2 border-dashed hairline rounded-2xl flex flex-col items-center justify-center gap-2 text-dim">
            <cur.icon size={28} strokeWidth={1.5} />
            <p className="text-xs font-semibold text-[var(--text)]">{cur.label}</p>
            <p className="text-[10px] text-center px-6 leading-relaxed">{cur.desc}</p>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)]">待实现</span>
          </div>
        )}
      </div>
    </div>
  )
}
