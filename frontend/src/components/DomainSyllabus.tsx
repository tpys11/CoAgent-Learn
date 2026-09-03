import { useState } from 'react'
import { ChevronDown, ChevronRight, BookOpen, Loader2, ExternalLink } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import { LS, lsGetJSON, lsSetJSON, lsGet } from '../storage'
import { api } from '../api'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (s: string) => md.render(s || '')

interface Chap { title: string; goal: string; keywords?: string[]; intro?: string; links?: Array<{ title: string; url: string; snippet?: string }> }
interface DomainData { chapters: Chap[] }

function loadData(domain: string): DomainData | null {
  const all = lsGetJSON<Record<string, DomainData>>(LS.syllabus, {})
  return all[domain] || null
}
function saveData(domain: string, data: DomainData) {
  const all = lsGetJSON<Record<string, DomainData>>(LS.syllabus, {})
  all[domain] = data
  lsSetJSON(LS.syllabus, all)
}

/** 领域课程大纲：章节列表 → 点章按需 AI 生成导读正文 + 联网搜真实链接（B3） */
export default function DomainSyllabus({ domain }: { domain: string }) {
  const [data, setData] = useState<DomainData | null>(() => loadData(domain))
  const [genIdx, setGenIdx] = useState<number | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [err, setErr] = useState('')

  if (!data || data.chapters.length === 0) return null

  const gen = async (i: number) => {
    const ch = data.chapters[i]
    setGenIdx(i); setErr('')
    try {
      const d = await api.generateChapter({
        domain, title: ch.title, keywords: ch.keywords || [],
        api_key: lsGet(LS.apiKey, ''),
      })
      if (d.status === 'ok') {
        const chapters = data.chapters.map((x, idx) => idx === i ? { ...x, intro: d.intro || '', links: d.links || [] } : x)
        const next = { chapters }
        saveData(domain, next); setData(next)
        setOpenIdx(i)
      } else setErr('生成失败：' + (d.msg || '请检查 API Key'))
    } catch (e: any) { setErr('生成失败：' + (e?.message || '网络异常')) }
    finally { setGenIdx(null) }
  }

  return (
    <div className="flex flex-col gap-2.5 mb-6">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dim">
        <BookOpen size={14} /> 课程大纲
      </div>
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      <div className="flex flex-col gap-2">
        {data.chapters.map((ch, i) => (
          <div key={ch.title} className="border hairline rounded-xl overflow-hidden bg-[var(--bg-panel)]">
            <button onClick={() => {
              if (genIdx === i) return
              if (openIdx === i) { setOpenIdx(null); return }
              if (!ch.intro) gen(i); else setOpenIdx(i)
            }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors">
              {genIdx === i ? <Loader2 size={14} className="animate-spin text-dim flex-shrink-0" />
                : openIdx === i ? <ChevronDown size={14} className="text-dim flex-shrink-0" /> : <ChevronRight size={14} className="text-dim flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">第{i + 1}节 · {ch.title}</p>
                {ch.goal && <p className="text-[10px] text-dim truncate mt-0.5">{ch.goal}</p>}
              </div>
              {ch.intro && <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 flex-shrink-0">已生成</span>}
            </button>
            {openIdx === i && ch.intro && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="border-t hairline pt-3 text-xs leading-relaxed md-answer-body" dangerouslySetInnerHTML={{ __html: renderMd(ch.intro) }} />
                {(ch.links || []).length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-dim">真实学习链接</p>
                    {(ch.links || []).map((lk, li) => (
                      <a key={li} href={lk.url} target="_blank" rel="noreferrer"
                        className="flex items-start gap-1.5 text-[11px] text-[var(--accent)] hover:underline py-0.5">
                        <ExternalLink size={11} className="mt-0.5 flex-shrink-0" />
                        <span className="min-w-0"><span className="truncate block">{lk.title || lk.url}</span>
                          {lk.snippet && <span className="text-[10px] text-dim truncate block">{lk.snippet}</span>}</span>
                      </a>
                    ))}
                  </div>
                )}
                {(!ch.links || ch.links.length === 0) && <p className="text-[10px] text-dim">（未检索到外部链接，导读已可阅读）</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
