/**
 * B3：Markdown 分片渐进渲染的「逐字节相等」守卫 + 缓存策略守卫。
 *
 * 断言定位（决策 24）：
 * - test_chunked_assembly_*（语料表）/ test_progressive_prefix_property /
 *   test_fuzz_*：新行为断言——分片规则放松（如在列表边界切分）或围栏感知破坏
 *   时，恰这些条红。这是 B3 的核心安全断言：分片渲染与整文渲染必须逐字节相等。
 * - test_xss_*：新行为断言——html:false 被破坏（改 html:true）时红。
 * - test_cache_*：缓存淘汰/命中率——淘汰上限被移除或改回条目数时红。
 *   （回归控制部分：同输入渲染结果确定性，由 markdown-it 纯函数性保证。）
 *
 * 设计：分片只发生在「可证明安全」的块边界（_splitMdChunks/_boundarySafe，
 * 围栏感知 + 松列表延续保守合并），尾段整文渲染不缓存。仓库无 jsdom，
 * node 环境纯逻辑测试（isFlowNode 先例）。
 */
import { describe, expect, it } from 'vitest'
import {
  renderMd, annotateCitations, renderMdProgressive, renderMdCached,
  _splitMdChunks, _mdStats, _mdCache,
} from './AssistantMessage'

const whole = (s: string) => annotateCitations(renderMd(s))

/** 核心断言：渐进渲染（分片缓存 + 尾段整文）== 整文渲染（逐字节） */
function expectByteEqual(text: string) {
  const split = _splitMdChunks(text)
  let assembled: string
  if (split === null) {
    assembled = renderMdCached(text)                       // 整文回退路径
  } else {
    assembled = ''
    for (const c of split.chunks) assembled += renderMdCached(c)
    if (split.tail) assembled += annotateCitations(renderMd(split.tail))
  }
  expect(assembled).toBe(whole(text))
}

// ---------- 语料表：每个已知结构性陷阱至少一条 ----------

const CORPUS: Array<[string, string]> = [
  ['简单段落', '第一段内容。\n\n第二段内容。'],
  ['单段无空行', '只有一段，没有空行分隔。'],
  ['ATX 标题', '# 标题一\n\n正文段落。\n\n## 标题二\n\n更多正文。'],
  ['Setext 标题', '段落一。\n\n标题文字\n========\n\n下一段。'],
  ['围栏闭合', '前面文字。\n\n```js\nconst x = 1\n\nconst y = 2\n```\n\n后面文字。'],
  ['波浪线围栏', '文字。\n\n~~~\ncode block\n~~~\n\n尾段。'],
  ['围栏未闭合（流式中）', '文字。\n\n```js\nconst x = 1\n\n还在输入'],
  ['围栏后紧跟段落', '```\ncode\n```\n紧贴围栏的段落。'],
  ['单层列表', '引导句。\n\n- 甲\n- 乙\n- 丙'],
  ['有序列表', '1. 第一\n2. 第二\n3. 第三'],
  ['星号列表', '* 项目一\n* 项目二'],
  ['松列表（空行分隔，整文一个 ul）', '- 甲\n\n- 乙\n\n- 丙'],
  ['列表后接段落（列表必须结束）', '- 甲\n- 乙\n\n普通段落，列表在此结束。'],
  ['列表项缩进续行陷阱', '- 甲\n\n  续行内容（2 空格，属于松列表项）\n\n- 乙'],
  ['有序列表 3 空格续行', '1. 甲\n\n   续行（3 空格）\n\n2. 乙'],
  ['嵌套列表', '- 甲\n  - 嵌套一\n  - 嵌套二\n- 乙\n\n后续段落。'],
  ['围栏前有列表', '- 甲\n\n```js\nconst a = 1\n```\n\n尾段文字。'],
  ['引用块', '> 引用一行\n> 引用两行\n\n正文。'],
  ['两个相邻引用块', '> 第一块\n\n> 第二块'],
  ['表格', '| 列A | 列B |\n| --- | --- |\n| 1 | 2 |\n\n表格后的段落。'],
  ['主题分割线', '段落一。\n\n---\n\n段落二。'],
  ['breaks:true 软换行', '第一行\n第二行\n第三行\n\n下一段。'],
  ['引用标注', '这是结论[来源: 教程文档#chunk-3]，另一条[来源: 指南#chunk-12]。\n\n第二段。'],
  ['html:false 行内脚本', '正文 <script>alert(1)</script> 尾部。\n\n<script>evil()</script>'],
  ['html:false 事件属性', '<img src=x onerror=alert(1)> 图。\n\n下一段。'],
  ['中文长段落', '这是一段较长的中文内容，用于测试分片边界在 CJK 文本上的表现。'.repeat(5) + '\n\n' + '第二段中文内容，包含标点符号：，。；：？！'.repeat(4)],
  ['连续空行', '段落一。\n\n\n\n段落二（前有三个换行）。\n\n\n段落三。'],
  ['首行即围栏', '```\n第一行就是围栏\n```\n\n后续。'],
  ['段落+缩进码块', '普通段落。\n\n    这是 4 空格缩进的码块\n    第二行\n\n结尾段落。'],
  ['围栏含列表样文本', '说明：\n\n```\n- 这不是列表，是围栏内容\n- 另一行\n```\n\n真列表：\n\n- 真·项目'],
]

