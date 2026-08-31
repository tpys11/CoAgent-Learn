/** F14-S3：自检卡五行判定（纯函数）。为什么：探测会产生费用/误报，默认只做零网络配置态判定；
 * 「可用」必须由用户显式触发检测（S3b 扩展的 test 端点）后作为覆盖态传入。 */
export interface SelfCheckInput {
  providerKeySet: boolean                 // 前端主通道 key（LS）
  zenKeySet?: boolean                     // 后端 ZEN_API_KEY（GET zen.api_key_set，S4 后有值）
  embeddingKeySet?: boolean               // GET embedding.api_key_set
  parseEngine?: string                    // GET parse.engine
  mineruKeySet?: boolean                  // GET parse.mineru_key_set
  kbMode?: string                         // GET kb_mode（light=视觉通道关闭态）
  vlKeySet?: boolean                      // GET vl.api_key_set
  reviewResearchModel?: string            // S4 后 GET review.model_research
}
export interface SelfCheckRow { id: 'chat' | 'review' | 'kb' | 'parse' | 'vision'
  state: 'ok' | 'warn' | 'missing' | 'off'; text: string }
export function computeSelfCheckRows(i: SelfCheckInput): SelfCheckRow[] {
  const rows: SelfCheckRow[] = []
  // chat:   providerKeySet||zenKeySet → ok(主通道已配置) 否则 missing
  const chatOk = i.providerKeySet || i.zenKeySet
  rows.push({
    id: 'chat',
    state: chatOk ? 'ok' : 'missing',
    text: chatOk ? '主通道已配置' : '未配置对话 Key',
  })
  // review: reviewResearchModel 非空→依前缀判 key（zen:→zenKeySet；"/"→embeddingKeySet）→ ok/warn；
  //         空 → warn「研究档判卷=主模型同源」（不是 missing——功能存在）
  if (i.reviewResearchModel) {
    if (i.reviewResearchModel.startsWith('zen:')) {
      const keyOk = i.zenKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要 Zen Key',
      })
    } else if (i.reviewResearchModel.includes('/')) {
      const keyOk = i.embeddingKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要硅基流动 Key',
      })
    } else {
      // 其他前缀或无前缀，假设主通道
      const keyOk = i.providerKeySet
      rows.push({
        id: 'review',
        state: keyOk ? 'ok' : 'warn',
        text: keyOk ? '审核模型已配置' : '审核模型需要对话 Key',
      })
    }
  } else {
    rows.push({
      id: 'review',
      state: 'warn',
      text: '研究档判卷=主模型同源',
    })
  }
  // kb:     embeddingKeySet → ok 否则 missing（文案沿用 F4′ 告警语义）
  rows.push({
    id: 'kb',
    state: i.embeddingKeySet ? 'ok' : 'missing',
    text: i.embeddingKeySet ? '知识库检索已配置' : '未配置硅基流动 Key',
  })
  // parse:  parseEngine==='mineru'&&!mineruKeySet → warn「本地 pymupdf4llm 兜底可用」；
  //         其余 → ok
  if (i.parseEngine === 'mineru' && !i.mineruKeySet) {
    rows.push({
      id: 'parse',
      state: 'warn',
      text: '本地 pymupdf4llm 兜底可用',
    })
  } else {
    rows.push({
      id: 'parse',
      state: 'ok',
      text: '文档解析已配置',
    })
  }
  // vision: kbMode==='light' → off「light 档未启用」；vlKeySet||embeddingKeySet → ok 否则 missing
  if (i.kbMode === 'light') {
    rows.push({
      id: 'vision',
      state: 'off',
      text: 'light 档未启用',
    })
  } else {
    const visionOk = i.vlKeySet || i.embeddingKeySet
    rows.push({
      id: 'vision',
      state: visionOk ? 'ok' : 'missing',
      text: visionOk ? '视觉通道已配置' : '未配置视觉 Key',
    })
  }
  return rows
}