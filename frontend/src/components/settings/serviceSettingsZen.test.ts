import { describe, it, expect } from 'vitest'
import { zenSaveUiState, zenSavedHintText } from './ServiceSettings'

/** RA2-S2 源级守卫：ServiceSettings.tsx 源码扫描（repo 无 jsdom，组件测试不可行——serviceGroups.ts 头注先例：
 *  行为收敛到导出纯函数/常量，源级断言钉「根因行禁止复活」与「纯函数被真实消费」。
 *  取源用 vite ?raw glob（tsconfig 无 @types/node，node:fs 类型不可用）。 */
const rawModules = import.meta.glob('./ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
const SRC = String(Object.values(rawModules)[0] ?? '')

describe('RA2-S2 Zen key 输入保留（owner 反馈③）——源级守卫', () => {
  it('旧卡清空交互根因行 setZenKey(\'\') 禁止复活（保存后输入保留）', () => {
    expect(SRC).not.toContain("setZenKey('')")
  })

  it('保存后状态收敛走纯函数 zenSaveUiState（防内联回退）', () => {
    expect(SRC).toContain('zenSaveUiState(')
  })

  it('已保存尾号提示经 zenSavedHintText 渲染', () => {
    expect(SRC).toContain('zenSavedHintText(')
  })
})

describe('RA2-S2 Zen key 保存状态收敛——纯函数直调', () => {
  it('保存后输入值保留：zenSaveUiState 原样透传 zenKey + 映射 zen_key_set/hint', () => {
    const out = zenSaveUiState('sk-zen-test-123', { zen: { api_key_set: true, api_key_hint: 'sk-…abcd' } })
    expect(out.zenKey).toBe('sk-zen-test-123')
    expect(out.zenKeySet).toBe(true)
    expect(out.zenKeyHint).toBe('sk-…abcd')
  })

  it('GET 缺 zen 节时优雅兜底：zenKey 仍保留，set/hint 落空', () => {
    const out = zenSaveUiState('sk-zen-test-123', {})
    expect(out.zenKey).toBe('sk-zen-test-123')
    expect(out.zenKeySet).toBe(false)
    expect(out.zenKeyHint).toBe('')
  })

  it('提示文案读 api_key_hint 尾号掩码（「已保存：」前缀逐字）', () => {
    expect(zenSavedHintText('sk-…abcd')).toBe('已保存：sk-…abcd')
  })
})
