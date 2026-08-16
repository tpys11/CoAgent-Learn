import { useState, useEffect, useRef, useMemo } from 'react'
import { Brain, User, FolderTree, Check, Loader2, PenLine, ChevronRight, ChevronDown } from 'lucide-react'
import { KnowledgeTree } from './KbTree'
import { LS, lsGet } from '../storage'
import { api } from '../api'
import { CalendarHeatmap, TimeLineChart } from './memoryView/charts'

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
/** 里程碑节点：进度条上的可交互节点（起点/当前/目标固定，系统预分析重要节点，用户自定义可增删） */
type MilestoneType = 'start' | 'current' | 'goal' | 'system' | 'custom'
interface Milestone { id: string; label: string; detail?: string; type: MilestoneType; pos: number; important?: boolean }

/** 构建里程碑列表：用户保存过的优先；否则自动生成（起点/当前/目标 + 系统预分析的知识点/难点节点） */
const buildMilestones = (data: any): Milestone[] => {
  const savedRaw = data?.fields?.['里程碑']
  if (savedRaw) {
    try {
      const arr = JSON.parse(savedRaw)
      if (Array.isArray(arr) && arr.length) return arr
    } catch { /* 忽略损坏数据 */ }
  }
  const list: Milestone[] = []
  list.push({ id: 'start', label: '起点', detail: data?.fields?.['起点'] || '', type: 'start', pos: 0, important: false })
  // 当前节点位置：按「当前水平」关键词映射，无则按对话量估计
  const lv = (data?.fields?.['当前水平'] || '').toLowerCase()
  let curP = 15
  if (/beginner|初级|入门/.test(lv)) curP = 30
  else if (/intermediate|中级|进阶/.test(lv)) curP = 60
  else if (/advanced|高级|掌握/.test(lv)) curP = 85
  else curP = Math.min(80, 15 + (data?.count || 0) * 3)
  list.push({ id: 'cur', label: '当前', detail: data?.fields?.['当前水平'] || '', type: 'current', pos: curP, important: false })
  list.push({ id: 'goal', label: '目标', detail: data?.fields?.['目标'] || '', type: 'goal', pos: 100, important: false })
  const goalText = data?.fields?.['目标'] || ''
  const kps = (data?.progress.items || []).filter((x: any) => x.kind === '知识点')
  kps.forEach((k: any, i: number) => {
    list.push({
      id: 'sys-' + (k.name || i),
      label: k.name || '知识点',
      detail: `${k.mastery ?? 0}% 掌握${k.daysSince >= 999 ? '' : `，${k.daysSince} 天前提及`}`,
      type: 'system',
      pos: Math.round(8 + (i / Math.max(1, kps.length)) * 84),
      important: !!(k.forgotten || (k.mastery ?? 0) < 0.6 || (goalText && k.name && goalText.includes(k.name))),
    })
  })
  const diffs = (data?.fields?.['难点'] || '').split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean)
  diffs.forEach((s: string, i: number) => {
    list.push({ id: 'sys-diff-' + i, label: s, detail: '难点', type: 'system', pos: Math.round(10 + (i / Math.max(1, diffs.length)) * 80), important: true })
  })
  return list
}

/** 节点填充色（实心色块内部）：固定节点按类型定深浅；系统/自定义节点按掌握度深浅（与知识图谱一致） */
const nodeFill = (m: Milestone, mastery: number | null) => {
  if (m.type === 'start') return 'color-mix(in srgb, var(--accent) 20%, var(--bg-panel))'
  if (m.type === 'current') return 'var(--accent)'
  if (m.type === 'goal') return 'color-mix(in srgb, var(--accent) 85%, var(--bg-panel))'
  if (m.type === 'custom') return 'color-mix(in srgb, var(--accent) 40%, var(--bg-panel))'
  const base = mastery == null ? 30 : Math.round(30 + mastery * 70)
  return `color-mix(in srgb, var(--accent) ${base}%, var(--bg-panel))`
}

