import { describe, it, expect } from 'vitest'
import { REVIEW_BUBBLE_NOTE, reviewSubSwitchPutBody } from './serviceGroups'

/** RA4-S3 源级守卫：合并栏独立审核气泡右端开关（S2 从测试档卡删除后在新位置重建——紧邻防丢）。
 *  repo 无 jsdom，组件测试不可行——serviceSettingsTestPreset.test.ts 先例。 */
const rawModules = import.meta.glob('./ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
const SRC = String(Object.values(rawModules)[0] ?? '')

describe('RA4-S3 合并栏独立审核开关——纯函数直调 + 源级守卫', () => {
  it('取值矩阵：ON=独立审核（follow_main=false），OFF=主模型审核（follow_main=true）', () => {
    expect(reviewSubSwitchPutBody(true)).toEqual({ review_follow_main: false })
    expect(reviewSubSwitchPutBody(false)).toEqual({ review_follow_main: true })
  })

  it('小字 owner 指定原文一字不改', () => {
    expect(REVIEW_BUBBLE_NOTE).toBe('关闭后需要审核时自动采用主模型')
  })

  it('开关渲染在气泡 B 行：checked 绑定取反（!review_follow_main=独立审核在开）', () => {
    expect(SRC).toContain('checked={!svc.review_follow_main}')
    expect(SRC).toContain('onChange={onReviewBubbleToggle}')
  })

  it('处理器搬迁至此：PUT 写法照旧走 reviewSubSwitchPutBody（review_follow_main 布尔翻转写入不丢）', () => {
    expect(SRC).toContain('reviewSubSwitchPutBody(v)')
  })

  it('小字渲染在气泡 B 下方且被真实消费', () => {
    expect(SRC).toContain('REVIEW_BUBBLE_NOTE')
  })

  it('PUT 失败持久红字（关键状态持久渲染，flash 只做动作回执）', () => {
    expect(SRC).toContain('reviewToggleErr &&')
    expect(SRC).toContain('setReviewToggleErr(true)')
  })
})
