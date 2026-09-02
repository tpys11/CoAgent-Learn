import { describe, it, expect } from 'vitest'
import { SERVICE_GROUPS, TEST_PRESET_NOTE, KB_MERGE_NOTE, reviewSubSwitchPutBody } from './serviceGroups'

describe('SERVICE_GROUPS', () => {
  it('has correct order of group ids', () => {
    expect(SERVICE_GROUPS.map(g => g.id)).toEqual(['chat', 'kb', 'parse'])
  })
  it('has correct titles', () => {
    expect(SERVICE_GROUPS.map(g => g.title)).toEqual(['对话与审核', '知识库检索', '文档解析'])
  })
  it('has correct descriptions', () => {
    expect(SERVICE_GROUPS.map(g => g.desc)).toEqual([
      '对话主模型与审核判卷模型；DeepSeek 对话 Key 在「基础」页配置',
      '向量化 + 重排（硅基流动 Key 驱动）',
      'MinerU 未配置时自动降级本地 pymupdf4llm 兜底，功能不中断'
    ])
  })
})

describe('RA-S3 owner 指定文案（逐字断言）', () => {
  it('测试档卡小字一字不改', () => {
    expect(TEST_PRESET_NOTE).toBe('文档解析用mineru、embedding模型用qwen3-VL-embedding-8B，主模型用opencode zen计划的免费模型mimo-V2.5 Free、审核模型用opencode zen计划的免费模型Big Pickle')
  })

  it('合并栏小字一字不改', () => {
    expect(KB_MERGE_NOTE).toBe('填写一个key，选用固定的知识库服务与独立审核模型')
  })

  it('RA4-S2：确认框常量已删除（owner 拍板点击直切）', () => {
    expect(TEST_PRESET_NOTE).not.toContain('确认')
  })

  it('RA4-S2：审核子开关关闭态常量已删除（S2 删测试档卡子开关，S3 新小字接管）', () => {
    expect(KB_MERGE_NOTE).not.toContain('审核时用主模型')
  })

  it('审核子开关联动：开=独立审核(follow_main=false)，关=主模型(true)', () => {
    expect(reviewSubSwitchPutBody(true)).toEqual({ review_follow_main: false })
    expect(reviewSubSwitchPutBody(false)).toEqual({ review_follow_main: true })
  })
})