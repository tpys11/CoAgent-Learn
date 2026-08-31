import { describe, it, expect } from 'vitest'
import { SERVICE_GROUPS } from './serviceGroups'

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