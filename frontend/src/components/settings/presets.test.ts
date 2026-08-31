import { describe, it, expect } from 'vitest'
import {
  PRESET_IDS, PRESET_LABELS,
  freePresetLsWrites, freePresetPutBody, standardPresetPutBody,
} from './presets'

describe('presets', () => {
  it('PRESET_IDS 包含 standard/free/custom', () => {
    expect(PRESET_IDS).toEqual(['standard', 'free', 'custom'])
  })

  it('PRESET_LABELS 为每个预设提供中文名', () => {
    expect(PRESET_LABELS.standard).toContain('标准')
    expect(PRESET_LABELS.free).toContain('免费')
    expect(PRESET_LABELS.custom).toContain('自定义')
  })

  it('freePresetLsWrites 返回 zen provider', () => {
    const w = freePresetLsWrites('mimo-v2.5-free')
    expect(w.provider).toBe('zen')
    expect(w.model).toBe('mimo-v2.5-free')
  })

  it('freePresetLsWrites 空模型名时回退默认', () => {
    const w = freePresetLsWrites('')
    expect(w.model).toBe('deepseek-v4-flash-free')
  })

  it('freePresetPutBody 包含 zen: 前缀的 review_model_research', () => {
    const b = freePresetPutBody()
    expect(b.review_model_research).toBe('zen:deepseek-v4-flash-free')
  })

  it('standardPresetPutBody 清空 review_model_research', () => {
    const b = standardPresetPutBody()
    expect(b.review_model_research).toBe('')
  })
})
