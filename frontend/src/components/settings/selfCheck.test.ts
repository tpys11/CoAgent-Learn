import { describe, it, expect } from 'vitest'
import { computeSelfCheckRows, SelfCheckInput } from './selfCheck'
import { selfCheckProbeKey } from './SelfCheckCard'

/** RA3-S2 源级守卫：repo 无 jsdom（serviceGroups.ts 头注先例），接线文本用 ?raw 钉住——
 *  isZen 判据与 selfCheckProbeKey 必须被真实消费，防纯函数过测而组件内联回退。 */
const rawCard = import.meta.glob('./SelfCheckCard.tsx', { query: '?raw', import: 'default', eager: true })
const CARD_SRC = String(Object.values(rawCard)[0] ?? '')

describe('RA5 冒烟补充：探测键名映射', () => {
  it('embedding 行 → text_embedding（后端键名）', () => {
    expect(selfCheckProbeKey('embedding', false)).toBe('text_embedding')
  })
  it('chat 标准档仍为 chat', () => {
    expect(selfCheckProbeKey('chat', false)).toBe('chat')
  })
})

describe('computeSelfCheckRows', () => {
  const baseInput: SelfCheckInput = {
    providerKeySet: true,
    zenKeySet: false,
    embeddingKeySet: true,
    parseEngine: 'pymupdf4llm',
    mineruKeySet: false,
    reviewEffectiveModel: 'Qwen/Qwen2.5-72B-Instruct',
    chatModel: 'deepseek-v4-flash-vision-exp',
    embeddingModel: 'Qwen/Qwen3-VL-Embedding-8B',
  }

  // ── RA-S4 行集结构（四项，vision/kb 删除）──
  it('rows 恰为四行 chat/review/parse/embedding', () => {
    expect(computeSelfCheckRows(baseInput).map(r => r.id)).toEqual(['chat', 'review', 'parse', 'embedding'])
  })

  it('vision 行不存在', () => {
    expect(computeSelfCheckRows(baseInput).map(r => r.id)).not.toContain('vision')
  })

  it('kb 行不存在（rerank 说明随行删除，四项之外不展示）', () => {
    expect(computeSelfCheckRows(baseInput).map(r => r.id)).not.toContain('kb')
  })

  // ── chat ──
  it('chat row: providerKeySet true -> ok', () => {
    const chat = computeSelfCheckRows(baseInput).find(r => r.id === 'chat')
    expect(chat?.state).toBe('ok')
  })

  it('chat row: providerKeySet false, zenKeySet true -> ok', () => {
    const input = { ...baseInput, providerKeySet: false, zenKeySet: true }
    expect(computeSelfCheckRows(input).find(r => r.id === 'chat')?.state).toBe('ok')
  })

  it('chat row: both false -> missing', () => {
    const input = { ...baseInput, providerKeySet: false, zenKeySet: false }
    expect(computeSelfCheckRows(input).find(r => r.id === 'chat')?.state).toBe('missing')
  })

  it('chat row: 模型名=LS 当前模型名', () => {
    const input = { ...baseInput, chatModel: 'mimo-V2.5 Free' }
    expect(computeSelfCheckRows(input).find(r => r.id === 'chat')?.model).toBe('mimo-V2.5 Free')
  })

  // ── review（RC4-S2 改写：判卷=档位定值格，通道判定由 effective 实名驱动）──
  it('review row: standard 档（effective=Qwen72B）-> SF 通道，embeddingKeySet=true -> ok', () => {
    const input = { ...baseInput, providerKeySet: false }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
    expect(review?.model).toBe('Qwen/Qwen2.5-72B-Instruct')
    expect(review?.text).toBe('审核模型已配置')
  })

  it('review row: standard 档缺硅基流动 key -> warn「审核模型需要硅基流动 Key」', () => {
    const input = { ...baseInput, embeddingKeySet: false }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.state).toBe('warn')
    expect(review?.text).toBe('审核模型需要硅基流动 Key')
  })

  it('review row: test 档（effective=big-pickle）-> zen 通道，状态按 zenKeySet 判定', () => {
    const input = { ...baseInput, reviewEffectiveModel: 'big-pickle', zenKeySet: true }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
    expect(review?.model).toBe('big-pickle')
    const noKey = computeSelfCheckRows({ ...input, zenKeySet: false }).find(r => r.id === 'review')
    expect(noKey?.state).toBe('warn')
    expect(noKey?.text).toBe('审核模型需要 Zen Key')
  })

  it('review row: effective 未喂 -> 不做前端兜底，model 缺省且按 SF 通道判定', () => {
    const review = computeSelfCheckRows({ ...baseInput, reviewEffectiveModel: undefined }).find(r => r.id === 'review')
    expect(review?.model).toBeUndefined()
    expect(review?.state).toBe('ok')   // embeddingKeySet=true → SF 通道可用
  })

  // ── RA5-S3：审核行模型名一律改读后端 effective_model（T59 前后端漂移根因拔除）──
  it('RA5-S3: review 行 model=effective 与 chatModel 无关（两行语义分离不合并）', () => {
    const input = { ...baseInput, chatModel: 'mimo-V2.5 Free', reviewEffectiveModel: 'big-pickle', zenKeySet: true }
    const rows = computeSelfCheckRows(input)
    expect(rows.find(r => r.id === 'chat')?.model).toBe('mimo-V2.5 Free')
    expect(rows.find(r => r.id === 'review')?.model).toBe('big-pickle')
  })

  // ── RA2-S1：chat 行模型名同源与缺省兜底（owner 反馈①②）──
  it('RA2-S1: chatModel 缺省 -> chat 行兜底 deepseek-v4-flash-vision-exp（与 backend MODEL_MAIN 同值）', () => {
    // 完整字面量构造（不写 chatModel 键），模拟消费端未喂
    const input: SelfCheckInput = {
      providerKeySet: true,
      zenKeySet: false,
      embeddingKeySet: true,
      parseEngine: 'pymupdf4llm',
      mineruKeySet: false,
      embeddingModel: 'Qwen/Qwen3-VL-Embedding-8B',
    }
    expect(computeSelfCheckRows(input).find(r => r.id === 'chat')?.model).toBe('deepseek-v4-flash-vision-exp')
  })

  // ── parse ──
  it('parse row: mineru 缺 token -> warn', () => {
    const input = { ...baseInput, parseEngine: 'mineru', mineruKeySet: false }
    expect(computeSelfCheckRows(input).find(r => r.id === 'parse')?.state).toBe('warn')
  })

  it('parse row: mineru 有 token -> ok', () => {
    const input = { ...baseInput, parseEngine: 'mineru', mineruKeySet: true }
    expect(computeSelfCheckRows(input).find(r => r.id === 'parse')?.state).toBe('ok')
  })

  it('parse row: 模型名=parse_engine 值', () => {
    const input = { ...baseInput, parseEngine: 'mineru', mineruKeySet: true }
    expect(computeSelfCheckRows(input).find(r => r.id === 'parse')?.model).toBe('mineru')
  })

  // ── embedding ──
  it('embedding row: key 齐 -> ok；缺 -> missing', () => {
    expect(computeSelfCheckRows(baseInput).find(r => r.id === 'embedding')?.state).toBe('ok')
    const missing = computeSelfCheckRows({ ...baseInput, embeddingKeySet: false })
    expect(missing.find(r => r.id === 'embedding')?.state).toBe('missing')
  })

  it('embedding row: 模型名=GET embedding.model', () => {
    const input = { ...baseInput, embeddingModel: 'BAAI/bge-m3' }
    expect(computeSelfCheckRows(input).find(r => r.id === 'embedding')?.model).toBe('BAAI/bge-m3')
  })
})

