import { describe, it, expect } from 'vitest'
import {
  PRESET_IDS, PRESET_LABELS,
  testPresetPutBody, testPresetLsWrites, standardPresetPutBody, goTestPresetLsWrites,
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

  it('testPresetPutBody 三键逐键断言（RC4-S1：判卷随档位定死，退役键不再出现）', () => {
    const b = testPresetPutBody()
    expect(b.parse_engine).toBe('mineru')
    expect(b.embedding_model).toBe('Qwen/Qwen3-VL-Embedding-8B')
    expect('review_model_research' in b).toBe(false)
    expect('review_follow_main' in b).toBe(false)
  })

  it('testPresetLsWrites 返回 zen 写集三键', () => {
    const w = testPresetLsWrites('https://opencode.ai/zen/v1')
    expect(w.provider).toBe('zen')
    expect(w.model).toBe('mimo-v2.5-free')
    expect(w.zenBaseUrl).toBe('https://opencode.ai/zen/v1')
  })

  it('testPresetLsWrites 空 zenBaseUrl 拒绝（调用方禁走约束）', () => {
    expect(() => testPresetLsWrites('')).toThrow()
  })

  it('standardPresetPutBody 恢复本地解析（RC4-S1：判卷随档位自动回 standard，无 PUT 键）', () => {
    const b = standardPresetPutBody()
    expect(b.parse_engine).toBe('pymupdf4llm')
    expect('review_follow_main' in b).toBe(false)
  })

  it('standardPresetPutBody 不含 review_model_research 与 embedding_model 键（T51 假恢复/embedding 不动）', () => {
    const b = standardPresetPutBody()
    expect('review_model_research' in b).toBe(false)
    expect('embedding_model' in b).toBe(false)
  })

  it('R-D S4: testPresetPutBody 携带 zen_test_mode=true（测试档后台链路总开关）', () => {
    expect(testPresetPutBody().zen_test_mode).toBe(true)
  })

  it('R-D S4: standardPresetPutBody 携带 zen_test_mode=false（退出测试档=后台链路回标准档）', () => {
    expect(standardPresetPutBody().zen_test_mode).toBe(false)
  })

  it('S4: testPresetPutBody 通道定向——默认 zen 兼容旧调用，显式 go 落 test_channel', () => {
    expect(testPresetPutBody().test_channel).toBe('zen')
    expect(testPresetPutBody('go').test_channel).toBe('go')
    expect(testPresetPutBody('zen').test_channel).toBe('zen')
  })

  it('S4: goTestPresetLsWrites 返回 go 写集三键（model=双源同值⑤字面）', () => {
    const w = goTestPresetLsWrites('https://gw.example.com/v1')
    expect(w.provider).toBe('go')
    expect(w.model).toBe('GLM-5.3-Flash')
    expect(w.goBaseUrl).toBe('https://gw.example.com/v1')
  })

  it('S4: goTestPresetLsWrites 空 goBaseUrl 拒绝（调用方禁走约束，对称 zen 版）', () => {
    expect(() => goTestPresetLsWrites('')).toThrow()
  })
})
