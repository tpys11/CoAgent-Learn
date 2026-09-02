/**
 * F11-S3：子代理行式组件（OpenCode 会话行风格）——LiveStrip 与 SubAgentPage 共用同一行。
 * 行式五要素：状态图标（running 旋转 / ok ✓ / error ⚠）+ agent 类型 + 任务标题 + 耗时 + token 用量（估算）；
 * 点击展开实时输出流（events 行化）；↗ 按钮保留原「打开只读运行窗口」入口。
 * 展示逻辑全部抽为导出纯函数（subagentRunRow.test.ts 直调）；subagent_runs schema 不改（只读原语）。
 */
import { useEffect, useState } from 'react'
import type { SubAgentRun } from '../../../types'
import type { RunLive, HitBlock } from '../../../stores/subagentStore'
import { HitBlocks } from './HitBlocks'

export interface RunRowEvent {
  event: string
  t?: string
  content?: string
  text?: string
  status?: string
  summary?: string
  /** RC2-S3：hits 事件载荷（终筛留存命中内容块） */
  hits?: HitBlock[]
}

export interface RunRowData {
  status: 'running' | 'ok' | 'error'
  agent: string
  title: string
  /** 终态耗时（end 后由 store 冻结 / 档案由 finished_at-created_at 计算）；null=无时刻 */
  elapsedMs: number | null
  /** running 且有 startedAt → 行内每秒实时计时；end 后以 elapsedMs 为准 */
  startedAt: number | null
  tokens: number
  events: RunRowEvent[]
  /** RC2-S3：终筛留存命中块（观察窗展开区渲染卡片；live/档案双源归一） */
  hits?: HitBlock[]
}

export const statusIcon = (s?: 'running' | 'ok' | 'error'): string =>
  s === 'running' ? '⟳' : s === 'ok' ? '✓' : '⚠'