/** 节点边框色：符合主题但与填充/进度条不重复（更深一档） */
const nodeBorder = (m: Milestone, mastery: number | null) => {
  if (m.type === 'start') return 'color-mix(in srgb, var(--accent) 50%, transparent)'
  if (m.type === 'current') return 'color-mix(in srgb, var(--accent) 60%, #1a1a1a)'
  if (m.type === 'goal') return 'color-mix(in srgb, var(--accent) 45%, #1a1a1a)'
  if (m.type === 'custom') return 'color-mix(in srgb, var(--accent) 60%, transparent)'
  const base = mastery == null ? 55 : Math.round(55 + mastery * 30)
  return `color-mix(in srgb, var(--accent) ${base}%, transparent)`
}

/** 记忆系统：两级（个人全局性记忆 / 课程记忆）完整界面 */

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

/** 阅读偏好：结构化程度展示（列表/表格），未设置项留空 */
function PrefSummary({ pref }: { pref: Record<string, any> | null }) {
  const jc = pref?.结构化程度 || {}
  const list = jc?.列表
  const table = jc?.表格
  return (
    <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
      <p><span className="font-semibold text-[var(--text)]">列表</span>　{list ? (list.喜欢 ? `喜欢 · ${list.有序 ? '有序' : '无序'}` : '不喜欢') : ''}</p>
      <p><span className="font-semibold text-[var(--text)]">表格</span>　{table ? (table.喜欢 ? '喜欢' : '不喜欢') : ''}</p>
    </div>
  )
}

/** 特殊需求：特殊格式展示（latex / md 文档 / 复制到笔记），未设置项留空 */
function SpecialPref({ pref }: { pref: Record<string, any> | null }) {
  const sp = pref?.特殊格式 || {}
  return (
    <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
      <p><span className="font-semibold text-[var(--text)]">latex 格式</span>　{sp?.latex !== undefined ? (sp.latex ? '需要' : '不需要') : ''}</p>
      <p><span className="font-semibold text-[var(--text)]">md 文档格式</span>　{sp?.['md文档'] !== undefined ? (sp['md文档'] ? '喜欢' : '不喜欢') : ''}</p>
      <p><span className="font-semibold text-[var(--text)]">复制内容到笔记</span>　{sp?.['喜欢复制到笔记'] !== undefined ? (sp['喜欢复制到笔记'] ? '是' : '否') : ''}</p>
    </div>
  )
}

