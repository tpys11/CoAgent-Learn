/** RA-S5：主链路 zen 路由闭环——LS.provider='zen' 时 base_url 从 LS.zenBaseUrl 读；
 * 空则与现状等价回落 undefined（后端回落 DeepSeek 端点）并 console.warn。
 * RA3-S1：resolveChatModel 升级双参 (provider, lsModel)——标准档钉死 MODEL_MAIN 常量、
 * 无视 LS.model 历史杂值（owner 反馈①：千问名残留既回显又随请求体发送，
 * pipeline_v2.py:170 后端真认 req.model）；zen 测试档取 LS.model（轮换免疫是 F14 设计原意），
 * 空值兜底 'mimo-V2.5 Free'；legacy alias 表保留做老存量名迁移映射。
 * repo 无 jsdom（serviceGroups.ts 头注先例）：行为钉在导出纯函数，「两消费端同源」与
 * 「请求体含解析值」属组件/钩子接线，用 ?raw 源级守卫钉取参表达式逐字一致。 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveChatBaseUrl, resolveChatModel } from './useChatStream'

const rawHooks = import.meta.glob('./useChatStream.ts', { query: '?raw', import: 'default', eager: true })
const HOOK_SRC = String(Object.values(rawHooks)[0] ?? '')
const rawCard = import.meta.glob('../components/settings/SelfCheckCard.tsx', { query: '?raw', import: 'default', eager: true })
const CARD_SRC = String(Object.values(rawCard)[0] ?? '')

// RA3-S1：两消费端必须用完全相同的取参表达式（provider 与 lsModel 同参数来源），
// 任何一端改回直读 LS.model 都会破坏「显示=发送」同源（owner 反馈①的根因形态）
const MODEL_CALL = "resolveChatModel(provider, lsGet(LS.model, 'deepseek-v4-flash-vision-exp'))"

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

describe('resolveChatModel (RA3-S1)', () => {
  it('标准档无视 LS.model 杂值：千问名残留钉死 dsv4f（owner 反馈①根因行）', () => {
    expect(resolveChatModel('deepseek', 'Qwen/Qwen2.5-72B-Instruct')).toBe('deepseek-v4-flash-vision-exp')
  })

  it('标准档未知值/空一律钉死 dsv4f（杂值与合法值不可区分，钉死才是钉死）', () => {
    expect(resolveChatModel('deepseek', '')).toBe('deepseek-v4-flash-vision-exp')
    expect(resolveChatModel('deepseek', 'glm-4-flash')).toBe('deepseek-v4-flash-vision-exp')
  })

  it('zen 取 LS.model 透传（不写死 mimo——轮换免疫是 F14 设计原意）', () => {
    expect(resolveChatModel('zen', 'mimo-V2.5 Free')).toBe('mimo-V2.5 Free')
    expect(resolveChatModel('zen', 'Big Pickle')).toBe('Big Pickle')
  })

  it('zen 空值兜底 mimo-V2.5 Free', () => {
    expect(resolveChatModel('zen', '')).toBe('mimo-V2.5 Free')
  })

  it('alias 迁移映射保留（老存量名→v4 系，标准档零回归；zen 分支不吃 alias）', () => {
    expect(resolveChatModel('deepseek', 'deepseek-flash')).toBe('deepseek-v4-flash-vision-exp')
    expect(resolveChatModel('deepseek', 'deepseek-chat')).toBe('deepseek-v4-pro')
    expect(resolveChatModel('deepseek', 'deepseek-v4-flash-vision-exp')).toBe('deepseek-v4-flash-vision-exp')
    expect(resolveChatModel('zen', 'deepseek-chat')).toBe('deepseek-chat')
  })

  it('两消费端同源：useChatStream 与 SelfCheckCard 用同一取参表达式调用（源级守卫）', () => {
    expect(HOOK_SRC).toContain(MODEL_CALL)
    expect(CARD_SRC).toContain(MODEL_CALL)
  })

  it('请求体含解析值：fetch body 的 model 走解析结果（源级守卫）', () => {
    expect(HOOK_SRC).toContain('model: model, base_url: baseUrl')
  })
})