export const formatElapsed = (ms: number | null): string => {
  if (ms === null || ms < 0) return ''
  const s = ms / 1000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const m = Math.floor(s / 60)
  return `${m}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}

/** 产出 token 估算：中文字符 1:1 保守上界。subagent_runs 无 usage 字段（schema 禁改），
 *  行内以 ≈ 标注为估算口径——不做伪精确。 */
export const estimateTokens = (text: string): number => (text || '').length

const _eventsText = (events: RunRowEvent[]): string =>
  (events || []).map(e => `${e.text || ''}${e.content || ''}${e.summary || ''}`).join('')

/** RC2-S3：档案 events 的 hits 载荷字段级归一（repo 原样 JSON，结构不可信须逐字段窄化） */
const _normHits = (raw: unknown): HitBlock[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const out: HitBlock[] = []
  for (const b of raw) {
    if (typeof b !== 'object' || b === null) continue
    const o = b as Record<string, unknown>
    out.push({
      title: typeof o.title === 'string' ? o.title : '',
      source: typeof o.source === 'string' ? o.source : '',
      content: typeof o.content === 'string' ? o.content : '',
    })
  }
  return out
}

/** 档案 events 元素是 Record<string, unknown>（repo 原样 JSON）——字段级显式归一，避免类型断言。
 * RC2-S3：事件种类键兼容双形态——live 帧为 event，档案 JSON 为 type（append_event 落库原样），
 * 兜底读取使档案行展开区标签/命中块归一与 live 同构。 */
const _normalizeEvent = (e: Record<string, unknown>): RunRowEvent => ({
  event: String(e.event ?? e.type ?? ''),
  t: typeof e.t === 'string' ? e.t : undefined,
  content: typeof e.content === 'string' ? e.content : undefined,
  text: typeof e.text === 'string' ? e.text : undefined,
  status: typeof e.status === 'string' ? e.status : undefined,
  summary: typeof e.summary === 'string' ? e.summary : undefined,
  hits: _normHits(e.hits),
})

/** RC2-S3：事件列表 → 命中块（首个含载荷的 hits 事件；live/档案共用） */
const _hitsOf = (events: RunRowEvent[]): HitBlock[] | undefined => {
  const hitEvent = (events || []).find(e => e.event === 'hits' && Array.isArray(e.hits))
  return hitEvent?.hits
}

/** 双数据源归一：live（RunLive）与档案（SubAgentRun）→ 同一行数据。 */
export const toRowData = (src: RunLive | SubAgentRun): RunRowData => {
  if ('runId' in src) {
    return {
      status: src.status,
      agent: src.agent,
      title: src.title || src.input.slice(0, 24) || '子agent',
      elapsedMs: src.elapsedMs ?? null,
      startedAt: src.startedAt ?? null,
      tokens: estimateTokens(_eventsText(src.events)),
      events: src.events || [],
      hits: src.hits?.length ? src.hits : _hitsOf(src.events || []),
    }
  }
  // 档案：SQLite CURRENT_TIMESTAMP 为 UTC 且无时区后缀——两端同源相减，差值与本地偏移无关
  const created = Date.parse((src.created_at || '').replace(' ', 'T'))
  const finished = src.finished_at ? Date.parse(src.finished_at.replace(' ', 'T')) : null
  const elapsedMs = created && finished && finished >= created ? finished - created : null
  const events = (src.events || []).map(_normalizeEvent)
  return {
    status: src.status,
    agent: src.agent,
    title: src.title || '子agent',
    elapsedMs,
    startedAt: null,
    tokens: estimateTokens(src.output || ''),
    events,
    hits: _hitsOf(events),
  }
}

/** 输出流行化：events → 行文本数组（展开区逐行渲染）。有 t 显示时刻，无则省略。
 * RC2-S3：hits 事件返回空串（结构化命中块由 HitBlocks 卡片渲染，避免文本重复）。 */
export const formatEventLines = (events: RunRowEvent[]): string[] =>
  (events || []).map(e => {
    const prefix = e.t ? `[${e.t}] ` : ''
    if (e.event === 'input') return `${prefix}指令：${e.content || ''}`
    if (e.event === 'delta') return `${prefix}${e.text || ''}`
    if (e.event === 'end') return `${prefix}结束 · ${e.status || ''}${e.summary ? ` · ${e.summary}` : ''}`
    if (e.event === 'start') return `${prefix}启动`
    if (e.event === 'hits') return ''
    return `${prefix}${e.event}`
  })

/** 行组件：点击行主体 = 展开/收起输出流；↗ = 打开只读运行窗口（保留 open-subagent 机制）。 */
export function SubAgentRunRow({ data, onOpen }: { data: RunRowData; onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)
  const live = data.status === 'running' && data.startedAt !== null
  useEffect(() => {
    if (!live) return
    // running 行每秒重算已运行时长（end 后 elapsedMs 冻结，interval 卸载）
    const id = window.setInterval(() => setTick(t => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [live])
  const elapsedMs = data.elapsedMs
    ?? (live && data.startedAt ? Date.now() - data.startedAt : null)
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5 text-[11px] leading-6 min-w-0">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity">
          <span className={`flex-shrink-0 ${data.status === 'running' ? 'inline-block animate-spin' : ''}`}>
            {statusIcon(data.status)}
          </span>
          <span className="flex-shrink-0 text-dim">{data.agent || '子agent'}</span>
          <span className="truncate text-[var(--text)]">{data.title}</span>
          <span className="flex-shrink-0 text-dim">
            {elapsedMs !== null ? formatElapsed(elapsedMs) : (data.status === 'running' ? '…' : '')}
          </span>
          <span className="flex-shrink-0 text-dim">≈{data.tokens} tok</span>
          <span className="flex-shrink-0 text-[9px]">{open ? '▾' : '▸'}</span>
        </button>
        {onOpen && (
          <button onClick={onOpen} title="打开只读运行窗口"
            className="flex-shrink-0 text-[10px] px-1.5 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors">↗</button>
        )}
      </div>
      {open && (
        <div className="mt-0.5 mb-1 ml-4 pl-2 border-l hairline flex flex-col gap-0.5">
          {/* RC2-S3：终筛留存命中内容块卡片（title+source+内容，点击展开；与思维链面共用） */}
          <HitBlocks hits={data.hits} />
          {formatEventLines(data.events).filter(l => l).map((ln, i) => (
            <div key={i} className="text-[10px] leading-5 text-dim whitespace-pre-wrap break-words">{ln}</div>
          ))}
        </div>
      )}
    </div>
  )
}
