/**
 * 测验作答收集器（闭环D 前端接线）：把 react-quiz-component 的逐题回调
 * 转换为 POST /api/quiz/submit 的标准载荷。
 *
 * 设计要点：
 * - 题目标识 stableQuestionId：题干文本 djb2 哈希 + 序号兜底——同一题重渲染/
 *   复看结果页不产生新 id；不同题几乎必异（哈希碰撞由序号兜底消除）
 * - 同题多次提交（导航回退重答）：last-write-wins，以最后一次作答为准
 * - 本模块保持零 React / 零 fetch 依赖，纯函数可 vitest 直测
 */

interface QuizAnswerOut {
  question_id: string
  kp_tag: string
  correct: boolean
}

/** djb2 变体：稳定、实现一行、无内置 crypto 依赖（浏览器/Node 双端一致） */
export function hashText(text: string): string {
  let h = 5381
  const s = (text || '').trim()
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

export function stableQuestionId(text: string, fallbackIndex: number): string {
  // 非空题干：id 只由文本派生——同题重答必得同 id，upsert 语义成立
  if ((text || '').trim()) return 'q-' + hashText(text)
  // 空题干：退化为序号区分（不同空位是不同占位）
  return 'q' + fallbackIndex + '-empty'
}

export interface QuizCollector {
  /** 记录一次作答；同题覆盖（last-write-wins）。返回当前已收集题数 */
  record(questionText: string, isCorrect: boolean): number
  size(): number
  toAnswers(): QuizAnswerOut[]
}

export function createQuizCollector(): QuizCollector {
  const map = new Map<string, QuizAnswerOut>()
  return {
    record(questionText: string, isCorrect: boolean): number {
      const id = stableQuestionId(questionText, map.size)
      // 同文本题重复出现时 id 含序号兜底仍可能撞（同文本同序号=同题，语义正确）
      map.set(id, { question_id: id, kp_tag: '', correct: !!isCorrect })
      return map.size
    },
    size(): number {
      return map.size
    },
    toAnswers(): QuizAnswerOut[] {
      return Array.from(map.values())
    },
  }
}
