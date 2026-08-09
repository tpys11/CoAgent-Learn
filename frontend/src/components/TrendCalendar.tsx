import { useEffect, useMemo, useRef, useState } from 'react'

/** 日历热度图：真实月历，格子颜色深浅表示当天对话量（0/1-2/3-5/6-9/10+ 五档）——与记忆界面一致 */
function CalendarHeatmap({ data }: { data: Record<string, number> }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const first = new Date(ym.y, ym.m, 1)
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // 周一开头
  const cells: Array<{ date: string; day: number } | null> = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d })
  }
  const level = (c: number) => c <= 0 ? '#f2f2f2' : c <= 2 ? `color-mix(in srgb, var(--accent) 22%, white)` : c <= 5 ? `color-mix(in srgb, var(--accent) 45%, white)` : c <= 9 ? `color-mix(in srgb, var(--accent) 70%, white)` : `color-mix(in srgb, var(--accent) 95%, white)`
  const shift = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1)
    setYm({ y: d.getFullYear(), m: d.getMonth() })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn text-sm leading-none">‹</button>
        <span className="text-xs font-semibold">{ym.y}年{ym.m + 1}月</span>
        <button onClick={() => shift(1)} className="w-6 h-6 flex items-center justify-center rounded-lg icon-btn text-sm leading-none">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['一', '二', '三', '四', '五', '六', '日'].map(w => (
          <span key={w} className="text-[9px] text-dim text-center">{w}</span>
        ))}
        {cells.map((c, i) => c ? (
          <button key={i} title={`${c.date}${data[c.date] ? ` · ${data[c.date]} 次对话` : ' · 无记录'}`}
            className={`h-8 rounded-lg text-[10px] flex items-center justify-center transition-colors ${data[c.date] ? 'font-medium text-white' : 'text-dim'} ${c.date === today ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
            style={data[c.date] ? { background: level(data[c.date] || 0) } : undefined}>
            {c.day}
          </button>
        ) : <span key={i} />)}
      </div>
    </div>
  )
}

/** 时间折线图：纵轴 = 当日内容量（对话产出条数），支持拖拽平移/滚轮缩放/范围滑块——与记忆界面一致 */
function TimeLineChart({ days, height = 90 }: { days: Record<string, any[]>; height?: number }) {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const allDates = useMemo(() => {
    const ks = Object.keys(days || {})
    const min = ks.length ? ks.slice().sort()[0] : key(new Date())
    const out: string[] = []
    const cur = new Date(min + 'T00:00:00')
    const today = new Date()
    while (key(cur) <= key(today)) {
      out.push(key(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [days])
  const total = allDates.length
  const [center, setCenter] = useState(total - 1)
  const [span, setSpan] = useState(14)
  useEffect(() => { setCenter(total - 1); setSpan(Math.min(14, total)) }, [total])
  const clampCenter = (c: number) => Math.min(Math.max(c, Math.floor(span / 2)), Math.max(Math.floor(span / 2), total - 1 - Math.ceil(span / 2)))
  const start = Math.min(Math.max(Math.round(center - span / 2), 0), Math.max(0, total - span))
  const end = Math.min(start + span, total)
  const seg = allDates.slice(start, end)
  const vals = seg.map(d => ((days || {})[d] || []).length)
  const max = Math.max(1, ...vals)
  const W = 100, H = 40
  const pts = vals.map((v, i) => `${(i / Math.max(1, seg.length - 1)) * W},${H - 6 - (v / max) * (H - 14)}`)
  const hasData = vals.some(v => v > 0)
  const dragRef = useRef<{ x: number } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const sliderDrag = useRef<{ x: number; c0: number } | null>(null)
  const onTrackDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    const c = clampCenter(ratio * total)
    setCenter(c)
    sliderDrag.current = { x: e.clientX, c0: c }
  }
  const onTrackMove = (e: React.PointerEvent) => {
    if (!sliderDrag.current || !trackRef.current) return
    const w = trackRef.current.clientWidth || 1
    const dy = ((e.clientX - sliderDrag.current.x) / w) * total
    setCenter(clampCenter(sliderDrag.current.c0 + dy))
  }
  const onTrackUp = () => { sliderDrag.current = null }
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); dragRef.current = { x: e.clientX } }
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    dragRef.current.x = e.clientX
    const w = (e.currentTarget as Element).clientWidth || 1
    setCenter(c => clampCenter(c - Math.round((dx / w) * span)))
  }
  const onUp = () => { dragRef.current = null }
  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(Math.max(span + (e.deltaY > 0 ? 4 : -4), 7), total)
    setSpan(next)
    setCenter(c => clampCenter(c))
  }
  return (
    <div className="flex flex-col gap-1.5 flex-1 select-none" style={{ touchAction: 'none' }}>
      <div className="flex items-center justify-between text-[10px] text-dim">
        <span className="font-semibold uppercase tracking-wider">内容量趋势</span>
        {hasData && <span>今日 {vals[vals.length - 1]} 条 · 峰值 {max} 条 · 显示范围 {span} 天</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-grab active:cursor-grabbing" style={{ height }}
        preserveAspectRatio="none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onWheel={onWheel}>
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1="0" y1={H - (H - 14) * g - 6} x2={W} y2={H - (H - 14) * g - 6} stroke="#ececec" strokeWidth="0.3" strokeDasharray="1.5 2" />
        ))}
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="#d4d4d4" strokeWidth="0.4" />
        {hasData ? (
          <>
            <polygon points={`${pts.join(' ')} ${W},${H - 6} 0,${H - 6}`} fill="var(--accent)" opacity="0.08" />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.split(',')[0]} cy={p.split(',')[1]} r="1.3" fill={vals[i] > 0 ? 'var(--accent)' : '#d4d4d4'} />
            ))}
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="4.5" fill="#b5b5b5">暂无对话数据</text>
        )}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-dim">
        <span>{allDates[0]?.slice(5)}</span>
        <span>今天</span>
      </div>
      <div ref={trackRef} className="relative h-5 flex items-center select-none" style={{ touchAction: 'none' }}
        onPointerDown={onTrackDown} onPointerMove={onTrackMove} onPointerUp={onTrackUp} onPointerLeave={onTrackUp}>
        <div className="absolute left-0 right-0 h-[3px] rounded-full bg-[#e5e5e5]" />
        <div className="absolute h-3.5 rounded-md cursor-grab active:cursor-grabbing shadow transition-[width] duration-150"
          style={{ background: 'var(--accent)', left: (start / total) * 100 + '%', width: Math.max(4, (span / total) * 100) + '%' }} />
      </div>
      <div className="flex items-center gap-2 text-[9px] text-dim">
        <span className="flex-shrink-0 w-14 whitespace-nowrap">显示范围</span>
        <input type="range" min={7} max={Math.max(7, total)} value={total + 7 - span}
          onChange={e => setSpan(Math.max(7, total + 7 - Number(e.target.value)))}
          className="flex-1 accent-[var(--accent)]" aria-label="显示范围" />
        <span className="w-9 text-right flex-shrink-0">{span} 天</span>
      </div>
    </div>
  )
}

/** 主页右栏：内容量趋势 + 日历，竖向平行展开（与记忆界面逻辑和形式一致） */
export default function TrendCalendar({ days }: { days: Record<string, any[]> }) {
  const data: Record<string, number> = {}
  for (const [d, items] of Object.entries(days || {})) data[d] = items.length
  const count = Object.values(data).reduce((s, n) => s + n, 0)
  const latest = Object.keys(data).sort().pop() || ''
  return (
    <div className="flex flex-col gap-5">
      <div className="border hairline rounded-2xl p-4 bg-[var(--bg-panel)] flex flex-col">
        <TimeLineChart days={days} />
      </div>
      <div className="border hairline rounded-2xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
        <CalendarHeatmap data={data} />
        <div className="flex items-center gap-4 text-[10px] text-dim">
          <span>累计 <b className="text-[var(--text)]">{count}</b> 次对话</span>
          {latest && <span>最近学习 <b className="text-[var(--text)]">{latest}</b></span>}
        </div>
      </div>
    </div>
  )
}
