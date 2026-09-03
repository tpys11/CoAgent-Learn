import { useState } from 'react'
import { X, Flame } from 'lucide-react'

interface ProjFocus { project_id: string; project_name: string; seconds: number }
interface FocusDay { date: string; projects: ProjFocus[] }
interface LogItem { project_name?: string; dialogue_name?: string; topic?: string; artifacts?: Array<{ type: string; title: string }> }
interface LogDay { date: string; items: LogItem[] }

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDur = (s: number) => {
  if (s >= 3600) { const h = s / 3600; return (Math.round(h * 10) / 10) + ' 小时' }
  if (s >= 60) return Math.round(s / 60) + ' 分钟'
  return Math.max(1, Math.round(s / 5) * 5) + ' 秒'
}
/** 色阶：0 → 无色；时长越大颜色越深（蓝阶梯） */
const levelAlpha = (s: number) => {
  const m = s / 60
  if (m <= 0) return 0
  if (m < 5) return 0.22
  if (m < 15) return 0.4
  if (m < 30) return 0.58
  if (m < 60) return 0.75
  return 1
}

/** 主页学习日历：30 天日期格，颜色深浅=当日专注时长；点格弹窗看当天明细（项目时长+对话主题） */
export default function LearningCalendar({ focusDays, logDays }: { focusDays: FocusDay[]; logDays: LogDay[] }) {
  const [sel, setSel] = useState<FocusDay | null>(null)
  // 30 天序列（今天往前 29 天）
  const days = (() => {
    const map: Record<string, number> = {}
    for (const d of focusDays || []) { map[d.date] = (d.projects || []).reduce((s, x) => s + x.seconds, 0) }
    const arr: Array<{ date: string; seconds: number; isToday: boolean; dow: number }> = []
    const cur = new Date()
    const todayKey = key(cur)
    cur.setDate(cur.getDate() - 29)
    for (let i = 0; i < 30; i++) {
      const k = key(cur)
      arr.push({ date: k, seconds: map[k] || 0, isToday: k === todayKey, dow: cur.getDay() })
      cur.setDate(cur.getDate() + 1)
    }
    return arr
  })()
  const totalSec = days.reduce((s, x) => s + x.seconds, 0)
  const activeDays = days.filter(x => x.seconds > 0).length
  const logOf = (date: string) => (logDays || []).find(x => x.date === date)
  // 月份标签：30 天跨月显示 "8-9月"，同月显示 "2026年9月"
  const monthLabel = (() => {
    const first = days[0]?.date || '', last = days[days.length - 1]?.date || ''
    if (first.slice(0, 7) === last.slice(0, 7)) return last.slice(0, 7).replace('-', '年') + '月'
    return String(parseInt(first.slice(5, 7), 10)) + '-' + String(parseInt(last.slice(5, 7), 10)) + '月'
  })()

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-[10px] text-dim">
        <span className="font-semibold uppercase tracking-wider">学习日历</span>
        <span className="font-semibold">{monthLabel}</span>
      </div>
      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-dim mb-0.5">
        {['日', '一', '二', '三', '四', '五', '六'].map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(d => {
          const a = levelAlpha(d.seconds)
          return (
            <button key={d.date} onClick={() => setSel(d.seconds > 0 ? d : null)}
              title={d.date + (d.seconds > 0 ? ' · ' + fmtDur(d.seconds) : ' · 未学习')}
              className={`aspect-square rounded-md flex items-center justify-center text-[9px] font-medium transition-transform hover:scale-110
                ${d.seconds > 0 ? 'text-white cursor-pointer' : 'text-[var(--text-muted)] cursor-default'} ${d.isToday ? 'ring-1.5 ring-[#1a1a1a]' : ''}`}
              style={d.seconds > 0 ? { background: `rgba(59,130,246,${a})` } : { background: 'var(--bg-hover)' }}>
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
              className="w-[420px] max-w-[92vw] max-h-[80vh] overflow-y-auto rounded-2xl bg-white border hairline shadow-2xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2"><Flame size={15} /> {sel.date} · 学习 {fmtDur(total)}</h3>
                <button onClick={() => setSel(null)} className="p-1 rounded-lg text-dim hover:bg-[var(--bg-hover)]"><X size={15} /></button>
              </div>
              {/* 项目级时长 */}
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
              {/* 当天对话/主题 */}
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
              {(!log || (log.items || []).length === 0) && (sel.projects || []).length === 0 && (
                <p className="text-xs text-dim">当天没有学习内容</p>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
