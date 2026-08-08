import { useState, useEffect, useRef } from 'react'
import { Brain, User, FolderTree, Check, Loader2, PenLine } from 'lucide-react'

/** 个人全局性记忆：基础信息字段（固定，纵向表单） */
const BASIC_FIELDS = [
  { key: '身份', label: '身份', placeholder: '如：大学生 / 工程师' },
  { key: '学习目标', label: '学习目标', placeholder: '如：掌握多智能体开发' },
  { key: '擅长领域', label: '擅长领域', placeholder: '如：Python、AI 基础' },
  { key: '学习方式', label: '学习方式', placeholder: '如：动手实践、官方文档' },
  { key: '兴趣方向', label: '兴趣方向', placeholder: '如：Agent、RAG' },
]

/** 项目记忆：按维度展开（概述 → 实现进度 → 时间） */
const PROJECT_DIMS: Array<{ title: string; hint: string; keys: string[]; arrayKeys: string[] }> = [
  { title: '概述', hint: '抽象项目目的与整体情况', keys: ['抽象目的', '抽象项目情况'], arrayKeys: ['偏好', '知识点', '难点', '薄弱点', '兴趣'] },
  { title: '实现进度', hint: '起点 → 当前水平 → 目标', keys: ['起点', '当前水平', '目标'], arrayKeys: [] },
]
/** 记忆系统：两级（个人全局性记忆 / 项目记忆）完整界面 */

/** 迷你 Markdown 渲染：段落 / 有序/无序列表 / **加粗**（行级，够用即可） */
const renderInline = (s: string) => {
  const parts = s.split(/\*\*([^*]+)\*\*/g)
  return parts.map((p, i) => i % 2 === 1 ? <b key={i}>{p}</b> : p)
}
function MiniMD({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let listBuf: { ordered: boolean; items: string[] } | null = null
  const flush = (key: string) => {
    if (listBuf) {
      nodes.push(listBuf.ordered
        ? <ol key={key} className="list-decimal pl-4 flex flex-col gap-0.5">{listBuf.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
        : <ul key={key} className="list-disc pl-4 flex flex-col gap-0.5">{listBuf.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>)
      listBuf = null
    }
  }
  lines.forEach((ln, i) => {
    const ul = ln.match(/^[-*]\s+(.+)/)
    const ol = ln.match(/^\d+[.、]\s*(.+)/)
    if (ul || ol) {
      if (!listBuf || listBuf.ordered !== !!ol) { flush('l' + i); listBuf = { ordered: !!ol, items: [] } }
      listBuf.items.push((ul || ol)![1])
    } else if (ln.trim()) {
      flush('l' + i)
      nodes.push(<p key={'p' + i} className="leading-relaxed">{renderInline(ln)}</p>)
    } else flush('l' + i)
  })
  flush('end')
  return <div className="flex flex-col gap-1.5">{nodes}</div>
}

/** 日历热度图：真实月历，格子颜色深浅表示当天对话量（0/1-2/3-5/6-9/10+ 五档） */
function CalendarHeatmap({ data, onPick }: { data: Record<string, number>; onPick?: (date: string) => void }) {
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
  const level = (c: number) => c <= 0 ? 'bg-[#ececec]' : c <= 2 ? 'bg-emerald-200' : c <= 5 ? 'bg-emerald-400' : c <= 9 ? 'bg-emerald-600' : 'bg-emerald-800'
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
          <button key={i} onClick={() => onPick?.(c.date)}
            title={`${c.date}${data[c.date] ? ` · ${data[c.date]} 次对话` : ' · 无记录'}`}
            className={`h-7 rounded-md text-[10px] flex items-center justify-center transition-colors ${level(data[c.date] || 0)} ${c.date === today ? 'ring-2 ring-[#1a1a1a] ring-offset-1' : ''} ${data[c.date] ? 'text-white font-medium' : 'text-dim'}`}>
            {c.day}
          </button>
        ) : <span key={i} />)}
      </div>
      <div className="flex items-center justify-end gap-1 text-[9px] text-dim">
        <span>少</span>
        <span className="w-3.5 h-3.5 rounded bg-[#ececec]" />
        <span className="w-3.5 h-3.5 rounded bg-emerald-200" />
        <span className="w-3.5 h-3.5 rounded bg-emerald-400" />
        <span className="w-3.5 h-3.5 rounded bg-emerald-600" />
        <span className="w-3.5 h-3.5 rounded bg-emerald-800" />
        <span>多</span>
      </div>
    </div>
  )
}

