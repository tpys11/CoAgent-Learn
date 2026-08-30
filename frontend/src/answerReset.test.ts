import { describe, expect, it } from 'vitest'
import { applyAnswerResetMessage } from './hooks/useChatStream'
import type { Message } from './types'

// A2：answer_reset 的消息状态转移守卫。
// 断言定位（决策 24）：
// - test_reset_blanks_last_assistant / test_reset_preserves_think_and_steps /
//   test_reset_leaves_non_assistant_alone：新行为断言（helper 缺失或改坏 → 恰这组红）。
// - test_interleaved_tokens_reset_then_new_draft：状态竞争场景——reset 到达时
//   缓冲里可能还有未渲染 token，处理顺序必须是「先清 pendingAnswerRef、再置空
//   content」，乱序会漏字符（这里按 useChatStream 处理序列逐拍复现）。

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

  it('interleaved tokens → reset → new draft shows latest draft only', () => {
    // 复现 useChatStream 的处理序列（pendingAnswerRef 缓冲 + rAF 排水 + reset）：
    // 旧稿 token 已部分渲染，reset 到达时缓冲里还有未渲染旧稿块——
    // 正确顺序（先清缓冲再置空）下最终气泡只含新稿。
    let pending = ''
    let content = ''
    const drain = (take: number) => {
      const out = pending.slice(0, take)
      pending = pending.slice(take)
      content += out
      return out
    }
    // 旧稿流式：部分已渲染进气泡，部分还在缓冲
    pending += '旧稿甲'
    drain(2)                       // 气泡 content = '旧稿'，缓冲剩 '甲'
    pending += '旧稿乙'            // 缓冲 '甲旧稿乙'（未发合批块在泵侧被 drop_pending 丢弃的对应物）

    // —— answer_reset 到达：useChatStream 分支的两步，顺序即此处 ——
    pending = ''                                            // ① 先清流式缓冲
    let state = stateWith(content, ['思考'], [{ agent: '学习助手·规划', status: 'done' }])
    state = applyAnswerResetMessage(state, did)             // ② 再置空气泡 content

    // 新稿 token：revealTick 语义 = 读 state 当前 content 再追加（非局部变量）
    pending += '新稿A'
    pending += '新稿B'
    const out = pending
    pending = ''
    const arr = state[did]
    const lastMsg = arr[arr.length - 1]
    state = { ...state, [did]: [...arr.slice(0, -1), { ...lastMsg, content: (lastMsg.content || '') + out }] }

    const last = state[did][state[did].length - 1]
    expect(last.content).toBe('新稿A新稿B') // 只含最新一稿，无重复段落
    expect(last.content).not.toContain('旧稿')
    expect(last.think).toEqual(['思考'])    // think 保留
  })
})
