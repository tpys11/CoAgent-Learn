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

/** RA4-S2：zenBaseUrl 空守卫持久内联文案（C3 09-04 改写：Zen Key UI 已删，base_url 由 GET 落 LS，
 *  守卫仅在后端不可达时触发——旧文案「请先填写并保存 Zen Key」对应的输入块已不存在） */
export const TEST_PRESET_ZEN_GUARD_NOTE = 'Zen 通道信息未就绪（后端不可达）——请刷新后重试'

/** RA4-S2：测试档启用后常驻绿字（模型组实名；owner 拍板点击直切，持久态替代确认框） */
export const TEST_PRESET_ON_NOTE =
  '测试档已启用（解析 mineru · embedding qwen3-VL · 主模型 mimo-V2.5 Free · 审核 zen:Big Pickle）'

/** RA4-S2：未启用时常驻灰字 */
export const TEST_PRESET_OFF_NOTE = '标准档'

/** RA4-S3：合并栏独立审核气泡下方说明（RC4-S1 改写：owner 09-03 终版指定文案——
 *  原「关闭后需要审核时自动采用主模型」随 follow_main 开关退役，改为一行档位定值说明） */
export const REVIEW_BUBBLE_NOTE = '标准档判卷=Qwen2.5-72B（独立厂商），测试档=big-pickle'

/** S4/S6（owner 09-04 拍板+截图实测校正）：go 通道小字——zen 的 go 计划子通道（与 zen 上下并列）。
 *  S6 实测：双模型 chat/completions 直连 200 通、同一 Bearer 鉴权复用 Zen Key（GO Key 留空即可） */
export const GO_CHANNEL_NOTE =
  '文档解析用mineru、embedding模型用qwen3-VL-embedding-8B，主模型用glm-5.3-flash、审核模型用qwen3.8-flash（go=zen 的 go 计划子通道）；GO Key 不填时自动复用 Zen Key'

/** S4：go 通道信息未就绪守卫持久内联文案（TEST_PRESET_ZEN_GUARD_NOTE 同款机理；S6 后 URL 有默认值，仅后端不可达时触发） */
export const TEST_PRESET_GO_GUARD_NOTE = 'GO 通道信息未就绪（后端不可达）——请刷新后重试'

/** S4：go 通道启用后常驻绿字（TEST_PRESET_ON_NOTE 同构；S6 模型名=API ID 实名） */
export const GO_ON_NOTE =
  '测试档已启用（解析 mineru · embedding qwen3-VL · 主模型 glm-5.3-flash · 审核 qwen3.8-flash）'

/** C1/C3（owner 09-04 拍板）：zai 通道小字——与 zen/go 并列的第三测试通道；owner 原话要求
 *  注明「专用于测试记忆机制」；主审同模型 glm-4.7（同模型自审=owner 明示取舍）。C3 按圈选删端点括注 */
export const ZAI_CHANNEL_NOTE =
  '主模型与审核模型均用 glm-4.7（同模型自审）· 专用于测试记忆机制；文档解析用mineru、embedding模型用qwen3-VL-embedding-8B'

/** C1：zai 通道 Key 空守卫持久内联文案（zai 无跨通道 key 兜底，必须先配 key） */
export const TEST_PRESET_ZAI_GUARD_NOTE = '请先填写并保存 Z.AI Key（bigmodel.cn 获取），测试档走 Z.AI 通道'

/** C1：zai 通道启用后常驻绿字 */
export const ZAI_ON_NOTE =
  'Z.AI 通道已启用（解析 mineru · embedding qwen3-VL · 主模型 glm-4.7 · 审核 glm-4.7 · 记忆机制专用）'
