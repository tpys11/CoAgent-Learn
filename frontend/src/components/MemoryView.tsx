import { useState, useEffect, useRef } from 'react'
import { Brain, User, FolderTree, Plus, Trash2, Check, Loader2 } from 'lucide-react'

/** 个人全局性记忆：数组型字段 */
const GLOBAL_ARRAY_KEYS = new Set(['偏好提问方式', '偏好学习方式', '偏好_输出', '学习内容'])
/** 建议的自由要点字段（空状态引导） */
const GLOBAL_SUGGEST = ['学习者身份', '学习目标', '擅长领域', '学习方式', '兴趣方向']

/** 项目记忆：固定字段（单值 / 数组） */
const PROJECT_TEXT_KEYS = ['项目概述', '当前进度', '领域', '背景', '水平', '学习目标']
const PROJECT_ARRAY_KEYS = new Set(['偏好', '知识点', '难点', '薄弱点', '兴趣'])

/** 通用条目行：label + value（数组字段用逗号分隔编辑） */
function EntryRow({ label, value, array, onLabel, onValue, onRemove }: {
  label: string; value: string; array: boolean
  onLabel: (v: string) => void; onValue: (v: string) => void; onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-2">
      <input value={label} onChange={e => onLabel(e.target.value)} placeholder="要点名称"
        className="w-28 flex-shrink-0 px-2.5 py-2 text-xs input-surface rounded-lg outline-none font-medium" />
      {array ? (
        <input value={value} onChange={e => onValue(e.target.value)} placeholder="多个值用逗号分隔"
          className="flex-1 px-2.5 py-2 text-xs input-surface rounded-lg outline-none" />
      ) : (
        <input value={value} onChange={e => onValue(e.target.value)} placeholder="填写内容"
          className="flex-1 px-2.5 py-2 text-xs input-surface rounded-lg outline-none" />
      )}
      <button onClick={onRemove} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="删除">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

/** 记忆系统：两级（个人全局性记忆 / 项目记忆）完整界面 */
export default function MemoryView({ projectId }: { projectId: string | null }) {
  const [level, setLevel] = useState<'global' | 'project'>('global')
  // 项目列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆
  const [gEntries, setGEntries] = useState<Array<{ key: string; value: string }>>([])
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 项目摘要（只读）
  const [gLoading, setGLoading] = useState(false)

  // 项目记忆
  const [pFields, setPFields] = useState<Record<string, string>>({})
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
        const entries: Array<{ key: string; value: string }> = []
        let summary: Record<string, any> = {}
        for (const [k, v] of Object.entries(p)) {
          if (k === '项目摘要') { summary = (v as any) || {}; continue }
          if (v === null || v === undefined) continue
          entries.push({ key: k, value: Array.isArray(v) ? (v as any[]).join(', ') : String(v) })
        }
        setGEntries(entries)
        setGSummary(summary)
      })
      .catch(() => {})
      .finally(() => setGLoading(false))
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

  const saveGlobal = () => {
    const profile: Record<string, any> = { ...gSummary }
    for (const e of gEntries) {
      if (!e.key.trim()) continue
      profile[e.key.trim()] = GLOBAL_ARRAY_KEYS.has(e.key.trim())
        ? e.value.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
        : e.value.trim()
    }
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

  const updateG = (i: number, patch: Partial<{ key: string; value: string }>) => {
    const next = gEntries.map((e, idx) => idx === i ? { ...e, ...patch } : e)
    setGEntries(next)
    saveGlobal()
  }
  const removeG = (i: number) => {
    const next = gEntries.filter((_, idx) => idx !== i)
    setGEntries(next)
    saveGlobal()
  }
  const addG = (key?: string) => {
    setGEntries([...gEntries, { key: key || '', value: '' }])
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
        <div className="p-2 border-t hairline">
          <p className="text-[10px] text-dim leading-relaxed px-2">系统会基于对话自动提炼记忆，这里可手动查看与补充。</p>
        </div>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ========== 个人全局性记忆 ========== */}
        {level === 'global' && (
          <div className="max-w-2xl flex flex-col gap-5">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2"><User size={16} /> 个人全局性记忆</h2>
              <p className="text-[11px] text-dim mt-1">面向个人的详细信息（学习者身份、学习目标等），跨项目保留；以"简历式自由要点"记录，可增删改。</p>
            </div>

            {gLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
              <>
                {/* 自由要点列表 */}
                <div className="flex flex-col gap-2">
                  {gEntries.length === 0 && (
                    <div className="border border-dashed hairline rounded-xl py-10 text-center">
                      <p className="text-xs text-dim">暂无个人要点，系统将基于项目记忆自动提炼，也可手动补充：</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-3">
                        {GLOBAL_SUGGEST.map(s => (
                          <button key={s} onClick={() => addG(s)}
                            className="px-3 py-1.5 text-[11px] border hairline rounded-full text-dim hover:bg-[var(--bg-hover)] transition-colors">
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {gEntries.map((e, i) => (
                    <EntryRow key={i} label={e.key} value={e.value}
                      array={GLOBAL_ARRAY_KEYS.has(e.key)}
                      onLabel={v => updateG(i, { key: v })} onValue={v => updateG(i, { value: v })}
                      onRemove={() => removeG(i)} />
                  ))}
                  {gEntries.length > 0 && (
                    <button onClick={() => addG()}
                      className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-dim hover:bg-[var(--bg-hover)] rounded-xl self-start transition-colors">
                      <Plus size={13} /> 添加要点
                    </button>
                  )}
                </div>

                {/* 项目摘要（只读） */}
                {Object.keys(gSummary).length > 0 && (
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                    <p className={fieldLabel}>跨项目摘要（系统自动生成，只读）</p>
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

                    {/* 对话记忆（只读） */}
                    <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                      <p className={fieldLabel}>对话记忆（{dialogueSummaries.length}）</p>
                      {dialogueSummaries.length === 0 ? (
                        <p className="text-[11px] text-dim">暂无对话记忆，新建对话并填写对话画像后自动生成</p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {dialogueSummaries.map((ds, i) => (
                            <div key={i} className="border hairline rounded-lg p-3">
                              <p className="text-xs font-semibold mb-1">💬 {ds.name || '对话'}</p>
                              {ds.概要 && (
                                <p className="text-[11px] text-[var(--text-muted)]">
                                  {ds.概要.topic && <>主题：{ds.概要.topic}</>}
                                  {ds.概要.selfLevel && <> · 水平：{ds.概要.selfLevel}</>}
                                  {ds.概要.target && <> · 目标：{ds.概要.target}</>}
                                </p>
                              )}
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
    </div>
  )
}
