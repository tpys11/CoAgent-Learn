import { describe, it, expect } from 'vitest'
import {
  PRESET_IDS, PRESET_LABELS,
  testPresetPutBody, testPresetLsWrites, standardPresetPutBody,
} from './presets'

describe('presets', () => {
  it('PRESET_IDS 包含 standard/test/custom', () => {
    expect(PRESET_IDS).toEqual(['standard', 'test', 'custom'])
  })

  it('PRESET_LABELS 为每个预设提供中文名', () => {
    expect(PRESET_LABELS.standard).toContain('标准')
    expect(PRESET_LABELS.test).toContain('测试')
    expect(PRESET_LABELS.custom).toContain('自定义')
  })

  it('testPresetPutBody 四键逐键断言（owner 指定固定模型组）', () => {
    const b = testPresetPutBody()
    expect(b.parse_engine).toBe('mineru')
    expect(b.embedding_model).toBe('Qwen/Qwen3-VL-Embedding-8B')
    expect(b.review_model_research).toBe('zen:Big Pickle')
    expect(b.review_follow_main).toBe(false)
  })

  it('testPresetLsWrites 返回 zen 写集三键', () => {
    const w = testPresetLsWrites('https://opencode.ai/zen/v1')
    expect(w.provider).toBe('zen')
    expect(w.model).toBe('mimo-V2.5 Free')
    expect(w.zenBaseUrl).toBe('https://opencode.ai/zen/v1')
  })

  it('testPresetLsWrites 空 zenBaseUrl 拒绝（调用方禁走约束）', () => {
    expect(() => testPresetLsWrites('')).toThrow()
  })

  it('standardPresetPutBody 恢复本地解析+审核回主模型（follow_main）', () => {
    const b = standardPresetPutBody()
    expect(b.parse_engine).toBe('pymupdf4llm')
    expect(b.review_follow_main).toBe(true)
  })

  it('standardPresetPutBody 不含 review_model_research 与 embedding_model 键（T51 假恢复/embedding 不动）', () => {
    const b = standardPresetPutBody()
    expect('review_model_research' in b).toBe(false)
    expect('embedding_model' in b).toBe(false)
  })
})
