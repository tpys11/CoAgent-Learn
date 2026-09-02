/** F14-S2/RA-S3：设置页 AI 服务区分组与文案单一事实源（顺序即渲染顺序）。
 * 为什么纯文件：CONVENTIONS 纯逻辑导出直调先例（memorySections）；vitest 无 jsdom，组件测试不可行，
 * 故 owner 指定文案（一字不改）以常量单点承载，组件渲染与 vitest 逐字断言共用同一事实源。 */
export interface ServiceGroup { id: 'chat' | 'kb' | 'parse'; title: string; desc: string }
export const SERVICE_GROUPS: ServiceGroup[] = [
  { id: 'chat', title: '对话与审核', desc: '对话主模型与审核判卷模型；DeepSeek 对话 Key 在「基础」页配置' },
  { id: 'kb', title: '知识库检索', desc: '向量化 + 重排（硅基流动 Key 驱动）' },
  { id: 'parse', title: '文档解析', desc: 'MinerU 未配置时自动降级本地 pymupdf4llm 兜底，功能不中断' },
]

/** RA-S3：测试档卡小字（owner 指定原文，一字不改——模型 ID 实名由 owner 冒烟对照，不符=常量一行修） */
export const TEST_PRESET_NOTE =
  '文档解析用mineru、embedding模型用qwen3-VL-embedding-8B，主模型用opencode zen计划的免费模型mimo-V2.5 Free、审核模型用opencode zen计划的免费模型Big Pickle'

/** RA-S3：合并栏小字（owner 指定原文，一字不改） */
export const KB_MERGE_NOTE = '填写一个key，选用固定的知识库服务与独立审核模型'

/** RA4-S2：zenBaseUrl 空守卫持久内联文案（旧瞬时 flash 即 return=开关不亮无反馈根因——owner 反馈②b） */
export const TEST_PRESET_ZEN_GUARD_NOTE = '请先填写并保存 Zen Key，测试档走 Zen 通道'

/** RA4-S2：测试档启用后常驻绿字（模型组实名；owner 拍板点击直切，持久态替代确认框） */
export const TEST_PRESET_ON_NOTE =
  '测试档已启用（解析 mineru · embedding qwen3-VL · 主模型 mimo-V2.5 Free · 审核 zen:Big Pickle）'

/** RA4-S2：未启用时常驻灰字 */
export const TEST_PRESET_OFF_NOTE = '标准档'

/** RA4-S3：合并栏独立审核气泡下方小字（owner 指定原文，一字不改） */
export const REVIEW_BUBBLE_NOTE = '关闭后需要审核时自动采用主模型'

/** RA-S3：审核子开关联动——开(独立审核模型)=review_follow_main=false；关(审核时用主模型)=true。
 *  为什么经 follow_main 表达「关」：T51 空串不覆写，写 review_model_research:'' 会被吞掉=假关闭。
 *  RA4-S3：处理器从测试档卡搬迁至合并栏独立审核气泡（reviewSubSwitchPutBody 写法照旧）。 */
export function reviewSubSwitchPutBody(subSwitchOn: boolean): { review_follow_main: boolean } {
  return { review_follow_main: !subSwitchOn }
}
