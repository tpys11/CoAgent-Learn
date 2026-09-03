/**
 * F12-S4 TDD：compress.py 五段式滚动摘要 → 单框「标题→要点[]」只读映射（纯函数）。
 * 红先行：本文件先于 compressMap.ts 存在（import 失败=红）。
 * 摘要形态（compress.py prompt 产出）："- 目标：…"/"- 关键事实与上下文：…"等小节行，
 * 允许无破折号/全角冒号/加粗变体；小节外的裸行归入「附记」。
 */
import { describe, it, expect } from 'vitest'
import { summaryToSections } from './compressMap'

describe('summaryToSections：五段式摘要 → sections', () => {
  it('标准五段（破折号+半角冒号）逐节成段', () => {
    const s = summaryToSections(
      '- 目标：掌握 RAG 原理\n- 关键事实与上下文：bge-m3 维度 1024\n- 决定与偏好：偏好实战示例\n- 进展：完成检索链路\n- 待办事项：重排未接',
    )
    expect(s.map(x => x.title)).toEqual(['目标', '关键事实与上下文', '决定与偏好', '进展', '待办事项'])
    expect(s[0].points).toEqual(['掌握 RAG 原理'])
  })

  it('无破折号/全角冒号/加粗变体同样识别', () => {
    const s = summaryToSections('目标：求职准备\n**进展**：搭建完向量库')
    expect(s.map(x => x.title)).toEqual(['目标', '进展'])
  })

  it('小节后续行并入该节要点', () => {
    const s = summaryToSections('- 进展：已完成\n  附加细节一行')
    expect(s[0].points).toEqual(['已完成', '附加细节一行'])
  })

  it('小节外的裸行归入「附记」；空行跳过', () => {
    const s = summaryToSections('开头一句\n\n- 目标：x')
    expect(s[0].title).toBe('附记')
    expect(s[0].points).toEqual(['开头一句'])
    expect(s[1].title).toBe('目标')
  })

  it('空/纯空白摘要 → 空数组（空态优雅降级）', () => {
    expect(summaryToSections('')).toEqual([])
    expect(summaryToSections('   \n  ')).toEqual([])
  })
})