export default function MemoryView({ projectId, onRequestModify }: { projectId: string | null; onRequestModify?: (label: string, pid?: string) => void }) {
  const [level, setLevel] = useState<'global' | 'project'>('global')
  // 项目列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean; created_at?: string }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆
  const [gFields, setGFields] = useState<Record<string, string>>({})
  const [gExtra, setGExtra] = useState('')
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 项目摘要（只读）
  const [gLoading, setGLoading] = useState(false)

  // 项目记忆（全部项目，默认展开显示）
  const [projData, setProjData] = useState<Record<string, { fields: Record<string, string>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string } }>>({})
  const [projLoading, setProjLoading] = useState(false)
  // 当前查看的项目（点击项目按钮切换）
  const [activeProject, setActiveProject] = useState<string | null>(null)
  // 日历数据：date → 当天对话项列表（全局）
  const [globalDays, setGlobalDays] = useState<Record<string, any[]>>({})
  const [globalStats, setGlobalStats] = useState<{ count: number; latest: string }>({ count: 0, latest: '' })
  const [dayDetail, setDayDetail] = useState<{ date: string; items: any[] } | null>(null)
  // 记忆模块只读详情（修改记忆由 AI 处理：跳转主对话并以 [模块名] 引用）
  const [detailCard, setDetailCard] = useState<{ key: string; label: string; val: string } | null>(null)
  useEffect(() => { setDayDetail(null) }, [level])

  const [saved, setSaved] = useState<'saving' | 'saved' | ''>('')
  const saveTimer = useRef<any>(null)

  const fieldLabel = 'text-[10px] font-semibold text-dim uppercase tracking-wider mb-2 block'

  // 进度估算：按「当前水平」关键词映射，无则按对话量估计
  const pctOf = (fields: Record<string, string>, count: number) => {
    const lv = (fields['当前水平'] || '').toLowerCase()
    if (/beginner|初级|入门/.test(lv)) return 30
    if (/intermediate|中级|进阶/.test(lv)) return 60
    if (/advanced|高级|掌握/.test(lv)) return 85
    return Math.min(80, 15 + count * 3)
  }

  // ---------- 项目列表 ----------
  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const arr = d.projects || d || []
      setProjects(Array.isArray(arr) ? arr : [])
    }).catch(() => {})
  }, [])

  // 切到项目层级时加载全部项目记忆（默认展开显示）
  useEffect(() => { if (level === 'project') setSelectedProject(selectedProject || projectId) }, [level])

  // ---------- 个人全局记忆加载 ----------
  const loadGlobal = () => {
    setGLoading(true)
    fetch('/api/global-profile', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const p = d.profile || {}
        const f: Record<string, string> = {}
        for (const b of BASIC_FIELDS) f[b.key] = p[b.key] ? String(p[b.key]) : ''
        setGFields(f)
        setGExtra(p['补充信息'] ? String(p['补充信息']) : '')
        setGSummary((p['项目摘要'] as Record<string, any>) || {})
      })
      .catch(() => {})
      .finally(() => setGLoading(false))
    // 全局学习统计 + 日历数据（所有项目）
    fetch('/api/learning-log', { cache: 'no-store' })
      .then(r => r.json()).then(dd => {
        const days: any[] = dd.days || []
        const map: Record<string, any[]> = {}
        for (const d of days) map[d.date] = d.items || []
        const count = days.reduce((s: number, x: any) => s + ((x.items || []).length || 0), 0)
        const latest = days.length ? days.map((x: any) => x.date).sort().pop() : ''
        setGlobalDays(map)
        setGlobalStats({ count, latest })
      }).catch(() => {})
  }
  useEffect(() => { loadGlobal() }, [level === 'global'])

  // ---------- 项目记忆加载（全部项目） ----------
  useEffect(() => {
    if (level !== 'project') return
    setProjLoading(true)
    fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const arr = d.projects || d || []
      const plist = (Array.isArray(arr) ? arr : []) as Array<{ id: string; name: string; created_at?: string }>
      setProjects(plist)
      if (plist.length === 0) { setProjLoading(false); return }
      const out: Record<string, { fields: Record<string, string>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string } }> = {}
      let done = 0
      // 加载超时兜底：任何接口挂起也不让页面卡在「加载中…」
      const timer = window.setTimeout(() => {
        setProjData(out)
        setProjLoading(false)
        setActiveProject(prev => prev || (plist[0]?.id || null))
      }, 8000)
      const finish = () => {
        if (++done >= plist.length) { window.clearTimeout(timer); setProjData(out); setProjLoading(false); setActiveProject(prev => prev || (plist[0]?.id || null)) }
      }
      for (const p of plist) {
        const pid = p.id
        Promise.all([
          fetch('/api/project-memory/' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/api/learning-log?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({ days: [] })),
          fetch('/api/memory/progress?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({ items: [], daily: [], pace: '' })),
        ]).then(([m, lg, pg]: [any, any, any]) => {
          const mem = (m as any).memory || {}
          const fields: Record<string, string> = {}
          for (const dim of PROJECT_DIMS) {
            for (const k of dim.keys) if (mem[k]) fields[k] = mem[k]
            for (const k of dim.arrayKeys) if (Array.isArray(mem[k]) && (mem[k] as any[]).length) fields[k] = (mem[k] as any[]).join(', ')
          }
          const daysArr: any[] = lg.days || []
          const days: Record<string, any[]> = {}
          for (const dd of daysArr) days[dd.date] = dd.items || []
          const count = daysArr.reduce((s: number, x: any) => s + ((x.items || []).length || 0), 0)
          const latest = daysArr.length ? daysArr.map((x: any) => x.date).sort().pop() : ''
          const progress = { items: (pg.items || []), daily: (pg.daily || []), pace: (pg.pace || '') }
          out[pid] = { fields, count, latest, days, progress }
          finish()
        })
      }
    }).catch(() => setProjLoading(false))
  }, [level])

  // ---------- 自动保存 ----------
  const scheduleSave = (url: string, data: Record<string, any>) => {
    setSaved('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: data }),
      }).then(() => { setSaved('saved'); setTimeout(() => setSaved(''), 1500) }).catch(() => setSaved(''))
    }, 800)
  }

  const saveGlobal = (fields = gFields, extra = gExtra) => {
    const profile: Record<string, any> = { ...gSummary }
    for (const [k, v] of Object.entries(fields)) if (v.trim()) profile[k] = v.trim()
    if (extra.trim()) profile['补充信息'] = extra.trim()
    scheduleSave('/api/global-profile', profile)
  }
  const updateField = (k: string, v: string) => {
    const next = { ...gFields, [k]: v }
    setGFields(next)
    saveGlobal(next, gExtra)
  }
  const updateExtra = (v: string) => {
    setGExtra(v)
    saveGlobal(gFields, v)
  }

  // 重新分析记忆：携带前端有效 key，后台从现有对话重新提炼（空 projectId = 全部项目）
  const runRebuild = (pid?: string) => {
    let key = ''
    try {
      const prov = localStorage.getItem('coagent-provider') || 'deepseek'
      const keys = JSON.parse(localStorage.getItem('coagent-provider-keys') || '{}')
      key = keys[prov] || localStorage.getItem('coagent-apikey') || ''
    } catch {
      key = localStorage.getItem('coagent-apikey') || ''
    }
    fetch('/api/memory/rebuild', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, project_id: pid || '' }),
    }).then(r => r.json()).then(d => alert(d.message || '记忆分析已启动')).catch(() => alert('记忆分析启动失败'))
  }

  const saveState = (
    <span className={`flex items-center gap-1 text-[10px] flex-shrink-0 ${saved === 'saved' ? 'text-green-600' : 'text-dim'}`}>
      {saved === 'saving' && <><Loader2 size={10} className="animate-spin" /> 保存中</>}
      {saved === 'saved' && <><Check size={10} /> 已保存</>}
    </span>
  )

  return (
    <div className="flex-1 h-full min-w-0 flex panel rounded-3xl overflow-hidden">
      {/* 左侧：两级导航 + 项目列表 */}
      <div className="w-52 bg-[var(--bg-sidebar)] border-r hairline flex flex-col flex-shrink-0">
        <div className="p-3 border-b hairline flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-1.5"><Brain size={15} /> 记忆系统</h2>
          {saveState}
        </div>
        <div className="p-2 flex flex-col gap-1 border-b hairline">
          <button onClick={() => setLevel('global')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
              level === 'global' ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
            }`}>
            <User size={14} /> 个人全局性记忆
          </button>
          <button onClick={() => setLevel('project')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${
              level === 'project' ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'
            }`}>
            <FolderTree size={14} /> 项目记忆
          </button>
        </div>
        <div className="flex-1" />
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ========== 个人全局性记忆 ========== */}
        {level === 'global' && (
          <div className="max-w-4xl flex flex-col gap-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><User size={16} /> 个人全局性记忆</h2>
            <button onClick={() => runRebuild()}
              className="self-end -mt-9 px-3 py-1.5 rounded-xl text-[11px] font-medium border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors"
              title="用当前 API Key 重新分析所有对话，生成全局画像与项目记忆">
              ↻ 重新分析记忆
            </button>

            {gLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
              <>
                {/* 个人记忆模块：资源式卡片展开（只读预览，点开查看详情） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...BASIC_FIELDS, { key: '补充信息', label: '补充信息', placeholder: '自由补充想记录的内容……' }].map(c => {
                    const val = c.key === '补充信息' ? gExtra : (gFields[c.key] || '')
                    return (
                      <div key={c.key}
                        onClick={() => setDetailCard({ key: c.key, label: c.label, val })}
                        className="border hairline rounded-2xl p-5 bg-[var(--bg-panel)] flex flex-col gap-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{c.label}</span>
                          <PenLine size={13} className="text-dim opacity-60" />
                        </div>
                        {val.trim() ? (
                          <div className="max-h-40 overflow-hidden text-xs text-[var(--text-muted)]">
                            <MiniMD text={val} />
                          </div>
                        ) : (
                          <p className="text-[11px] text-dim">（暂无内容，点开查看）</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 时间：日历热度图 + 学习统计（所有项目） */}
                <div>
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">时间</p>
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                    <CalendarHeatmap
                      data={Object.fromEntries(Object.entries(globalDays).map(([d, items]) => [d, items.length]))}
                      onPick={d => setDayDetail({ date: d, items: globalDays[d] || [] })}
                    />
                    <div className="flex items-center gap-4 text-[11px] text-dim">
                      <span>累计 <b className="text-[var(--text)]">{globalStats.count}</b> 次对话</span>
                      {globalStats.latest && <span>最近学习 <b className="text-[var(--text)]">{globalStats.latest}</b></span>}
                    </div>
                  </div>
                  {dayDetail && (
                    <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] mt-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{dayDetail.date} 的对话</span>
                        <button onClick={() => setDayDetail(null)} className="text-[10px] text-dim hover:text-[var(--text)]">关闭</button>
                      </div>
                      {dayDetail.items.length === 0 ? <p className="text-[11px] text-dim">无记录</p> : dayDetail.items.map((it, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                          <p className="text-[11px] font-medium">
                            {it.project_name && it.project_name !== it.project_id ? `${it.project_name} · ` : ''}{it.dialogue_name}
                          </p>
                          {it.topic && <p className="text-[10px] text-dim">主题：{it.topic}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 项目摘要（只读） */}
                {Object.keys(gSummary).length > 0 && (
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                    <p className={fieldLabel}>跨项目摘要</p>
                    <div className="flex flex-col gap-2">
                      {Object.entries(gSummary).map(([pid, info]: [string, any]) => (
                        <div key={pid} className="text-xs text-[var(--text-muted)] leading-relaxed">
                          <span className="font-semibold text-[var(--text)]">📁 {pid}</span>
                          {info && (info.抽象项目情况 || info.当前水平 || (info.偏好 || []).length || (info.薄弱点 || []).length) && (
                            <span className="ml-1">
                              {info.抽象项目情况 && `概况: ${info.抽象项目情况}；`}
                              {info.当前水平 && `水平: ${info.当前水平}；`}
                              {(info.偏好 || []).length > 0 && `偏好: ${info.偏好.join(', ')}；`}
                              {(info.薄弱点 || []).length > 0 && `薄弱点: ${info.薄弱点.join(', ')}`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ========== 项目记忆 ========== */}
        {level === 'project' && (
          <div className="max-w-3xl flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <FolderTree size={16} /> 项目记忆
                <span className="text-[10px] font-normal text-dim ml-1">点击项目按钮查看记忆 · 字段只读，修改由 AI 处理</span>
                <button onClick={() => runRebuild(activeProject || undefined)}
                  className="ml-auto px-3 py-1.5 rounded-xl text-[11px] font-medium border hairline text-dim hover:bg-[var(--bg-hover)] transition-colors"
                  title="用当前 API Key 重新分析对话，生成该项目的记忆">
                  ↻ 重新分析
                </button>
              </h2>
            </div>

            {projLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : projects.length === 0 ? (
              <p className="text-xs text-dim text-center py-10">暂无项目</p>
            ) : (
              <>
                {/* 项目按钮：直接显示，点击查看该项目记忆 */}
                <div className="flex flex-wrap gap-2">
                  {projects.map(p => (
                    <button key={p.id} onClick={() => setActiveProject(p.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${activeProject === p.id ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-soft' : 'bg-[var(--bg-panel)] text-dim border-[var(--border-color)] hover:bg-[var(--bg-hover)]'}`}>
                      <FolderTree size={13} />
                      <span className="max-w-[150px] truncate">{p.name || p.id}</span>
                      {p.id === projectId && <span className="text-[9px] opacity-70">当前</span>}
                    </button>
                  ))}
                </div>

                {/* 选中项目的记忆详情 */}
                {activeProject && (() => {
                  const p = projects.find(x => x.id === activeProject)
                  const data = projData[activeProject]
                  const pid = activeProject
                  return (
                    <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b hairline">
                        <FolderTree size={14} />
                        <span className="text-sm font-bold">{p?.name || pid}</span>
                        {p?.id === projectId && <span className="text-[9px] text-dim">当前</span>}
                        <span className="text-[10px] text-dim ml-auto">
                          {p?.created_at ? String(p.created_at).slice(0, 10) : ''}{data ? ` · ${data.count} 次对话` : ''}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-4">
                        {/* 空数据引导 */}
                        {data && !Object.values(data.fields).some(v => (v || '').trim()) && (data.progress.items || []).length === 0 && (
                          <div className="px-3 py-2.5 rounded-xl bg-amber-50 text-amber-800 text-[11px] border border-amber-200 leading-relaxed">
                            ⚠️ 该项目暂无记忆数据：与 AI 对话后会自动分析生成；也可点击右上角「↻ 重新分析」立即从现有对话生成记忆。
                          </div>
                        )}
                        {/* 进度：标尺 + 快慢 + 具体内容 */}
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">进度<span className="ml-1 text-[9px] font-normal text-dim/70">起点 → 当前 → 目标 · 快慢直观</span></p>
                          <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2.5">
                            <div className="relative h-2 rounded-full bg-[#ececec]">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pctOf(data?.fields || {}, data?.count || 0) + '%', background: 'var(--accent)' }} />
                              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2" style={{ left: `calc(${pctOf(data?.fields || {}, data?.count || 0)}% - 6px)`, borderColor: 'var(--accent)' }} />
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-dim">
                              <span className="truncate max-w-[38%]">起点：{(data?.fields['起点'] || '').trim() || '（待填写）'}</span>
                              <span className="font-semibold text-[var(--text)] flex-shrink-0">{pctOf(data?.fields || {}, data?.count || 0)}%</span>
                              <span className="truncate max-w-[38%] text-right">目标：{(data?.fields['目标'] || '').trim() || '（待填写）'}</span>
                            </div>
                            {(() => { const dl = data?.progress.daily || []; const w7 = dl.slice(-7).reduce((s: number, d: any) => s + (d.count || 0), 0); const maxC = Math.max(1, ...dl.map((d: any) => d.count || 0)); return (
                              <>
                                {/* 推进节奏：最近 14 天柱状图（昨天多今天少一目了然） */}
                                <div className="flex items-end gap-1 h-10 pt-2 border-t hairline">
                                  {dl.map((d: any) => (
                                    <div key={d.date} className="flex-1 flex items-end" title={`${d.date} ${d.count} 次对话`}>
                                      <div className="w-full rounded-t" style={{ height: Math.max(2, Math.round((d.count || 0) / maxC * 32)) + 'px', background: 'var(--accent)', opacity: d.count ? 0.35 + Math.min(0.65, (d.count || 0) / maxC) : 0.08 }} />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-dim">
                                  <span>近7天 <b className="text-[var(--text)]">{w7}</b> 次</span>
                                  <span className="ml-auto font-medium">{data?.progress.pace || '—'}</span>
                                </div>
                              </>
                            ) })()}
                          </div>
                          <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
                            {['抽象目的', '抽象项目情况'].map(k => (
                              <div key={k}>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-semibold text-dim uppercase tracking-wider">{k}</label>
                                  <button onClick={() => onRequestModify?.(k, pid)} className="text-[9px] text-[var(--accent)] hover:underline">修改</button>
                                </div>
                                <div className="px-3 py-2 border hairline rounded-xl text-xs bg-[var(--bg-input)] text-[var(--text-muted)] leading-relaxed">
                                  {(data?.fields[k] || '').trim() ? <MiniMD text={data?.fields[k] || ''} /> : <span className="text-dim">（空）</span>}
                                </div>
                              </div>
                            ))}
                            {['起点', '当前水平', '目标'].map(k => (
                              <div key={k}>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-semibold text-dim uppercase tracking-wider">{k}</label>
                                  <button onClick={() => onRequestModify?.(k, pid)} className="text-[9px] text-[var(--accent)] hover:underline">修改</button>
                                </div>
                                <div className="px-3 py-2 border hairline rounded-xl text-xs bg-[var(--bg-input)] text-[var(--text-muted)] leading-relaxed">
                                  {(data?.fields[k] || '').trim() ? <MiniMD text={data?.fields[k] || ''} /> : <span className="text-dim">（空）</span>}
                                </div>
                              </div>
                            ))}
                            {/* 知识点掌握度（遗忘曲线：久未复习颜色变淡） */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-semibold text-dim uppercase tracking-wider">知识点（掌握度）</label>
                                <button onClick={() => onRequestModify?.('知识点', pid)} className="text-[9px] text-[var(--accent)] hover:underline">修改</button>
                              </div>
                              {(() => { const kps = (data?.progress.items || []).filter((x: any) => x.kind === '知识点'); return kps.length ? (
                                <div className="flex flex-col gap-1.5">
                                  {kps.map((it: any) => {
                                    const r = it.retrievability || 0
                                    const cls = r >= 0.9 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : r >= 0.7 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
                                    return (
                                      <div key={it.name} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] ${cls}`} style={{ opacity: 0.45 + r * 0.55 }}>
                                        <span className="font-medium truncate">{it.name}</span>
                                        <span className="ml-auto text-dim flex-shrink-0">{it.daysSince >= 999 ? '未提及' : `${it.daysSince} 天前`} · {it.mastery}%</span>
                                        {it.forgotten && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0">待复习</span>}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="px-3 py-2.5 border border-dashed hairline rounded-xl text-[11px] text-dim">暂无知识点数据 —— 对话后自动分析生成（可点右上角「↻ 重新分析」立即生成）</div>
                              ) })()}
                            </div>
                            {/* 难点（待攻克） */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-semibold text-dim uppercase tracking-wider">难点（待攻克）</label>
                                <button onClick={() => onRequestModify?.('难点', pid)} className="text-[9px] text-[var(--accent)] hover:underline">修改</button>
                              </div>
                              {(data?.fields['难点'] || '').trim() ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {(data?.fields['难点'] || '').split(/[,，、]/).map((s, i) => s.trim()).filter(Boolean).map((s, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600">{s}</span>
                                  ))}
                                </div>
                              ) : <span className="text-[11px] text-dim">（空）</span>}
                            </div>
                          </div>
                        </div>
                        {/* 时间：日历热度图 + 统计 */}
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">时间</p>
                          <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)]">
                            <CalendarHeatmap
                              data={Object.fromEntries(Object.entries(data?.days || {}).map(([d, items]) => [d, items.length]))}
                              onPick={d => setDayDetail({ date: d, items: (data?.days || {})[d] || [] })}
                            />
                            <div className="flex gap-4 text-[10px] text-dim mt-2">
                              <span>累计 {data?.count || 0} 次对话</span>
                              {data?.latest && <span>最近学习 {data.latest}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {/* 当天对话详情（点击日历日期） */}
            {dayDetail && (
              <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{dayDetail.date} 的对话</span>
                  <button onClick={() => setDayDetail(null)} className="text-[10px] text-dim hover:text-[var(--text)]">关闭</button>
                </div>
                {dayDetail.items.length === 0 ? <p className="text-[11px] text-dim">无记录</p> : dayDetail.items.map((it, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <p className="text-[11px] font-medium">
                      {it.project_name && it.project_name !== it.project_id ? `${it.project_name} · ` : ''}{it.dialogue_name}
                    </p>
                    {it.topic && <p className="text-[10px] text-dim">主题：{it.topic}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 记忆模块只读详情（修改记忆由 AI 处理：跳转主对话并以 [模块名] 引用） */}
      {detailCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setDetailCard(null)}>
          <div className="w-[440px] max-h-[75vh] overflow-y-auto panel rounded-3xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-base font-bold">{detailCard.label}</span>
              <button onClick={() => setDetailCard(null)} className="text-xs text-dim hover:text-[var(--text)]">关闭 ✕</button>
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              {detailCard.val.trim() ? <MiniMD text={detailCard.val} /> : <p className="text-xs text-dim">（暂无内容）</p>}
            </div>
            <div className="flex flex-col gap-2 pt-3 border-t hairline">
              <button
                onClick={() => { const lb = detailCard.label; setDetailCard(null); onRequestModify?.(lb) }}
                className="py-2.5 rounded-xl bg-[#1a1a1a] text-white text-xs font-medium">
                ✏️ 修改记忆
              </button>
              <p className="text-[10px] text-dim leading-relaxed">修改记忆由 AI 处理：点击后跳转到主对话界面，输入框会以 [模块名] 引用该记忆，补充你的修改想法后发送即可。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
