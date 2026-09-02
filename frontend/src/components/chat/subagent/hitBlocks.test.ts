// RC2-S3：命中内容块渲染纯函数 + run_ids 生产者 + hits 事件入仓（纯逻辑直调，
// 组件 JSX 仅薄壳——CONVENTIONS §1 纯逻辑抽导出纯函数先例）。
import { describe, expect, it } from 'vitest'
import {
  splitHitSection,
  hitBlocksFromEvents,
  HIT_SECTION_MARK,
} from './HitBlocks'
import { attachRunIdsToKbEntry, subagentStore, type HitBlock } from '../../../stores/subagentStore'
import { toRowData, formatEventLines, type RunRowEvent } from './RunRow'

const block = (over: Partial<HitBlock> = {}): HitBlock =>
  ({ title: 'RAG 综述', source: '测试文档A.pdf', content: '检索增强生成是一种……', ...over })

describe('RC2-S3：splitHitSection 思维链双写 markdown → 结构化命中块', () => {
  it('标准区段：标记+编号行解析为块，head 为空', () => {
    const md = [HIT_SECTION_MARK,
      '1. **RAG 综述**（测试文档A.pdf）：检索增强生成是……',
      '2. **KB-其他**（文档B.pdf）：第二条内容'].join('\n')
    const { head, hits } = splitHitSection(md)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toEqual({ title: 'RAG 综述', source: '测试文档A.pdf', content: '检索增强生成是……' })
    expect(head).toBe('')
  })

  it('合并条目：hits 区段 + 后续「检索查询」详情行——块与 head 分离互不吞并', () => {
    const md = [HIT_SECTION_MARK,
      '1. **RAG 综述**（测试文档A.pdf）：内容……',
      '**检索查询**：`qA`、`qB`',
      '**命中预览**：1. 测试文档A.pdf #chunk-3'].join('\n')
    const { head, hits } = splitHitSection(md)
    expect(hits).toHaveLength(1)
    expect(head).toContain('检索查询')
    expect(head).toContain('命中预览')
  })

  it('空态：无标记内容原样返回（既有渲染零行为变化）', () => {
    const src = '规划要点：复杂度 standard · 思考档'
    const { head, hits } = splitHitSection(src)
    expect(hits).toHaveLength(0)
    expect(head).toBe(src)
  })

  it('流式中途：标记 + 完整首块 + 半截行——已完整块先出（流式渐进可见）', () => {
    const md = [HIT_SECTION_MARK,
      '1. **T1**（S1）：完整内容',
      '2. **T2**（S2）：半截'].join('\n')
    const { hits } = splitHitSection(md)
    expect(hits).toHaveLength(2)
    expect(hits[1].title).toBe('T2')
  })
})

describe('RC2-S3：hitBlocksFromEvents 观察窗 events → 命中块', () => {
  it('hits 事件取首个含载荷者；空态返回 []', () => {
    const evs: RunRowEvent[] = [
      { event: 'start' },
      { event: 'hits', hits: [block()] },
    ]
    expect(hitBlocksFromEvents(evs)).toHaveLength(1)
    expect(hitBlocksFromEvents([{ event: 'delta', text: '终筛留存 1 条' }])).toEqual([])
  })
})

describe('RC2-S3：attachRunIdsToKbEntry run_ids 生产者', () => {
  it('挂到知识库管理条目并去重；无该条目挂末条；空 runIds 原样返回', () => {
    const chain = [
      { agent: '学习助手·规划', content: 'a' },
      { agent: '知识库管理', content: 'b', run_ids: ['r1'] },
      { agent: '学习助手·生成', content: 'c' },
    ]
    const out = attachRunIdsToKbEntry(chain, ['r1', 'r2'])
    expect(out[1].run_ids).toEqual(['r1', 'r2'])
    expect(chain[1].run_ids).toEqual(['r1'])   // 纯函数：不改入参
    const out2 = attachRunIdsToKbEntry([{ agent: '学习助手·生成', content: 'x' }], ['r9'])
    expect(out2[0].run_ids).toEqual(['r9'])
    expect(attachRunIdsToKbEntry(chain, [])).toBe(chain)
  })
})

describe('RC2-S3：subagentStore.applySse hits 事件入仓', () => {
  it('hits 载荷进 RunLive 与 events；end 冻结后仍在（观察窗持久展示数据面）', () => {
    subagentStore.reset()
    subagentStore.applySse({ type: 'subagent', event: 'start', run_id: 'rT1', agent: '知识库管理', title: '🛰 检索观察窗' })
    subagentStore.applySse({ type: 'subagent', event: 'hits', run_id: 'rT1', hits: [block()] })
    subagentStore.applySse({ type: 'subagent', event: 'end', run_id: 'rT1', status: 'ok', summary: '候选 3 → 留存 1' })
    const run = subagentStore.get('rT1')
    expect(run?.hits).toHaveLength(1)
    expect(run?.events.map(e => e.event)).toEqual(['start', 'hits', 'end'])
    // 空态：hits 事件无载荷 → 空数组不炸
    subagentStore.applySse({ type: 'subagent', event: 'start', run_id: 'rT2' })
    subagentStore.applySse({ type: 'subagent', event: 'hits', run_id: 'rT2' })
    expect(subagentStore.get('rT2')?.hits).toEqual([])
    subagentStore.reset()
  })
})

describe('RC2-S3：toRowData / formatEventLines hits 归一', () => {
  it('live 携带 hits；档案 events 的 hits 载荷字段级归一', () => {
    const live = toRowData({
      runId: 'rL1', agent: '知识库管理', title: '🛰 检索观察窗', input: '',
      status: 'ok', summary: '', events: [{ event: 'hits', hits: [block()] }],
      startedAt: 1, elapsedMs: 5,
    })
    expect(live.hits).toHaveLength(1)
    const archive = toRowData({
      id: 'rA1', project_id: 'pX', dialogue_id: 'dX', agent: '知识库管理',
      title: '🛰 检索观察窗', input: '', status: 'ok', output: '',
      created_at: '2026-09-02 15:00:00', finished_at: '2026-09-02 15:00:05',
      events: [{ t: '2026-09-02 15:00:01', type: 'hits', hits: [{ title: 'x', source: 'y', content: 'z' }] }],
    })
    expect(archive.hits).toEqual([{ title: 'x', source: 'y', content: 'z' }])
  })

  it('formatEventLines：hits 行返回空串（卡片渲染代替文本行，避免重复）', () => {
    const lines = formatEventLines([
      { event: 'start' },
      { event: 'hits', hits: [block()] },
      { event: 'end', status: 'ok', summary: '留存 1' },
    ])
    expect(lines.filter(l => l)).toEqual(['启动', '结束 · ok · 留存 1'])
  })
})
