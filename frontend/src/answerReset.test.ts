import { describe, expect, it } from 'vitest'
import {
  applyAnswerResetMessage,
  applyAnswerTokenToChain,
  applyAnswerResetToChain,
} from './hooks/useChatStream'
import type { Message } from './types'

// A2：answer_reset 的消息状态转移守卫。
// 断言定位（决策 24）：
// - test_reset_blanks_last_assistant / test_reset_preserves_think_and_steps /
//   test_reset_leaves_non_assistant_alone：新行为断言（helper 缺失或改坏 → 恰这组红）。
// - test_interleaved_tokens_reset_then_new_draft：状态竞争场景——RB-S1 重定义其语义
//   （原 A2：新稿直灌正文；RB-S1 改道后：草稿只入链、正文恒空、旧稿在链内保留）。
//   「末条非 assistant 不误伤」的回归控制断言保留不动。

const did = 'd1'

function stateWith(content: string, think: string[], steps: Array<{ agent: string; status: string }>): Record<string, Message[]> {
  const last: Message = { role: 'assistant', content, think, steps }
  return { [did]: [{ role: 'user', content: '问题' }, last] }
}

describe('applyAnswerResetMessage', () => {
  it('blanks last assistant content only', () => {
    const state = stateWith('旧稿甲旧稿乙', ['思考'], [{ agent: '学习助手·规划', status: 'done' }])
    const next = applyAnswerResetMessage(state, did)
    const last = next[did][next[did].length - 1]
    expect(last.role).toBe('assistant')
    expect(last.content).toBe('')
    expect(next[did][0]).toBe(state[did][0]) // user 消息不动
  })

  it('preserves think and steps', () => {
    const think = ['思考甲', '思考乙']
    const steps = [{ agent: '学习助手·规划', status: 'done' }]
    const next = applyAnswerResetMessage(stateWith('旧稿', think, steps), did)
    const last = next[did][next[did].length - 1]
    expect(last.think).toEqual(think)
    expect(last.steps).toEqual(steps)
  })

  it('leaves state alone when last message is not assistant', () => {
    const state: Record<string, Message[]> = { [did]: [{ role: 'user', content: '只有用户消息' }] }
    expect(applyAnswerResetMessage(state, did)).toBe(state)
    expect(applyAnswerResetMessage(state, null)).toBe(state)
  })

  it('interleaved tokens → reset → 旧稿留链、重写段开新段、正文恒空（RB-S1 重定义）', () => {
    // 复现 useChatStream 的处理序列（RB-S1 改道后）：草稿 token 经 pendingMind
    // 缓冲入链（不再写正文）；reset 到达时 ①冲缓冲尾段进旧条目（旧稿完整性）
    // → ②链内开重写段（applyAnswerResetToChain，旧稿保留）→ ③正文置空（A2
    // 语义保留，改道后正文本就是空占位）；新稿 token 流入重写段。正文全程零草稿字符。
    let pending = { agent: '学习助手·生成', text: '' }
    let content = ''
    let chain: Array<{ agent: string; content: string }> = []
    const drain2 = () => {                    // 模拟 revealTick 自适应排水（取前 2 字）
      if (!pending.text) return
      chain = applyAnswerTokenToChain(chain, pending.agent, pending.text.slice(0, 2))
      pending = { agent: pending.agent, text: pending.text.slice(2) }
    }
    // 旧稿流式：部分已入链，部分还在缓冲
    pending.text += '旧稿甲'
    drain2()                                  // 链内生成条目 = '旧稿'，缓冲剩 '甲'
    pending.text += '旧稿乙'                  // 缓冲 '甲旧稿乙'

    // —— answer_reset 到达：useChatStream 分支顺序（RB-S1 改道后）——
    chain = applyAnswerTokenToChain(chain, pending.agent, pending.text)  // ① 冲尾段进旧条目
    pending = { agent: pending.agent, text: '' }
    chain = applyAnswerResetToChain(chain, 0, '审核未通过')              // ② 开重写段（旧稿保留）
    let state = stateWith(content, ['思考'], [{ agent: '学习助手·规划', status: 'done' }])
    state = applyAnswerResetMessage(state, did)                          // ③ 正文置空（保留语义）

    // 新稿 token：草稿目标段已切到重写段
    pending = { agent: '学习助手·生成（重写 #0）', text: '新稿A新稿B' }
    while (pending.text) drain2()

    const last = state[did][state[did].length - 1]
    expect(last.content).toBe('')                                        // 正文恒空（owner 底线）
    expect(chain.find(x => x.agent === '学习助手·生成')?.content).toBe('旧稿甲旧稿乙')  // 旧稿完整保留
    expect(chain.find(x => x.agent === '学习助手·生成（重写 #0）')?.content).toBe('新稿A新稿B')
    expect(last.think).toEqual(['思考'])                                 // think 保留
  })
})
