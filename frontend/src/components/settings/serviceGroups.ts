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

/** RA-S3：测试档总开关开启前确认框文案（固定，不可自由发挥——E-22：settings 保存即永久压过 .env） */
export const TEST_PRESET_CONFIRM_TEXT = '测试档将按固定模型组合覆盖当前配置（保存后永久生效，恢复需手动改回）。确认进入？'

/** RA-S3：审核子开关关闭状态文案（owner 指定） */
export const REVIEW_SUB_OFF_NOTE = '审核时用主模型'

/** RA-S3：审核子开关联动——开(独立审核模型)=review_follow_main=false；关(审核时用主模型)=true。
 *  为什么经 follow_main 表达「关」：T51 空串不覆写，写 review_model_research:'' 会被吞掉=假关闭。 */
export function reviewSubSwitchPutBody(subSwitchOn: boolean): { review_follow_main: boolean } {
  return { review_follow_main: !subSwitchOn }
}
