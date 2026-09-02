/** RA-S2：测试档数据结构——为什么要单独抽？切换动作=当前 LS 写入 + 瞬时 PUT body，
 *  保证「先保存，再操作」的语义；可复用可测试。
 *  E-22 语义：settings 表任一键经 UI 保存即永久压过 .env，故测试档开关=批量覆盖，恢复走
 *  standardPresetPutBody（review_follow_main 表达「审核回主模型」——T51 空串不覆写，
 *  写 review_model_research:'' 会被吞掉=假恢复，故恢复清单里绝不出现该键）。 */

export type PresetId = 'standard' | 'test' | 'custom'
export const PRESET_IDS: PresetId[] = ['standard', 'test', 'custom']
export const PRESET_LABELS: Record<PresetId, string> = {
  standard: '标准档（默认）',
  test: '测试档',
  custom: '自定义',
}

/** 测试档 PUT body：固定模型组四键（owner 指定模型名原样作常量；真实 ID 由 owner 冒烟对照
 *  GET /api/settings/zen/models——不符=常量一行修，不算缺陷）。 */
export function testPresetPutBody(): Record<string, unknown> {
  return {
    parse_engine: 'mineru',
    embedding_model: 'Qwen/Qwen3-VL-Embedding-8B',
    review_model_research: 'zen:big-pickle',
    review_follow_main: false,
  }
}

/** 测试档 LS 写集三键：provider/model/zenBaseUrl。
 *  zenBaseUrl 空串时调用方禁走（S5：zen 路由 base_url 取此值，空=回落 DeepSeek 端点），
 *  故此函数对空串防御性抛错——调用方必须先用 lsGet(LS.zenBaseUrl, '') 判非空再调用。 */
export function testPresetLsWrites(zenBaseUrl: string): { provider: string; model: string; zenBaseUrl: string } {
  if (!zenBaseUrl) throw new Error('testPresetLsWrites: zenBaseUrl 为空——调用方禁走（S5 路由约束）')
  return { provider: 'zen', model: 'mimo-v2.5-free', zenBaseUrl }
}

/** 标准档 PUT body（退出测试档=回主模型审核+本地解析）：
 *  - embedding 不动（qwen3-VL 即默认，零向量空间问题）；
 *  - 绝不写 review_model_research:''（T51 空串不覆写=假恢复），用 follow_main 语义表达「审核回主模型」。 */
export function standardPresetPutBody(): Record<string, unknown> {
  return { parse_engine: 'pymupdf4llm', review_follow_main: true }
}
