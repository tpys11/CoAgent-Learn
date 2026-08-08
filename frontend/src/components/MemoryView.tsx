import { useState, useEffect, useRef } from 'react'
import { Brain, User, FolderTree, Check, Loader2, ChevronDown } from 'lucide-react'

/** 个人全局性记忆：基础信息字段（固定，纵向表单） */
const BASIC_FIELDS = [
  { key: '身份', label: '身份', placeholder: '如：大学生 / 工程师' },
  { key: '学习目标', label: '学习目标', placeholder: '如：掌握多智能体开发' },
  { key: '擅长领域', label: '擅长领域', placeholder: '如：Python、AI 基础' },
  { key: '学习方式', label: '学习方式', placeholder: '如：动手实践、官方文档' },
  { key: '兴趣方向', label: '兴趣方向', placeholder: '如：Agent、RAG' },
]

/** 项目记忆：固定字段（单值 / 数组） */
const PROJECT_TEXT_KEYS = ['项目概述', '当前进度', '领域', '背景', '水平', '学习目标']
const PROJECT_ARRAY_KEYS = new Set(['偏好', '知识点', '难点', '薄弱点', '兴趣'])
/** 记忆系统：两级（个人全局性记忆 / 项目记忆）完整界面 */
export default function MemoryView({ projectId }: { projectId: string | null }) {
  const [level, setLevel] = useState<'global' | 'project'>('global')
  // 项目列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆
  const [gFields, setGFields] = useState<Record<string, string>>({})
  const [gExtra, setGExtra] = useState('')
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 项目摘要（只读）
  const [gLoading, setGLoading] = useState(false)

  // 项目记忆
  const [pFields, setPFields] = useState<Record<string, string>>({})
  // 学习时间线
  const [timeline, setTimeline] = useState<Array<{ date: string; items: any[] }>>([])
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [pLoading, setPLoading] = useState(false)
  const [dialogueSummaries, setDialogueSummaries] = useState<Array<{ dialogue_id?: string; name?: string; 概要?: any }>>([])

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
  }
  useEffect(() => { loadGlobal() }, [level === 'global'])

  // ---------- 学习时间线 ----------
  const fmtDateCN = (s: string) => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/) || s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
    if (!m) return s
    const y = new Date().getFullYear()
    return String(m[1]) === String(y) ? `${Number(m[2])}月${Number(m[3])}日` : `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
  }
  const loadTimeline = (pid: string | null) => {
    const url = pid ? '/api/learning-log?project_id=' + encodeURIComponent(pid) : '/api/learning-log'
    fetch(url, { cache: 'no-store' }).then(r => r.json()).then(d => setTimeline(d.days || [])).catch(() => setTimeline([]))
  }
  useEffect(() => {
    if (level === 'project') loadTimeline(selectedProject)
    else loadTimeline(null)
  }, [level, selectedProject])
  const toggleDay = (date: string) => {
    setOpenDays(prev => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n })
  }
  const renderTimeline = () => (
    <div className="flex flex-col gap-2">
      {timeline.length === 0 ? (
        <p className="text-[11px] text-dim text-center py-8">暂无学习记录，对话后会按日期汇总</p>
      ) : timeline.map(d => {
        const open = openDays.has(d.date)
        return (
          <div key={d.date} className="border hairline rounded-xl bg-[var(--bg-panel)] overflow-hidden">
            <button onClick={() => toggleDay(d.date)} className="w-full flex items-center gap-2.5 px-4 py-3 text-left">
              <ChevronDown size={13} className={`transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
              <span className="text-sm font-semibold">{fmtDateCN(d.date)}</span>
              <span className="text-[11px] text-dim">{d.items.length} 次对话</span>
            </button>
            {open && (
              <div className="px-4 pb-3 flex flex-col gap-2">
                {d.items.map((item, i) => (
                  <div key={i} className="border hairline rounded-lg p-3 flex flex-col gap-1">
                    <p className="text-xs font-semibold">
                      {item.project_name && item.project_name !== item.project_id ? `${item.project_name} · ` : ''}{item.dialogue_name}
                    </p>
                    {item.topic && <p className="text-[11px] text-dim">主题：{item.topic}</p>}
                    {item.artifacts && item.artifacts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {item.artifacts.map((a: any, j: number) => (
                          <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-dim">{a.type}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ---------- 项目记忆加载 ----------
  useEffect(() => {
    if (level !== 'project' || !selectedProject) return
    setPLoading(true)
    fetch('/api/project-memory/' + encodeURIComponent(selectedProject), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const mem = d.memory || {}
        const f: Record<string, string> = {}
        for (const k of PROJECT_TEXT_KEYS) if (mem[k]) f[k] = mem[k]
        for (const k of PROJECT_ARRAY_KEYS) if (Array.isArray(mem[k]) && (mem[k] as any[]).length) f[k] = (mem[k] as any[]).join(', ')
        setPFields(f)
        setDialogueSummaries(mem['对话概要'] || [])
      })
      .catch(() => {})
      .finally(() => setPLoading(false))
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
    for (const [k, v] of Object.entries(pFields)) {
      if (PROJECT_ARRAY_KEYS.has(k)) profile[k] = v.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
      else profile[k] = v.trim()
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
          <div className="max-w-3xl flex flex-col gap-6">
            <h2 className="text-xl font-bold flex items-center gap-2"><User size={16} /> 个人全局性记忆</h2>

            {gLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
              <>
                {/* 基础信息 */}
                <div>
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">基础信息</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {BASIC_FIELDS.map(f => (
                      <div key={f.key} className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-2">
                        <span className="text-xs font-semibold">{f.label}</span>
                        <input value={gFields[f.key] || ''} onChange={e => updateField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className="w-full px-3 py-2 text-xs input-surface rounded-lg outline-none" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 补充信息 */}
                <div>
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">补充信息</p>
                  <textarea value={gExtra} onChange={e => updateExtra(e.target.value)} rows={6}
                    placeholder="自由补充想记录的内容……"
                    className="w-full px-3 py-3 text-xs input-surface rounded-xl outline-none resize-none" />
                </div>

                {/* 学习时间线（跨项目） */}
                <div>
                  <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">学习时间线</p>
                  {renderTimeline()}
                </div>

                {/* 项目摘要（只读） */}
                {Object.keys(gSummary).length > 0 && (
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                    <p className={fieldLabel}>跨项目摘要</p>
                    <div className="flex flex-col gap-2">
                      {Object.entries(gSummary).map(([pid, info]: [string, any]) => (
                        <div key={pid} className="text-xs text-[var(--text-muted)] leading-relaxed">
                          <span className="font-semibold text-[var(--text)]">📁 {pid}</span>
                          {info && (info.领域 || info.水平 || (info.兴趣 || []).length || (info.薄弱点 || []).length) && (
                            <span className="ml-1">
                              {info.领域 && `领域: ${info.领域}；`}
                              {info.水平 && `水平: ${info.水平}；`}
                              {(info.兴趣 || []).length > 0 && `兴趣: ${info.兴趣.join(', ')}；`}
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
                  <p className="text-[11px] text-dim mt-1">按项目拆分记录：项目概述、学习目标、知识点、薄弱点等，改动即时自动保存。</p>
                </div>

                {pLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
                  <>
                    {/* 单值字段 */}
                    <div className="flex flex-col gap-3">
                      {PROJECT_TEXT_KEYS.map(k => (
                        <div key={k}>
                          <label className={fieldLabel}>{k}</label>
                          <textarea value={pFields[k] || ''} onChange={e => updateP(k, e.target.value)} rows={k === '项目概述' ? 3 : 2}
                            placeholder={`填写${k}…`}
                            className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none resize-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                        </div>
                      ))}
                    </div>
                    {/* 数组字段 */}
                    <div className="flex flex-col gap-3">
                      {Array.from(PROJECT_ARRAY_KEYS).map(k => (
                        <div key={k}>
                          <label className={fieldLabel}>{k}（逗号分隔）</label>
                          <input value={pFields[k] || ''} onChange={e => updateP(k, e.target.value)}
                            placeholder={`填写${k}，多个用逗号分隔`}
                            className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none focus:border-[var(--border-strong)] bg-[var(--bg-input)]" />
                        </div>
                      ))}
                    </div>

                    {/* 学习时间线（按日期展开/折叠） */}
                    <div>
                      <p className="text-xs font-semibold text-dim uppercase tracking-wider mb-3">学习时间线</p>
                      {renderTimeline()}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
