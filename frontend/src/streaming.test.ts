// 闭环B·护栏：流式状态机正式单测（此前为一次性脚本，现入库常驻）
// 围栏语义参照 faa44b1 chunk直传后的正确行为；排水窗为自适应放行公式。
import { describe, expect, it } from 'vitest'
import { drainTake, feedThoughtChunk, newFenceState } from './streaming'

/** 驱动器：喂入 chunks 序列，返回外发文本与终态 */
function drive(chunks: string[]) {
  const st = newFenceState()
  let out = ''
  for (const c of chunks) feedThoughtChunk(st, c, '测试Agent', (_ag, t) => { out += t })
  return { out, state: st }
}

describe('feedThoughtChunk 围栏状态机', () => {
  it('T1 多字chunk含围栏开+代码+围栏关 → 内部隐藏、外文保序、状态归位', () => {
    const r = drive(['好的```python\nprint(1)\n```完成'])
    expect(r.out).toBe('好的完成')
    expect(r.state.inside).toBe(false)
  })

  it('T2 跨chunk拆分：反引号分散到达仍能开栏', () => {
    const r = drive(['a', '`', '`', '`secret', '```end'])
    expect(r.out).toBe('aend')
    expect(r.state.inside).toBe(false)
  })

  it('T3 行内散反引号被丢弃（历史遗留语义保持一致）', () => {
    const r = drive(['用 `x` 表示'])
    expect(r.out).toBe('用 x 表示')
  })

  it('T4 空chunk安全无外发', () => {
    const st = newFenceState()
    expect(feedThoughtChunk(st, '', 'a', () => {})).toBe(false)
    expect(feedThoughtChunk(st, 'ok', 'a', () => {})).toBe(true)
  })

  it('T5 回归对照：多字代码块若按旧实现会整体泄漏，现必须隐藏', () => {
    // faa44b1 之前的旧写法对 "```python\nx\n```done" 这类整块漏判（out 含全部原文）
    const r = drive(['```python', '\nimport os\n', '```done'])
    expect(r.out).toBe('done')
    expect(r.out).not.toContain('import')
  })

  it('T6 append 收到 agent 与每chunk合并文本；围栏内不外发', () => {
    const calls: Array<[string, string]> = []
    const st = newFenceState()
    feedThoughtChunk(st, '前```中```后', 'ag1', (ag, t) => calls.push([ag, t]))
    // 契约：每 chunk 一次性回调全部可见字符；围栏内"中"被抑制
    expect(calls).toEqual([['ag1', '前后']])
  })
})

describe('drainTake 自适应排水窗', () => {
  it('回答下限=2：小积压仍至少吐2字且不超积压', () => {
    expect(drainTake(0, 2)).toBe(0)
    expect(drainTake(1, 2)).toBe(1)
    expect(drainTake(2, 2)).toBe(2)
    expect(drainTake(7, 2)).toBe(2)
    expect(drainTake(13, 2)).toBe(3)
    expect(drainTake(120, 2)).toBe(20)
  })

  it('思维链下限=1：逐字平滑档', () => {
    expect(drainTake(1, 1)).toBe(1)
    expect(drainTake(6, 1)).toBe(1)
    expect(drainTake(60, 1)).toBe(10)
  })

  it('恒等式：返回值 ∈ [floor, backlog] 且 backlog≤floor 时取 backlog', () => {
    for (let n = 0; n <= 50; n++) {
      const t = drainTake(n, 2)
      expect(t).toBeLessThanOrEqual(n)
      expect(t).toBeGreaterThanOrEqual(Math.min(n, 2))
      expect(t).toBe(n === 0 ? 0 : Math.min(n, Math.max(2, Math.ceil(n / 6))))
    }
  })
})