// ── RA3-S2：自检档位感知（owner 反馈②：立即检测未按档位选探测源——chat 行恒吃 chat 键，
//    测试档开着也不看 chat_zen；后端 /test 两键都返回，零后端改动空间）──
describe('selfCheckProbeKey (RA3-S2)', () => {
  it('isZen=true：chat 行探测键换 chat_zen', () => {
    expect(selfCheckProbeKey('chat', true)).toBe('chat_zen')
  })

  it('isZen=false：chat 行探测键保持 chat（非 zen 不换）', () => {
    expect(selfCheckProbeKey('chat', false)).toBe('chat')
  })

  it('review/parse 行不条件化；embedding 行映射后端键名（RA5 冒烟修复）', () => {
    expect(selfCheckProbeKey('review', true)).toBe('review')
    expect(selfCheckProbeKey('parse', true)).toBe('parse')
    expect(selfCheckProbeKey('embedding', true)).toBe('text_embedding') // RA5 冒烟修复：键名对齐后端
    expect(selfCheckProbeKey('embedding', false)).toBe('text_embedding')
    expect(selfCheckProbeKey('review', false)).toBe('review')
  })

  it('源级守卫：isZen 判据与 selfCheckProbeKey 被组件真实消费', () => {
    expect(CARD_SRC).toContain("const isZen = provider === 'zen'")
    expect(CARD_SRC).toContain('selfCheckProbeKey(r.id, isZen)')
  })

  it('RA5-S3 源级守卫：SelfCheckCard 传参 review_effective_model（GET review.effective_model 消费接线）', () => {
    expect(CARD_SRC).toContain('reviewEffectiveModel: settings?.review_effective_model')
  })
})
