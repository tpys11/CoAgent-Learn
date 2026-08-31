/** F14-S2：ServiceSettings 提交体构造（纯函数直调测试）。
 * 为什么：buildSvcBody 原写死 embedding_model/base_url——免费档（S5）切换后会被保存动作打回（E-22 语义放大器）。 */
export interface SvcState {
  embedding_base_url: string; embedding_model: string
  review_enabled: boolean; review_model: string; parse_engine: string
  chunk_mode: string; chunk_size: number; chunk_overlap: number; rrf_k: number; fetch_mult: number
}
export interface SvcKeys { embedding_api_key: string; mineru_api_token: string; mathpix_app_id: string; mathpix_app_key: string; zen_api_key?: string }
export function buildSvcBody(svc: SvcState, keys: SvcKeys): Record<string, unknown> {
  return {
    vector_model: 'qwen',
    embedding_base_url: svc.embedding_base_url || 'https://api.siliconflow.cn/v1',
    embedding_api_key: keys.embedding_api_key,
    embedding_model: svc.embedding_model || 'Qwen/Qwen3-VL-Embedding-8B',
    embedding_dim: 1024,
    rerank_backend: 'api', rerank_base_url: '', rerank_api_key: '',
    rerank_model: 'BAAI/bge-reranker-v2-m3',
    vl_api_key: '', zhipu_api_key: '', kb_mode: 'full',
    review_enabled: svc.review_enabled, review_model: svc.review_model,
    parse_engine: svc.parse_engine,
    mineru_api_token: keys.mineru_api_token,
    mathpix_app_id: keys.mathpix_app_id, mathpix_app_key: keys.mathpix_app_key,
    chunk_mode: svc.chunk_mode, chunk_size: svc.chunk_size,
    chunk_overlap: svc.chunk_overlap, rrf_k: svc.rrf_k, fetch_mult: svc.fetch_mult,
  }
}