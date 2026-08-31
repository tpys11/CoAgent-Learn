/**
 * F9-S2 留存范围纯逻辑测试：树拍平 / include 清单去重（子树语义） / 仅保留正文。
 */
import { describe, expect, it } from 'vitest'
import { bodyOnlySelection, buildIncludeList, flattenOutline, type ScopeNode } from './RetentionScopePanel'

const TREE: ScopeNode[] = [
  { name: '第1章 力学', category: '正文', children: [{ name: '1.1 牛顿定律' }] },
  { name: '第2章 习题', category: '习题', children: [{ name: '2.1 习题一' }] },
  { name: '本章小结', category: '小结' },
]

describe('flattenOutline', () => {
  it('拍平保序并带深度与 "/" 路径', () => {
    const flat = flattenOutline(TREE)
    expect(flat.map(s => s.path)).toEqual([
      '第1章 力学', '第1章 力学/1.1 牛顿定律', '第2章 习题', '第2章 习题/2.1 习题一', '本章小结',
    ])
    expect(flat[1].depth).toBe(1)
    expect(flat[3].category).toBe('正文') // 未标注视作正文
    expect(flat[0].hasKids).toBe(true)
    expect(flat[4].hasKids).toBe(false)
  })
  it('空树/脏节点安全', () => {
    expect(flattenOutline([])).toEqual([])
    expect(flattenOutline([{ name: '' } as any, { name: '有效' }])).toHaveLength(1)
  })
})

describe('buildIncludeList', () => {
  const flat = flattenOutline(TREE)
  it('勾父含子：父勾选时子孙不重复列出（后端子树语义）', () => {
    const inc = buildIncludeList(flat, new Set(['第1章 力学', '第1章 力学/1.1 牛顿定律', '本章小结']))
    expect(inc).toEqual(['第1章 力学', '本章小结'])
  })
  it('仅勾子：单列子路径', () => {
    const inc = buildIncludeList(flat, new Set(['第2章 习题/2.1 习题一']))
    expect(inc).toEqual(['第2章 习题/2.1 习题一'])
  })
})

describe('bodyOnlySelection', () => {
  it('非正文根及其子孙不勾', () => {
    const flat = flattenOutline(TREE)
    const sel = bodyOnlySelection(flat)
    expect(sel.has('第1章 力学')).toBe(true)
    expect(sel.has('第1章 力学/1.1 牛顿定律')).toBe(true)
    expect(sel.has('第2章 习题')).toBe(false)
    expect(sel.has('第2章 习题/2.1 习题一')).toBe(false) // 习题父下的正文默认子被连带排除
    expect(sel.has('本章小结')).toBe(false)
  })
})
