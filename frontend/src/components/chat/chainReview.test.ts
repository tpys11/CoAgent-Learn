// F11-S2：审核全程入思维链——前端兼容注入与结构守卫。
// 1) formatReviewMd：ReviewResult → 思维链审核条目 markdown（与后端结论同语义）；
// 2) withReviewEntry：历史消息兼容注入（think 无审核条目才注入，不重复）；
// 3) 结构守卫：AssistantMessage.tsx 不得再有正文后「审核报告」块（删除不回潮），
//    经 vite ?raw 原文导入（无 @types/node，不能用 node:fs）。
import { describe, expect, it } from 'vitest'
import { formatReviewMd, withReviewEntry } from '../../components/chat/AssistantMessage'
import assistantMessageSrc from './AssistantMessage.tsx?raw'
import type { ReviewResult } from '../../types'

const PASS: ReviewResult = { passed: true, score: 92, suggestion: '总体准确' }
const FAIL: ReviewResult = {
  passed: false, score: 61, suggestion: '存在虚构',
  issues: [{ problem: '【虚构】top-k 是 5', fix: '证据说 3' }],
}

describe('F11-S2：formatReviewMd 审核结论 markdown', () => {
  it('通过：含通过状态与分数', () => {
    const md = formatReviewMd(PASS)
    expect(md).toContain('审核通过')
    expect(md).toContain('92')
    expect(md).toContain('总体准确')
  })

  it('未通过：含分数与问题清单（problem → fix）', () => {
    const md = formatReviewMd(FAIL)
    expect(md).toContain('审核未通过')
    expect(md).toContain('61')
    expect(md).toContain('【虚构】top-k 是 5')
    expect(md).toContain('证据说 3')
  })

  it('skipped：标注跳过且不渲染 suggestion 为建议', () => {
    const md = formatReviewMd({ passed: true, score: 100, skipped: true, suggestion: '审核器异常跳过：x' })
    expect(md).toContain('审核跳过')
    expect(md).not.toContain('💡')
  })
})

describe('F11-S2：withReviewEntry 历史消息兼容注入', () => {
  it('旧消息（think 无审核条目 + msg.review）→ 注入 agent=审核 条目', () => {
    const think = [{ agent: '学习助手·规划', content: '要点' }]
    const out = withReviewEntry(think, FAIL)
    expect(out.length).toBe(2)
    expect(out[1].agent).toBe('审核')
    expect(out[1].content).toContain('61')
  })

  it('新消息（think 已含审核条目）→ 不重复注入', () => {
    const think = [
      { agent: '学习助手·规划', content: '要点' },
      { agent: '审核', content: '✅ 审核通过 · 92分' },
    ]
    const out = withReviewEntry(think, FAIL)
    expect(out.length).toBe(2)
    expect(out.filter(it => it.agent === '审核').length).toBe(1)
  })

  it('无 msg.review → 原样返回（含 string[] 形态归一）', () => {
    expect(withReviewEntry(undefined, undefined)).toEqual([])
    expect(withReviewEntry(['纯字符串条目'], undefined)).toEqual([
      { agent: '', content: '纯字符串条目' },
    ])
  })
})

describe('F11-S2：结构守卫——正文后审核块删除不回潮', () => {
  it('AssistantMessage.tsx 源码不再含「审核报告」正文后块标记', () => {
    expect(assistantMessageSrc).not.toContain('审核报告')
    expect(assistantMessageSrc).toContain('withReviewEntry(msg.think, msg.review)')
  })
})
