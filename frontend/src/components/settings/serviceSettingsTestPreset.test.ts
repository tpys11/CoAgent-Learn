import { describe, it, expect } from 'vitest'
import { TEST_PRESET_ZEN_GUARD_NOTE, TEST_PRESET_ON_NOTE, TEST_PRESET_OFF_NOTE } from './serviceGroups'

/** RA4-S2 源级守卫：ServiceSettings.tsx 源码扫描（repo 无 jsdom，组件测试不可行——serviceSettingsZen.test.ts 先例：
 *  行为收敛到导出常量/纯函数，源级断言钉「根因行禁止复活」与「常量被真实消费」。 */
const rawModules = import.meta.glob('./ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
const SRC = String(Object.values(rawModules)[0] ?? '')

describe('RA4-S2 测试档开关直切（owner 拍板：取消确认框，点击直接转换）——源级守卫', () => {
  it('确认框根因行 window.confirm 禁止复活', () => {
    expect(SRC).not.toContain('window.confirm')
  })

  it('zenBaseUrl 空守卫=持久内联 amber 文案（旧瞬时 flash 即 return=开关不亮无反馈根因）', () => {
    expect(TEST_PRESET_ZEN_GUARD_NOTE).toBe('请先填写并保存 Zen Key，测试档走 Zen 通道')
    expect(SRC).toContain('TEST_PRESET_ZEN_GUARD_NOTE')
    expect(SRC).toContain('setPresetGuardHint(true)')
  })

  it('成功亮起+常驻绿字文案（模型组实名逐字）', () => {
    expect(TEST_PRESET_ON_NOTE).toBe('测试档已启用（解析 mineru · embedding qwen3-VL · 主模型 mimo-V2.5 Free · 审核 zen:Big Pickle）')
    expect(SRC).toContain('TEST_PRESET_ON_NOTE')
  })

  it('退出后常驻灰字「标准档」', () => {
    expect(TEST_PRESET_OFF_NOTE).toBe('标准档')
    expect(SRC).toContain('TEST_PRESET_OFF_NOTE')
  })

  it('审核子开关从测试档卡删除（根因行 onReviewSubSwitch/关闭态短语禁止复活——S3 合并栏新名接管）', () => {
    expect(SRC).not.toContain('onReviewSubSwitch')
    expect(SRC).not.toContain('REVIEW_SUB_OFF_NOTE')
    expect(SRC).not.toContain('审核时用主模型')
  })

  it('PUT 失败开关回弹+持久红字（不做半开状态）', () => {
    expect(SRC).toContain('presetFailMsg &&')
    expect(SRC).toContain('setPresetFailMsg(')
  })
})
