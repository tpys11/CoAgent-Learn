/**
 * 测验作答收集器守卫（闭环D前端接线）：
 * id 稳定性 / 同题 last-write-wins / toAnswers 形状与后端契约对齐。
 */
import { describe, expect, it } from 'vitest'
import { createQuizCollector, hashText, stableQuestionId } from './submit'

describe('hashText / stableQuestionId', () => {
  it('同文本哈希稳定，不同文本不同', () => {
    expect(hashText('角动量守恒的条件是什么')).toBe(hashText(' 角动量守恒的条件是什么 '))
    expect(hashText('角动量守恒的条件是什么')).not.toBe(hashText('什么是惯性定律'))
  })

  it('空文本有兜底 id（不抛错，按序号区分占位）', () => {
    expect(stableQuestionId('', 3)).toBe('q3-empty')
  })

  it('序号兜底：不同空位互异', () => {
    const a = stableQuestionId('', 0)
    const b = stableQuestionId('', 1)
    expect(a).not.toBe(b)
    expect(a.startsWith('q0-')).toBe(true)
  })
})

describe('createQuizCollector', () => {
  it('逐题收集，toAnswers 与后端 QuizAnswerIn 契约对齐', () => {
    const c = createQuizCollector()
    c.record('角动量守恒的条件是什么', true)
    c.record('什么是惯性定律', false)
    const out = c.toAnswers()
    expect(out).toHaveLength(2)
    for (const a of out) {
      expect(Object.keys(a).sort()).toEqual(['correct', 'kp_tag', 'question_id'])
      expect(typeof a.correct).toBe('boolean')
      expect(a.kp_tag).toBe('')
    }
    expect(out[0].correct).toBe(true)
    expect(out[1].correct).toBe(false)
  })

  it('同题重答 last-write-wins（以最后一次为准），size 不涨', () => {
    const text = '动能定理怎么表述'
    const c = createQuizCollector()
    c.record(text, true)
    expect(c.size()).toBe(1)
    c.record(text, false)
    expect(c.size()).toBe(1)
    expect(c.toAnswers()[0].correct).toBe(false)
    // 且 question_id 稳定（重答不产生新条目）
    expect(c.toAnswers()[0].question_id).toBe(stableQuestionId(text, 0))
  })

  it('isCorrect 非布尔输入归一为 false', () => {
    const c = createQuizCollector()
    c.record('q', undefined as unknown as boolean)
    expect(c.toAnswers()[0].correct).toBe(false)
  })
})
