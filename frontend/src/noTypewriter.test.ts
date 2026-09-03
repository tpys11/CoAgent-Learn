import { describe, expect, it } from 'vitest'
import hookSrc from './hooks/useChatStream.ts?raw'

// A3：打字机降级分支删除守卫（源码文本守卫——结构上防回归）。
//
// 断言定位（决策 24）：
// - 新行为断言：useChatStream.ts 不得再出现 setInterval（打字机以 16ms×500 次
//   全量 setAllMessages 的方式渲染 1,500 字终稿——A3 删除该分支后，终稿为一次
//   无条件同步写入）。若打字机以任何形式回归 → 恰这条红。
// - typingOn 开关同删（恒等 true，无关闭途径），防止出现「恒等 if/else」残尸。
// - 终稿内容完整性（与 finalReply 逐字一致）由浏览器实测 + reset 桩测试覆盖
//   （done.reply 直写，结构上就是同一字符串）。
//
// 说明：用 Vite ?raw 导入源码而非 node:fs——前端 tsconfig 无 @types/node
//（禁加依赖），?raw 由 vite/client 类型声明覆盖，tsc 零配置通过。

describe('A3 打字机降级删除守卫', () => {
  it('useChatStream.ts 不再出现 setInterval', () => {
    expect(hookSrc.includes('setInterval'), '打字机 setInterval 不得回归').toBe(false)
  })

  it('typingOn 恒等开关已删除', () => {
    expect(hookSrc.includes('typingOn'), 'typingOn 常量与恒等 if/else 应随打字机一起删除').toBe(false)
  })
})
