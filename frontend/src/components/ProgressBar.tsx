/**
 * 章节进度条（5.2）：读课程记忆的「进度」（章节名→完成度 0-100）。
 * 章节均匀布点：点间距 ≥ 两倍直径（最多 6 点），未学到的章节为空心点。
 */
export default function ProgressBar({ chapters }: { chapters: Record<string, number> }) {
  const entries = Object.entries(chapters || {})
    .map(([name, v]) => ({ name, v: Math.max(0, Math.min(100, Number(v) || 0)) }))
  if (entries.length === 0) return null
  const shown = entries.slice(0, 6)
  const n = shown.length
  const avg = Math.round(entries.reduce((s, e) => s + e.v, 0) / entries.length)
  const pos = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * 100)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-dim">章节进度</p>
        <span className="text-[9px] text-dim">共 {entries.length} 章 · 平均 {avg}%</span>
      </div>
      <div className="relative h-2 rounded-full bg-[#ececec]">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: avg + '%', background: 'var(--accent)', opacity: 0.35 }} />
        {shown.map((e, i) => (
          <button key={e.name} title={`${e.name}：${e.v}%`}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 transition-transform hover:scale-125"
            style={{ left: pos(i) + '%', background: e.v >= 100 ? 'var(--accent)' : (e.v > 0 ? 'color-mix(in srgb, var(--accent) 45%, #fff)' : '#fff'), borderColor: 'var(--accent)' }}>
          </button>
        ))}
      </div>
    </div>
  )
}