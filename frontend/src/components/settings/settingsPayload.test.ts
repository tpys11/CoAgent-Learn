import { describe, it, expect } from 'vitest'
import { buildSvcBody, SvcState, SvcKeys } from './settingsPayload'

describe('buildSvcBody', () => {
  const baseSvc: SvcState = {
    embedding_base_url: 'https://custom.example.com/v1',
    embedding_model: 'custom-model',
    review_enabled: false,
    review_model: 'Qwen/Qwen2.5-72B-Instruct',
    parse_engine: 'pymupdf4llm',
    chunk_mode: 'auto',
    chunk_size: 512,
    chunk_overlap: 50,
    rrf_k: 60,
    fetch_mult: 3,
  }
  const baseKeys: SvcKeys = {
    embedding_api_key: 'sk-test',
    mineru_api_token: '',
    mathpix_app_id: '',
    mathpix_app_key: '',
  }

  it('embedding fields are passed through, not hardcoded', () => {
    const body = buildSvcBody(baseSvc, baseKeys)
    expect(body.embedding_base_url).toBe('https://custom.example.com/v1')
    expect(body.embedding_model).toBe('custom-model')
  })

  it('other fields match existing behavior (regression钉)', () => {
    const body = buildSvcBody(baseSvc, baseKeys)
    expect(body.vector_model).toBe('qwen')
    expect(body.embedding_dim).toBe(1024)
    expect(body.rerank_backend).toBe('api')
    expect(body.rerank_model).toBe('BAAI/bge-reranker-v2-m3')
    expect(body.kb_mode).toBe('full')
    expect(body.review_enabled).toBe(false)
    expect(body.review_model).toBe('Qwen/Qwen2.5-72B-Instruct')
    expect(body.parse_engine).toBe('pymupdf4llm')
    expect(body.chunk_mode).toBe('auto')
    expect(body.chunk_size).toBe(512)
    expect(body.chunk_overlap).toBe(50)
    expect(body.rrf_k).toBe(60)
    expect(body.fetch_mult).toBe(3)
  })

  it('empty embedding_model falls back to default', () => {
    const svc = { ...baseSvc, embedding_model: '' }
    const body = buildSvcBody(svc, baseKeys)
    expect(body.embedding_model).toBe('Qwen/Qwen3-VL-Embedding-8B')
  })

  it('empty embedding_base_url falls back to default', () => {
    const svc = { ...baseSvc, embedding_base_url: '' }
    const body = buildSvcBody(svc, baseKeys)
    expect(body.embedding_base_url).toBe('https://api.siliconflow.cn/v1')
  })

  it('RA-S3：合并栏一把 key 同值写 embedding_api_key 与 vl_api_key', () => {
    const body = buildSvcBody(baseSvc, baseKeys)
    expect(body.embedding_api_key).toBe('sk-test')
    expect(body.vl_api_key).toBe('sk-test')
  })

  it('RA-S3：空 key 时两键同为空串（后端 T51 空串不覆写兜底，不打空已有 VL key）', () => {
    const body = buildSvcBody(baseSvc, { ...baseKeys, embedding_api_key: '' })
    expect(body.embedding_api_key).toBe('')
    expect(body.vl_api_key).toBe('')
  })
})