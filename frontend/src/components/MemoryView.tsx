import { useState, useEffect, useRef } from 'react'
import { Brain, User, FolderTree, Check, Loader2, PenLine, ChevronRight, ChevronDown, ArrowLeft } from 'lucide-react'
import { KnowledgeTree } from './KbTree'
import { LS, lsGet } from '../storage'
import { api } from '../api'
import { MiniMD } from './memoryView/MiniMD'
import { PrefSummary } from './memoryView/PrefSummary'
import MemoryBox from './memoryView/MemoryBox'
import MatchReport from './matchReport/MatchReport'

/** 个人全局性记忆：基础信息字段（固定，纵向表单） */
const BASIC_FIELDS = [
  { key: '身份', label: '身份', placeholder: '如：大学生 / 工程师' },
  { key: '学习目标', label: '学习目标', placeholder: '如：掌握多智能体开发' },
  { key: '擅长领域', label: '擅长领域', placeholder: '如：Python、AI 基础' },
  { key: '学习方式', label: '学习方式', placeholder: '如：动手实践、官方文档' },
  { key: '兴趣方向', label: '兴趣方向', placeholder: '如：Agent、RAG' },
]

/** 课程记忆：按维度展开（概述 → 实现进度 → 时间） */
const PROJECT_DIMS: Array<{ title: string; hint: string; keys: string[]; arrayKeys: string[] }> = [
  { title: '概述', hint: '抽象课程目的与整体情况', keys: ['抽象目的', '抽象项目情况'], arrayKeys: ['偏好', '知识点', '难点', '薄弱点', '兴趣'] },
  { title: '实现进度', hint: '起点 → 当前水平 → 目标', keys: ['起点', '当前水平', '目标'], arrayKeys: [] },
]

/** 记忆系统：两级（个人全局性记忆 / 课程记忆）完整界面 */

