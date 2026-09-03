import { describe, it, expect } from 'vitest'
import { zenSaveUiState, zenKeyConfigText, zenSaveFailPersistText, zenSavedFlashText, zenSaveFailFlashText } from './ServiceSettings'

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

  it('RA4-S1：持久配置态徽标经 zenKeyConfigText 渲染（不依赖 flash）', () => {
    expect(SRC).toContain('zenKeyConfigText(')
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

  it('RA4-S1：已配置徽标带尾号（绿字「已配置：」前缀+掩码尾号）', () => {
    expect(zenKeyConfigText(true, 'sk-…abcd')).toBe('已配置：sk-…abcd')
  })

  it('RA4-S1：hint 空串时仍显「已配置」——&& 链吞掉整条提示=「没反馈」根因，禁复活', () => {
    expect(zenKeyConfigText(true, '')).toBe('已配置')
  })

  it('RA4-S1：未配置时常驻灰字「未配置」', () => {
    expect(zenKeyConfigText(false, '')).toBe('未配置')
    expect(zenKeyConfigText(false, 'sk-…abcd')).toBe('未配置')
  })
})

// ── RA3-S2：Zen 保存反馈强化（owner 反馈②：保存反馈弱+缺「成功后引导立即检测」）──
describe('RA3-S2 Zen 保存反馈——纯函数直调 + 源级守卫', () => {
  it('成功 flash 文案引导立即检测（owner 指定语义逐字）', () => {
    expect(zenSavedFlashText()).toBe('Zen Key 已保存——点击上方立即检测验证连通性')
  })

  it('失败 flash 文案含原因与怎么办（CONVENTIONS §6；saveService 同款先例）', () => {
    expect(zenSaveFailFlashText()).toBe('保存失败（后端不可达），请重试')
  })

  it('源级守卫：成功/失败文案被 saveZenKey 真实消费', () => {
    expect(SRC).toContain('flash(zenSavedFlashText())')
    expect(SRC).toContain('flashErr(zenSaveFailFlashText())')
  })

  it('源级守卫：失败反馈红色渲染路径存在（旧 catch 只走绿色成功样式=视觉不可辨）', () => {
    expect(SRC).toContain("feedbackErr ? 'text-red-500'")
  })
})

// ── RA4-S1：Zen 保存持久反馈（owner 反馈①：无持久「已配置」态；关键状态持久渲染，flash 只做动作回执）──
describe('RA4-S1 Zen 持久配置态——纯函数直调 + 源级守卫', () => {
  it('保存失败持久红字文案（不清到下次成功，逐字）', () => {
    expect(zenSaveFailPersistText()).toBe('保存失败，请检查网络后重试')
  })

  it('源级守卫：持久红字由 zenSaveErr 态驱动且在 saveZenKey 失败分支置位', () => {
    expect(SRC).toContain('setZenSaveErr(true)')
    expect(SRC).toContain('zenSaveErr &&')
  })

  it('源级守卫：成功分支清失败红字（下次成功即消）', () => {
    expect(SRC).toContain('setZenSaveErr(false)')
  })
})
