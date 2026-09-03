import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { api } from '../api'

interface ProjFocus { project_id: string; project_name: string; seconds: number }
interface FocusDay { date: string; projects: ProjFocus[] }
interface LogItem { project_name?: string; dialogue_name?: string; topic?: string; artifacts?: Array<{ type: string; title: string }> }
interface LogDay { date: string; items: LogItem[] }

const fmtDur = (s: number) => {
  if (s >= 3600) { const h = s / 3600; return (Math.round(h * 10) / 10) + ' 小时' }
  if (s >= 60) return Math.round(s / 60) + ' 分钟'
  return Math.max(1, Math.round(s / 5) * 5) + ' 秒'
}
/** 分段色阶：时长越大越深 */
const levelAlpha = (s: number) => {
  const m = s / 60
  if (m <= 0) return 0
  if (m < 5) return 0.25
  if (m < 15) return 0.42
  if (m < 30) return 0.6
  if (m < 60) return 0.78
  return 1
}
const pad = (n: number) => String(n).padStart(2, '0')

/** 主页学习日历（月历）：显示某月 + 左右翻月；当日黑框；点有学习的格子弹窗当天明细 */
export default function LearningCalendar({ logDays }: { logDays: LogDay[] }) {
  const now = new Date()
  const [ym, setYm] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`) // 'YYYY-MM'
  const [focusMap, setFocusMap] = useState<Record<string, FocusDay[]>>({}) // ym → 当月数据
  const [sel, setSel] = useState<FocusDay | null>(null)

  // 切月时拉当月数据（缓存）
  useEffect(() => {
    if (focusMap[ym]) return
    api.getFocusDays({ month: ym }).then(d => {
      const days = Array.isArray(d.days) ? d.days : []
      setFocusMap(prev => ({ ...prev, [ym]: days }))
      // 选中/弹窗数据若属于旧月，清掉
      setSel(prev => prev && prev.date.slice(0, 7) === ym ? prev : null)
    }).catch(() => {})
  }, [ym, focusMap])

  const curFocus = focusMap[ym] || []
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const [Y, M] = ym.split('-').map(Number)
  const monthLabel = `${Y}年${M}月`
  const totalSec = (curFocus || []).reduce((s, d) => s + d.projects.reduce((x, p) => x + p.seconds, 0), 0)
  const activeDays = curFocus.filter(d => d.projects.reduce((x, p) => x + p.seconds, 0) > 0).length

  // 当月日期格（含 1 号前补位）
  const firstDow = new Date(Y, M - 1, 1).getDay()
  const daysInMonth = new Date(Y, M, 0).getDate()
  const cells: Array<{ date: string; seconds: number; inMonth: boolean }> = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: '', seconds: 0, inMonth: false })
  const secMap: Record<string, number> = {}
  for (const d of curFocus || []) secMap[d.date] = d.projects.reduce((x, p) => x + p.seconds, 0)
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${ym}-${pad(day)}`
    cells.push({ date, seconds: secMap[date] || 0, inMonth: true })
  }

  const move = (delta: number) => {
    const d = new Date(Y, M - 1 + delta, 1)
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const logOf = (date: string) => (logDays || []).find(x => x.date === date)

  return (
    <div className="flex flex-col gap-2">
      {/* 头部：◀ 月份 ▶ */}
      <div className="flex items-center justify-between text-[11px]">
        <button onClick={() => move(-1)} className="p-0.5 rounded-md text-dim hover:bg-[var(--bg-hover)]" title="上个月"><ChevronLeft size={14} /></button>
        <span className="font-bold">{monthLabel}</span>
        <button onClick={() => move(1)} className="p-0.5 rounded-md text-dim hover:bg-[var(--bg-hover)]" title="下个月"><ChevronRight size={14} /></button>
      </div>
      {/* 月份统计小字 */}
      <div className="text-[9px] text-dim text-center -mt-0.5">{activeDays} 天学习 · 累计 {fmtDur(totalSec)}</div>
      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-dim">
        {['日', '一', '二', '三', '四', '五', '六'].map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d.inMonth) return <span key={i} />
          const a = levelAlpha(d.seconds)
          const isToday = d.date === todayKey
          return (
            <button key={d.date} onClick={() => d.seconds > 0 && setSel(curFocus.find(x => x.date === d.date) || null)}
              title={d.date + (d.seconds > 0 ? ' · ' + fmtDur(d.seconds) : ' · 未学习')}
              className={`aspect-square rounded-md flex items-center justify-center text-[9px] font-medium transition-transform hover:scale-110
                ${isToday ? 'ring-[1.5px] ring-[#1a1a1a] ring-offset-0' : ''}
                ${d.seconds > 0 ? 'text-white cursor-pointer' : 'text-[var(--text-muted)] cursor-default'}`}
              style={d.seconds > 0 ? { background: `rgba(59,130,246,${a})` } : { background: isToday ? '#e5e7eb' : 'transparent' }}>
              {parseInt(d.date.slice(8), 10)}
            </button>
          )
        })}
      </div>

      {/* 当天明细弹窗 */}
      {sel && (() => {
        const log = logOf(sel.date)
        const total = (sel.projects || []).reduce((s, x) => s + x.seconds, 0)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setSel(null)}>
            <div onClick={e => e.stopPropagation()}
              className="w-[400px] max-w-[92vw] max-h-[80vh] overflow-y-auto rounded-2xl bg-white border hairline shadow-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2"><Flame size={15} /> {sel.date} · 学习 {fmtDur(total)}</h3>
                <button onClick={() => setSel(null)} className="p-1 rounded-lg text-dim hover:bg-[var(--bg-hover)]"><X size={15} /></button>
              </div>
              {(sel.projects || []).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold text-dim uppercase tracking-wider">涉及课程</p>
                  {(sel.projects || []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b hairline last:border-0">
                      <span className="truncate flex-1">{p.project_name}</span>
                      <span className="text-dim flex-shrink-0 ml-2">{fmtDur(p.seconds)}</span>
                    </div>
                  ))}
                </div>
              )}
              {log && (log.items || []).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold text-dim uppercase tracking-wider">当天学习内容</p>
                  {(log.items || []).map((it, i) => (
                    <div key={i} className="text-[11px] flex flex-col gap-0.5 border-b hairline last:border-0 pb-1.5">
                      <span className="font-medium truncate">{it.dialogue_name || '对话'}（{it.project_name || ''}）</span>
                      {it.topic && <span className="text-dim truncate">主题：{it.topic}</span>}
                      {(it.artifacts || []).length > 0 &&
                        <span className="text-[10px] text-dim">{it.artifacts!.map((a: any) => a.type).join('、')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
