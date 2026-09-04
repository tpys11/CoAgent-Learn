import { useState } from 'react'
import { BookOpen, ExternalLink } from 'lucide-react'
import { LS, lsGetJSON } from '../storage'

interface L { title: string; url: string; snippet?: string }
interface DomainData { links: L[] }

function loadData(domain: string): DomainData | null {
  const all = lsGetJSON<Record<string, DomainData>>(LS.syllabus, {})
  return all[domain] || null
}

/** 领域学习资源（真实链接）：新建领域时按领域联网搜到的 5-6 条可学资料 */
export default function DomainSyllabus({ domain }: { domain: string }) {
  const [data] = useState<DomainData | null>(() => loadData(domain))
  const links = (data && Array.isArray(data.links) ? data.links : []).filter(l => l.url)
  if (links.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5 mb-6">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dim">
        <BookOpen size={14} /> 领域学习资源
        <span className="font-normal normal-case text-[10px] text-dim">（联网推荐的真实资料，点击可学；也可自行上传补充）</span>
      </div>
      <div className="flex flex-col gap-2">
        {links.map((lk, i) => (
          <a key={i} href={lk.url} target="_blank" rel="noreferrer"
            className="border hairline rounded-xl px-4 py-3 bg-[var(--bg-panel)] flex items-start gap-3 hover:border-[var(--accent)] transition-colors group">
            <span className="text-[11px] font-bold text-[var(--accent)] flex-shrink-0 mt-0.5">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate group-hover:text-[var(--accent)]">{lk.title || lk.url}</p>
              {lk.snippet && <p className="text-[10px] text-dim truncate mt-0.5">{lk.snippet}</p>}
              {lk.url && <p className="text-[10px] text-[#3b82f6] truncate mt-0.5">{lk.url}</p>}
            </div>
            <ExternalLink size={13} className="text-dim flex-shrink-0 mt-1" />
          </a>
        ))}
      </div>
    </div>
  )
}
