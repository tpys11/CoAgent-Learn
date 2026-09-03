/**
 * F8-S5 统一 markdown 渲染管线（单一事实源）：全站 markdown 输出共用一套
 * markdown-it 配置——html:false 防 XSS、linkify、breaks 换行、KaTeX 公式、
 * mermaid/echarts 围栏异步渲染（复用 KbReaderModal 既有实现逻辑）。
 *
 * 边界（派发单 S5）：
 *  - ObsidianView 保持自有高级管线（callout/双链/嵌入）不动，不在本管线内；
 *  - KaTeX CSS 全局只引一次（ObsidianView.tsx 已引，Vite 去重），本模块不重复引；
 *  - mermaid/echarts 走动态 import：模块加载保持轻量（vitest node 环境可安全 import），
 *    首个图表围栏出现时才拉取（vendor 分包见 vite.config manualChunks）。
 */
import MarkdownIt from 'markdown-it'
import katexPlugin from 'markdown-it-katex'

let mmdSeq = 0
let ecSeq = 0
let mermaidReady = false

/** 图表容器样式一次性注入（原 kr-/rp- 前缀样式上收为全局 mdx- 前缀——
 *  此前仅 KbReaderModal/SpecialOutputPane 挂载期有样式，其余消费方的图表无样式）。 */
function ensureChartStyles() {
  if (typeof document === 'undefined' || document.getElementById('mdx-chart-styles')) return
  const tag = document.createElement('style')
  tag.id = 'mdx-chart-styles'
  tag.textContent = `
    .mdx-mermaid { background: var(--bg-panel, #fff); border: 1px solid var(--border-color, #e5e5e5); border-radius: 10px; padding: 0.8em; text-align: center; overflow-x: auto; }
    .mdx-echarts { width: 100%; }
  `
  document.head.appendChild(tag)
}

async function renderMermaid(id: string, code: string, errClass: string) {
  if (typeof document === 'undefined') return  // node 环境（vitest）无 DOM：占位即终态
  try {
    const { default: mermaid } = await import('mermaid')
    if (!mermaidReady) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' })
      mermaidReady = true
    }
    const { svg } = await mermaid.render(id, code)
    document.getElementById(id)!.innerHTML = svg
  } catch {
    const el = document.getElementById(id)
    if (el) el.innerHTML = `<div class="${errClass}">图表渲染失败</div>`
  }
}

async function renderEcharts(id: string, code: string) {
  if (typeof document === 'undefined') return  // node 环境（vitest）无 DOM：占位即终态
  const el = document.getElementById(id)
  if (!el) return
  try {
    const option = JSON.parse(code)
    const echarts = await import('echarts')
    const old = echarts.getInstanceByDom(el)
    if (old) old.dispose()
    const chart = echarts.init(el)
    chart.setOption(option)
  } catch {
    el.innerHTML = '<pre class="text-[11px] overflow-x-auto">图表配置无法解析</pre>'
  }
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
md.use(katexPlugin, { throwOnError: false, errorColor: '#d9534f' })

const _fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const t = tokens[idx]
  const info = t.info.trim()
  if (info === 'mermaid') {
    const id = 'mdx-mmd-' + (++mmdSeq)
    ensureChartStyles()
    setTimeout(() => { void renderMermaid(id, t.content, 'text-red-500 text-[11px]') }, 0)
    return `<pre id="${id}" class="mdx-mermaid">加载图表…</pre>`
  }
  if (info === 'echarts') {
    const id = 'mdx-ec-' + (++ecSeq)
    ensureChartStyles()
    setTimeout(() => { void renderEcharts(id, t.content) }, 0)
    return `<div id="${id}" class="mdx-echarts" style="height:320px"></div>`
  }
  return _fence(tokens, idx, options, env, slf)
}

/** 统一渲染入口：全站 markdown → HTML（XSS 安全：html:false） */
export const renderMd = (text: string): string => md.render(text || '')