// ---------- 一致性：语料表 ----------

describe('B3 分片 vs 整文 逐字节相等（语料表）', () => {
  for (const [name, text] of CORPUS) {
    it(`语料：${name}`, () => {
      expectByteEqual(text)
    })
  }

  it('语料覆盖了关键陷阱（存在性守卫：规则回退时这些语料必须仍走分片或整文）', () => {
    // 松列表语料确实存在「列表→列表」边界（若规则错切成安全，语料才会暴露差异）
    const loose = '- 甲\n\n- 乙\n\n- 丙'
    const blocks = _splitMdChunks(loose)
    expect(blocks).not.toBeNull()
    // 松列表全部边界不安全 → 只有一个尾段，无分片（分片了就会产生两个 <ul>）
    expect(blocks!.chunks).toEqual([])
    // 引用定义存在 → 整文回退（null 由 renderMdProgressive 内部处理，这里直接断言）
    expect(_splitMdChunks('定义：\n\n[ref]: https://example.com\n\n使用 [text][ref]。')).toBeNull()
  })
})

// ---------- 一致性：任意前缀属性（流式场景的数学表述） ----------

describe('B3 渐进前缀属性（流式期每个前缀都必须逐字节相等）', () => {
  it('长混合文档的所有前缀', () => {
    const text = CORPUS.filter(([n]) => !n.includes('引用定义'))
      .map(([, t]) => t).join('\n\n')
    for (let i = 1; i <= text.length; i++) {
      const prefix = text.slice(0, i)
      expect(renderMdProgressive(prefix)).toBe(whole(prefix))
    }
  })

  it('流式增长场景：逐字符追加 + answer_reset 清空后重写', () => {
    const draft1 = '# 结论\n\n向量检索通过嵌入向量定位语义。\n\n- 快\n- 准'
    const draft2 = '重新生成的完整回答，包含**加粗**与 `代码`。\n\n第二段。'
    // 第一稿逐字流式
    for (let i = 1; i <= draft1.length; i++) {
      expect(renderMdProgressive(draft1.slice(0, i))).toBe(whole(draft1.slice(0, i)))
    }
    // reset 后从空重新流式（第二稿）
    for (let i = 1; i <= draft2.length; i++) {
      expect(renderMdProgressive(draft2.slice(0, i))).toBe(whole(draft2.slice(0, i)))
    }
  })
})

// ---------- 一致性：种子模糊（LCG 确定性，暴露规则盲区） ----------

