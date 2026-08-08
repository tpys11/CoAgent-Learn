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

export default function MemoryView({ projectId, onRequestModify }: { projectId: string | null; onRequestModify?: (label: string) => void }) {
  const [level, setLevel] = useState<'global' | 'project'>('global')
  // 项目列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean; created_at?: string }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆
  const [gFields, setGFields] = useState<Record<string, string>>({})
  const [gExtra, setGExtra] = useState('')
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 项目摘要（只读）
  const [gLoading, setGLoading] = useState(false)

  // 项目记忆
  const [pFields, setPFields] = useState<Record<string, string>>({})
  // 项目时间信息（只读统计）
  const [projectStats, setProjectStats] = useState<{ count: number; latest: string }>({ count: 0, latest: '' })
  // 日历数据：date → 当天对话项列表（全局 / 项目）
  const [globalDays, setGlobalDays] = useState<Record<string, any[]>>({})
  const [projectDays, setProjectDays] = useState<Record<string, any[]>>({})
  const [globalStats, setGlobalStats] = useState<{ count: number; latest: string }>({ count: 0, latest: '' })
  const [dayDetail, setDayDetail] = useState<{ date: string; items: any[] } | null>(null)
  // 记忆模块只读详情（修改记忆由 AI 处理：跳转主对话并以 [模块名] 引用）
  const [detailCard, setDetailCard] = useState<{ key: string; label: string; val: string } | null>(null)
  useEffect(() => { setDayDetail(null) }, [level])
  const [pLoading, setPLoading] = useState(false)

  const [saved, setSaved] = useState<'saving' | 'saved' | ''>('')
  const saveTimer = useRef<any>(null)

  const fieldLabel = 'text-[10px] font-semibold text-dim uppercase tracking-wider mb-2 block'

  // ---------- 项目列表 ----------
  useEffect(() => {
    fetch('/api/projects', { cache: 'no-store' }).then(r => r.json()).then(d => {
      const arr = d.projects || d || []
      setProjects(Array.isArray(arr) ? arr : [])
    }).catch(() => {})
  }, [])

  // 切到项目层级时默认选中当前项目
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

  // ---------- 项目记忆加载 ----------
  useEffect(() => {
    if (level !== 'project' || !selectedProject) return
    setPLoading(true)
    fetch('/api/project-memory/' + encodeURIComponent(selectedProject), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const mem = d.memory || {}
        const f: Record<string, string> = {}
        for (const dim of PROJECT_DIMS) {
          for (const k of dim.keys) if (mem[k]) f[k] = mem[k]
          for (const k of dim.arrayKeys) if (Array.isArray(mem[k]) && (mem[k] as any[]).length) f[k] = (mem[k] as any[]).join(', ')
        }
        setPFields(f)
      })
      .catch(() => {})
      .finally(() => setPLoading(false))
    // 时间统计（只读）：对话次数 + 最近学习日期 + 日历数据
    fetch('/api/learning-log?project_id=' + encodeURIComponent(selectedProject), { cache: 'no-store' })
      .then(r => r.json()).then(dd => {
        const days: any[] = dd.days || []
        const map: Record<string, any[]> = {}
        for (const d of days) map[d.date] = d.items || []
        const count = days.reduce((s: number, x: any) => s + ((x.items || []).length || 0), 0)
        const latest = days.length ? days.map((x: any) => x.date).sort().pop() : ''
        setProjectDays(map)
        setProjectStats({ count, latest })
      }).catch(() => {})
  }, [level, selectedProject])

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
  const saveProject = () => {
    const profile: Record<string, any> = {}
    for (const dim of PROJECT_DIMS) {
      for (const k of dim.keys) if (pFields[k]?.trim()) profile[k] = pFields[k].trim()
      for (const k of dim.arrayKeys) if (pFields[k]?.trim()) profile[k] = pFields[k].split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean)
    }
    scheduleSave('/api/project-memory/' + encodeURIComponent(selectedProject || 'default'), profile)
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
  const updateP = (k: string, v: string) => {
    setPFields(prev => ({ ...prev, [k]: v }))
    saveProject()
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
        {level === 'project' && (
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {projects.length === 0 && <p className="text-[11px] text-dim text-center py-6">暂无项目</p>}
            {projects.map(p => (
              <button key={p.id} onClick={() => setSelectedProject(p.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  p.id === selectedProject ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm' : 'hover:bg-white/60 text-dim'
                }`}>
                <FolderTree size={12} className="flex-shrink-0" />
                <span className="truncate">{p.name || p.id}</span>
                {p.id === projectId && <span className="text-[9px] text-dim flex-shrink-0">当前</span>}
              </button>
            ))}
          </div>
        )}
        {level !== 'project' && <div className="flex-1" />}
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ========== 个人全局性记忆 ========== */}
        {level === 'global' && (
          <div className="max-w-4xl flex flex-col gap-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><User size={16} /> 个人全局性记忆</h2>

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
          <div className="max-w-2xl flex flex-col gap-5">
            {!selectedProject ? (
              <p className="text-xs text-dim text-center py-10">请先在左侧选择项目</p>
            ) : (
              <>
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <FolderTree size={16} /> 项目记忆
                    <span className="text-xs font-normal text-dim ml-1">{projects.find(p => p.id === selectedProject)?.name || selectedProject}</span>
                  </h2>
                </div>

                {pLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
                  <>
                    {/* 维度区块：概述 / 实现进度 */}
                    {PROJECT_DIMS.map(dim => (
                      <div key={dim.title} className="flex flex-col gap-3">
                        <p className="text-xs font-semibold text-dim uppercase tracking-wider flex items-baseline gap-2">
                          {dim.title}
                          <span className="text-[10px] font-normal text-dim/70">{dim.hint}</span>
                        </p>
                        {dim.keys.map(k => (
                          <div key={k}>
                            <label className={fieldLabel}>{k}</label>
                            <textarea value={pFields[k] || ''} onChange={e => updateP(k, e.target.value)} rows={k === '抽象项目情况' ? 3 : 2}
                              placeholder={`填写${k}…`}
                              className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                          </div>
                        ))}
                        {dim.arrayKeys.map(k => (
                          <div key={k}>
                            <label className={fieldLabel}>{k}（逗号分隔）</label>
                            <input value={pFields[k] || ''} onChange={e => updateP(k, e.target.value)}
                              placeholder={`填写${k}，多个用逗号分隔`}
                              className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* 时间：日历热度图 + 项目统计 */}
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-semibold text-dim uppercase tracking-wider">时间</p>
                      <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                        <CalendarHeatmap
                          data={Object.fromEntries(Object.entries(projectDays).map(([d, items]) => [d, items.length]))}
                          onPick={d => setDayDetail({ date: d, items: projectDays[d] || [] })}
                        />
                        <div className="flex flex-col gap-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-dim">创建时间</span>
                            <span className="font-medium">{(projects.find(p => p.id === selectedProject) as any)?.created_at ? String((projects.find(p => p.id === selectedProject) as any)?.created_at).slice(0, 10) : '—'}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-dim">对话次数</span>
                            <span className="font-medium">{projectStats.count} 次</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-dim">最近学习</span>
                            <span className="font-medium">{projectStats.latest || '暂无'}</span>
                          </div>
                        </div>
                      </div>
                      {dayDetail && (
                        <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{dayDetail.date} 的对话</span>
                            <button onClick={() => setDayDetail(null)} className="text-[10px] text-dim hover:text-[var(--text)]">关闭</button>
                          </div>
                          {dayDetail.items.length === 0 ? <p className="text-[11px] text-dim">无记录</p> : dayDetail.items.map((it, i) => (
                            <div key={i} className="flex flex-col gap-0.5">
                              <p className="text-[11px] font-medium">{it.dialogue_name}</p>
                              {it.topic && <p className="text-[10px] text-dim">主题：{it.topic}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
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