/** 迷你 Markdown 渲染：段落 / 有序/无序列表 / **加粗**（行级，够用即可） */
export default function MemoryView({ projectId, onRequestModify, onRequestAnalyze, projectOnly, initialEdit, onEditChange }: {
  projectId: string | null
  onRequestModify?: (label: string, pid?: string) => void
  onRequestAnalyze?: (projectName: string) => void
  projectOnly?: boolean
  /** 初次手动初始化：基本情况/目的/初始情况三个区域原地可编辑，编辑内容通过 onEditChange 上报 */
  initialEdit?: boolean
  onEditChange?: (f: Record<string, string>) => void
}) {
  const [level, setLevel] = useState<'global' | 'project'>(projectOnly ? 'project' : 'global')
  // 课程列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean; created_at?: string }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆（三栏：基本情况 / 学习情况 / 阅读偏好）
  const [gFields, setGFields] = useState<Record<string, string>>({})
  const [gExtra, setGExtra] = useState('')
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 课程摘要（只读）
  const [gLoading, setGLoading] = useState(false)
  const [gBasic, setGBasic] = useState('') // 基本情况：一段 <500 字概述
  const [gStudy, setGStudy] = useState<{ 总体概述: string; 课程: Array<{ 课程名: string; 目标: string; 当前情况: string }> }>({ 总体概述: '', 课程: [] }) // 学习情况
  const [gPref, setGPref] = useState<Record<string, any> | null>(null) // 阅读偏好（问卷式）

  // 课程记忆（全部课程，默认展开显示）
  const [projData, setProjData] = useState<Record<string, { fields: Record<string, string>; rawMem: Record<string, any>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string }; chapters: Record<string, number>; treeDocs: Array<{ source: string; tree: any[] }> }>>({})
  // 初次手动初始化：基本情况/目的/初始情况 三个区域的编辑值
  const [projLoading, setProjLoading] = useState(false)
  // 当前查看的课程（点击课程按钮切换）
  const [activeProject, setActiveProject] = useState<string | null>(projectOnly ? projectId : null)
  // 初次手动初始化：基本情况/目的/初始情况 三个区域的编辑值（随课程数据加载初始化）
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!initialEdit || !activeProject) return
    const data = projData[activeProject]
    setEditFields({
      '抽象目的': data?.fields?.['抽象目的'] || '',
      '起点': data?.fields?.['起点'] || '',
      '课程结束时间': data?.fields?.['课程结束时间'] || data?.fields?.['时间限制'] || '',
      '平均每日投入时间': data?.fields?.['平均每日投入时间'] || '',
      '其他': data?.fields?.['其他'] || '',
    })
  }, [initialEdit, activeProject, projData])
  // 日历数据：date → 当天对话项列表（全局）
  const [globalDays, setGlobalDays] = useState<Record<string, any[]>>({})
  const [globalStats, setGlobalStats] = useState<{ count: number; latest: string }>({ count: 0, latest: '' })
  const [dayDetail, setDayDetail] = useState<{ date: string; items: any[] } | null>(null)
  // 里程碑弹层：查看/编辑节点（null 不显示；{ mode:'new' } 为新增节点）

  // 课程详情页签：基本情况 | 进度与细节
  // 记忆对话（右侧对话框，直接输入修改记忆）
  const [mcMsgs, setMcMsgs] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [mcInput, setMcInput] = useState('')
  const [mcSending, setMcSending] = useState(false)
  // 课程记忆刷新触发器（记忆对话后刷新）
  const [refreshTick, setRefreshTick] = useState(0)
  // F12-S2：原 detailCard 展开弹层随分块卡移除——单框完整展示所有要点，无截断
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

  // ---------- 课程列表 ----------
  useEffect(() => {
    api.listProjects().then(d => {
      const arr = d.projects || d || []
      setProjects(Array.isArray(arr) ? arr : [])
    }).catch(() => {})
  }, [])

  // 切到课程层级时加载全部课程记忆（默认展开显示）
  useEffect(() => { if (level === 'project') setSelectedProject(selectedProject || projectId) }, [level])

  // ---------- 个人全局记忆加载 ----------
  const loadGlobal = () => {
    setGLoading(true)
    api.getGlobalProfile()
      .then(d => {
        const p = d.profile || {}
        const f: Record<string, string> = {}
        for (const b of BASIC_FIELDS) f[b.key] = p[b.key] ? String(p[b.key]) : ''
        setGFields(f)
        setGExtra(p['补充信息'] ? String(p['补充信息']) : '')
        setGSummary((p['课程摘要'] as Record<string, any>) || {})
        // 三栏结构
        setGBasic(p['基本情况'] ? String(p['基本情况']) : '')
        const lc = p['学习情况'] && typeof p['学习情况'] === 'object' ? p['学习情况'] : { 总体概述: '', 课程: [] }
        setGStudy({ 总体概述: lc['总体概述'] ? String(lc['总体概述']) : '', 课程: Array.isArray(lc['课程']) ? lc['课程'] : [] })
        setGPref(p['阅读偏好'] && typeof p['阅读偏好'] === 'object' ? p['阅读偏好'] : null)
      })
      .catch(() => {})
      .finally(() => setGLoading(false))
    // 全局学习统计 + 日历数据（所有课程）
    api.getLearningLog()
      .then(dd => {
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

  // ---------- 课程记忆加载（全部课程，常驻加载供个人画像·学习情况使用） ----------
  useEffect(() => {
    setProjLoading(true)
    api.listProjects().then(d => {
      const arr = d.projects || d || []
      const plist = (Array.isArray(arr) ? arr : []) as Array<{ id: string; name: string; created_at?: string }>
      setProjects(plist)
      if (plist.length === 0) { setProjLoading(false); return }
      const out: Record<string, { fields: Record<string, string>; rawMem: Record<string, any>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string }; chapters: Record<string, number>; treeDocs: Array<{ source: string; tree: any[] }> }> = {}
      let done = 0
      // 加载超时兜底：任何接口挂起也不让页面卡在「加载中…」
      const timer = window.setTimeout(() => {
        setProjData(out)
        setProjLoading(false)
        setActiveProject(prev => prev || (projectOnly ? (projectId || plist[0]?.id) : (plist[0]?.id || null)))
      }, 8000)
      const finish = () => {
        if (++done >= plist.length) { window.clearTimeout(timer); setProjData(out); setProjLoading(false); setActiveProject(prev => prev || (projectOnly ? (projectId || plist[0]?.id) : (plist[0]?.id || null))) }
      }
      for (const p of plist) {
        const pid = p.id
        Promise.all([
          api.getProjectMemory(pid).catch(() => ({})),
          api.getLearningLog(pid).catch(() => ({ days: [] })),
          api.getMemoryProgress(pid).catch(() => ({ items: [], daily: [], pace: '' })),
          api.getKb(pid).catch(() => []),
        ]).then(([m, lg, pg, kb]: [any, any, any, any]) => {
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
          const chapters = (mem['进度'] && typeof mem['进度'] === 'object' && !Array.isArray(mem['进度'])) ? mem['进度'] : {}
          const treeDocs = (Array.isArray(kb) ? kb : []).map((x: any) => ({ source: x.source || '未命名', tree: Array.isArray(x.tree) ? x.tree : [] }))
          out[pid] = { fields, rawMem: mem, count, latest, days, progress, chapters, treeDocs }
          finish()
        })
      }
    }).catch(() => setProjLoading(false))
  }, [level, refreshTick])

  // ---------- 自动保存 ----------
  const scheduleSave = (call: () => Promise<any>) => {
    setSaved('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      call().then(() => { setSaved('saved'); setTimeout(() => setSaved(''), 1500) }).catch(() => setSaved(''))
    }, 800)
  }

  const saveGlobal = (fields = gFields, extra = gExtra, basic?: string, study?: any, pref?: any) => {
    const profile: Record<string, any> = { ...gSummary }
    for (const [k, v] of Object.entries(fields)) if (v.trim()) profile[k] = v.trim()
    if (extra.trim()) profile['补充信息'] = extra.trim()
    // 三栏结构（基本情况 / 学习情况 / 阅读偏好）
    const b = basic !== undefined ? basic : gBasic
    if (b.trim()) profile['基本情况'] = b.trim()
    profile['学习情况'] = study !== undefined ? study : gStudy
    const p = pref !== undefined ? pref : gPref
    if (p) profile['阅读偏好'] = p
    scheduleSave(() => api.saveGlobalProfile(profile))
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

  // 记忆对话：直接输入想修改的记忆，AI 更新课程记忆字段并回复确认
  const sendMc = async () => {
    const text = mcInput.trim()
    if (!text || mcSending || !activeProject) return
    setMcMsgs(prev => [...prev, { role: 'user', content: text }])
    setMcInput('')
    setMcSending(true)
    try {
      const apikey = lsGet(LS.apiKey, '')
      const target = level === 'global' ? 'global' : (activeProject || '')
      const d = await api.memoryChat({ message: text, project_id: target, api_key: apikey })
      setMcMsgs(prev => [...prev, { role: 'assistant', content: d.reply || '已处理。' }])
      if (level === 'global') loadGlobal()
      else setRefreshTick(t => t + 1)
    } catch {
      setMcMsgs(prev => [...prev, { role: 'assistant', content: '请求失败，请稍后再试。' }])
    }
    setMcSending(false)
  }

  const saveState = (
    <span className={`flex items-center gap-1 text-[10px] flex-shrink-0 ${saved === 'saved' ? 'text-green-600' : 'text-dim'}`}>
      {saved === 'saving' && <><Loader2 size={10} className="animate-spin" /> 保存中</>}
      {saved === 'saved' && <><Check size={10} /> 已保存</>}
    </span>
  )

  return (
    <div className={`flex-1 min-w-0 flex panel rounded-3xl ${initialEdit ? '' : 'h-full overflow-hidden'}`}>
      {/* 右侧内容：初始化时自然高度（随外层整体滚动），否则内部滚动 */}
      <div className={`flex-1 p-6 ${initialEdit ? '' : 'overflow-y-auto'}`}>
        {/* ========== 个人画像 ========== */}
        {level === 'global' && (
          <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0 max-w-4xl pl-14 flex flex-col gap-6">
            <h1 className="text-2xl font-bold">个人画像</h1>

            {gLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : (
              <>
                {/* 简历框：基本信息 / 阅读偏好 / 学习情况 */}
                <div className="border hairline rounded-2xl p-6 bg-[var(--bg-panel)] flex flex-col gap-6">
                  {/* 基本信息：身份 / 年龄（行式）+ 其他（虚线框占位） */}
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">基本信息</h3>
                    <div className="flex flex-col gap-1.5">
                      {[['身份', '身份'], ['年龄', '年龄']].map(([label, k]) => (
                        <p key={k} className="text-xs leading-relaxed">
                          <span className="font-semibold text-[var(--text)]">{label}：</span>
                          {gFields[k] ? (
                            <span className="text-[var(--text-muted)]">{gFields[k]}</span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                    <p className="text-xs leading-relaxed"><span className="font-semibold text-[var(--text)]">其他：</span></p>
                    <div className="rounded-xl border border-dashed hairline bg-[var(--bg-input)] px-4 py-3 min-h-[84px]">
                      {gBasic ? (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed"><MiniMD text={gBasic} /></p>
                      ) : null}
                    </div>
                  </div>

                  {/* 学习情况：总体概述 + 课程方形按钮（只读展示，修改走右侧对话框） */}
                  <div className="border hairline rounded-2xl p-5 bg-[var(--bg-panel)] flex flex-col gap-3">
                    <span className="text-sm font-semibold">学习情况</span>
                    <p className="text-xs leading-relaxed"><span className="font-semibold text-[var(--text)]">概述：</span></p>
                    <div className="rounded-xl border border-dashed hairline bg-[var(--bg-input)] px-4 py-3 min-h-[84px]">
                      {gStudy.总体概述 ? (
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{gStudy.总体概述}</p>
                      ) : null}
                    </div>
                    {projects.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {projects.map(p => (
                          <button key={p.id} onClick={() => { setActiveProject(p.id); setLevel('project') }}
                            className="aspect-square rounded-xl border hairline bg-[var(--bg-input)] flex flex-col items-center justify-center gap-1 hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors">
                            <span className="text-lg font-bold leading-none text-[var(--text)]">{p.name.slice(0, 1)}</span>
                            <span className="text-[10px] text-dim leading-tight text-center px-1 truncate max-w-full">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="aspect-square rounded-xl border border-dashed hairline bg-[var(--bg-input)]" />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 阅读偏好 | 特殊需求（同一水平并排） */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border hairline rounded-2xl p-5 bg-[var(--bg-panel)] flex flex-col gap-2">
                      <span className="text-sm font-semibold">阅读偏好</span>
                      <PrefSummary pref={gPref} />
                    </div>
                    <div className="border hairline rounded-2xl p-5 bg-[var(--bg-panel)] flex flex-col gap-2">
                      <span className="text-sm font-semibold">特殊需求</span>
                      <div className="rounded-xl border border-dashed hairline bg-[var(--bg-input)] px-4 py-3 min-h-[84px]" />
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
          {/* 右侧：记忆对话窗口（与课程记忆一致） */}
          <div className="w-[340px] h-[calc(100vh-120px)] flex-shrink-0 border hairline rounded-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b hairline flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold">修改记忆</span>
              <span className="text-[9px] text-dim">对话后 AI 直接更新记忆</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {mcMsgs.length === 0 ? (
                <p className="text-[10px] text-dim text-center py-6 leading-relaxed">
                  直接输入想修改的内容，例如：
                  <br />「学习目标改为掌握 RAG 原理」
                  <br />「我的薄弱点是向量检索」
                </p>
              ) : mcMsgs.map((m, i) => (
                <div key={i} className={`max-w-[88%] px-3 py-2 rounded-xl text-[11px] leading-relaxed ${m.role === 'user' ? 'bg-[#1a1a1a] text-white self-end' : 'bg-[var(--bg-hover)] text-[var(--text)] self-start'}`}>
                  {m.content}
                </div>
              ))}
            </div>
            <div className="p-3 border-t hairline flex gap-2">
              <input value={mcInput} onChange={e => setMcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMc() }}
                placeholder="输入想修改的记忆…"
                className="flex-1 px-3 py-2 rounded-xl text-xs border hairline bg-[var(--bg-input)] outline-none focus:border-[var(--border-strong)]" />
              <button onClick={sendMc} disabled={mcSending || !mcInput.trim()}
                className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#1a1a1a] text-white disabled:opacity-40 transition-opacity">
                {mcSending ? '…' : '发送'}
              </button>
            </div>
          </div>
          </div>
        )}

        {/* ========== 课程记忆（层级：课程） ========== */}
        {level === 'project' && (
          <div className="w-full flex flex-col gap-4">
            {/* 返回个人画像（projectOnly 弹窗内固定课程记忆，不显示） */}
            {!projectOnly && (
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">课程记忆</h1>
              <button onClick={() => setLevel('global')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border hairline text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors">
                <ArrowLeft size={12} /> 返回个人画像
              </button>
            </div>
            )}
            {projLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : projects.length === 0 ? (
              <p className="text-xs text-dim text-center py-10">暂无课程</p>
            ) : (
              <>
                {/* 课程按钮：直接显示，点击查看该课程记忆（projectOnly 时固定当前课程，不显示） */}
                {!projectOnly && (
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
                )}

                {/* 选中课程的记忆详情 */}
                {activeProject && (() => {
                  const p = projects.find(x => x.id === activeProject)
                  const data = projData[activeProject]
                  const pid = activeProject
                  return (
                    <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                    <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
                      <div className="px-4 py-3 flex flex-col gap-4">
                        {/* 基本情况（上） */}
                          <div className="max-w-3xl">
                            {/* 基本情况：简历式竖向文档（各内容区形状/大小不同），改动由 AI 整体处理 */}
                            <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
                              {/* 简历头部：大标题居中，创建时间/对话次数在右下角；初始化时不显示（直接进入填写） */}
                              {!initialEdit && (
                              <div className="relative px-8 py-5 flex items-center justify-center border-b hairline" style={{ background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-panel))' }}>
                                <span className="text-xl font-bold">{p?.name || pid}</span>
                                <span className="absolute right-8 bottom-2.5 text-[11px] text-dim">
                                  {p?.created_at ? `创建于 ${String(p.created_at).slice(0, 10)}` : ''}{data ? ` · 累计 ${data.count} 次对话` : ''}
                                </span>
                              </div>
                              )}
                              <div className="px-8 py-6 flex flex-col gap-7">
                                {initialEdit ? (
                                  <>
                                {/* 第二栏：基本情况（大框） */}
                                <section>
                                  <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>基本情况</h3>
                                  {(
                                    <div className="flex flex-col gap-2.5">
                                      {/* 每项一行「设置项提示：输入」，用户跟着冒号填写；项目名在最前 */}
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold flex-shrink-0">项目名：</span>
                                        <input value={editFields['项目名'] ?? p?.name ?? ''} placeholder="课程名称，如：Python 数据分析实战"
                                          onChange={(e) => { const v = e.target.value; setEditFields(prev => ({ ...prev, '项目名': v })); onEditChange?.({ ...editFields, '项目名': v }) }}
                                          className="flex-1 min-w-0 border hairline rounded-lg px-2.5 py-1.5 bg-[var(--bg-input)] text-xs outline-none focus:border-[var(--accent)]" />
                                      </div>
                                      {[['课程结束时间', '什么日期验收，如：8 月 30 日完成验收'], ['平均每日投入时间', '如：每天 2 小时']].map(([label, ph]) => (
                                        <div key={label} className="flex items-center gap-2">
                                          <span className="text-xs font-semibold flex-shrink-0">{label}：</span>
                                          <input value={editFields[label] || ''} placeholder={ph}
                                            onChange={(e) => { const v = e.target.value; setEditFields(prev => ({ ...prev, [label]: v })); onEditChange?.({ ...editFields, [label]: v }) }}
                                            className="flex-1 min-w-0 border hairline rounded-lg px-2.5 py-1.5 bg-[var(--bg-input)] text-xs outline-none focus:border-[var(--accent)]" />
                                        </div>
                                      ))}
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-semibold flex-shrink-0">其他：</span>
                                        <textarea value={editFields['其他'] || ''} rows={3}
                                          placeholder="其他想说明的情况（可选）"
                                          onChange={(e) => { const v = e.target.value; setEditFields(prev => ({ ...prev, '其他': v })); onEditChange?.({ ...editFields, '其他': v }) }}
                                          className="flex-1 min-w-0 border hairline rounded-xl px-3 py-2 bg-[var(--bg-input)] text-[13px] leading-6 outline-none resize-y focus:border-[var(--accent)]" />
                                      </div>
                                    </div>
                                  )}
                                </section>
                                {/* 第三栏：大框内三个横向矩形（目的 / 初始情况 / 当前情况） */}
                                <section>
                                  <div className="border hairline rounded-xl p-5 bg-[var(--bg-input)]">
                                    <div className="grid grid-cols-3 gap-4">
                                      {[['目的', '抽象目的'], ['初始情况', '起点'], ['当前情况', '当前水平']].map(([title, k]) => (
                                        <div key={k} className="rounded-xl border hairline bg-[var(--bg-panel)] px-4 py-3.5 flex flex-col gap-2 min-h-[110px]">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">{title}</span>
                                          {k !== '当前水平' ? (
                                            <textarea value={editFields[k] || ''} rows={4}
                                              placeholder={k === '抽象目的' ? '学习目的（求职 / 兴趣 / 考试…）' : '开始学习前的水平'}
                                              onChange={(e) => { const v = e.target.value; setEditFields(prev => ({ ...prev, [k]: v })); onEditChange?.({ ...editFields, [k]: v }) }}
                                              className="w-full border hairline rounded-lg px-2 py-1.5 bg-[var(--bg-input)] text-xs leading-relaxed outline-none resize-y focus:border-[var(--accent)]" />
                                          ) : (
                                            <div className="text-xs leading-relaxed text-[var(--text)] line-clamp-5">
                                              {(data?.fields[k] || '').trim() ? <MiniMD text={data?.fields[k] || ''} /> : null}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </section>
                                  </>
                                ) : (
                                  /* F12-S2 记忆单框化：替换原「基本情况+目的/初始情况/当前情况」分块卡——
                                     ## 标题 + 要点列表 + 每节行尾补充输入 + 末尾新建标题输入；保存走键值合并，旧数据不丢 */
                                  <MemoryBox memory={data?.rawMem || {}}
                                    onSave={(profile: Record<string, unknown>) => scheduleSave(() => api.saveProjectMemory(pid, profile))} />
                                )}

                              </div>
                            </div>
                          </div>
                        {/* 进度与细节（下） */}
                        {/* 文档大纲：树状结构（复用资料章节层级，节点颜色=掌握状态）；初始化时不展示 */}
                        {!initialEdit && (
                        <div className="flex flex-col gap-2 max-w-3xl">
                          <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">文档大纲</p>
                          <KnowledgeTree treeDocs={data?.treeDocs || []} progressItems={data?.progress.items || []} projectId={projectId} />
                        </div>
                        )}

                        {/* 学情匹配度报告（评估体系 §五）：盲区/曲线/正确率/路径树；初始化时不展示 */}
                        {!initialEdit && projectId && (
                          <MatchReport projectId={projectId} />
                        )}

                        {/* 进度：基础进度条；初始化时不展示 */}
                        {!initialEdit && (
                        <div className="flex flex-col gap-2 max-w-3xl">
                          <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">进度</p>
                              <span className="text-[11px] font-semibold text-[var(--accent)]">{pctOf(data?.fields || {}, data?.count || 0)}%</span>
                            </div>
                            <div className="relative h-2.5 rounded-full bg-[#ececec]">
                              <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: pctOf(data?.fields || {}, data?.count || 0) + '%', background: 'var(--accent)', opacity: 0.9 }} />
                            </div>
                          </div>
                        </div>
                        )}
                      </div>
                    </div>
                    </div>
                    {/* 右侧：记忆对话（直接输入修改记忆）——sticky 固定悬浮；初始化时不显示 */}
                    {!initialEdit && (
                    <div className="w-[340px] h-[calc(90vh-100px)] flex-shrink-0 self-start sticky top-0 border hairline rounded-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden">
                      <div className="px-4 py-3 border-b hairline">
                        <span className="text-xs font-bold">修改记忆</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                        {mcMsgs.length === 0 ? (
                          <p className="text-[10px] text-dim text-center py-6 leading-relaxed">
                            手动修改记忆很容易发生冲突，agent可以帮助您完成这件事情
                          </p>
                        ) : mcMsgs.map((m, i) => (
                          <div key={i} className={`max-w-[88%] px-3 py-2 rounded-xl text-[11px] leading-relaxed ${m.role === 'user' ? 'bg-[#1a1a1a] text-white self-end' : 'bg-[var(--bg-hover)] text-[var(--text)] self-start'}`}>
                            {m.content}
                          </div>
                        ))}
                      </div>
                      <div className="p-3 border-t hairline flex gap-2">
                        <input value={mcInput} onChange={e => setMcInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') sendMc() }}
                          placeholder="输入想修改的记忆…"
                          className="flex-1 px-3 py-2 rounded-xl text-xs border hairline bg-[var(--bg-input)] outline-none focus:border-[var(--border-strong)]" />
                        <button onClick={sendMc} disabled={mcSending || !mcInput.trim()}
                          className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#1a1a1a] text-white disabled:opacity-40 transition-opacity">
                          {mcSending ? '…' : '发送'}
                        </button>
                      </div>
                    </div>
                    )}
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
    </div>
  )
}
