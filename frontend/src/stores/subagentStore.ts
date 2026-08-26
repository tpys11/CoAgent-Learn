/**
 * 条目4：子agent实时事件仓库（模块级单例，React 外置 store）。
 * useChatStream 是唯一写入点（SSE 信封事件）；显示组件经 useSyncExternalStore 订阅。
 * 不引状态库——pub/sub 满足"跨组件只读直播"；档案持久化在后端 subagent_runs 表，此处仅直播态。
 */
import type { SubAgentSse } from '../types'

export interface SubAgentEventItem {
  event: 'start' | 'input' | 'delta' | 'end'
  content?: string
  text?: string
  status?: 'ok' | 'error'
  summary?: string
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
}

const runs = new Map<string, RunLive>()
let version = 0
const listeners = new Set<() => void>()

function touch() {
  version++
  listeners.forEach(fn => { try { fn() } catch { /* 订阅者异常不影响其余 */ } })
}

export const subagentStore = {
  /** SSE 信封事件入仓（唯一写入点） */
  applySse(p: SubAgentSse) {
    let r = runs.get(p.run_id)
    if (!r) {
      r = { runId: p.run_id, agent: p.agent || '', title: p.title || '', input: '', status: 'running', summary: '', events: [] }
      runs.set(p.run_id, r)
    }
    if (p.event === 'start') {
      r.title = p.title || r.title
      r.agent = p.agent || r.agent
    } else if (p.event === 'input') {
      r.input = p.content || r.input
    }
    if (p.event === 'end') {
      r.status = p.status || 'ok'
      r.summary = p.summary || ''
    }
    r.events.push({ event: p.event, content: p.content, text: p.text, status: p.status, summary: p.summary })
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
