import { Clock } from 'lucide-react'
import { summaryToSections } from './compressMap'
import type { MemorySection } from './memorySections'

interface SummaryItem { dialogueId: string; name: string; summary: string }
interface MappedItem { name: string; sections: MemorySection[] }

/**
 * F12-S4：课程记忆的压缩摘要素材（只读）——把各对话的 compress.py 五段式滚动摘要
 * 映射为单框结构展示在记忆框下方。只读：这里没有任何写路径；空态（无摘要/全空段）
 * 整块不渲染，优雅降级不占版面。
 */
export default function CompressMaterial({ items }: { items: SummaryItem[] }) {
  const mapped: MappedItem[] = items
    .map(s => ({ name: s.name || '对话', sections: summaryToSections(s.summary) }))
    .filter(x => x.sections.length > 0)
  if (mapped.length === 0) return null
  return (
    <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
      <div className="px-5 py-3 border-b hairline flex items-center gap-2">
        <Clock size={13} className="text-dim" />
        <span className="text-xs font-bold">对话压缩摘要（素材）</span>
        <span className="text-[9px] text-dim">由对话记忆压缩自动生成 · 只读，修改请通过「修改记忆」对话</span>
      </div>
      <div className="px-5 py-4 flex flex-col gap-5">
        {mapped.map((item, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-dim">{item.name}</p>
            {item.sections.map(sec => (
              <div key={sec.title} className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                  <span className="opacity-60">##</span> {sec.title}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {sec.points.map((p, j) => (
                    <li key={j} className="text-[12px] leading-6 text-[var(--text-muted)] flex gap-2">
                      <span className="text-dim flex-shrink-0 select-none">·</span>
                      <span className="min-w-0">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
