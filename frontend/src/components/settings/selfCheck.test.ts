import { describe, it, expect } from 'vitest'
import { computeSelfCheckRows, SelfCheckInput } from './selfCheck'

describe('computeSelfCheckRows', () => {
  const baseInput: SelfCheckInput = {
    providerKeySet: true,
    zenKeySet: false,
    embeddingKeySet: true,
    parseEngine: 'pymupdf4llm',
    mineruKeySet: false,
    kbMode: 'full',
    vlKeySet: false,
    reviewResearchModel: '',
  }

  it('chat row: providerKeySet true -> ok', () => {
    const rows = computeSelfCheckRows(baseInput)
    const chat = rows.find(r => r.id === 'chat')
    expect(chat?.state).toBe('ok')
  })

  it('chat row: providerKeySet false, zenKeySet true -> ok', () => {
    const input = { ...baseInput, providerKeySet: false, zenKeySet: true }
    const rows = computeSelfCheckRows(input)
    const chat = rows.find(r => r.id === 'chat')
    expect(chat?.state).toBe('ok')
  })

  it('chat row: both false -> missing', () => {
    const input = { ...baseInput, providerKeySet: false, zenKeySet: false }
    const rows = computeSelfCheckRows(input)
    const chat = rows.find(r => r.id === 'chat')
    expect(chat?.state).toBe('missing')
  })

  it('review row: empty model -> warn', () => {
    const rows = computeSelfCheckRows(baseInput)
    const review = rows.find(r => r.id === 'review')
    expect(review?.state).toBe('warn')
    expect(review?.text).toBe('研究档判卷=主模型同源')
  })

  it('review row: zen: prefix with zenKeySet -> ok', () => {
    const input = { ...baseInput, reviewResearchModel: 'zen:mimo-v2.5-free', zenKeySet: true }
    const rows = computeSelfCheckRows(input)
    const review = rows.find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
  })

  it('review row: zen: prefix without zenKeySet -> warn', () => {
    const input = { ...baseInput, reviewResearchModel: 'zen:mimo-v2.5-free', zenKeySet: false }
    const rows = computeSelfCheckRows(input)
    const review = rows.find(r => r.id === 'review')
    expect(review?.state).toBe('warn')
  })

  it('review row: "/" in model with embeddingKeySet -> ok', () => {
    const input = { ...baseInput, reviewResearchModel: 'Qwen/Qwen2.5-72B-Instruct', embeddingKeySet: true }
    const rows = computeSelfCheckRows(input)
    const review = rows.find(r => r.id === 'review')
    expect(review?.state).toBe('ok')
  })

  it('review row: "/" in model without embeddingKeySet -> warn', () => {
    const input = { ...baseInput, reviewResearchModel: 'Qwen/Qwen2.5-72B-Instruct', embeddingKeySet: false }
    const rows = computeSelfCheckRows(input)
    const review = rows.find(r => r.id === 'review')
    expect(review?.state).toBe('warn')
  })

  it('kb row: embeddingKeySet true -> ok', () => {
    const rows = computeSelfCheckRows(baseInput)
    const kb = rows.find(r => r.id === 'kb')
    expect(kb?.state).toBe('ok')
  })

  it('kb row: embeddingKeySet false -> missing', () => {
    const input = { ...baseInput, embeddingKeySet: false }
    const rows = computeSelfCheckRows(input)
    const kb = rows.find(r => r.id === 'kb')
    expect(kb?.state).toBe('missing')
  })

  it('parse row: mineru without key -> warn', () => {
    const input = { ...baseInput, parseEngine: 'mineru', mineruKeySet: false }
    const rows = computeSelfCheckRows(input)
    const parse = rows.find(r => r.id === 'parse')
    expect(parse?.state).toBe('warn')
  })

  it('parse row: mineru with key -> ok', () => {
    const input = { ...baseInput, parseEngine: 'mineru', mineruKeySet: true }
    const rows = computeSelfCheckRows(input)
    const parse = rows.find(r => r.id === 'parse')
    expect(parse?.state).toBe('ok')
  })

  it('parse row: pymupdf4llm -> ok', () => {
    const rows = computeSelfCheckRows(baseInput)
    const parse = rows.find(r => r.id === 'parse')
    expect(parse?.state).toBe('ok')
  })

  it('vision row: light mode -> off', () => {
    const input = { ...baseInput, kbMode: 'light' }
    const rows = computeSelfCheckRows(input)
    const vision = rows.find(r => r.id === 'vision')
    expect(vision?.state).toBe('off')
  })

  it('vision row: full mode with vlKeySet -> ok', () => {
    const input = { ...baseInput, kbMode: 'full', vlKeySet: true }
    const rows = computeSelfCheckRows(input)
    const vision = rows.find(r => r.id === 'vision')
    expect(vision?.state).toBe('ok')
  })

  it('vision row: full mode with embeddingKeySet -> ok', () => {
    const input = { ...baseInput, kbMode: 'full', vlKeySet: false, embeddingKeySet: true }
    const rows = computeSelfCheckRows(input)
    const vision = rows.find(r => r.id === 'vision')
    expect(vision?.state).toBe('ok')
  })

  it('vision row: full mode without any key -> missing', () => {
    const input = { ...baseInput, kbMode: 'full', vlKeySet: false, embeddingKeySet: false }
    const rows = computeSelfCheckRows(input)
    const vision = rows.find(r => r.id === 'vision')
    expect(vision?.state).toBe('missing')
  })
})