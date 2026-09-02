/** R-D S5：后端 ModelRegistry（backend/core/model_provider.py REGISTRY）的前端镜像。
 *  为什么是「镜像」而非共享：前后端语言不同无法共享文件——模型 ID 三串由本目录 models.test.ts
 *  与 backend tests/test_rd_s1_registry.py 双断言同值，交接文档记录「双源同值」核对项；
 *  owner「换模型」演示=改后端 REGISTRY 一格 + 本镜像对应常量（两侧各一行）。
 *  消费端同源：resolveChatModel（useChatStream 发送 + SelfCheckCard 显示）、resolveAuxCall
 *  （CenterPanel 资源生成 + SpecialOutputPane）；selfCheck.ts 缺省主模型名亦导入此处。 */

// ── 注册表镜像常量（与后端矩阵同值；换模型=两侧各改一行）──
export const MODEL_MAIN = 'deepseek-v4-flash-vision-exp'   // 双源同值③ = backend MODEL_MAIN（主对话/生成/审核默认，视觉版）
export const MODEL_PRO = 'deepseek-v4-pro'                 // legacy alias 目标 = backend MODEL_PRO
export const MODEL_ZEN_TEST = 'mimo-v2.5-free'             // 双源同值① = backend MODEL_ZEN_TEST（决策 38 测试档对话/辅助实名）
export const MODEL_ZEN_REVIEW = 'big-pickle'               // 双源同值②（决策 38 测试档审核实名；预设以 zen: 前缀承载）
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
export const ZEN_BASE_URL = 'https://opencode.ai/zen/v1'

/** 注册表镜像矩阵（角色×档位 → 模型实名/端点）。review 标准档无静态值——后端路由函数权威，
 *  前端读 GET review.effective_model（RA5-S3 契约）；embedding/rerank 专有能力留 SF（决策 38），
 *  前端无决策点故不入镜像。 */
export const REGISTRY_MIRROR = {
  standard: { main: MODEL_MAIN, fast: MODEL_MAIN, vision: MODEL_MAIN, pro: MODEL_PRO, base_url: DEEPSEEK_BASE_URL },
  test: { main: MODEL_ZEN_TEST, fast: MODEL_ZEN_TEST, vision: MODEL_ZEN_TEST, review: MODEL_ZEN_REVIEW, base_url: ZEN_BASE_URL },
} as const

/** zen 态对话模型「显示名」兜底（chatRouting 源级契约值——非 API ID，F14 显示语义原样保留，
 *  勿与 MODEL_ZEN_TEST（API ID）混同）。 */
export const ZEN_CHAT_FALLBACK_DISPLAY = 'mimo-V2.5 Free'

/** RA3-S1 契约（签名不变）：主链路模型名解析——标准档 legacy alias 迁移 + 杂值一律钉死
 *  MODEL_MAIN（owner 原话「我不是说了要换成 deepseek-v4-flash-vision-exp 吗」；LS.model 历史
 *  杂值与合法值无法可靠区分，钉死常量才是钉死）；zen 测试档 LS.model 透传（轮换免疫是 F14
 *  设计原意），空值才兜底显示名，zen 分支不吃 alias。R-D S5：实现自 useChatStream 移入镜像。 */
export function resolveChatModel(provider: string, lsModel: string): string {
  if (provider === 'zen') return lsModel || ZEN_CHAT_FALLBACK_DISPLAY
  const alias: Record<string, string> = {
    'deepseek-chat': MODEL_PRO,
    'deepseek-reasoner': MODEL_PRO,
    'deepseek-pro': MODEL_PRO,
    'deepseek-flash': MODEL_MAIN,
    'deepseek-v4-flash': MODEL_MAIN,   // 老用户存量 localStorage 迁移到视觉版
  }
  return alias[lsModel] || MODEL_MAIN
}

/** R-D S5：辅助调用（资源生成/上传链等非对话 LLM 调用）注册表薄封装——后端 S3 已改为注册表
 *  决策（base_url/model 传参被后端忽略），前端同源发送镜像值保持请求自洽：
 *  standard=DeepSeek 端点+MODEL_MAIN（zhipu 不再特判——注册表 main 无 zhipu 格）；
 *  test(zen)=Zen 端点+mimo；zenBaseUrl 空回落 DeepSeek 端点（RA-S5 既有语义）。 */
export function resolveAuxCall(provider: string, zenBaseUrl: string): { base_url: string; model: string } {
  if (provider === 'zen') {
    return { base_url: zenBaseUrl || DEEPSEEK_BASE_URL, model: REGISTRY_MIRROR.test.main }
  }
  return { base_url: REGISTRY_MIRROR.standard.base_url, model: REGISTRY_MIRROR.standard.main }
}
