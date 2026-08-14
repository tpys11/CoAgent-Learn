import { useMemo } from 'react'

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 主页趋势图：纵轴 = 专注时长，横轴 = 固定最近 30 天（无数据日补零） */
export default function TrendCalendar({ days }: { days: Array<{ date: string; seconds: number }> }) {
  const { dates, vals } = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of days || []) map[d.date] = d.seconds
    const dates: string[] = []
    const cur = new Date()
    cur.setDate(cur.getDate() - 29)
    for (let i = 0; i < 30; i++) { dates.push(key(cur)); cur.setDate(cur.getDate() + 1) }
    return { dates, vals: dates.map(d => map[d] || 0) }
  }, [days])
  const totalSec = vals.reduce((s, n) => s + n, 0)
  const max = Math.max(60, ...vals)
  const fmt = (s: number) => s >= 3600 ? (s / 3600).toFixed(1) + ' 小时' : Math.round(s / 60) + ' 分钟'
  const W = 100, H = 40
  const bw = W / 30
  const bh = (v: number) => (v / max) * (H - 14)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] text-dim">
        <span className="font-semibold uppercase tracking-wider">专注时长趋势</span>
        <span>最近 30 天 · 累计 {fmt(totalSec)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} preserveAspectRatio="none">
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="#d4d4d4" strokeWidth="0.4" />
        {vals.map((v, i) => (
          <rect key={i} x={i * bw + 0.6} y={H - 6 - Math.max(bh(v), v > 0 ? 1 : 0)}
            width={bw - 1.2} height={Math.max(bh(v), v > 0 ? 1 : 0)}
            fill={v > 0 ? 'var(--accent)' : '#e5e5e5'} rx="0.6" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-dim">
        <span>{dates[0]?.slice(5)}</span>
        <span>{dates[29]?.slice(5)}（今天）</span>
      </div>
    </div>
  )
}
