import { useEffect, useState } from 'react'
import { Plus, X, FolderOpen, Pencil, HelpCircle } from 'lucide-react'
import GuideModal from './GuideModal'
import TrendCalendar from './TrendCalendar'
import { api } from '../api'

/** 系统预设领域 → 预存图片；非预设领域/未设置领域使用默认学习封面 */
const DOMAIN_IMAGES: Record<string, string> = {
  'Agent 应用与开发': '/domain-images/agent.jpg',
  'Python 编程': '/domain-images/python.jpg',
}
const DEFAULT_COURSE_IMG = '/domain-images/default-course.jpg'

interface HomeProject {
  id: string
  name: string
  domain?: string
  simple?: boolean
  created_at?: string
}

/** 主页：按课程展开的大卡片（上 70% 图片/名称/进度，下 30% 三方面描述），点击进入该课程对话 */
export default function HomeView({ projects, onEnter, onCreate, onDelete, onRename }: {
  projects: HomeProject[]
  onEnter: (id: string) => void
  onCreate: (name: string) => void
  onDelete: (id: string) => void
  onRename?: (id: string, name: string) => void
}) {
  const [stats, setStats] = useState<Record<string, number>>({})
  const [mems, setMems] = useState<Record<string, Record<string, any>>>({})
  const [kbCount, setKbCount] = useState<Record<string, number>>({})
  // 每课程最新对话名（"上次学到哪"）
  const [lastTopics, setLastTopics] = useState<Record<string, string>>({})
  // 主页趋势：专注时长·最近30天（/api/stats?project_id=all 聚合全部项目）
  const [trendDays, setTrendDays] = useState<Array<{ date: string; seconds: number }>>([])
  useEffect(() => {
    api.getStats('all').then(d => {
      setTrendDays(Array.isArray(d.daily_focus) ? d.daily_focus : [])
    }).catch(() => {})
  }, [])
  useEffect(() => {
    const m: Record<string, number> = {}
    const mm: Record<string, Record<string, any>> = {}
    const kc: Record<string, number> = {}
    const lt: Record<string, string> = {}
    Promise.all(projects.map(p =>
      Promise.all([
        api.getStats(p.id)
          .then(d => { m[p.id] = d.dialogue_count ?? d.count ?? 0 }).catch(() => { m[p.id] = 0 }),
        api.getProjectMemory(p.id)
          .then(d => { mm[p.id] = d.memory || {} }).catch(() => { mm[p.id] = {} }),
        api.getKb(p.id)
          .then(d => { kc[p.id] = Array.isArray(d) ? d.length : 0 }).catch(() => { kc[p.id] = 0 }),
        api.listProjectDialogues(p.id)
          .then(d => {
            const arr = (d.dialogues || []).slice()
            arr.sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
            const last = arr[arr.length - 1]
            lt[p.id] = (last && last.name && last.name !== '对话') ? last.name : ''
          }).catch(() => { lt[p.id] = '' }),
      ])
    )).then(() => { setStats(m); setMems(mm); setKbCount(kc); setLastTopics(lt) })
  }, [projects])

  const newProject = () => {
    // 点击新建课程：直接创建并进入对话界面（命名等由对话内静态引导完成）
    onCreate('新课程')
  }
  const strOf = (v: any) => Array.isArray(v) ? v.join('、') : v ? String(v) : ''
  const short = (s: string, n = 34) => s.length > n ? s.slice(0, n) + '…' : s

  // ---------- 快速引导：系统提示建议（课程 / 资源） ----------
  const totalCount = Object.values(stats).reduce((s, n) => s + n, 0)
  const totalDocs = Object.values(kbCount).reduce((s, n) => s + n, 0)
  const latestDate = trendDays.filter(d => (d.seconds || 0) > 0).map(d => d.date).sort().pop() || ''
  const buildTips = () => {
    const tips: Array<{ title: string; text: string }> = []
    if (projects.length === 0) {
      tips.push({ title: '课程', text: '还没有课程。点击下方「新建课程」卡片创建第一个课程，开始你的学习之旅。' })
    } else {
      const stale = projects.filter(p => (stats[p.id] ?? 0) === 0)
      if (stale.length > 0) {
        tips.push({ title: '课程', text: `${stale.length} 个课程还没有对话记录（如「${stale[0].name}」），建议尽快安排时间开始学习；若时间紧迫，优先推进最近创建的课程。` })
      } else {
        tips.push({ title: '课程', text: `学习进度正常，最近学习${latestDate ? '于 ' + latestDate : '记录暂无'}。可参考各课程卡片的「进度 / 上次 / 后续」决定下一步。` })
      }
    }
    if (totalDocs === 0) {
      tips.push({ title: '资源', text: '知识库还没有文档。在课程侧栏「资源」中上传文件或从系统预设资源加入，回答将更有依据、更少幻觉。' })
    } else {
      tips.push({ title: '资源', text: `知识库已收录 ${totalDocs} 份文档。建议定期补充或更新资料（如教程更新、新文档发布），让回答持续贴合最新内容。` })
    }
    return tips
  }
  const tips = buildTips()

  // 行内改名：正在编辑名称的课程 id
  const [renamingId, setRenamingId] = useState<string | null>(null)
  // 删除确认弹窗：待删除的课程 id
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // 快速引导弹窗开关
  const [guideOpen, setGuideOpen] = useState(false)

  // 顶部问候：按时间打招呼 + 最近学习时间与连续学习天数
  const hour = new Date().getHours()
  const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  // 连续学习天数：从今日（或昨日）向前连续有学习记录的日期数
  const streakDays = (() => {
    const daySet = new Set(Object.keys(trendDays))
    const key = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const d = new Date()
    if (!daySet.has(key(d))) d.setDate(d.getDate() - 1)
    let streak = 0
    while (daySet.has(key(d))) { streak++; d.setDate(d.getDate() - 1) }
    return streak
  })()
  const statusTxt = `最近学习${latestDate ? ' ' + latestDate : ' 暂无记录'} · 连续学习 ${streakDays} 天`

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="px-28 py-8 flex flex-col gap-8">
          {/* 左上角：快速引导按钮（点击弹出项目使用教程） */}
          <div className="flex justify-start">
            <button onClick={() => setGuideOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-semibold shadow-soft hover:bg-[#333333] transition-colors">
              <HelpCircle size={15} /> 快速引导
            </button>
          </div>
          {/* 专注时长趋势（快速引导下方） */}
          <div className="w-[560px] max-w-full border hairline rounded-2xl p-4 bg-[var(--bg-panel)] flex flex-col">
            <TrendCalendar days={trendDays} />
          </div>
          {/* 课程区块 */}
          <div className="flex flex-col gap-6">
            <h2 className="text-xl font-bold">课程</h2>
          {projects.length === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <NewCourseCard onClick={newProject} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {projects.map(p => {
                const img = (p.domain && DOMAIN_IMAGES[p.domain]) || DEFAULT_COURSE_IMG
                const count = stats[p.id] ?? 0
                const pct = Math.min(95, 8 + count * 4)
                const mem = mems[p.id] || {}
                // 进度一段话：学了多少 / 上次学到哪 / 接下来建议学什么
                const unsolved = strOf((mem['薄弱点'] || [])[0] || (mem['难点'] || [])[0]) || ''
                const toLearnArr = (mem['难点'] || []).length ? (mem['难点'] || []).slice(0, 2) : (mem['知识点'] || []).slice(0, 2)
                const toLearnTxt = strOf(toLearnArr) || ''
                const lastTopic = lastTopics[p.id] || ''
                const progressSentence = count === 0
                  ? '尚未开始，建议尽快开启第一次对话，明确学习目标。'
                  : ['已学习 ' + count + ' 次对话', lastTopic ? '上次学到「' + short(lastTopic, 12) + '」' : '', toLearnTxt ? '接下来建议先学「' + short(toLearnTxt, 16) + '」' : (unsolved ? '接下来建议先补「' + short(unsolved, 12) + '」' : '')].filter(Boolean).join('，') + '。'
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
                      {/* 右上角：灰色叉删除（持久显示、显眼，点击弹确认窗） */}
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(p.id) }}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-gray-400/90 text-white shadow-md hover:bg-red-500 hover:scale-110 transition-all" title="删除课程">
                        <X size={15} strokeWidth={2.5} />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                            <div className="h-full rounded-full bg-white" style={{ width: pct + '%' }} />
                          </div>
                          <span className="text-[10px] text-white/90 flex-shrink-0">{pct}%</span>
                        </div>
                      </div>
                    </div>
                    {/* 下 30%：顶部课程名（重命名按钮在名称右边一点），下面进度一段话 */}
                    <div className="h-[30%] p-3.5 bg-[var(--bg-panel)] flex flex-col justify-center gap-1.5">
                      <div className="flex items-center gap-1 min-w-0">
                        {renamingId === p.id ? (
                          <input autoFocus defaultValue={p.name}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const v = (e.target as HTMLInputElement).value.trim()
                                if (v && v !== p.name) onRename?.(p.id, v)
                                setRenamingId(null)
                              } else if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={(e) => {
                              const v = e.target.value.trim()
                              if (v && v !== p.name) onRename?.(p.id, v)
                              setRenamingId(null)
                            }}
                            className="min-w-0 flex-1 text-sm font-bold rounded-md px-1.5 py-0.5 outline-none border hairline bg-[var(--bg-input)]" />
                        ) : (
                          <p className="text-sm font-bold truncate min-w-0">{p.name}</p>
                        )}
                        {onRename && (
                          <button onClick={(e) => { e.stopPropagation(); setRenamingId(renamingId === p.id ? null : p.id) }}
                            className="p-1 rounded-md text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors flex-shrink-0" title="改名">
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{progressSentence}</p>
                    </div>
                  </div>
                )
              })}
              {/* 新建课程卡片（与课程卡片同尺寸） */}
              <NewCourseCard onClick={newProject} />
            </div>
          )}
          </div>
          {/* 删除课程确认弹窗 */}
          {deleteId && (() => {
            const dp = projects.find(x => x.id === deleteId)
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setDeleteId(null)}>
                <div className="w-[360px] card-lift rounded-2xl p-5 flex flex-col gap-3.5" onClick={e => e.stopPropagation()}>
                  <p className="text-sm font-bold">删除课程「{dp?.name || ''}」？</p>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    删除后，对应资源、入口、对话历史会被删除；<br />已写入抽象记忆的部分不会删除。
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteId(null)}
                      className="flex-1 py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)] transition-colors">取消</button>
                    <button onClick={() => { setDeleteId(null); onDelete(deleteId) }}
                      className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 transition-colors">确认删除</button>
                  </div>
                </div>
              </div>
            )
          })()}
          {/* 快速引导弹窗（静态项目使用教程） */}
          {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
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
