import { useEffect, useRef, useState } from 'react'
import { FileText, GitBranch, Table as TableIcon, BarChart3, Volume2, ClipboardList, Layers, Play, Square } from 'lucide-react'
import * as echarts from 'echarts'

type FormKey = 'report' | 'mindmap' | 'table' | 'chart' | 'audio' | 'quiz' | 'flash'

const FORMS: Array<{ key: FormKey; label: string; icon: any }> = [
  { key: 'report', label: '报告', icon: FileText },
  { key: 'mindmap', label: '思维导图', icon: GitBranch },
  { key: 'table', label: '表格', icon: TableIcon },
  { key: 'chart', label: '统计图', icon: BarChart3 },
  { key: 'audio', label: '音频', icon: Volume2 },
  { key: 'quiz', label: '测试题', icon: ClipboardList },
  { key: 'flash', label: '闪卡', icon: Layers },
]

/** 从回答文本解析测试题条目：支持本项目格式（**【难度】** 题目 / > 答案：）
 * 与 deeptutor 格式（Q1:/Question N: 题目 + A) B) C) D) 选项 + 答案行） */
function parseQuiz(content: string): Array<{ diff: string; q: string; a: string }> {
  const out: Array<{ diff: string; q: string; a: string }> = []
  const lines = (content || '').split('\n')
  let cur: { diff: string; q: string; a: string } | null = null
  for (const line of lines) {
    const m = line.match(/^\*\*【([^】]+)】\*\*\s*(.+)$/)
    if (m) { cur = { diff: m[1], q: m[2].trim(), a: '' }; out.push(cur); continue }
    const a = line.match(/^>\s*答案[：:]\s*(.+)$/)
    if (a && cur) { cur.a = a[1].trim(); continue }
    // deeptutor：Q1: / Question 1: 开头，后跟选项 A) B) C) D)
    const qm = line.match(/^(?:Q\d*|Question\s*\d*)[:.\s]*([^A-D][\s\S]*)$/)
    if (qm && qm[1].trim() && !/^[A-D]\)/.test(qm[1].trim())) {
      cur = { diff: '题', q: qm[1].trim(), a: '' }; out.push(cur); continue
    }
    if (cur && !cur.a) {
      const am = line.match(/^[A-D]\)[\s\S]*$/)
      if (am && cur.q) cur.q += ' ' + line.trim()  // 选项并入题目（答案行另行匹配）
    }
  }
  return out
}

/** 从回答文本解析闪卡：deeptutor/Anki 风格 front: / back: 格式 */
function parseFlash(content: string): Array<{ front: string; back: string }> {
  const out: Array<{ front: string; back: string }> = []
  let front = '', back = ''
  for (const line of (content || '').split('\n')) {
    const l = line.trim()
    if (/^front:/i.test(l)) { if (front && back) out.push({ front, back }); front = l.replace(/^front:/i, '').trim(); back = '' }
    else if (/^back:/i.test(l)) { back = l.replace(/^back:/i, '').trim() }
    else if (front && l) back += (back ? ' ' : '') + l
  }
  if (front && back) out.push({ front, back })
  return out
}

