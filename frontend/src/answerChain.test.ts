// RB-S1：草稿改道思维链——answer_token/answer_reset 的链状态转移守卫（纯函数直调）。
// 断言定位（决策 24）：
// - 「正文零字符」双保险：源码守卫钉住 answer_token 分支不得恢复 pendingAnswerRef
//   直灌（变异①恰红点，chainReview ?raw 同模式）+ 纯函数组合序列复现钉语义；
// - 「围栏代码块完整」钉 feedDraftChunk 直通语义（与 feedThoughtChunk 相反：
//   草稿即正文形态，围栏标记与代码块完整入链，S3 按 markdown 渲染）；
// - 「互染守卫」钉草稿围栏状态与 thought fenceRef 物理隔离（派发单陷阱①）。
import { describe, expect, it } from 'vitest'
import {
  applyAnswerTokenToChain,
  applyAnswerResetToChain,
  genRewriteAgent,
} from './hooks/useChatStream'
import { feedDraftChunk, feedThoughtChunk, newFenceState } from './streaming'
import useChatStreamSrc from './hooks/useChatStream.ts?raw'

const REWRITE0 = '学习助手·生成（重写 #0）'
const REWRITE1 = '学习助手·生成（重写 #1）'

describe('RB-S1：applyAnswerTokenToChain（草稿 token 入链）', () => {
  it('无则建：空链首 token 建条目', () => {
    const out = applyAnswerTokenToChain([], '学习助手·生成', 'A')
    expect(out).toEqual([{ agent: '学习助手·生成', content: 'A' }])
  })

  it('同名追加（lastIndexOf 语义）；不同名新建；空 chunk 原样返回', () => {
    const c0 = applyAnswerTokenToChain([{ agent: '学习助手·生成', content: 'A' }], '学习助手·生成', 'B')
    expect(c0).toEqual([{ agent: '学习助手·生成', content: 'AB' }])
    const c1 = applyAnswerTokenToChain(c0, REWRITE0, 'C')
    expect(c1.length).toBe(2)
    expect(c1[1]).toEqual({ agent: REWRITE0, content: 'C' })
    expect(applyAnswerTokenToChain(c1, REWRITE0, '')).toBe(c1)
  })
})

describe('RB-S1：applyAnswerResetToChain（重写段开段，旧稿保留）', () => {
  const chain = [
    { agent: '学习助手·生成', content: '思考+旧稿全文' },
    { agent: '审核', content: '❌ 审核未通过 · 61分' },
  ]

  it('reset 保留旧稿条目原样，开重写段且插在「审核」之前（草稿只准在审核节点之前）', () => {
    const out = applyAnswerResetToChain(chain, 0, '审核未通过')
    expect(out.length).toBe(3)
    expect(out[0]).toBe(chain[0])                     // 旧稿条目引用不动（保留可见）
    expect(out[1].agent).toBe(REWRITE0)
    expect(out[1].content).toBe('')
    expect(out[2].agent).toBe('审核')                  // 审核条目被推后：草稿段在审核之前
  })

  it('attempt 段名：段名取 SSE 帧 data.attempt', () => {
    expect(genRewriteAgent(0)).toBe(REWRITE0)
    expect(genRewriteAgent(2)).toBe('学习助手·生成（重写 #2）')
    const out = applyAnswerResetToChain([], 2, '审核未通过')
    expect(out[0].agent).toBe('学习助手·生成（重写 #2）')
  })

  it('幂等：同一 reset 帧重发不重复开段；不同 attempt 各开一段', () => {
    let out = applyAnswerResetToChain(chain, 0, '审核未通过')
    out = applyAnswerResetToChain(out, 0, '审核未通过')
    expect(out.filter(x => x.agent === REWRITE0).length).toBe(1)
    out = applyAnswerResetToChain(out, 1, '审核未通过')
    expect(out.filter(x => x.agent === REWRITE1).length).toBe(1)
    expect(out.length).toBe(4)
  })

  it('无审核条目时重写段追加到末尾', () => {
    const out = applyAnswerResetToChain([{ agent: '学习助手·生成', content: 'x' }], 0, '审核未通过')
    expect(out.length).toBe(2)
    expect(out[1].agent).toBe(REWRITE0)
  })
})

describe('RB-S1：feedDraftChunk（围栏直通——草稿代码块完整）', () => {
  it('代码围栏跨 chunk 拆分仍完整入链（含 ``` 标记与围栏内代码）', () => {
    const state = newFenceState()
    let captured = ''
    const append = (_ag: string, text: string) => { captured += text }
    expect(feedDraftChunk(state, '前文\n```py', '学习助手·生成', append)).toBe(true)
    feedDraftChunk(state, 'thon\nprint(1)\n', '学习助手·生成', append)
    feedDraftChunk(state, '```\n后文', '学习助手·生成', append)
    expect(captured).toBe('前文\n```python\nprint(1)\n```\n后文')
  })

  it('互染守卫：草稿围栏状态独立——thought 吞块语义不受 answer 流影响，反之亦然', () => {
    const thought = newFenceState()
    const draft = newFenceState()
    let thoughtOut = ''
    let draftOut = ''
    feedThoughtChunk(thought, '思考```py\nsecret', 't', (_a, t) => { thoughtOut += t })
    feedDraftChunk(draft, '```py\nvis', 'a', (_a, t) => { draftOut += t })
    feedThoughtChunk(thought, '\nmore\n```\n可见尾', 't', (_a, t) => { thoughtOut += t })
    expect(thoughtOut).toBe('思考\n可见尾')     // thought 围栏吞块语义原样（secret/more 被吞）
    expect(draftOut).toBe('```py\nvis')          // 草稿全量直通（含围栏标记）
  })
})

describe('RB-S1：正文零字符（源码守卫，chainReview ?raw 同模式）', () => {
  it('answer_token 分支不得恢复 pendingAnswerRef 直灌正文（变异①恰红点）', () => {
    expect(useChatStreamSrc).not.toContain('pendingAnswerRef.current +=')
    expect(useChatStreamSrc).toContain('feedDraftChunk(draftFenceRef.current')
  })

  it('answer_reset 分支接线 applyAnswerResetToChain（变异②接缝在位）', () => {
    expect(useChatStreamSrc).toContain('applyAnswerResetToChain(prev')
  })
})
