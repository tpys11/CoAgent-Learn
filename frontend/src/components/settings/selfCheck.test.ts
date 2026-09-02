import { describe, it, expect } from 'vitest'
import { computeSelfCheckRows, SelfCheckInput } from './selfCheck'
import { selfCheckProbeKey } from './SelfCheckCard'

/** RA3-S2 源级守卫：repo 无 jsdom（serviceGroups.ts 头注先例），接线文本用 ?raw 钉住——
 *  isZen 判据与 selfCheckProbeKey 必须被真实消费，防纯函数过测而组件内联回退。 */
const rawCard = import.meta.glob('./SelfCheckCard.tsx', { query: '?raw', import: 'default', eager: true })
const CARD_SRC = String(Object.values(rawCard)[0] ?? '')

describe('computeSelfCheckRows', () => {
  const baseInput: SelfCheckInput = {
    providerKeySet: true,
    zenKeySet: false,
    embeddingKeySet: true,
    parseEngine: 'pymupdf4llm',
    mineruKeySet: false,
    reviewResearchModel: '',
    followMain: false,
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

  // ── review ──
  it('review row: follow_main=true -> 主模型通道（RA2-S1：模型名=chat 行同源具体名，禁「主模型」字面量）', () => {
    const input = { ...baseInput, followMain: true, reviewResearchModel: 'zen:Big Pickle', providerKeySet: true }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
    expect(review?.model).toBe('deepseek-v4-flash-vision-exp')
    expect(review?.model).not.toBe('主模型')
  })

  it('review row: follow_main=true 但无对话 key -> warn', () => {
    const input = { ...baseInput, followMain: true, providerKeySet: false }
    expect(computeSelfCheckRows(input).find(r => r.id === 'review')?.state).toBe('warn')
  })

  it('review row: zen: 前缀 -> 模型名=reviewResearchModel 原值，key 齐则 ok', () => {
    const input = { ...baseInput, reviewResearchModel: 'zen:Big Pickle', zenKeySet: true }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
    expect(review?.model).toBe('zen:Big Pickle')
  })

  it('review row: zen: 前缀缺 zen key -> warn', () => {
    const input = { ...baseInput, reviewResearchModel: 'zen:Big Pickle', zenKeySet: false }
    expect(computeSelfCheckRows(input).find(r => r.id === 'review')?.state).toBe('warn')
  })

  it('review row: "/" 模型缺硅基流动 key -> warn', () => {
    const input = { ...baseInput, reviewResearchModel: 'Qwen/Qwen2.5-72B-Instruct', embeddingKeySet: false }
    expect(computeSelfCheckRows(input).find(r => r.id === 'review')?.state).toBe('warn')
  })

  it('review row: 空 research 模型 -> warn「审核模型（研究档判卷走主模型）」', () => {
    const review = computeSelfCheckRows(baseInput).find(r => r.id === 'review')
    expect(review?.state).toBe('warn')
    // RA2 补充修复（验收打回）：text 也是 owner 反馈②点名的展示面，禁旧短语「研究档判卷=主模型同源」
    expect(review?.text).toBe('审核模型（研究档判卷走主模型）')
    expect(review?.text).not.toContain('主模型同源')
    // RA2-S1：空 research 判卷回落主模型（pick_judge: REVIEW_MODEL_RESEARCH or MODEL_MAIN），显具体名
    expect(review?.model).toBe('deepseek-v4-flash-vision-exp')
  })

  // ── RA2-S1：模型名同源与缺省兜底（owner 反馈①②——chat 行与 review 行 follow_main 同一具体名）──
  it('RA2-S1: chatModel 缺省 -> chat 行兜底 deepseek-v4-flash-vision-exp（与 backend MODEL_MAIN 同值）', () => {
    // 完整字面量构造（不写 chatModel 键），模拟消费端未喂
    const input: SelfCheckInput = {
      providerKeySet: true,
      zenKeySet: false,
      embeddingKeySet: true,
      parseEngine: 'pymupdf4llm',
      mineruKeySet: false,
      reviewResearchModel: '',
      followMain: false,
      embeddingModel: 'Qwen/Qwen3-VL-Embedding-8B',
    }
    expect(computeSelfCheckRows(input).find(r => r.id === 'chat')?.model).toBe('deepseek-v4-flash-vision-exp')
  })

  it('RA2-S1: chatModel 缺省 + follow_main -> review 行兜底同一具体名（两行同源）', () => {
    const input: SelfCheckInput = {
      providerKeySet: true,
      zenKeySet: false,
      embeddingKeySet: true,
      parseEngine: 'pymupdf4llm',
      mineruKeySet: false,
      reviewResearchModel: '',
      followMain: true,
      embeddingModel: 'Qwen/Qwen3-VL-Embedding-8B',
    }
    const review = computeSelfCheckRows(input).find(r => r.id === 'review')
    expect(review?.model).toBe('deepseek-v4-flash-vision-exp')
    expect(review?.model).not.toBe('主模型')
  })

  it('RA2-S1: 测试档（LS.model=mimo）follow_main -> review 行=chat 行同源显 mimo（两档语义不搅）', () => {
    const input = { ...baseInput, chatModel: 'mimo-V2.5 Free', followMain: true }
    const rows = computeSelfCheckRows(input)
    expect(rows.find(r => r.id === 'chat')?.model).toBe('mimo-V2.5 Free')
    expect(rows.find(r => r.id === 'review')?.model).toBe('mimo-V2.5 Free')
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

  it('review/parse/embedding 行不条件化（后端已按 review_model_research 自路由，重复条件化=双重处理）', () => {
    expect(selfCheckProbeKey('review', true)).toBe('review')
    expect(selfCheckProbeKey('parse', true)).toBe('parse')
    expect(selfCheckProbeKey('embedding', true)).toBe('embedding')
    expect(selfCheckProbeKey('review', false)).toBe('review')
  })

  it('源级守卫：isZen 判据与 selfCheckProbeKey 被组件真实消费', () => {
    expect(CARD_SRC).toContain("const isZen = provider === 'zen'")
    expect(CARD_SRC).toContain('selfCheckProbeKey(r.id, isZen)')
  })
})