/** 特殊形式输出：报告（原）/ 思维导图 / 表格 / 统计图 / 音频 / 测试题 / 闪卡 */
export default function SpecialOutputPane({ projectId, dialogueId }: { projectId?: string | null; dialogueId?: string | null }) {
  const [form, setForm] = useState<FormKey>('report')
  const [artifacts, setArtifacts] = useState<Array<{ id: string; title: string; type: string; content: string }>>([])
  const [treeDocs, setTreeDocs] = useState<any[]>([])
  const [progress, setProgress] = useState<{ items: any[]; daily: Array<{ date: string; count: number }>; pace: string }>({ items: [], daily: [], pace: '' })
  const [reply, setReply] = useState('')
  const [speaking, setSpeaking] = useState(false)

  // 数据加载
  useEffect(() => {
    if (!projectId) return
    fetch('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setArtifacts(d.artifacts || [])).catch(() => {})
    fetch('/api/knowledge/list?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setTreeDocs((d.docs || []).map((x: any) => ({ source: x.source || '未命名', tree: Array.isArray(x.tree) ? x.tree : [] })))).catch(() => {})
    fetch('/api/memory/progress?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' })
      .then(r => r.json()).then(d => setProgress({ items: d.items || [], daily: d.daily || [], pace: d.pace || '' })).catch(() => {})
  }, [projectId])
  // 最近一次回答（音频/测试题/闪卡数据源）
  useEffect(() => {
    if (!dialogueId) return
    fetch('/api/dialogues/' + encodeURIComponent(dialogueId) + '/messages', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const msgs = d.messages || []
        const last = [...msgs].reverse().find((m: any) => m.role === 'assistant' && m.content && m.content !== '（系统未生成内容）')
        setReply((last && last.content) || '')
      })
      .catch(() => {})
  }, [dialogueId, projectId])

  // echarts 实例（思维导图 / 统计图）
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInst = useRef<any>(null)
  const renderChart = (option: any) => {
    if (!chartRef.current) return
    if (!chartInst.current) chartInst.current = echarts.init(chartRef.current)
    chartInst.current.setOption(option, true)
  }
  useEffect(() => {
    if (!chartRef.current) return
    if (form === 'mindmap') {
      // 树 → echarts tree
      const toTree = (nodes: any[]): any[] => (nodes || []).map(n => ({ name: n.name || '', children: toTree(n.children) }))
      renderChart({
        tooltip: { trigger: 'item', triggerOn: 'mousemove' },
        series: [{ type: 'tree', data: treeDocs.length ? treeDocs.map(d => ({ name: d.source, children: toTree(d.tree) })) : [{ name: '暂无资料' }], top: '4%', left: '8%', bottom: '4%', right: '20%', symbolSize: 8, label: { fontSize: 10 }, orient: 'LR', expandAndCollapse: true, initialTreeDepth: 2 }],
      })
    } else if (form === 'chart') {
      const daily = progress.daily || []
      renderChart({
        tooltip: { trigger: 'axis' },
        grid: { left: 30, right: 12, top: 16, bottom: 24 },
        xAxis: { type: 'category', data: daily.map(d => d.date.slice(5)), axisLabel: { fontSize: 9 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9 } },
        series: [{ type: 'line', smooth: true, data: daily.map(d => d.count), areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 } }],
      })
    }
    return () => { if (chartInst.current) { chartInst.current.dispose(); chartInst.current = null } }
  }, [form, treeDocs, progress])

  // 音频：浏览器 TTS 朗读最近回答
  const speak = () => {
    if (!('speechSynthesis' in window)) { alert('当前浏览器不支持语音合成'); return }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const txt = (reply || '').replace(/[#>*`_\-\[\]]/g, '').slice(0, 3000)
    if (!txt.trim()) { alert('暂无可朗读的回答内容'); return }
    const u = new SpeechSynthesisUtterance(txt)
    u.lang = 'zh-CN'
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    setSpeaking(true)
  }

  const quiz = parseQuiz(reply)
  const flashCards = parseFlash(reply)
  const flash = flashCards.length ? flashCards : quiz.map(q => ({ front: q.q, back: q.a }))

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* 形式标签条 */}
      <div className="flex flex-wrap gap-1 px-3 pt-2 flex-shrink-0">
        {FORMS.map(f => (
          <button key={f.key} onClick={() => setForm(f.key)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${form === f.key ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
            <f.icon size={11} /> {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* 报告：合并原报告功能 */}
        {form === 'report' && (
          <div className="flex flex-col gap-1.5">
            {artifacts.length === 0 ? (
              <p className="text-[11px] text-dim text-center py-6">暂无报告（对话生成讲义/指南/测试题后会汇总于此）</p>
            ) : artifacts.map(it => (
              <details key={it.id} className="border hairline rounded-xl px-3 py-2 bg-[var(--bg-panel)]">
                <summary className="text-[11px] font-semibold cursor-pointer flex items-center gap-1.5">
                  <FileText size={11} /> {it.title} <span className="text-dim font-normal">· {it.type}</span>
                </summary>
                <div className="mt-1.5 text-[10px] leading-relaxed text-dim whitespace-pre-wrap max-h-56 overflow-y-auto">{it.content}</div>
              </details>
            ))}
          </div>
        )}
        {/* 思维导图 */}
        {form === 'mindmap' && (
          <div ref={chartRef} className="w-full h-[320px]" />
        )}
        {/* 表格：知识点掌握度 */}
        {form === 'table' && (
          <div className="border hairline rounded-xl overflow-hidden">
            <table className="w-full text-[10px]">
              <thead><tr className="bg-[var(--bg-hover)] text-left">
                <th className="px-2.5 py-1.5 font-semibold">知识点</th><th className="px-2.5 py-1.5 font-semibold">类型</th><th className="px-2.5 py-1.5 font-semibold">掌握度</th><th className="px-2.5 py-1.5 font-semibold">最近提及</th>
              </tr></thead>
              <tbody>
                {progress.items.length === 0 ? (
                  <tr><td colSpan={4} className="px-2.5 py-4 text-dim text-center">暂无数据（对话后自动分析生成）</td></tr>
                ) : progress.items.map((it, i) => (
                  <tr key={i} className="border-t hairline">
                    <td className="px-2.5 py-1.5">{it.name}</td>
                    <td className="px-2.5 py-1.5 text-dim">{it.kind}</td>
                    <td className="px-2.5 py-1.5">{it.mastery}% {it.forgotten ? <span className="text-red-500">· 遗忘</span> : ''}</td>
                    <td className="px-2.5 py-1.5 text-dim">{it.lastSeen || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* 统计图：14 天对话趋势 */}
        {form === 'chart' && (
          <div className="flex flex-col gap-2">
            <div ref={chartRef} className="w-full h-[180px]" />
            <p className="text-[10px] text-dim text-center">近 14 天学习节奏：{progress.pace || '—'}</p>
          </div>
        )}
        {/* 音频：TTS 朗读最近回答 */}
        {form === 'audio' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <button onClick={speak}
              className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${speaking ? 'bg-red-500' : 'bg-[#1a1a1a] hover:bg-[#333]'}`}>
              {speaking ? <Square size={18} /> : <Play size={18} />}
            </button>
            <p className="text-[10px] text-dim text-center leading-relaxed">
              {speaking ? '正在朗读最近一次回答…（点击停止）' : '点击播放：朗读最近一次回答内容（参考 deeptutor 音频概览，后续可升级为双人讨论播客）'}
            </p>
          </div>
        )}
        {/* 测试题 */}
        {form === 'quiz' && (
          <div className="flex flex-col gap-2">
            {quiz.length === 0 ? (
              <p className="text-[11px] text-dim text-center py-6">暂无测试题（回答生成分阶测试题后展示）</p>
            ) : quiz.map((q, i) => (
              <div key={i} className="border hairline rounded-xl px-3 py-2 bg-[var(--bg-panel)]">
                <p className="text-[11px] font-medium"><span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] mr-1.5">{q.diff}</span>{q.q}</p>
                {q.a && <p className="mt-1 text-[10px] text-dim">答案：{q.a}</p>}
              </div>
            ))}
          </div>
        )}
        {/* 闪卡：测试题翻转卡 */}
        {form === 'flash' && (
          <div className="flex flex-col gap-2">
            {flash.length === 0 ? (
              <p className="text-[11px] text-dim text-center py-6">暂无闪卡（回答生成测试题后展示）</p>
            ) : flash.map((q, i) => <FlashCard key={i} q={(q as any).front || (q as any).q} a={(q as any).back || (q as any).a} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function FlashCard({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={() => setOpen(!open)}
      className={`border rounded-xl px-3 py-2.5 text-left text-[11px] transition-colors ${open ? 'bg-[var(--bg-input)] border-[var(--accent)]' : 'bg-[var(--bg-panel)] hairline'}`}>
      {open ? (a || '暂无答案') : q}
      <span className="block mt-1 text-[9px] text-dim">{open ? '点击收起' : '点击翻转看答案'}</span>
    </button>
  )
}
