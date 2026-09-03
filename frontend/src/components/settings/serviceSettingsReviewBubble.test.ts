import { describe, it, expect } from 'vitest'
import { REVIEW_BUBBLE_NOTE } from './serviceGroups'

/** RC4-S2 源级守卫：合并栏「独立审核 follow_main」开关退役（owner 09-03 终版：判卷路由=
 *  档位定值格，无用户开关语义）——原 RA4-S3 开关接线断言按退役语义改写：开关及其处理器
 *  不得在组件源码残留（防回潮），气泡 B 下方保留一行档位定值说明。
 *  repo 无 jsdom，组件测试不可行——serviceSettingsTestPreset.test.ts 先例。 */
const rawModules = import.meta.glob('./ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
const SRC = String(Object.values(rawModules)[0] ?? '')

describe('RC4-S2 合并栏审核开关退役——退役守卫 + 说明文案接线', () => {
  it('退役守卫：follow_main 开关及其处理器不再出现在组件源码（not.toContain 防回潮）', () => {
    expect(SRC).not.toContain('review_follow_main')
    expect(SRC).not.toContain('reviewSubSwitchPutBody')
    expect(SRC).not.toContain('onReviewBubbleToggle')
    expect(SRC).not.toContain('review_model_research')
  })

  it('说明文案=owner 终版档位定值（一字不改），旧开关小字退役', () => {
    expect(REVIEW_BUBBLE_NOTE).toBe('标准档判卷=Qwen2.5-72B（独立厂商），测试档=big-pickle')
    expect(REVIEW_BUBBLE_NOTE).not.toBe('关闭后需要审核时自动采用主模型')
  })

  it('说明文案渲染在气泡 B 下方且被真实消费', () => {
    expect(SRC).toContain('REVIEW_BUBBLE_NOTE')
  })

  it('气泡 B 显示值改传 effective_model（档位定值格权威，退役 review_model 直传）', () => {
    expect(SRC).toContain('kbServiceBubbles(svc.review_effective_model)')
    expect(SRC).not.toContain('kbServiceBubbles(svc.review_model)')
  })

  it('RA5-S3 布局遗产保留：气泡容器恒上下排列（owner 两次点名宽屏也上下）', () => {
    expect(SRC).not.toContain('sm:flex-row')
  })
})
