// F11-S3：子代理行式五要素（状态/类型/标题/耗时/token）+ 可展开输出流——纯函数守卫。
// RunRow 组件的展示逻辑全部抽为导出纯函数（CONVENTIONS §1），LiveStrip 与
// SubAgentPage 共用同一行组件；subagent_runs schema 不改（只读原语）。
import { describe, expect, it } from 'vitest'
import {
  statusIcon, formatElapsed, estimateTokens, toRowData, formatEventLines,
} from './RunRow'
import type { RunLive } from '../../../stores/subagentStore'
import type { SubAgentRun } from '../../../types'

describe('F11-S3：statusIcon 状态图标映射', () => {
  it('running 旋转 / ok 完成 / error 异常 / 未知兜底', () => {
    expect(statusIcon('running')).toBe('⟳')
    expect(statusIcon('ok')).toBe('✓')
    expect(statusIcon('error')).toBe('⚠')
    expect(statusIcon(undefined as unknown as 'ok')).toBe('⚠')
  })
})

describe('F11-S3：formatElapsed 耗时格式化', () => {
  it('毫秒 → 秒（<60s 保留 1 位小数）', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(1500)).toBe('1.5s')
    expect(formatElapsed(59900)).toBe('59.9s')
  })
  it('≥60s → 分秒', () => {
    expect(formatElapsed(65000)).toBe('1m05s')
    expect(formatElapsed(125000)).toBe('2m05s')
  })
  it('null/负数 → 空串（无时刻不硬造）', () => {
    expect(formatElapsed(null)).toBe('')
    expect(formatElapsed(-5)).toBe('')
  })
})

describe('F11-S3：estimateTokens 产出 token 估算', () => {
  it('中文字符按 1:1 保守上界折算', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('报告内容三字')).toBe(6)
  })
})

describe('F11-S3：toRowData 双数据源归一（live / 档案）', () => {
  it('档案：created_at/finished_at 差值 → 耗时 ms；tokens 按 output 估算', () => {
    const arch: SubAgentRun = {
      id: 'r1', project_id: 'p', dialogue_id: 'd', agent: '知识库管理',
      title: '🛰 检索观察窗', input: '整理检索结果', status: 'ok', output: '终稿报告',
      events: [], created_at: '2026-08-31 10:00:00', finished_at: '2026-08-31 10:00:05',
    }
    const row = toRowData(arch)
    expect(row.status).toBe('ok')
    expect(row.agent).toBe('知识库管理')
    expect(row.title).toContain('检索观察窗')
    expect(row.elapsedMs).toBe(5000)
    expect(row.tokens).toBe(4)
  })

  it('档案 running（finished_at=null）→ 耗时 null', () => {
    const arch = { ...({} as SubAgentRun), id: 'r2', agent: '搜索增强', title: 't',
      status: 'running' as const, output: '', events: [],
      created_at: '2026-08-31 10:00:00', finished_at: null }
    expect(toRowData(arch).elapsedMs).toBeNull()
  })

  it('live：end 后 elapsedMs 有值；running 时 startedAt 供行内实时计时', () => {
    const live: RunLive = {
      runId: 'r3', agent: '知识库管理', title: '观察窗', input: '整理',
      status: 'running', summary: '',
      events: [{ event: 'delta', text: 'abc' }],
    }
    const running = toRowData(live)
    expect(running.status).toBe('running')
    expect(running.elapsedMs).toBeNull()
    expect(running.tokens).toBe(3)
    const ended: RunLive = { ...live, status: 'ok', elapsedMs: 4200 }
    const row = toRowData(ended)
    expect(row.elapsedMs).toBe(4200)
  })
})

describe('F11-S3：formatEventLines 输出流行化（展开可见）', () => {
  it('混合事件 → 行数组：input/delta/end 各一行，内容与终态可辨', () => {
    const lines = formatEventLines([
      { event: 'start', t: '2026-08-31 10:00:01' },
      { event: 'input', t: '2026-08-31 10:00:01', content: '整理检索结果' },
      { event: 'delta', t: '2026-08-31 10:00:03', text: '来源A→观点B' },
      { event: 'end', t: '2026-08-31 10:00:05', status: 'ok', summary: '候选 9 → 留存 2' },
    ])
    expect(lines.length).toBe(4)
    expect(lines[1]).toContain('整理检索结果')
    expect(lines[2]).toContain('来源A→观点B')
    expect(lines[3]).toContain('留存 2')
    expect(lines[3]).toContain('ok')
  })

  it('live 事件（无 t 字段）→ 行内容不丢', () => {
    const lines = formatEventLines([{ event: 'delta', text: '片段X' }])
    expect(lines[0]).toContain('片段X')
  })
})
