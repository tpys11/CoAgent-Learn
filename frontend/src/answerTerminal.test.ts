// RB-S2：终态与边界——done/stop/断线三边界正文内容来源守卫（纯函数直调）。
// 三边界口径（写进交接）：done 正文=done 帧 data.reply（服务端权威终稿）；
// stop 正文=「⏹ 已停止生成（草稿见思维链）」纯文案（草稿在链内，不拼部分内容）；
// 断线正文=服务端落库终稿（fetchOnce 取回，取回语义 RB 改道前后不变）。
// error 帧无终稿时落正文（⚠️ 前缀）——与 done 同一出口 resolveFinalContent。
// 断言定位（决策 24）：三个纯函数缺失或改坏 → 恰这组红；「末条非 assistant
// 不误伤」回归控制断言与 A2 同款保留。
import { describe, expect, it } from 'vitest'
import {
  applyStoppedGenerationMessage,
  resolveFinalContent,
  isRecoveredAssistantFinal,
} from './hooks/useChatStream'
import type { Message } from './types'

const did = 'd1'

function stateWith(content: string): Record<string, Message[]> {
  return { [did]: [{ role: 'user', content: '问题' }, { role: 'assistant', content, think: [] }] }
}

describe('RB-S2：applyStoppedGenerationMessage（stop 终态）', () => {
  it('stop 文案：正文=「⏹ 已停止生成（草稿见思维链）」，不拼接部分内容；think 快照写入', () => {
    const base = stateWith('')
    const think = [{ agent: '学习助手·生成', content: '草稿残留部分' }]
    const next = applyStoppedGenerationMessage(base, did, think)
    const last = next[did][next[did].length - 1]
    expect(last.content).toBe('⏹ 已停止生成（草稿见思维链）')
    expect(last.content).not.toContain('草稿残留部分')      // 正文不收部分内容（owner 底线）
    expect(last.think).toEqual(think)                        // 草稿可见性在链内快照
    expect(next[did][0]).toBe(base[did][0])                  // user 消息不动
  })

  it('末条非 assistant 原样返回（回归控制：防旧消息残留误伤，A2 同款保留）', () => {
    const state: Record<string, Message[]> = { [did]: [{ role: 'user', content: '只有用户消息' }] }
    expect(applyStoppedGenerationMessage(state, did, [])).toBe(state)
    expect(applyStoppedGenerationMessage(state, null, [])).toBe(state)
  })
})

describe('RB-S2：resolveFinalContent（done/error 正文来源）', () => {
  it('error 落正文：无终稿时 flowError 带 ⚠️ 前缀入正文', () => {
    expect(resolveFinalContent('', '模型超时')).toBe('⚠️ 模型超时')
  })
  it('终稿优先：有 data.reply 时正文=终稿（error 不覆盖）', () => {
    expect(resolveFinalContent('服务端权威终稿', '某个error')).toBe('服务端权威终稿')
  })
  it('兜底：两者皆无给「处理完成」', () => {
    expect(resolveFinalContent('', '')).toBe('处理完成')
  })
})

describe('RB-S2：isRecoveredAssistantFinal（断线取回不变量）', () => {
  it('服务端落库终稿算取回成功（正文来源=服务端终稿，改道不影响）', () => {
    expect(isRecoveredAssistantFinal([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '服务端已落库的终稿' },
    ])).toBe(true)
  })
  it('空 content / 「（系统未生成内容）」占位 / 末条非 assistant 都不算取回', () => {
    expect(isRecoveredAssistantFinal([{ role: 'assistant', content: '' }])).toBe(false)
    expect(isRecoveredAssistantFinal([{ role: 'assistant', content: '（系统未生成内容）' }])).toBe(false)
    expect(isRecoveredAssistantFinal([{ role: 'user', content: 'x' }])).toBe(false)
    expect(isRecoveredAssistantFinal([])).toBe(false)
  })
})