const BLOCK_POOL = [
  '普通段落，中文内容。',
  '# 标题行',
  '- 列表项甲\n- 列表项乙',
  '- 松列表项\n\n- 松列表项二',
  '1. 有序一\n2. 有序二',
  '```js\nconst x = 1\n```',
  '```\n未闭合围栏内容',
  '> 引用内容\n> 第二行',
  '| a | b |\n| - | - |\n| 1 | 2 |',
  '    缩进码块行',
  '续行（两个空格缩进）'.split('')[0] + '  2 空格缩进续行',
  '---',
  '结尾带[来源: 文档#chunk-1]的段落。',
  '<b>行内 html</b> 文本',
  '2 空格续行',
]

function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

describe('B3 种子模糊（200 组随机块拼接，逐字节相等）', () => {
  it('LCG 确定性模糊', () => {
    const rand = lcg(20260830)
    for (let iter = 0; iter < 200; iter++) {
      const n = 1 + Math.floor(rand() * 6)
      const parts: string[] = []
      for (let k = 0; k < n; k++) parts.push(BLOCK_POOL[Math.floor(rand() * BLOCK_POOL.length)])
      const text = parts.join('\n\n') + (rand() < 0.3 ? '\n\n未完的尾段' : '')
      let assembled: string
      const split = _splitMdChunks(text)
      if (split === null) assembled = renderMdCached(text)
      else {
        assembled = ''
        for (const c of split.chunks) assembled += renderMdCached(c)
        if (split.tail) assembled += annotateCitations(renderMd(split.tail))
      }
      if (assembled !== whole(text)) {
        throw new Error(`模糊第 ${iter} 组失败，文本：\n${JSON.stringify(text)}`)
      }
    }
  })
})

// ---------- XSS：html:false 未被破坏 ----------

describe('B3 XSS 防护（html:false）', () => {
  it('整文路径：script 标签被转义', () => {
    const html = whole('<script>alert(1)</script>\n\n<b>x</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('分片路径：渐进渲染同样转义（含跨分片拼装）', () => {
    const text = '第一段 <script>a()</script>\n\n<script>b()</script>'
    expect(renderMdProgressive(text)).toBe(whole(text))
    expect(renderMdProgressive(text)).not.toContain('<script')
    const html = renderMdProgressive('<img src=x onerror=alert(1)>\n\n后续')
    expect(html).not.toContain('<img')
  })
})

// ---------- 缓存策略：按累计字符数淘汰 ----------

describe('B3 缓存淘汰（≤2MB，按字符数 FIFO）', () => {
  it('超过上限后体积回落且仍在写入（上限被移除/改回条目数时红）', () => {
    _mdCache.clear()
    _mdStats.chars = 0
    const big = 'x'.repeat(300 * 1024)   // 300KB/条 → 8 条触发 2MB 上限
    for (let i = 0; i < 10; i++) renderMdCached(`${big}-${i}`)
    expect(_mdStats.chars).toBeLessThanOrEqual(2 * 1024 * 1024 + big.length)
    expect(_mdCache.size).toBeLessThan(10)
    // FIFO：最早写入的 key 已被淘汰
    expect(_mdCache.has(`${big}-0`)).toBe(false)
    expect(_mdCache.has(`${big}-9`)).toBe(true)
    _mdCache.clear()
    _mdStats.chars = 0
  })
})

describe('B3 历史消息缓存命中率', () => {
  it('30 条历史消息二次渲染命中率 ≥95%', () => {
    _mdCache.clear()
    const texts = Array.from({ length: 30 }, (_, i) =>
      `第 ${i} 条历史消息的正文。\n\n- 要点甲-${i}\n- 要点乙-${i}\n\n结论[来源: 文档${i}#chunk-1]。`)
    _mdStats.parses = 0
    _mdStats.hits = 0
    for (const t of texts) renderMdCached(t)
    expect(_mdStats.parses).toBe(30)          // 首次：全部解析
    _mdStats.parses = 0
    _mdStats.hits = 0
    for (const t of texts) renderMdCached(t)   // 二次：应全部命中
    const hitRate = _mdStats.hits / (_mdStats.hits + _mdStats.parses)
    expect(hitRate).toBeGreaterThanOrEqual(0.95)
    _mdCache.clear()
  })
})
