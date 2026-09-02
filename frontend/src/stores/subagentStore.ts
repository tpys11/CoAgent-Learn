/**
 * 条目4：子agent实时事件仓库（模块级单例，React 外置 store）。
 * useChatStream 是唯一写入点（SSE 信封事件）；显示组件经 useSyncExternalStore 订阅。
 * 不引状态库——pub/sub 满足"跨组件只读直播"；档案持久化在后端 subagent_runs 表，此处仅直播态。
 */
import type { SubAgentSse } from '../types'

/** RC2-S3：检索命中内容块（后端 _hit_blocks 载荷：title/source 均≤60、content≤240 字） */
export interface HitBlock { title: string; source: string; content: string }

/** RC2-S3：事件入参放宽——SubAgentSse 之上新增 hits 事件（观察窗命中内容块），
 * types.ts 原契约不动（additive 在本仓库层收口） */
export type SubAgentEventKind = 'start' | 'input' | 'delta' | 'end' | 'hits'
type SseIn = Omit<SubAgentSse, 'event'> & { event: SubAgentEventKind; hits?: HitBlock[] }

interface SubAgentEventItem {
  event: SubAgentEventKind
  content?: string
  text?: string
  status?: 'ok' | 'error'
  summary?: string
  /** RC2-S3：hits 事件载荷（终筛留存命中块，top5） */
  hits?: HitBlock[]
}

export interface RunLive {
  runId: string
  agent: string
  title: string
  /** 主发给子的指令（截断版，完整看档案接口） */
  input: string
  status: 'running' | 'ok' | 'error'
  summary: string
  events: SubAgentEventItem[]
  /** F11-S3：首见时刻（行式耗时实时计时的起点）；end 时换算 elapsedMs 冻结 */
  startedAt?: number
  elapsedMs?: number
  /** RC2-S3：终筛留存命中内容块（hits 事件载荷；观察窗展开区与思维链面共用渲染） */
  hits?: HitBlock[]
}

const runs = new Map<string, RunLive>()
let version = 0
const listeners = new Set<() => void>()

function touch() {
  version++
  listeners.forEach(fn => { try { fn() } catch { /* 订阅者异常不影响其余 */ } })
}

export const subagentStore = {
  /** SSE 信封事件入仓（唯一写入点）；RC2-S3 起收口为 SseIn（含 hits 事件） */
  applySse(p: SseIn) {
    let r = runs.get(p.run_id)
    if (!r) {
      r = { runId: p.run_id, agent: p.agent || '', title: p.title || '', input: '', status: 'running', summary: '', events: [], startedAt: Date.now() }
      runs.set(p.run_id, r)
    }
    if (p.event === 'start') {
      r.title = p.title || r.title
      r.agent = p.agent || r.agent
    } else if (p.event === 'input') {
      r.input = p.content || r.input
    } else if (p.event === 'hits') {
      // RC2-S3：命中内容块入直播仓（先于 end 冻结，展开区渲染卡片）
      r.hits = Array.isArray(p.hits) ? p.hits : []
    }
    if (p.event === 'end') {
      r.status = p.status || 'ok'
      r.summary = p.summary || ''
      // F11-S3：终态冻结耗时（running 行的 interval 计时随之停）
      if (r.elapsedMs === undefined && r.startedAt) r.elapsedMs = Date.now() - r.startedAt
    }
    r.events.push({ event: p.event, content: p.content, text: p.text, status: p.status, summary: p.summary, hits: p.hits })
    touch()
  },

  get(rid: string): RunLive | undefined {
    return runs.get(rid)
  },

  /** 直播条枚举：按启动顺序返回全部 run（Map 保序） */
  listAll(): RunLive[] {
    return Array.from(runs.values())
  },

  /** useSyncExternalStore 快照：版本号（数字在两次变更间恒定） */
  getVersion() {
    return version
  },

  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },

  /** 新消息发送时清空上一轮直播态（历史档案在后端，不受影响） */
  reset() {
    if (runs.size === 0) return
    runs.clear()
    touch()
  },
}

/** RC2-S3：run_ids 生产者——把本轮观察窗 run 挂到知识库管理链条目（缺省挂末条）。
 * 纯函数（返回新数组不改入参）：types MindchainItem.run_ids 既有缝自此有生产者，
 * 刷新后历史回看经 ReasoningBlock ↗ 按钮（open-subagent 事件）+ REST 档案通道。 */
export function attachRunIdsToKbEntry(
  chain: Array<{ agent: string; content: string; run_ids?: string[] }>,
  runIds: string[],
): Array<{ agent: string; content: string; run_ids?: string[] }> {
  if (!runIds.length || chain.length === 0) return chain
  const kbIdx = chain.findIndex(it => it.agent === '知识库管理')
  const idx = kbIdx >= 0 ? kbIdx : chain.length - 1
  const target = chain[idx]
  const next = chain.slice()
  next[idx] = { ...target, run_ids: Array.from(new Set([...(target.run_ids || []), ...runIds])) }
  return next
}
