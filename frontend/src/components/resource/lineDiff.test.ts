import { describe, expect, it } from 'vitest'
import { lineDiff } from './lineDiff'

describe('lineDiff', () => {
  it('identical content → no added/removed', () => {
    const d = lineDiff('a\nb\nc', 'a\nb\nc')
    expect(d).not.toBeNull()
    expect(d!.added).toHaveLength(0)
    expect(d!.removed).toHaveLength(0)
    expect(d!.unchanged).toBe(3)
  })

  it('single line change → one removed + one added', () => {
    const d = lineDiff('a\n30天\nc', 'a\n45天\nc')
    expect(d!.removed).toEqual(['30天'])
    expect(d!.added).toEqual(['45天'])
    expect(d!.unchanged).toBe(2)
  })

  it('append at end → added only', () => {
    const d = lineDiff('a\nb', 'a\nb\nc')
    expect(d!.added).toEqual(['c'])
    expect(d!.removed).toHaveLength(0)
  })

  it('over maxLines → null (熔断，调用方降级为摘要提示)', () => {
    const big = Array.from({ length: 801 }, (_, i) => 'x' + i).join('\n')
    expect(lineDiff(big, big)).toBeNull()
  })
})
