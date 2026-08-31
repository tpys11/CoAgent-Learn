/** F14-S5a：预设档数据结构——为什么要单独抽？切换动作=当前 LS 写入 + 瞬时 PUT body，
 *  保证「先保存，再操作」的语义；可复用可测试。 */

export type PresetId = 'standard' | 'free' | 'custom'
export const PRESET_IDS: PresetId[] = ['standard', 'free', 'custom']
export const PRESET_LABELS: Record<PresetId, string> = {
  standard: '标准档（默认）',
  free: '免费档',
  custom: '自定义',
}

/** 待写入 LS 写码（普通对话 Zen，DeepSeek key 独立）——切换回标准档时回滚用 */
export function freePresetLsWrites(zenMainModel: string): { provider: string; model: string } {
  return { provider: 'zen', model: zenMainModel || 'deepseek-v4-flash-free' }
}

/** 待写入 settings PUT body（遵循 S1 T51 语义；review_model_research = zen: 前缀=审核跨厂商） */
export function freePresetPutBody(): Record<string, unknown> {
  return { review_model_research: 'zen:deepseek-v4-flash-free' }
}

/** 标准档 PUT body（恢复默认：关闭免费审核通道） */
export function standardPresetPutBody(): Record<string, unknown> {
  return { review_model_research: '' }
}
