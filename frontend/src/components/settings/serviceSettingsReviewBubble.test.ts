import { describe, it, expect } from 'vitest'
import { REVIEW_BUBBLE_NOTE, reviewSubSwitchPutBody } from './serviceGroups'

/** RA4-S3 源级守卫：合并栏独立审核气泡右端开关（S2 从测试档卡删除后在新位置重建——紧邻防丢）。
 *  repo 无 jsdom，组件测试不可行——serviceSettingsTestPreset.test.ts 先例。 */
const rawModules = import.meta.glob('./ServiceSettings.tsx', { query: '?raw', import: 'default', eager: true })
const SRC = String(Object.values(rawModules)[0] ?? '')

describe('RA4-S3 合并栏独立审核开关——纯函数直调 + 源级守卫', () => {
  it('RA5-S3 取值矩阵：ON+空 research 补写默认判卷模型（T59 兑现气泡承诺），非空绝不覆盖', () => {
    expect(reviewSubSwitchPutBody(true, '')).toEqual({ review_follow_main: false, review_model_research: 'Qwen/Qwen2.5-72B-Instruct' })
    expect(reviewSubSwitchPutBody(true, 'zen:Big Pickle')).toEqual({ review_follow_main: false })
  })

  it('小字 owner 指定原文一字不改', () => {
    expect(REVIEW_BUBBLE_NOTE).toBe('关闭后需要审核时自动采用主模型')
  })

  it('开关渲染在气泡 B 行：checked 绑定取反（!review_follow_main=独立审核在开）', () => {
    expect(SRC).toContain('checked={!svc.review_follow_main}')
    expect(SRC).toContain('onChange={onReviewBubbleToggle}')
  })

  it('处理器搬迁至此：PUT 走 reviewSubSwitchPutBody 且 RA5-S3 起传 GET research 值（follow_main 布尔翻转写入不丢）', () => {
    expect(SRC).toContain('reviewSubSwitchPutBody(v, svc.review_model_research)')
  })

  it('小字渲染在气泡 B 下方且被真实消费', () => {
    expect(SRC).toContain('REVIEW_BUBBLE_NOTE')
  })

  it('PUT 失败持久红字（关键状态持久渲染，flash 只做动作回执）', () => {
    expect(SRC).toContain('reviewToggleErr &&')
    expect(SRC).toContain('setReviewToggleErr(true)')
  })

  it('RA5-S3：气泡容器恒上下排列（删除 sm:flex-row 响应式并列——owner 两次点名宽屏也上下）', () => {
    expect(SRC).not.toContain('sm:flex-row')
  })

  it('RA5-S3：处理器传 GET research 值（条件补写收敛在纯函数内，组件不做内联判定）', () => {
    expect(SRC).toContain('reviewSubSwitchPutBody(v, svc.review_model_research)')
  })
})
