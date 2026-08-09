import { useEffect, useState } from 'react'
import { Home, Plus, X, FolderOpen, Clock, Library, GraduationCap } from 'lucide-react'
import TrendCalendar from './TrendCalendar'

/** 系统预设领域 → 预存图片（非系统自带领域无图，显示首字占位） */
const DOMAIN_IMAGES: Record<string, string> = {
  'Agent 应用与开发': '/domain-images/agent.svg',
  'Python 编程': '/domain-images/python.svg',
}

interface HomeProject {
  id: string
  name: string
  domain?: string
  simple?: boolean
  created_at?: string
}

/** 主页：按课程展开的大卡片（上 70% 图片/名称/进度，下 30% 三方面描述），点击进入该课程对话 */
export default function HomeView({ projects, onEnter, onCreate, onDelete, onNavigate }: {
  projects: HomeProject[]
  onEnter: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onNavigate?: (v: string) => void
}) {
  const [stats, setStats] = useState<Record<string, number>>({})
  const [mems, setMems] = useState<Record<string, Record<string, any>>>({})
  // 横栏：内容量趋势 + 日历（全局学习记录，与记忆界面一致）
  const [trendDays, setTrendDays] = useState<Record<string, any[]>>({})
  useEffect(() => {
    fetch('/api/learning-log', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const days: Record<string, any[]> = {}
      for (const dd of (d.days || [])) days[dd.date] = dd.items || []
      setTrendDays(days)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const m: Record<string, number> = {}
    const mm: Record<string, Record<string, any>> = {}
    Promise.all(projects.map(p =>
      Promise.all([
        fetch('/api/stats?project_id=' + encodeURIComponent(p.id), { cache: 'no-store' })
          .then(r => r.json()).then(d => { m[p.id] = d.dialogue_count ?? d.count ?? 0 }).catch(() => { m[p.id] = 0 }),
        fetch('/api/project-memory/' + encodeURIComponent(p.id), { cache: 'no-store' })
          .then(r => r.json()).then(d => { mm[p.id] = d.memory || {} }).catch(() => { mm[p.id] = {} }),
      ])
    )).then(() => { setStats(m); setMems(mm) })
  }, [projects])

  const newProject = () => {
    const name = window.prompt('课程名称：')
    if (name && name.trim()) onCreate(name.trim())
  }
  const strOf = (v: any) => Array.isArray(v) ? v.join('、') : v ? String(v) : ''
  const short = (s: string, n = 34) => s.length > n ? s.slice(0, n) + '…' : s

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl px-10 py-10 flex gap-10">
          {/* 左：主内容 */}
          <div className="flex-1 min-w-0 flex flex-col gap-8">
          {/* 左上角：我的主页 */}
          <h1 className="text-2xl font-bold flex items-center gap-2"><Home size={22} /> 我的主页</h1>
          {/* 快速引导 */}
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">快速引导</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Plus, label: '新建课程', fn: newProject },
                { icon: Library, label: '资源中心', fn: () => onNavigate?.('resources') },
                { icon: GraduationCap, label: '使用引导', fn: () => onNavigate?.('tutorial') },
                { icon: FolderOpen, label: '本地文档', fn: () => onNavigate?.('obsidian') },
              ].map(({ icon: Icon, label, fn }) => (
                <button key={label} onClick={fn}
                  className="card-surface rounded-2xl p-5 flex flex-col items-center gap-2.5 hover:shadow-soft hover:border-[var(--accent)] transition-all">
                  <Icon size={20} className="text-dim" />
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* 课程区块 */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">课程</h2>
          {projects.length === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <NewCourseCard onClick={newProject} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {projects.map(p => {
                const img = p.domain ? DOMAIN_IMAGES[p.domain] : undefined
                const count = stats[p.id] ?? 0
                const pct = Math.min(95, 8 + count * 4)
                const mem = mems[p.id] || {}
                const progressTxt = strOf(mem['当前水平']) || (count ? `已学习 ${count} 次对话` : '尚未开始')
                const unsolved = strOf((mem['薄弱点'] || [])[0] || (mem['难点'] || [])[0]) || '—'
                const toLearn = strOf((mem['难点'] || []).slice(0, 2).join('、') ? (mem['难点'] || []).slice(0, 2) : (mem['知识点'] || []).slice(0, 2)) || '—'
                return (
                  <div key={p.id} onClick={() => onEnter(p.id)}
                    className="group relative card-surface rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-[var(--border-strong)] flex flex-col h-[330px]">
                    {/* 上 70%：图片 + 名称 + 进度 */}
                    <div className="h-[70%] relative overflow-hidden">
                      {img ? (
                        <img src={img} alt={p.domain} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, var(--border-strong), var(--bg-hover))' }}>
                          {p.name.slice(0, 1)}
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-bold text-white truncate">{p.name}</p>
                          <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`删除课程「${p.name}」？`)) onDelete(p.id) }}
                            className="p-1 rounded-lg text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all flex-shrink-0" title="删除课程">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                            <div className="h-full rounded-full bg-white" style={{ width: pct + '%' }} />
                          </div>
                          <span className="text-[10px] text-white/90 flex-shrink-0">{pct}%</span>
                        </div>
                      </div>
                    </div>
                    {/* 下 30%：进度 / 上次 / 后续 三横平行（每行标签+内容） */}
                    <div className="h-[30%] p-3.5 bg-[var(--bg-panel)] flex flex-col justify-center gap-1.5">
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">进度</span>：{short(progressTxt)}</p>
                        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">上次</span>：{short(unsolved)}</p>
                        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">后续</span>：{short(toLearn)}</p>
                      </div>
                      <p className="text-[9px] text-dim flex items-center gap-1">
                        <Clock size={9} /> {p.created_at ? String(p.created_at).slice(0, 10) : '—'}{p.domain ? ` · ${p.domain}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
              {/* 新建课程卡片（与课程卡片同尺寸） */}
              <NewCourseCard onClick={newProject} />
            </div>
          )}
          </div>
          </div>
          {/* 右：内容量趋势 + 日历（竖向平行展开） */}
          <div className="w-[360px] flex-shrink-0">
            <TrendCalendar days={trendDays} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** 新建课程卡片：虚线边框 + 加号 + 文字，与课程卡片同尺寸 */
function NewCourseCard({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={onClick}
      className="group card-surface rounded-2xl border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-soft transition-all cursor-pointer flex flex-col items-center justify-center gap-3.5 h-[330px]">
      <span className="w-14 h-14 rounded-2xl bg-[var(--bg-hover)] group-hover:bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-hover))] group-hover:scale-105 transition-all flex items-center justify-center text-dim group-hover:text-[var(--accent)]">
        <Plus size={26} />
      </span>
      <span className="text-sm font-semibold text-dim group-hover:text-[var(--text)] transition-colors">新建课程</span>
    </div>
  )
}
