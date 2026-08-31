import { describe, expect, it } from 'vitest'
import { renderMd } from './mdRenderer'

/** F8-S5 守卫：统一渲染管线——公式出 .katex 节点、XSS 安全、图表围栏占位。 */

describe('mdRenderer 统一渲染管线', () => {
  it('行内公式渲染出 .katex 节点', () => {
    const html = renderMd('质能方程 $E=mc^2$ 很重要。')
    expect(html).toContain('katex')
    expect(html).toContain('E=mc^2')
  })

  it('块级公式渲染出 .katex-display 节点', () => {
    const html = renderMd('$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$')
    expect(html).toContain('katex-display')
  })

  it('html:false 防 XSS（与既有各处渲染器同契约）', () => {
    const html = renderMd('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('breaks 换行生效、linkify 生效', () => {
    expect(renderMd('a\nb')).toContain('<br>')
    expect(renderMd('see https://example.com')).toContain('<a href="https://example.com"')
  })

  it('mermaid/echarts 围栏渲染为异步占位（mdx- 前缀）', () => {
    expect(renderMd('```mermaid\ngraph TD\nA-->B\n```')).toContain('class="mdx-mermaid"')
    expect(renderMd('```echarts\n{"series":[]}\n```')).toContain('class="mdx-echarts"')
  })

  it('普通代码围栏不受图表规则影响', () => {
    const html = renderMd('```py\nprint(1)\n```')
    expect(html).toContain('<pre>')
    expect(html).not.toContain('mdx-')
  })
})
