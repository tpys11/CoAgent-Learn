/**
 * B2：列表窗口化——窗口起点转移函数守卫。
 *
 * 断言定位（决策 24）：
 * - 全部用例为新行为断言：窗口转移规则（批量载入重置 / 流式追加冻结 /
 *   小对话不开窗 / 收缩重灌）是 B2 引入的纯逻辑，任何一条规则被改坏
 *   （如去掉冻结、去掉小对话旁路）恰对应条红。
 * - idx 全量下标语义由结构保证（map 仍遍历全量 messages，占位行只是空 div），
 *   单测覆盖不到 DOM，浏览器实测另行记录（见 step-B.md B2 节）。
 */
import { describe, expect, it } from 'vitest'
import { nextWindowStart } from './CenterPanel'

describe('B2 窗口起点转移（nextWindowStart）', () => {
  it('首次批量载入 30 条 → 窗口重置为末尾 12 条', () => {
    expect(nextWindowStart(0, 0, 30, 12, 8)).toBe(18)
  })

  it('流式追加（len 单调 +1~2）→ 窗口冻结，已物化消息不打回占位', () => {
    expect(nextWindowStart(18, 30, 31, 12, 8)).toBe(18)
    expect(nextWindowStart(18, 31, 32, 12, 8)).toBe(18)
    expect(nextWindowStart(18, 32, 33, 12, 8)).toBe(18)
  })

  it('用户上滚展开后（窗口前移）流式追加仍冻结', () => {
    expect(nextWindowStart(6, 30, 31, 12, 8)).toBe(6)
    expect(nextWindowStart(2, 34, 35, 12, 8)).toBe(2)
  })

  it('小对话（≤n）不开窗', () => {
    expect(nextWindowStart(0, 0, 5, 12, 8)).toBe(0)
    expect(nextWindowStart(6, 30, 12, 12, 8)).toBe(0)
  })

  it('切换对话批量重灌（len 从 0 跳到 40）→ 重置为末尾 n 条', () => {
    expect(nextWindowStart(6, 0, 40, 12, 8)).toBe(28)
  })

  it('大列表收缩（删消息）→ 重灌防越界', () => {
    expect(nextWindowStart(2, 40, 30, 12, 8)).toBe(18)
  })

  it('边界：len 恰为 n+1 → 窗口 1；len 为 n → 0', () => {
    expect(nextWindowStart(0, 0, 13, 12, 8)).toBe(1)
    expect(nextWindowStart(1, 13, 12, 12, 8)).toBe(0)
  })

  it('上滚展开本身由组件内 setWinStart(max(0, s-STEP)) 完成，转移函数不参与', () => {
    // 该行为是 UI 状态迁移，纯函数只约束「非展开路径」不吞掉展开结果：
    // 展开后的值作为 prevStart 传入必须被冻结保留（上面用例 3 已覆盖）。
    expect(nextWindowStart(4, 30, 30, 12, 8)).toBe(4)
  })
})
