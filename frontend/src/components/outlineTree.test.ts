/**
 * F9-S4 统一大纲树纯逻辑测试：拍平/路径连接/默认展开集/分类徽章。
 */
import { describe, expect, it } from 'vitest'
import { categoryBadgeClass, flattenOutlineRows, initialExpandedPaths, nodePath, type OutlineNode } from './OutlineTree'

const TREE: OutlineNode[] = [
  { name: '第1章 力学', id: 'a1', page: 1, category: '正文', children: [
    { name: '1.1 牛顿定律', id: 'a2', page: 2 },
    { name: '1.2 习题课', id: 'a3', category: '习题' },
  ] },
  { name: '本章小结', id: 'b1', page: 9, category: '小结' },
]

describe('nodePath', () => {
  it('根路径无前缀，子孙用 / 连接', () => {
    expect(nodePath('', '第1章')).toBe('第1章')
    expect(nodePath('第1章', '1.1')).toBe('第1章/1.1')
  })
})

describe('flattenOutlineRows', () => {
  it('先序拍平，保留分类/页码/子节点标记', () => {
    const rows = flattenOutlineRows(TREE)
    expect(rows.map(r => r.path)).toEqual([
      '第1章 力学', '第1章 力学/1.1 牛顿定律', '第1章 力学/1.2 习题课', '本章小结',
    ])
    expect(rows[0]).toMatchObject({ hasKids: true, page: 1, category: '正文' })
    expect(rows[2]).toMatchObject({ category: '习题', hasKids: false })
    expect(rows[1].depth).toBe(1)
  })
  it('空树与脏节点安全', () => {
    expect(flattenOutlineRows([])).toEqual([])
    expect(flattenOutlineRows([{ name: '' } as any, { name: '有效' }])).toHaveLength(1)
  })
})

describe('initialExpandedPaths', () => {
  it('maxDepth=1 只展开章级；0 全收起', () => {
    const rows = flattenOutlineRows(TREE)
    expect(initialExpandedPaths(rows, 1)).toEqual(new Set(['第1章 力学']))
    expect(initialExpandedPaths(rows, 0)).toEqual(new Set())
  })
  it('maxDepth=2 展开到节级', () => {
    const rows = flattenOutlineRows(TREE)
    expect(initialExpandedPaths(rows, 2)).toEqual(new Set(['第1章 力学']))
    // 1.1/1.2 无子节点不进展开集——加一个带孙节的用例验证深度语义
    const deep = flattenOutlineRows([
      { name: 'A', children: [{ name: 'A1', children: [{ name: 'A1a' }] }] },
    ])
    expect(initialExpandedPaths(deep, 2)).toEqual(new Set(['A', 'A/A1']))
  })
})

describe('categoryBadgeClass', () => {
  it('五类非正文各自配色；正文/未标注中性', () => {
    expect(categoryBadgeClass('习题')).toBe('text-amber-600')
    expect(categoryBadgeClass('实验')).toBe('text-sky-600')
    expect(categoryBadgeClass('总测试')).toBe('text-rose-600')
    expect(categoryBadgeClass('正文')).toBe('text-dim')
    expect(categoryBadgeClass(undefined)).toBe('text-dim')
  })
})