/** 阅读偏好问卷：首次设置 / 修改（用户手动选择，系统不自动猜测） */
function PrefDialog({ initial, onCancel, onSave }: { initial: Record<string, any> | null; onCancel: () => void; onSave: (p: Record<string, any>) => void }) {
  const jc = initial?.结构化程度 || {}
  const sp = initial?.特殊格式 || {}
  const [listLike, setListLike] = useState<'y' | 'n' | ''>(jc?.列表?.喜欢 === false ? 'n' : jc?.列表?.喜欢 ? 'y' : '')
  const [listOrdered, setListOrdered] = useState(jc?.列表?.有序 !== false)
  const [tableLike, setTableLike] = useState<'y' | 'n' | ''>(jc?.表格?.喜欢 === false ? 'n' : jc?.表格?.喜欢 ? 'y' : '')
  const [latex, setLatex] = useState(!!sp?.latex)
  const [mdLike, setMdLike] = useState<'y' | 'n' | ''>(sp?.['md文档'] === false ? 'n' : sp?.['md文档'] ? 'y' : '')
  const [copyLike, setCopyLike] = useState<'y' | 'n' | ''>(sp?.['喜欢复制到笔记'] === false ? 'n' : sp?.['喜欢复制到笔记'] ? 'y' : '')

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
  const YN = ({ cur, onChange }: { cur: 'y' | 'n' | ''; onChange: (v: 'y' | 'n') => void }) => (
    <>
      {[['y', '喜欢'], ['n', '不用']].map(([v, t]) => (
        <button key={v} onClick={() => onChange(v as 'y' | 'n')}
          className={`px-3 py-1 rounded-lg text-[11px] font-medium border hairline transition-colors ${cur === v ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'}`}>{t}</button>
      ))}
    </>
  )
  const YN2 = ({ label, cur, onChange }: { label: string; cur: 'y' | 'n' | ''; onChange: (v: 'y' | 'n') => void }) => (
    <Row label={label}><YN cur={cur} onChange={onChange} /></Row>
  )
  const save = () => {
    onSave({
      结构化程度: {
        列表: { 喜欢: listLike !== 'n', 有序: listOrdered },
        表格: { 喜欢: tableLike !== 'n' },
      },
      特殊格式: {
        latex: !!latex,
        'md文档': mdLike !== 'n',
        '喜欢复制到笔记': copyLike === 'y',
      },
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onCancel}>
      <div className="w-[420px] max-h-[80vh] overflow-y-auto panel rounded-3xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-base font-bold">阅读偏好</span>
          <button onClick={onCancel} className="text-xs text-dim hover:text-[var(--text)]">关闭 ✕</button>
        </div>
        <p className="text-[11px] text-dim leading-relaxed">告诉系统你希望回答以怎样的形式呈现（可随时修改）</p>
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">结构化程度</p>
          <YN2 label="列表" cur={listLike} onChange={setListLike} />
          {listLike !== 'n' && (
            <div className="flex items-center justify-between gap-3 pl-2">
              <span className="text-[11px] text-dim">列表形式</span>
              <div className="flex items-center gap-1.5">
                {([['有序', true], ['无序', false]] as [string, boolean][]).map(([t, v]) => (
                  <button key={t} onClick={() => setListOrdered(v)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-medium border hairline transition-colors ${listOrdered === v ? 'bg-[#1a1a1a] text-white' : 'bg-[var(--bg-input)] hover:bg-[var(--bg-hover)]'}`}>{t}</button>
                ))}
              </div>
            </div>
          )}
          <YN2 label="表格" cur={tableLike} onChange={setTableLike} />
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] mt-1">特殊格式</p>
          <YN2 label="latex 公式" cur={latex ? 'y' : ''} onChange={v => setLatex(v === 'y')} />
          <YN2 label="md 文档格式" cur={mdLike} onChange={setMdLike} />
          <YN2 label="喜欢复制内容到笔记" cur={copyLike} onChange={setCopyLike} />
        </div>
        <button onClick={save}
          className="py-2.5 rounded-xl bg-[#1a1a1a] text-white text-xs font-medium hover:bg-[#333333] transition-colors">
          保存偏好
        </button>
      </div>
    </div>
  )
}

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
  const [projData, setProjData] = useState<Record<string, { fields: Record<string, string>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string }; treeDocs: Array<{ source: string; tree: any[] }> }>>({})
  // 初次手动初始化：基本情况/目的/初始情况 三个区域的编辑值
  const [projLoading, setProjLoading] = useState(false)
  // 当前查看的课程（点击课程按钮切换）
  const [activeProject, setActiveProject] = useState<string | null>(projectOnly ? projectId : null)
  // 课程详情弹层（个人画像·学习情况 点击课程方形按钮打开）
  const [courseModal, setCourseModal] = useState(false)
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
  const [msNode, setMsNode] = useState<Milestone | { mode: 'new' } | null>(null)
  // 课程详情页签：基本情况 | 进度与细节
  // 记忆对话（右侧对话框，直接输入修改记忆）
  const [mcMsgs, setMcMsgs] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [mcInput, setMcInput] = useState('')
  const [mcSending, setMcSending] = useState(false)
  // 课程记忆刷新触发器（记忆对话后刷新）
  const [refreshTick, setRefreshTick] = useState(0)
  // 记忆模块只读详情（修改记忆由 AI 处理：跳转主对话并以 [模块名] 引用）
  const [detailCard, setDetailCard] = useState<{ key: string; label: string; val: string } | null>(null)
  useEffect(() => { setDayDetail(null); setDetailCard(null) }, [level])

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
      const out: Record<string, { fields: Record<string, string>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string }; treeDocs: Array<{ source: string; tree: any[] }> }> = {}
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
          const treeDocs = (Array.isArray(kb) ? kb : []).map((x: any) => ({ source: x.source || '未命名', tree: Array.isArray(x.tree) ? x.tree : [] }))
          out[pid] = { fields, count, latest, days, progress, treeDocs }
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
                          <button key={p.id} onClick={() => { setActiveProject(p.id); setLevel('project'); setCourseModal(true) }}
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

        {/* ========== 课程详情弹层 ========== */}
        {courseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={() => setCourseModal(false)}>
            <div className="w-[960px] max-h-[85vh] overflow-y-auto panel rounded-3xl p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between flex-shrink-0">
                <span className="text-base font-bold">课程记忆{activeProject ? ` · ${projects.find(p => p.id === activeProject)?.name || ''}` : ''}</span>
                <button onClick={() => setCourseModal(false)} className="text-xs text-dim hover:text-[var(--text)]">关闭 ✕</button>
              </div>
        {level === 'project' && (
          <div className="w-full flex flex-col gap-4">
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
                                {/* 第二栏：基本情况（大框） */}
                                <section>
                                  <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>基本情况</h3>
                                  {initialEdit ? (
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
                                  ) : (
                                    <div className="border hairline rounded-xl px-5 py-4 bg-[var(--bg-input)] text-[13px] leading-7 text-[var(--text)]">
                                      {/* 只显示一点字：截断预览 */}
                                      <div className="line-clamp-4 overflow-hidden">
                                        {['课程结束时间', '平均每日投入时间', '其他'].map(k => (data?.fields[k] || (k === '课程结束时间' ? data?.fields?.['时间限制'] : '') || '').trim() ? (
                                          <div key={k} className="flex items-baseline gap-2 text-[11px] leading-6">
                                            <span className="font-semibold text-[var(--text)] flex-shrink-0">{k}</span>
                                            <span className="text-[var(--text-muted)]">{data?.fields[k]}</span>
                                          </div>
                                        ) : null)}
                                        {(data?.fields['抽象项目情况'] || '').trim() ? <MiniMD text={data?.fields['抽象项目情况'] || ''} /> : null}
                                      </div>
                                      {/* 右下角高亮字（非按钮）：展开为独立显示窗口 */}
                                      <div className="flex justify-end mt-1.5">
                                        <span onClick={() => setDetailCard({
                                          key: '基本情况', label: '基本情况',
                                          val: ['课程结束时间', '平均每日投入时间', '其他'].map(k => {
                                            const v = (data?.fields[k] || (k === '课程结束时间' ? data?.fields?.['时间限制'] : '') || '').trim()
                                            return v ? `${k}：${v}` : ''
                                          }).filter(Boolean).join('\n')
                                            + ((data?.fields['抽象项目情况'] || '').trim() ? '\n\n抽象项目情况：\n' + data?.fields['抽象项目情况'] : '')
                                        })}
                                          className="text-[10px] font-semibold text-[var(--accent)] cursor-pointer hover:underline select-none">展开更多</span>
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
                                          {initialEdit && k !== '当前水平' ? (
                                            <textarea value={editFields[k] || ''} rows={4}
                                              placeholder={k === '抽象目的' ? '学习目的（求职 / 兴趣 / 考试…）' : '开始学习前的水平'}
                                              onChange={(e) => { const v = e.target.value; setEditFields(prev => ({ ...prev, [k]: v })); onEditChange?.({ ...editFields, [k]: v }) }}
                                              className="w-full border hairline rounded-lg px-2 py-1.5 bg-[var(--bg-input)] text-xs leading-relaxed outline-none resize-y focus:border-[var(--accent)]" />
                                          ) : (
                                            <>
                                              {/* 只显示一点字：截断预览 */}
                                              <div className="text-xs leading-relaxed text-[var(--text)] line-clamp-5">
                                                {(data?.fields[k] || '').trim() ? <MiniMD text={data?.fields[k] || ''} /> : null}
                                              </div>
                                              {/* 右下角高亮字（非按钮）：展开为独立显示窗口 */}
                                              <div className="flex justify-end mt-auto">
                                                <span onClick={() => setDetailCard({ key: k, label: title, val: data?.fields[k] || '' })}
                                                  className="text-[10px] font-semibold text-[var(--accent)] cursor-pointer hover:underline select-none">展开更多</span>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </section>
                                {/* 标签区：偏好/知识点/难点/薄弱点/兴趣（胶囊） */}
                                {['偏好', '知识点', '难点', '薄弱点', '兴趣'].map(k => {
                                  const arr = (data?.fields[k] || '').split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean)
                                  if (!arr.length) return null
                                  return (
                                    <section key={k}>
                                      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--accent)' }}>{k}</h3>
                                      <div className="flex flex-wrap gap-2">
                                        {arr.map((s, i) => (
                                          <span key={i} className="px-3 py-1 rounded-full text-[11px] border hairline"
                                            style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-panel))', borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                                            {s}
                                          </span>
                                        ))}
                                      </div>
                                    </section>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        {/* 进度与细节（下） */}
                        {/* 知识图谱：树状结构（复用资料章节层级，节点颜色=掌握状态）；初始化时不展示 */}
                        {!initialEdit && (
                        <div className="flex flex-col gap-2 max-w-3xl">
                          <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">知识图谱</p>
                          <KnowledgeTree treeDocs={data?.treeDocs || []} progressItems={data?.progress.items || []} />
                        </div>
                        )}

                        {/* 进度：里程碑时间线；初始化时不展示 */}
                        {!initialEdit && (
                        <div className="flex flex-col gap-2 max-w-3xl">
                          <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">进度</p>
                              <button onClick={() => setMsNode({ mode: 'new' })}
                                className="px-2.5 py-1 rounded-lg border hairline text-[10px] text-dim hover:bg-[var(--bg-hover)] transition-colors">＋ 新增节点</button>
                            </div>
                            {(() => {
                              const pct = pctOf(data?.fields || {}, data?.count || 0)
                              const ms = buildMilestones(data)
                              // 节点掌握度：与知识图谱同源匹配（名与知识点/难点双向包含）
                              const masteryOf = (label: string) => {
                                const hit = (data?.progress.items || []).find((it: any) => it.name && label && (label.includes(it.name) || it.name.includes(label)))
                                return hit ? (hit.retrievability || 0) : null
                              }
                              return (
                                <>
                                  {/* 加宽进度条 + 节点 */}
                                  <div className="relative pt-4 pb-7">
                                    <div className="relative h-4 rounded-full bg-[#ececec]">
                                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct + '%', background: 'var(--accent)', opacity: 0.9 }} />
                                      {ms.map(m => {
                                        const mst = masteryOf(m.label)
                                        return (
                                        <button key={m.id} onClick={() => setMsNode(m)}
                                          title={m.label}
                                          className="absolute top-0 bottom-0 w-7 group"
                                          style={{ left: m.pos + '%', transform: 'translateX(-50%)' }}>
                                          {/* 圆点：按钮宽=圆点宽，水平中心=pos%；垂直 top-1/2 居中于条中线 */}
                                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full shadow transition-transform group-hover:scale-110"
                                            style={{ background: nodeFill(m, mst), border: '3px solid ' + nodeBorder(m, mst) }}>
                                            {m.important && <span className="absolute -top-3 -right-2.5 text-[10px] leading-none text-amber-500">★</span>}
                                          </span>
                                          {/* 小三角：提示可点击查看内容（挂在圆点正下方，与圆点同中心） */}
                                          <span className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent"
                                            style={{ top: 'calc(50% + 17px)', borderBottomColor: nodeFill(m, mst) }} />
                                          {m.type !== 'start' && m.type !== 'current' && m.type !== 'goal' && (
                                            <span className="absolute left-1/2 -translate-x-1/2 max-w-[56px] truncate text-[9px] text-dim group-hover:text-[var(--text)]"
                                              style={{ top: 'calc(50% + 22px)' }}>{m.label}</span>
                                          )}
                                        </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </>
                              )
                            })()}
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
                修改记忆
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 里程碑节点弹层：查看内容 / 标注重要 / 删除 / 新增 */}
      {msNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setMsNode(null)}>
          <div className="card-lift rounded-2xl p-5 w-[340px] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            {'mode' in msNode ? (
              <NewMilestoneForm
                onCancel={() => setMsNode(null)}
                onAdd={(label, detail, pos) => {
                  const data = projData[activeProject || '']
                  const base = buildMilestones(data)
                  const next = [...base, { id: 'c-' + Date.now(), label, detail, type: 'custom' as MilestoneType, pos, important: false }]
                  setProjData(prev => ({ ...prev, [activeProject || '']: { ...prev[activeProject || ''], fields: { ...prev[activeProject || '']?.fields, 里程碑: JSON.stringify(next) } } }))
scheduleSave(() => api.saveProjectMemory(activeProject || 'default', { 里程碑: next }))
                  setMsNode(null)
                }}
              />
            ) : (() => {
              const m = msNode as Milestone
              const fixed = m.type === 'start' || m.type === 'current' || m.type === 'goal'
              const typeName = { start: '起点', current: '当前', goal: '目标', system: '系统预分析', custom: '自定义' }[m.type]
              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold truncate">{m.label}</span>
                    <span className="text-[10px] text-dim flex-shrink-0">{typeName}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] leading-relaxed min-h-[40px] whitespace-pre-wrap">
                    {m.detail?.trim() ? m.detail : '（无内容）'}
                  </div>
                  {!fixed && (
                    <div className="flex flex-col gap-2 pt-2 border-t hairline">
                      <button onClick={() => {
                        const data = projData[activeProject || '']
                        const base = buildMilestones(data)
                        const next = base.map(x => x.id === m.id ? { ...x, important: !x.important } : x)
                        setProjData(prev => ({ ...prev, [activeProject || '']: { ...prev[activeProject || ''], fields: { ...prev[activeProject || '']?.fields, 里程碑: JSON.stringify(next) } } }))
scheduleSave(() => api.saveProjectMemory(activeProject || 'default', { 里程碑: next }))
                      }} className="py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)] transition-colors">
                        {m.important ? '取消重要标注' : '标注为重要节点'}
                      </button>
                      <button onClick={() => {
                        const data = projData[activeProject || '']
                        const next = buildMilestones(data).filter(x => x.id !== m.id)
                        setProjData(prev => ({ ...prev, [activeProject || '']: { ...prev[activeProject || ''], fields: { ...prev[activeProject || '']?.fields, 里程碑: JSON.stringify(next) } } }))
scheduleSave(() => api.saveProjectMemory(activeProject || 'default', { 里程碑: next }))
                        setMsNode(null)
                      }} className="py-2 rounded-xl bg-red-50 text-red-600 text-[11px] hover:bg-red-100 transition-colors">删除该节点</button>
                    </div>
                  )}
                  <button onClick={() => setMsNode(null)} className="py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-medium">关闭</button>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

/** 新增里程碑节点表单 */
function NewMilestoneForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (label: string, detail: string, pos: number) => void }) {
  const [label, setLabel] = useState('')
  const [detail, setDetail] = useState('')
  const [pos, setPos] = useState(50)
  return (
    <>
      <p className="text-sm font-bold">新增节点</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="节点名称"
        className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none bg-[var(--bg-input)]" autoFocus />
      <textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="节点内容（点击节点时查看）" rows={3}
        className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none resize-none bg-[var(--bg-input)]" />
      <div className="flex items-center gap-2 text-[11px] text-dim">
        <span className="flex-shrink-0">位置</span>
        <input type="range" min="0" max="100" value={pos} onChange={e => setPos(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
        <span className="w-8 text-right font-semibold">{pos}%</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)]">取消</button>
        <button onClick={() => label.trim() && onAdd(label.trim(), detail.trim(), pos)}
          className="flex-1 py-2 rounded-xl bg-[#1a1a1a] text-white text-[11px] font-medium">添加</button>
      </div>
    </>
  )
}
