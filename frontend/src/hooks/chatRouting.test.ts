/** RA-S5：主链路 zen 路由闭环（红先行）——LS.provider='zen' 时 base_url 从 LS.zenBaseUrl 读；
 * 空则与现状等价回落 undefined（后端回落 DeepSeek 端点）并 console.warn；zen 模型名透传不被 alias 表改写。 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveChatBaseUrl, resolveChatModel } from './useChatStream'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveChatBaseUrl (RA-S5)', () => {
  it('zen 路由取 LS.zenBaseUrl', () => {
    expect(resolveChatBaseUrl('zen', 'https://opencode.ai/zen/v1')).toBe('https://opencode.ai/zen/v1')
  })

  it('zen 空 zenBaseUrl 回落 undefined 并 console.warn（与现状等价不炸）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveChatBaseUrl('zen', '')).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('deepseek/zhipu 路由不受影响（标准档零回归）', () => {
    expect(resolveChatBaseUrl('deepseek', '')).toBe('https://api.deepseek.com/v1')
    expect(resolveChatBaseUrl('zhipu', '')).toBe('https://open.bigmodel.cn/api/paas/v4')
  })
})

describe('resolveChatModel (RA-S5)', () => {
  it('zen 模型名透传不被 alias 表改写', () => {
    expect(resolveChatModel('mimo-V2.5 Free')).toBe('mimo-V2.5 Free')
    expect(resolveChatModel('Big Pickle')).toBe('Big Pickle')
  })

  it('deepseek 老存量 alias 迁移语义保留（标准档零回归）', () => {
    expect(resolveChatModel('deepseek-flash')).toBe('deepseek-v4-flash-vision-exp')
    expect(resolveChatModel('deepseek-chat')).toBe('deepseek-v4-pro')
    expect(resolveChatModel('deepseek-v4-flash-vision-exp')).toBe('deepseek-v4-flash-vision-exp')
  })
})
