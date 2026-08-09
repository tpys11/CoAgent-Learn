import { useState, useEffect, useRef, useMemo } from 'react'
import { Brain, User, FolderTree, Check, Loader2, PenLine, ChevronRight, ChevronDown } from 'lucide-react'

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
  const level = (c: number) => c <= 0 ? '#f2f2f2' : c <= 2 ? `color-mix(in srgb, var(--accent) 22%, white)` : c <= 5 ? `color-mix(in srgb, var(--accent) 45%, white)` : c <= 9 ? `color-mix(in srgb, var(--accent) 70%, white)` : `color-mix(in srgb, var(--accent) 95%, white)`
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
            className={`h-8 rounded-lg text-[10px] flex items-center justify-center transition-colors ${data[c.date] ? 'font-medium text-white' : 'text-dim'} ${c.date === today ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
            style={data[c.date] ? { background: level(data[c.date] || 0) } : undefined}>
            {c.day}
          </button>
        ) : <span key={i} />)}
      </div>
    </div>
  )
}

/** 知识图谱（树）：复用上传资料自身的标题层级；节点颜色 = 基于对话估计的掌握状态
 *  绿=掌握良好(≥0.9) 黄=一般(≥0.7) 红=薄弱/待复习；未提及节点灰色 */
function TreeNodeRow({ node, colorOf, depth, defaultOpen }: { node: any; colorOf: (name: string) => string; depth: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen || depth < 1)
  const hasKids = (node.children || []).length > 0
  const c = colorOf(node.name || '')
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 py-0.5 min-h-[22px]" style={{ paddingLeft: depth * 16 }}>
        {hasKids ? (
          <button onClick={() => setOpen(!open)} className="flex-shrink-0 text-dim hover:text-[var(--text)]">
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : <span className="w-[11px] flex-shrink-0" />}
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }} />
        <span className="text-[11px] leading-snug truncate" style={{ color: c === 'var(--text-dim)' ? 'var(--text-muted)' : 'var(--text)' }}>{node.name}</span>
      </div>
      {hasKids && open && (
        <div className="flex flex-col">
          {(node.children || []).map((kid: any, i: number) => (
            <TreeNodeRow key={i} node={kid} colorOf={colorOf} depth={depth + 1} defaultOpen={defaultOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function KnowledgeTree({ treeDocs, progressItems }: { treeDocs: Array<{ source: string; tree: any[] }>; progressItems: any[] }) {
  // 掌握度颜色：节点名与知识点/难点名双向包含匹配；掌握越好颜色越深（主题色深浅），未提及灰色
  const colorOf = (name: string) => {
    const hit = (progressItems || []).find((it: any) => it.name && name && (name.includes(it.name) || it.name.includes(name)))
    if (!hit) return 'var(--text-dim)'
    const r = hit.retrievability || 0
    return `color-mix(in srgb, var(--accent) ${Math.round(30 + r * 70)}%, var(--bg-panel))`
  }
  const hasAny = (treeDocs || []).some(d => (d.tree || []).length > 0)
  if (!hasAny) {
    // 空态：小空树占位（将来保存树状图的位置）
    return (
      <div className="min-h-[120px] border border-dashed hairline rounded-xl p-4 flex items-center justify-center gap-4">
        <svg width="90" height="70" viewBox="0 0 90 70" fill="none">
          <circle cx="45" cy="12" r="7" stroke="#d4d4d4" strokeDasharray="3 3" />
          <path d="M45 19 V30 M45 30 H12 V44 M45 30 H78 V44" stroke="#d4d4d4" strokeDasharray="3 3" />
          <rect x="4" y="44" width="16" height="12" rx="3" stroke="#d4d4d4" strokeDasharray="3 3" />
          <rect x="70" y="44" width="16" height="12" rx="3" stroke="#d4d4d4" strokeDasharray="3 3" />
          <circle cx="45" cy="50" r="6" stroke="#d4d4d4" strokeDasharray="3 3" />
        </svg>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {(treeDocs || []).map(d => (
        <div key={d.source} className="border hairline rounded-xl px-3 py-2 bg-[var(--bg-input)] flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-dim mb-0.5">
            <FolderTree size={11} /> {d.source}
          </div>
          {(d.tree || []).map((n: any, i: number) => (
            <TreeNodeRow key={i} node={n} colorOf={colorOf} depth={0} defaultOpen={false} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 时间折线图：纵轴 = 当日内容量（对话产出条数）。支持拖拽左右平移时间窗口、滚轮缩放时间跨度。 */
function TimeLineChart({ days, height = 90 }: { days: Record<string, any[]>; height?: number }) {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // 全量日期序列：最早有记录日 → 今天
  const allDates = useMemo(() => {
    const ks = Object.keys(days || {})
    const min = ks.length ? ks.slice().sort()[0] : key(new Date())
    const out: string[] = []
    const cur = new Date(min + 'T00:00:00')
    const today = new Date()
    while (key(cur) <= key(today)) {
      out.push(key(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [days])
  const total = allDates.length
  // 时间窗口：center（日期索引）+ span（天数）
  const [center, setCenter] = useState(total - 1)
  const [span, setSpan] = useState(14)
  useEffect(() => { setCenter(total - 1); setSpan(Math.min(14, total)) }, [total])
  const clampCenter = (c: number) => Math.min(Math.max(c, Math.floor(span / 2)), Math.max(Math.floor(span / 2), total - 1 - Math.ceil(span / 2)))
  const start = Math.min(Math.max(Math.round(center - span / 2), 0), Math.max(0, total - span))
  const end = Math.min(start + span, total)
  const seg = allDates.slice(start, end)
  const vals = seg.map(d => ((days || {})[d] || []).length)
  const max = Math.max(1, ...vals)
  const W = 100, H = 40
  const pts = vals.map((v, i) => `${(i / Math.max(1, seg.length - 1)) * W},${H - 6 - (v / max) * (H - 14)}`)
  const hasData = vals.some(v => v > 0)
  // 拖拽平移（图表）
  const dragRef = useRef<{ x: number } | null>(null)
  // 范围滑块拖拽（轨道上拉动）
  const trackRef = useRef<HTMLDivElement>(null)
  const sliderDrag = useRef<{ x: number; c0: number } | null>(null)
  const onTrackDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (e.clientX - rect.left) / rect.width
    const c = clampCenter(ratio * total)
    setCenter(c)
    sliderDrag.current = { x: e.clientX, c0: c }
  }
  const onTrackMove = (e: React.PointerEvent) => {
    if (!sliderDrag.current || !trackRef.current) return
    const w = trackRef.current.clientWidth || 1
    const days = ((e.clientX - sliderDrag.current.x) / w) * total
    setCenter(clampCenter(sliderDrag.current.c0 + days))
  }
  const onTrackUp = () => { sliderDrag.current = null }
  const onDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); dragRef.current = { x: e.clientX } }
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    dragRef.current.x = e.clientX
    const w = (e.currentTarget as Element).clientWidth || 1
    setCenter(c => clampCenter(c - Math.round((dx / w) * span)))
  }
  const onUp = () => { dragRef.current = null }
  // 滚轮伸缩（以窗口中心为锚）
  const onWheel = (e: React.WheelEvent) => {
    const next = Math.min(Math.max(span + (e.deltaY > 0 ? 4 : -4), 7), total)
    setSpan(next)
    setCenter(c => clampCenter(c))
  }
  return (
    <div className="flex flex-col gap-1.5 flex-1 select-none" style={{ touchAction: 'none' }}>
      <div className="flex items-center justify-between text-[10px] text-dim">
        <span className="font-semibold uppercase tracking-wider">内容量趋势</span>
        {hasData && <span>今日 {vals[vals.length - 1]} 条 · 峰值 {max} 条 · 显示范围 {span} 天</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-grab active:cursor-grabbing" style={{ height }}
        preserveAspectRatio="none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        onWheel={onWheel}>
        {/* 网格线 */}
        {[0.25, 0.5, 0.75].map(g => (
          <line key={g} x1="0" y1={H - (H - 14) * g - 6} x2={W} y2={H - (H - 14) * g - 6} stroke="#ececec" strokeWidth="0.3" strokeDasharray="1.5 2" />
        ))}
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="#d4d4d4" strokeWidth="0.4" />
        {hasData ? (
          <>
            <polygon points={`${pts.join(' ')} ${W},${H - 6} 0,${H - 6}`} fill="var(--accent)" opacity="0.08" />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((p, i) => (
              <circle key={i} cx={p.split(',')[0]} cy={p.split(',')[1]} r="1.3" fill={vals[i] > 0 ? 'var(--accent)' : '#d4d4d4'} />
            ))}
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="4.5" fill="#b5b5b5">暂无对话数据</text>
        )}
      </svg>
      {/* 时间显示（最早 | 今天）：位于滑块之上 */}
      <div className="flex items-center justify-between text-[9px] text-dim">
        <span>{allDates[0]?.slice(5)}</span>
        <span>今天</span>
      </div>
      {/* 范围滑块：轨道 + 可变长滑块（最左 = 最早，最右 = 今天；滑块长度 = 当前跨度比例，拖动平移） */}
      <div ref={trackRef} className="relative h-5 flex items-center select-none" style={{ touchAction: 'none' }}
        onPointerDown={onTrackDown} onPointerMove={onTrackMove} onPointerUp={onTrackUp} onPointerLeave={onTrackUp}>
        <div className="absolute left-0 right-0 h-[3px] rounded-full bg-[#e5e5e5]" />
        <div className="absolute h-3.5 rounded-md cursor-grab active:cursor-grabbing shadow transition-[width] duration-150"
          style={{ background: 'var(--accent)', left: (start / total) * 100 + '%', width: Math.max(4, (span / total) * 100) + '%' }} />
      </div>
      {/* 显示范围滑块：越往右显示范围越小（放大细节） */}
      <div className="flex items-center gap-2 text-[9px] text-dim">
        <span className="flex-shrink-0 w-14 whitespace-nowrap">显示范围</span>
        <input type="range" min={7} max={Math.max(7, total)} value={total + 7 - span}
          onChange={e => setSpan(Math.max(7, total + 7 - Number(e.target.value)))}
          className="flex-1 accent-[var(--accent)]" aria-label="显示范围" />
        <span className="w-9 text-right flex-shrink-0">{span} 天</span>
      </div>
    </div>
  )
}

export default function MemoryView({ projectId, onRequestModify, onRequestAnalyze, projectOnly }: { projectId: string | null; onRequestModify?: (label: string, pid?: string) => void; onRequestAnalyze?: (projectName: string) => void; projectOnly?: boolean }) {
  const [level, setLevel] = useState<'global' | 'project'>(projectOnly ? 'project' : 'global')
  // 项目列表
  const [projects, setProjects] = useState<Array<{ id: string; name: string; is_default?: boolean; created_at?: string }>>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId)

  // 个人全局记忆
  const [gFields, setGFields] = useState<Record<string, string>>({})
  const [gExtra, setGExtra] = useState('')
  const [gSummary, setGSummary] = useState<Record<string, any>>({}) // 项目摘要（只读）
  const [gLoading, setGLoading] = useState(false)

  // 项目记忆（全部项目，默认展开显示）
  const [projData, setProjData] = useState<Record<string, { fields: Record<string, string>; count: number; latest: string; days: Record<string, any[]>; progress: { items: any[]; daily: Array<{ date: string; count: number }>; pace: string }; treeDocs: Array<{ source: string; tree: any[] }> }>>({})
  const [projLoading, setProjLoading] = useState(false)
  // 当前查看的项目（点击项目按钮切换）
  const [activeProject, setActiveProject] = useState<string | null>(projectOnly ? projectId : null)
  // 日历数据：date → 当天对话项列表（全局）
  const [globalDays, setGlobalDays] = useState<Record<string, any[]>>({})
  const [globalStats, setGlobalStats] = useState<{ count: number; latest: string }>({ count: 0, latest: '' })
  const [dayDetail, setDayDetail] = useState<{ date: string; items: any[] } | null>(null)
  // 里程碑弹层：查看/编辑节点（null 不显示；{ mode:'new' } 为新增节点）
  const [msNode, setMsNode] = useState<Milestone | { mode: 'new' } | null>(null)
  // 项目详情页签：基本情况 | 进度与细节
  const [detailTab, setDetailTab] = useState<'base' | 'progress'>('base')
  // 修改记忆介绍弹窗
  const [showModifyTip, setShowModifyTip] = useState(false)
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
          fetch('/api/project-memory/' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/api/learning-log?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({ days: [] })),
          fetch('/api/memory/progress?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => ({ items: [], daily: [], pace: '' })),
          fetch('/api/kb/' + encodeURIComponent(pid), { cache: 'no-store' }).then(r => r.json()).catch(() => []),
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
      {/* 左侧：两级导航 + 项目列表（projectOnly 时不显示，仅项目记忆） */}
      {!projectOnly && (
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
      )}

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
                          <p className="text-[11px] text-dim">（暂无内容）</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 时间：内容量趋势 + 日历（横向排布） */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col">
                    <TimeLineChart days={globalDays} />
                  </div>
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)] flex flex-col gap-3">
                    <CalendarHeatmap
                      data={Object.fromEntries(Object.entries(globalDays).map(([d, items]) => [d, items.length]))}
                      onPick={d => setDayDetail({ date: d, items: globalDays[d] || [] })}
                    />
                    <div className="flex items-center gap-4 text-[10px] text-dim">
                      <span>累计 <b className="text-[var(--text)]">{globalStats.count}</b> 次对话</span>
                      {globalStats.latest && <span>最近学习 <b className="text-[var(--text)]">{globalStats.latest}</b></span>}
                    </div>
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

                {/* 项目摘要（只读） */}
                {Object.keys(gSummary).length > 0 && (
                  <div className="border hairline rounded-xl p-4 bg-[var(--bg-panel)]">
                    <p className={fieldLabel}>跨项目摘要</p>
                    <div className="flex flex-col gap-2">
                      {Object.entries(gSummary).map(([pid, info]: [string, any]) => (
                        <div key={pid} className="text-xs text-[var(--text-muted)] leading-relaxed">
                          <span className="font-semibold text-[var(--text)]">{pid}</span>
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
          <div className="w-full flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <FolderTree size={16} /> 项目记忆
                {projectOnly && (
                  <button onClick={() => setShowModifyTip(true)}
                    className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white shadow-soft transition-transform hover:scale-105"
                    style={{ background: 'var(--accent)' }}>修改记忆</button>
                )}
              </h2>
            </div>

            {projLoading ? <p className="text-xs text-dim text-center py-10">加载中…</p> : projects.length === 0 ? (
              <p className="text-xs text-dim text-center py-10">暂无项目</p>
            ) : (
              <>
                {/* 项目按钮：直接显示，点击查看该项目记忆（projectOnly 时固定当前项目，不显示） */}
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

                {/* 选中项目的记忆详情 */}
                {activeProject && (() => {
                  const p = projects.find(x => x.id === activeProject)
                  const data = projData[activeProject]
                  const pid = activeProject
                  return (
                    <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b hairline">
                        {!projectOnly && (
                          <>
                            <FolderTree size={14} />
                            <span className="text-sm font-bold">{p?.name || pid}</span>
                            {p?.id === projectId && <span className="text-[9px] text-dim">当前</span>}
                            <button onClick={() => setShowModifyTip(true)}
                              className="ml-2 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white shadow-soft transition-transform hover:scale-105"
                              style={{ background: 'var(--accent)' }}>修改记忆</button>
                          </>
                        )}
                        <span className="text-[10px] text-dim ml-auto">
                          {p?.created_at ? String(p.created_at).slice(0, 10) : ''}{data ? ` · ${data.count} 次对话` : ''}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-4">
                        {/* 页签：基本情况 | 进度与细节 */}
                        <div className="flex items-center gap-1">
                          {([['base', '基本情况'], ['progress', '进度与细节']] as const).map(([key, label]) => (
                            <button key={key} onClick={() => setDetailTab(key)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${detailTab === key ? 'bg-[#1a1a1a] text-white shadow-soft' : 'text-dim hover:bg-[var(--bg-hover)]'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {detailTab === 'base' && (
                          <div className="max-w-3xl">
                            {/* 基本情况：简历式竖向文档（各内容区形状/大小不同），改动由 AI 整体处理 */}
                            <div className="border hairline rounded-2xl bg-[var(--bg-panel)] overflow-hidden">
                              {/* 简历头部：大标题居中（高度缩小），创建时间/对话次数在右下角 */}
                              <div className="relative px-8 py-5 flex items-center justify-center border-b hairline" style={{ background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-panel))' }}>
                                <span className="text-xl font-bold">{p?.name || pid}</span>
                                <span className="absolute right-8 bottom-2.5 text-[11px] text-dim">
                                  {p?.created_at ? `创建于 ${String(p.created_at).slice(0, 10)}` : ''}{data ? ` · 累计 ${data.count} 次对话` : ''}
                                </span>
                              </div>
                              <div className="px-8 py-6 flex flex-col gap-7">
                                {/* 第二栏：基本情况（大框） */}
                                <section>
                                  <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>基本情况</h3>
                                  <div className="border hairline rounded-xl px-5 py-4 bg-[var(--bg-input)] min-h-[120px] text-[13px] leading-7 text-[var(--text)]">
                                    {(data?.fields['抽象项目情况'] || '').trim() ? <MiniMD text={data?.fields['抽象项目情况'] || ''} /> : null}
                                  </div>
                                </section>
                                {/* 第三栏：大框内三个横向矩形（目的 / 初始情况 / 当前情况） */}
                                <section>
                                  <div className="border hairline rounded-xl p-5 bg-[var(--bg-input)]">
                                    <div className="grid grid-cols-3 gap-4">
                                      {[['目的', '抽象目的'], ['初始情况', '起点'], ['当前情况', '当前水平']].map(([title, k]) => (
                                        <div key={k} className="rounded-xl border hairline bg-[var(--bg-panel)] px-4 py-3.5 flex flex-col gap-2 min-h-[110px]">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-dim">{title}</span>
                                          <div className="text-xs leading-relaxed text-[var(--text)] line-clamp-5">
                                            {(data?.fields[k] || '').trim() ? <MiniMD text={data?.fields[k] || ''} /> : null}
                                          </div>
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
                        )}
                        {detailTab === 'progress' && (<>
                        {/* 知识图谱：树状结构（复用资料章节层级，节点颜色=掌握状态） */}
                        <div className="flex flex-col gap-2 max-w-3xl">
                          <p className="text-[10px] font-semibold text-dim uppercase tracking-wider">知识图谱</p>
                          <KnowledgeTree treeDocs={data?.treeDocs || []} progressItems={data?.progress.items || []} />
                        </div>

                        {/* 进度：里程碑时间线 */}
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
                        {/* 时间：内容量趋势 + 日历（横向排布，占满详情宽度） */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col">
                            <TimeLineChart days={data?.days || {}} />
                          </div>
                          <div className="border hairline rounded-xl p-3 bg-[var(--bg-panel)] flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-dim uppercase tracking-wider">日历</span>
                              <span className="text-[9px] text-dim">{data?.count || 0} 次对话{data?.latest ? ` · 最近 ${data.latest}` : ''}</span>
                            </div>
                            <CalendarHeatmap
                              data={Object.fromEntries(Object.entries(data?.days || {}).map(([d, items]) => [d, items.length]))}
                              onPick={d => setDayDetail({ date: d, items: (data?.days || {})[d] || [] })}
                            />
                          </div>
                        </div>
                      </>)}
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
                修改记忆
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 修改记忆介绍弹窗 */}
      {showModifyTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModifyTip(false)}>
          <div className="card-lift rounded-2xl p-5 w-[340px] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold">修改记忆</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">进入对话界面后，AI 会重新分析该项目的对话与资料，并更新项目记忆（基本情况、知识图谱、进度等）。修改在对话中完成。</p>
            <div className="flex gap-2">
              <button onClick={() => setShowModifyTip(false)} className="flex-1 py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)] transition-colors">取消</button>
              <button onClick={() => { setShowModifyTip(false); const ap = projects.find(x => x.id === activeProject); onRequestAnalyze?.(ap?.name || activeProject || '') }}
                className="flex-1 py-2 rounded-xl text-[11px] font-medium text-white" style={{ background: 'var(--accent)' }}>进入对话</button>
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
                  scheduleSave('/api/project-memory/' + encodeURIComponent(activeProject || 'default'), { 里程碑: next })
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
                        scheduleSave('/api/project-memory/' + encodeURIComponent(activeProject || 'default'), { 里程碑: next })
                      }} className="py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)] transition-colors">
                        {m.important ? '取消重要标注' : '标注为重要节点'}
                      </button>
                      <button onClick={() => {
                        const data = projData[activeProject || '']
                        const next = buildMilestones(data).filter(x => x.id !== m.id)
                        setProjData(prev => ({ ...prev, [activeProject || '']: { ...prev[activeProject || ''], fields: { ...prev[activeProject || '']?.fields, 里程碑: JSON.stringify(next) } } }))
                        scheduleSave('/api/project-memory/' + encodeURIComponent(activeProject || 'default'), { 里程碑: next })
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
