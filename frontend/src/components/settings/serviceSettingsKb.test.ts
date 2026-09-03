import { describe, it, expect } from 'vitest'
import { WIKI_ENTRIES } from '../../data/wikiEntries'
import { kbServiceBubbles } from './ServiceSettings'

/** RA2-S3 bge 展示清算（owner 反馈④）：教学例句改 qwen 系 + 全 src 源级扫描钉「bge 只能以重排器形态出现」。
 *  取源用 vite ?raw glob（tsconfig 无 @types/node，node:fs 类型不可用）；扫描排除 *.test.*（测试断言=合法）。 */
const rawModules = import.meta.glob(['../../**/*.ts', '../../**/*.tsx'], { query: '?raw', import: 'default', eager: true })

describe('RA2-S3 bge 展示清算（owner 反馈④）', () => {
  it('wikiEntries Embedding 词条例句不再以 bge 举例（改 qwen 系，语义不变）', () => {
    const detail = WIKI_ENTRIES.find(e => e.name === 'Embedding（向量化）')?.detail ?? ''
    expect(detail).not.toMatch(/bge/i)
    expect(detail).toMatch(/Qwen/)
  })

  it('src 全量（非测试文件）bge 仅得以 bge-reranker（重排器）形态出现——bge 作 embedding 展示零残留', () => {
    const offenders: string[] = []
    for (const [path, raw] of Object.entries(rawModules)) {
      if (/\.test\./.test(path)) continue // 测试断言=合法（派发单 S3③ 口径）
      String(raw).split('\n').forEach((line, i) => {
        if (/bge/i.test(line) && !/bge-reranker/i.test(line)) offenders.push(`${path}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('RA2-S3 气泡双联（owner 反馈④）——纯函数直调', () => {
  it('气泡 A「知识库服务」：向量化侧带 qwen3-VL 全名（1024 维，文字与图片同一向量空间）·重排 bge-reranker 分开表述', () => {
    const a = kbServiceBubbles('Qwen/Qwen2.5-72B-Instruct')[0]
    expect(a.title).toBe('知识库服务')
    // owner 指定文案逐字钉死（小字常量化先例）
    expect(a.lines[0]).toBe('向量化：Qwen/Qwen3-VL-Embedding-8B（1024 维，文字与图片同一向量空间）· 重排：BAAI/bge-reranker-v2-m3')
    // 沿用既有括号说明逐字
    expect(a.lines[1]).toBe('（上传自动切块向量化 + 重排 + 跨模态检索）')
  })

  it('气泡 B「独立审核模型」= 入参动态透传（写死会在改 REVIEW_MODEL 时说谎——变异②靶）', () => {
    const b = kbServiceBubbles('Qwen/Qwen2.5-72B-Instruct')[1]
    expect(b.title).toBe('独立审核模型')
    expect(b.lines[0]).toBe('Qwen/Qwen2.5-72B-Instruct')
    // 换值即跟随——钉「动态」本身而非某个字面值
    expect(kbServiceBubbles('zen:Big Pickle')[1].lines[0]).toBe('zen:Big Pickle')
  })
})
