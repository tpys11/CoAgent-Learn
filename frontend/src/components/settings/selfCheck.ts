/** F14-S3/RA-S4：自检卡四行判定（纯函数）。为什么：探测会产生费用/误报，默认只做零网络配置态判定；
 * 「可用」必须由用户显式触发检测（test 端点）后作为覆盖态传入。
 * RA-S4：行集瘦身为四项——主模型(chat)/审核模型(review)/文档解析(parse)/embedding 模型；
 * vision/kb 行删除（owner 四项之外不展示，rerank 说明随 kb 行删除）；每行带 model 字段显示模型名。 */
export interface SelfCheckInput {
  providerKeySet: boolean                 // 前端主通道 key（LS）
  zenKeySet?: boolean                     // 后端 ZEN_API_KEY（GET zen.api_key_set）
  embeddingKeySet?: boolean               // GET embedding.api_key_set
  parseEngine?: string                    // GET parse.engine
  mineruKeySet?: boolean                  // GET parse.mineru_key_set
  reviewResearchModel?: string            // GET review.model_research
  followMain?: boolean                    // RA-S1：GET review.follow_main（true=审核用主模型）
  chatModel?: string                      // RA-S4：LS 当前模型名
  embeddingModel?: string                 // RA-S4：GET embedding.model
}
export interface SelfCheckRow { id: 'chat' | 'review' | 'parse' | 'embedding'
  state: 'ok' | 'warn' | 'missing' | 'off'; text: string; model?: string }

/** RA2-S1：主模型缺省兜底——与 backend core/model_provider.py:11 MODEL_MAIN 同值（GET chat.main_model 可对照）。
 *  为什么在纯函数内兜底：消费端漏喂 chatModel 时两行仍显具体名，owner 反馈②禁「主模型」字面量复活。 */
const DEFAULT_MAIN_MODEL = 'deepseek-v4-flash-vision-exp'

export function computeSelfCheckRows(i: SelfCheckInput): SelfCheckRow[] {
  const rows: SelfCheckRow[] = []
  // RA2-S1：mainModel 是 chat 行与 review 行（follow_main / 空 research 回落）的唯一同源——
  // 主对话与研究档判卷共用 MODEL_MAIN（pick_judge 同款短路），两行各接各的源会不一致。
  const mainModel = i.chatModel || DEFAULT_MAIN_MODEL
  // chat: providerKeySet||zenKeySet → ok 否则 missing；模型名=LS 当前模型名（缺省兜底具体名）
  const chatOk = i.providerKeySet || i.zenKeySet
  rows.push({
    id: 'chat',
    state: chatOk ? 'ok' : 'missing',
    text: chatOk ? '主通道已配置' : '未配置对话 Key',
    model: mainModel,
  })
  // review: follow_main=true → 主模型通道（模型名=同源具体名，owner 反馈②：非「主模型」字面量）；
  //         否则依 reviewResearchModel 前缀路由：zen:→zenKeySet；"/"→embeddingKeySet；其余主通道
  if (i.followMain) {
    rows.push({
      id: 'review',
      state: i.providerKeySet ? 'ok' : 'warn',
      text: i.providerKeySet ? '审核模型已配置' : '审核模型需要对话 Key',
      model: mainModel,
    })
  } else if (i.reviewResearchModel) {
    if (i.reviewResearchModel.startsWith('zen:')) {
      const keyOk = i.zenKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要 Zen Key',
        model: i.reviewResearchModel,
      })
    } else if (i.reviewResearchModel.includes('/')) {
      const keyOk = i.embeddingKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要硅基流动 Key',
        model: i.reviewResearchModel,
      })
    } else {
      // 其他前缀或无前缀，假设主通道
      const keyOk = i.providerKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要对话 Key',
        model: i.reviewResearchModel,
      })
    }
  } else {
    rows.push({
      id: 'review',
      state: 'warn',
      text: '研究档判卷=主模型同源',
      model: mainModel,  // RA2-S1：空 research 判卷回落主模型，显同源具体名（原「主模型」字面量删除）
    })
  }
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
