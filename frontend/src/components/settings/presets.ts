/** RA-S2：测试档数据结构——为什么要单独抽？切换动作=当前 LS 写入 + 瞬时 PUT body，
 *  保证「先保存，再操作」的语义；可复用可测试。
 *  E-22 语义：settings 表任一键经 UI 保存即永久压过 .env，故测试档开关=批量覆盖，恢复走
 *  standardPresetPutBody。RC4-S1（owner 09-03 终版）：判卷路由=档位定值格——
 *  review_model_research/review_follow_main 退役键不再出现在任何 PUT body。 */

export type PresetId = 'standard' | 'test' | 'custom'
export const PRESET_IDS: PresetId[] = ['standard', 'test', 'custom']
export const PRESET_LABELS: Record<PresetId, string> = {
  standard: '标准档（默认）',
  test: '测试档',
  custom: '自定义',
}

/** 测试档 PUT body：固定模型组（owner 指定模型名原样作常量；真实 ID 由 owner 冒烟对照
 *  GET /api/settings/zen/models——不符=常量一行修，不算缺陷）。
 *  R-D S4：zen_test_mode=true——测试档后台辅助链（压缩/入库增强/大纲/资源生成）随档总开关。
 *  RC4-S1：判卷随档位自动切换（standard=Qwen2.5-72B/test=big-pickle/go=Qwen3.8 Flash），无 PUT 键。
 *  S4（owner 09-04）：test_channel 通道定向（'go'→go 档；默认 'zen' 兼容旧语义）——current_tier 读此键。 */
export function testPresetPutBody(channel: 'zen' | 'go' = 'zen'): Record<string, unknown> {
  return {
    parse_engine: 'mineru',
    embedding_model: 'Qwen/Qwen3-VL-Embedding-8B',
    zen_test_mode: true,
    test_channel: channel,
  }
}

/** 测试档 LS 写集三键：provider/model/zenBaseUrl。
 *  zenBaseUrl 空串时调用方禁走（S5：zen 路由 base_url 取此值，空=回落 DeepSeek 端点），
 *  故此函数对空串防御性抛错——调用方必须先用 lsGet(LS.zenBaseUrl, '') 判非空再调用。 */
export function testPresetLsWrites(zenBaseUrl: string): { provider: string; model: string; zenBaseUrl: string } {
  if (!zenBaseUrl) throw new Error('testPresetLsWrites: zenBaseUrl 为空——调用方禁走（S5 路由约束）')
  return { provider: 'zen', model: 'mimo-v2.5-free', zenBaseUrl }
}

/** S4：go 通道 LS 写集（对称 zen 版）——model 字面与 backend MODEL_GO_MAIN / models.ts
 *  双源同值⑤一致；goBaseUrl 空串同款防御性抛错（S3：go 路由 base_url 取此值）。 */
export function goTestPresetLsWrites(goBaseUrl: string): { provider: string; model: string; goBaseUrl: string } {
  if (!goBaseUrl) throw new Error('goTestPresetLsWrites: goBaseUrl 为空——调用方禁走（S3 路由约束）')
  return { provider: 'go', model: 'GLM-5.3-Flash', goBaseUrl }
}

/** 标准档 PUT body（退出测试档=本地解析+后台链路回标准档）：
 *  - embedding 不动（qwen3-VL 即默认，零向量空间问题）；
 *  - 判卷随档位自动回 standard（Qwen2.5-72B），无 PUT 键（RC4-S1 退役 follow_main 表达）；
 *  - R-D S4：zen_test_mode=false——后台辅助链退出测试档（false 必须能落 0，R14 红线）。 */
export function standardPresetPutBody(): Record<string, unknown> {
  return { parse_engine: 'pymupdf4llm', zen_test_mode: false }
}
