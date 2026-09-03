/**
 * F12-S2 TDD：记忆单框化数据模型——「标题→要点[]」双向兼容纯函数。
 * 红先行：本文件先于 memorySections.ts 模块存在（import 失败=红）。
 * 兼容承诺（旧数据不丢）：
 *  - 旧记忆 JSON 是异构 dict（字符串键/数组键/对象键混存），单框渲染前先转 sections；
 *  - 保存时 sectionsToMemory 以「合并覆盖」方式写回：未在单框中呈现的复杂键
 *    （进度/对话概要/里程碑等对象）原样保留，AI 链路写路径零感知。
 */
import { describe, it, expect } from 'vitest'
import { memoryToSections, sectionsToMemory, appendPoint, appendSection } from './memorySections'

describe('memoryToSections：旧记忆 dict → 标题→要点[]', () => {
  it('字符串键按换行拆为要点', () => {
    const secs = memoryToSections({ '抽象目的': '求职准备\n掌握 RAG' })
    const s = secs.find(x => x.title === '抽象目的')
    expect(s).toBeDefined()
    expect(s!.points).toEqual(['求职准备', '掌握 RAG'])
  })

  it('数组键逐项成要点（偏好/知识点等）', () => {
    const secs = memoryToSections({ '知识点': ['向量检索', 'RRF 融合'], '薄弱点': [] })
    expect(secs.find(x => x.title === '知识点')!.points).toEqual(['向量检索', 'RRF 融合'])
    expect(secs.find(x => x.title === '薄弱点')!.points).toEqual([])
  })

  it('对象键（进度/对话概要）不进单框——由专属组件渲染', () => {
    const secs = memoryToSections({ '抽象目的': '求职', '进度': { '第一章': 3 }, '对话概要': [{ dialogue_id: 'd1' }] })
    expect(secs.map(s => s.title)).not.toContain('进度')
    expect(secs.map(s => s.title)).not.toContain('对话概要')
  })

  it('未知字符串/数组键泛化纳入（AI 新增键不丢）', () => {
    const secs = memoryToSections({ '自定义维度': '甲\n乙' })
    expect(secs.find(x => x.title === '自定义维度')!.points).toEqual(['甲', '乙'])
  })

  it('空值键：未知键跳过不渲染；已知键空值仍渲染（待填位，行尾输入框可达）', () => {
    const secs = memoryToSections({ '抽象目的': '', '起点': '零基础', '其他': [], 'AI备注': '' })
    expect(secs.find(x => x.title === '抽象目的')!.points).toEqual([])
    expect(secs.find(x => x.title === '其他')!.points).toEqual([])
    expect(secs.map(s => s.title)).not.toContain('AI备注')
    expect(secs.map(s => s.title)).toContain('起点')
  })

  it('已知键按稳定排序输出（目的在前、其他在后）', () => {
    const secs = memoryToSections({ '其他': 'x', '抽象目的': 'y', '起点': 'z' })
    const titles = secs.map(s => s.title)
    expect(titles.indexOf('抽象目的')).toBeLessThan(titles.indexOf('起点'))
    expect(titles.indexOf('起点')).toBeLessThan(titles.indexOf('其他'))
  })
})

describe('sectionsToMemory：单框 → 保存 payload（合并覆盖，不丢复杂键）', () => {
  it('数组 nature 键存数组、字符串键存换行拼接', () => {
    const mem = sectionsToMemory(
      [{ title: '偏好', points: ['视频', '实战'] }, { title: '抽象目的', points: ['求职', '考证'] }],
      { 进度: { a: 1 } },
    )
    expect(mem['偏好']).toEqual(['视频', '实战'])
    expect(mem['抽象目的']).toBe('求职\n考证')
    expect(mem['进度']).toEqual({ a: 1 })  // 未呈现键原样保留
  })

  it('空要点section：已知字符串键省略（对齐后端空值弹出语义），原值不残留在 payload', () => {
    const mem = sectionsToMemory([{ title: '抽象目的', points: [] }], { '抽象目的': '旧值', '起点': '零基础' })
    expect(mem).not.toHaveProperty('抽象目的')
    expect(mem['起点']).toBe('零基础')
  })

  it('roundtrip：典型旧数据 dict → sections → 合并写回后语义等价（数组键/字符串键/复杂键）', () => {
    const old = {
      '抽象目的': '求职准备',
      '抽象项目情况': '在职转行\n每天 2 小时',
      '起点': '零基础',
      '当前水平': '入门',
      '目标': '能独立做项目',
      '偏好': ['实战', '视频'],
      '知识点': ['RAG'],
      '难点': [],
      '薄弱点': [],
      '兴趣': ['Agent'],
      '课程结束时间': '9-05',
      '平均每日投入时间': '2 小时',
      '其他': '',
      '进度': { 'ch1': 5 },
      '对话概要': [{ dialogue_id: 'd1', name: '对话 1', 概要: {} }],
    }
    const mem = sectionsToMemory(memoryToSections(old), old)
    for (const k of ['抽象目的', '抽象项目情况', '起点', '当前水平', '目标', '课程结束时间', '平均每日投入时间']) {
      expect(mem[k]).toBe((old as any)[k])
    }
    for (const k of ['偏好', '知识点', '难点', '薄弱点', '兴趣']) {
      const got = mem[k]
      if (k === '难点' || k === '薄弱点') {
        // 空数组无信息量：合并写回后键可省略，但绝不残留非空脏值
        expect(got === undefined || (Array.isArray(got) && got.length === 0)).toBe(true)
      } else {
        expect(got).toEqual((old as any)[k])
      }
    }
    expect(mem['进度']).toEqual(old['进度'])
    expect(mem['对话概要']).toEqual(old['对话概要'])
  })
})

describe('单框编辑操作', () => {
  it('appendPoint：向指定标题追加要点（owner 行尾输入框）', () => {
    const next = appendPoint([{ title: '难点', points: [] }], '难点', '注意力机制')
    expect(next[0].points).toEqual(['注意力机制'])
  })

  it('appendSection：末尾新建空标题（owner 手动补充位），重复标题不新建', () => {
    let secs = [{ title: '抽象目的', points: ['x'] }]
    secs = appendSection(secs, '面试准备')
    expect(secs.map(s => s.title)).toContain('面试准备')
    expect(appendSection(secs, '面试准备').filter(s => s.title === '面试准备')).toHaveLength(1)
  })
})
