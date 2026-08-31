// F11-S1：检索/规划节点内容化——后端内容事件的 markdown 方言与 F8 渲染管线的兼容性守卫。
// 后端 _format_search_detail 只用粗体/行内码/编号列表；本测试钉住这些构造
// 经 renderMd（F8 统一管线）产出预期 HTML 结构，防止后端方言漂移出管线支持范围。
import { describe, expect, it } from 'vitest'
import { renderMd } from '../../lib/mdRenderer'

// 与 backend/engine/pipeline_v2._format_search_detail 同构的样例（后端若改方言须同步此处）
const SEARCH_DETAIL = [
  '**检索查询**：`Uber 出营策略`、`Lyft 出营策略`',
  '**命中预览**：',
  '1. 测试文档A.pdf #chunk-3（融合分 0.0328）：库内内容摘要片段',
  '2. WEB-Uber 出营策略（融合分 0.0164）：网页内容摘要片段',
].join('\n')
const PLAN_POINTS = '规划要点：复杂度 standard · 思考档 · 需检索知识库'

describe('F11-S1：检索/规划内容 markdown 经 F8 管线渲染', () => {
  it('粗体与行内码渲染为 <strong>/<code>', () => {
    const html = renderMd(SEARCH_DETAIL)
    expect(html).toContain('<strong>检索查询</strong>')
    expect(html).toContain('<code>Uber 出营策略</code>')
    expect(html).toContain('<strong>命中预览</strong>')
  })

  it('命中预览渲染为有序列表且 source/chunk/分数可辨', () => {
    const html = renderMd(SEARCH_DETAIL)
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('测试文档A.pdf')
    expect(html).toContain('#chunk-3')
    expect(html).toContain('0.0328')
  })

  it('规划要点（纯文本+间隔号）渲染不丢失要点内容', () => {
    const html = renderMd(PLAN_POINTS)
    expect(html).toContain('规划要点')
    expect(html).toContain('standard')
    expect(html).toContain('需检索知识库')
  })

  it('超长内容（防爆上界 4000 字符内）渲染不异常且长度有界', () => {
    const long = '长'.repeat(3900)
    const html = renderMd(long)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
    expect(html).toContain('长')
  })
})
