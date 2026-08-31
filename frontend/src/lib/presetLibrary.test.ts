import { describe, expect, it } from 'vitest'
import {
  mergeDomains, groupByDomain, firstPresetDomain, presetSummary, presetDetailBody, presetMetaLine,
} from './presetLibrary'
import type { PresetDomain, PresetResource } from '../api'

/** F13-S1 守卫：预设资源库数据驱动的纯逻辑——领域合并去重、映射、自动跳转、摘要文案 */

const mkRes = (over: Partial<PresetResource> & { id: string }): PresetResource => ({
  name: over.id, files: [], publisher: '', pub_year: '', cover: '', ...over,
})

describe('mergeDomains 领域合并', () => {
  it('默认在前、预设去重、自定义殿后', () => {
    expect(mergeDomains(['A', 'B'], ['B', 'C'], ['C', 'D'])).toEqual(['A', 'B', 'C', 'D'])
  })
  it('空段与空名安全', () => {
    expect(mergeDomains([], [], [])).toEqual([])
    expect(mergeDomains(['A'], [], [''])).toEqual(['A'])
  })
})

describe('groupByDomain 清单映射', () => {
  it('领域名→资源数组直取', () => {
    const r = mkRes({ id: 'r1' })
    const domains: PresetDomain[] = [{ name: '线性代数', resources: [r] }, { name: '空领域', resources: [] }]
    expect(groupByDomain(domains)['线性代数']).toEqual([r])
    expect(groupByDomain(domains)['空领域']).toEqual([])
  })
})

describe('firstPresetDomain 自动跳转', () => {
  it('跳过无资源领域，取第一个有资源的', () => {
    const by = { A: [], B: [mkRes({ id: 'b1' })] }
    expect(firstPresetDomain(['A', 'B', 'C'], by)).toBe('B')
  })
  it('全空返回 null', () => {
    expect(firstPresetDomain(['A'], { A: [] })).toBeNull()
  })
})

describe('presetSummary 摘要', () => {
  it('多文件显示文件数', () => {
    const res = mkRes({ id: 'x', files: [
      { name: 'a.pdf', rel_path: 'd/a.pdf', ext: 'pdf', size: 1, pages: 10, url: '' },
      { name: 'b.pdf', rel_path: 'd/b.pdf', ext: 'pdf', size: 1, pages: 20, url: '' },
    ] })
    expect(presetSummary(res)).toBe('2 个文件')
  })
  it('单文件显示页数；md 无页数留空', () => {
    const pdf = mkRes({ id: 'x', files: [
      { name: 'a.pdf', rel_path: 'd/a.pdf', ext: 'pdf', size: 1, pages: 82, url: '' },
    ] })
    expect(presetSummary(pdf)).toBe('82 页')
    const md = mkRes({ id: 'y', files: [
      { name: 'a.md', rel_path: 'd/a.md', ext: 'md', size: 1, pages: null, url: '' },
    ] })
    expect(presetSummary(md)).toBe('')
  })
})

describe('presetMetaLine 大卡片元数据行', () => {
  it('页数·出版社·初版时间齐全时全拼', () => {
    const res = mkRes({ id: 'x', publisher: '清华出版社', pub_year: '2025', files: [
      { name: 'a.pdf', rel_path: 'd/a.pdf', ext: 'pdf', size: 1, pages: 82, url: '' },
    ] })
    expect(presetMetaLine(res)).toBe('82 页 · 清华出版社 · 2025')
  })
  it('多文件显示文件数，缺省项不拼', () => {
    const res = mkRes({ id: 'x', files: [
      { name: 'a.pdf', rel_path: 'd/a.pdf', ext: 'pdf', size: 1, pages: null, url: '' },
      { name: 'b.md', rel_path: 'd/b.md', ext: 'md', size: 1, pages: null, url: '' },
    ] })
    expect(presetMetaLine(res)).toBe('2 个文件')
    expect(presetMetaLine(mkRes({ id: 'y', files: [] }))).toBe('')
  })
})

describe('presetDetailBody 详情文案', () => {
  it('占位元数据缺省项不显示，文件清单恒列', () => {
    const res = mkRes({ id: 'x', publisher: '清华出版社', pub_year: '2025', files: [
      { name: '讲义.pdf', rel_path: 'd/讲义.pdf', ext: 'pdf', size: 1, pages: 82, url: '' },
    ] })
    const body = presetDetailBody(res)
    expect(body).toContain('出版社：清华出版社')
    expect(body).toContain('初版时间：2025')
    expect(body).toContain('页数：82')
    expect(body).toContain('- 讲义.pdf')
  })
  it('全占位空资源仅列文件', () => {
    const res = mkRes({ id: 'x', files: [
      { name: 'a.md', rel_path: 'd/a.md', ext: 'md', size: 1, pages: null, url: '' },
    ] })
    expect(presetDetailBody(res).trim()).toBe('- a.md')
  })
})
