/** F14-S3/RA-S4：自检卡四行判定（纯函数）。为什么：探测会产生费用/误报，默认只做零网络配置态判定；
 * 「可用」必须由用户显式触发检测（test 端点）后作为覆盖态传入。
 * RA-S4：行集瘦身为四项——主模型(chat)/审核模型(review)/文档解析(parse)/embedding 模型；
 * vision/kb 行删除（owner 四项之外不展示，rerank 说明随 kb 行删除）；每行带 model 字段显示模型名。 */
import { MODEL_MAIN as DEFAULT_MAIN_MODEL, MODEL_ZEN_REVIEW, MODEL_GO_REVIEW } from '../../models'   // R-D S5：缺省主模型名入注册表镜像（删除本地字面量）
export interface SelfCheckInput {
  providerKeySet: boolean                 // 前端主通道 key（LS）
  zenKeySet?: boolean                     // 后端 ZEN_API_KEY（GET zen.api_key_set）
  goKeySet?: boolean                      // S4：后端 GO_API_KEY（GET go.api_key_set）
  embeddingKeySet?: boolean               // GET embedding.api_key_set
  parseEngine?: string                    // GET parse.engine
  mineruKeySet?: boolean                  // GET parse.mineru_key_set
  reviewEffectiveModel?: string           // RA5-S3：GET review.effective_model（后端权威，模型名唯一来源）
  chatModel?: string                      // RA-S4：LS 当前模型名
  embeddingModel?: string                 // RA-S4：GET embedding.model
}
export interface SelfCheckRow { id: 'chat' | 'review' | 'parse' | 'embedding'
  state: 'ok' | 'warn' | 'missing' | 'off'; text: string; model?: string }

export function computeSelfCheckRows(i: SelfCheckInput): SelfCheckRow[] {
  const rows: SelfCheckRow[] = []
  // RA2-S1：mainModel 是 chat 行模型名（RA5-S3 起 review 行改读后端 effective_model，不再共用此源——
  // 主模型语义（req 主模型）与判卷路由语义不同，勿合并）
  const mainModel = i.chatModel || DEFAULT_MAIN_MODEL
  // chat: providerKeySet||zenKeySet → ok 否则 missing；模型名=LS 当前模型名（缺省兜底具体名）
  const chatOk = i.providerKeySet || i.zenKeySet
  rows.push({
    id: 'chat',
    state: chatOk ? 'ok' : 'missing',
    text: chatOk ? '主通道已配置' : '未配置对话 Key',
    model: mainModel,
  })
  // RA5-S3：审核行模型名一律=i.reviewEffectiveModel（GET review.effective_model，resolve_review_route
  // 权威判定）——chat 行维持 resolveChatModel（主模型语义不同，勿合并）。reviewEffectiveModel 未喂时
  // model 缺省，不做前端兜底。
  // RC4-S2：判卷=档位定值格（follow_main/research 前缀分叉随动态格退役）——通道判定改由
  // effective 实名驱动（后端权威）：big-pickle=zen 通道看 zenKeySet；Qwen3.8 Flash=go 通道看
  // goKeySet（S4）；其余（Qwen2.5-72B 等）=SF 通道看 embeddingKeySet。
  const effModel = i.reviewEffectiveModel || ''
  const isZenReview = effModel === MODEL_ZEN_REVIEW
  const isGoReview = effModel === MODEL_GO_REVIEW
  const reviewKeyOk = isZenReview ? i.zenKeySet : (isGoReview ? i.goKeySet : i.embeddingKeySet)
  rows.push({
    id: 'review',
    state: reviewKeyOk ? 'ok' : 'warn',
    text: reviewKeyOk ? '审核模型已配置'
      : (isZenReview ? '审核模型需要 Zen Key' : (isGoReview ? '审核模型需要 GO Key' : '审核模型需要硅基流动 Key')),
    model: i.reviewEffectiveModel,
  })
  // parse: 模型名=parse_engine 值；mineru 缺 token → warn「本地 pymupdf4llm 兜底可用」
  if (i.parseEngine === 'mineru' && !i.mineruKeySet) {
    rows.push({
      id: 'parse',
      state: 'warn',
      text: '本地 pymupdf4llm 兜底可用',
      model: i.parseEngine,
    })
  } else {
    rows.push({
      id: 'parse',
      state: 'ok',
      text: '文档解析已配置',
      model: i.parseEngine,
    })
  }
  // embedding: 模型名=GET embedding.model；kb 旧行（向量化/重排说明）并入此行——四项之外不展示
  rows.push({
    id: 'embedding',
    state: i.embeddingKeySet ? 'ok' : 'missing',
    text: i.embeddingKeySet ? '知识库检索已配置' : '未配置硅基流动 Key',
    model: i.embeddingModel,
  })
  return rows
}
