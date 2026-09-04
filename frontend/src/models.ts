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
export const MODEL_ZEN_REVIEW = 'big-pickle'               // 双源同值②（RC4 测试档判卷实名 = backend MODEL_ZEN_REVIEW）
export const MODEL_REVIEW_SF = 'Qwen/Qwen2.5-72B-Instruct' // 双源同值④（RC4 标准档判卷实名 = backend MODEL_REVIEW_SF，SF 跨厂商）
// S3/S6（owner 09-04 拍板+截图实测校正）：go 第二测试通道实名=zen go 计划子通道 API ID（小写，
// 双模型 chat/completions 实测 200 通）；换 API ID=两侧各改一行+两处测试钉字
export const MODEL_GO_MAIN = 'glm-5.3-flash'               // 双源同值⑤ = backend MODEL_GO_MAIN（go 通道主对话/辅助）
export const MODEL_GO_REVIEW = 'qwen3.8-flash'             // 双源同值⑥ = backend MODEL_GO_REVIEW（go 通道判卷）
// C1（owner 09-04 拍板）：Z.AI 第三测试通道——官方文档 model="glm-4.7"，主审同模型（专用记忆机制测试）
export const MODEL_ZAI_MAIN = 'glm-4.7'                    // 双源同值⑦ = backend MODEL_ZAI_MAIN（zai 主对话/辅助）
export const MODEL_ZAI_REVIEW = 'glm-4.7'                  // 双源同值⑧ = backend MODEL_ZAI_REVIEW（zai 判卷，同模型自审）
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
export const ZEN_BASE_URL = 'https://opencode.ai/zen/v1'
export const ZAI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

/** 注册表镜像矩阵（角色×档位 → 模型实名/端点）。RC4-S1：review 两档均定值格（owner 09-03 终版
 *  「档位定死」）——standard=SF Qwen2.5-72B（跨厂商独立判卷）、test=zen big-pickle；
 *  运行时权威仍是后端 GET review.effective_model；embedding/rerank 专有能力留 SF（决策 38），
 *  前端无决策点故不入镜像。 */
export const REGISTRY_MIRROR = {
  standard: { main: MODEL_MAIN, fast: MODEL_MAIN, vision: MODEL_MAIN, pro: MODEL_PRO, review: MODEL_REVIEW_SF, base_url: DEEPSEEK_BASE_URL },
  test: { main: MODEL_ZEN_TEST, fast: MODEL_ZEN_TEST, vision: MODEL_ZEN_TEST, review: MODEL_ZEN_REVIEW, base_url: ZEN_BASE_URL },
  // S3：go 档——端点动态（设置页填 GO_BASE_URL）无镜像常量位，base_url 留空仅占位防误用
  go: { main: MODEL_GO_MAIN, fast: MODEL_GO_MAIN, vision: MODEL_GO_MAIN, review: MODEL_GO_REVIEW, base_url: '' },
  // C1：zai 档——bigmodel 官方端点固定（镜像常量），主审同模型 glm-4.7
  zai: { main: MODEL_ZAI_MAIN, fast: MODEL_ZAI_MAIN, vision: MODEL_ZAI_MAIN, review: MODEL_ZAI_REVIEW, base_url: ZAI_BASE_URL },
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
  if (provider === 'go') return MODEL_GO_MAIN   // S3：go 通道定值（不吃 LS.model；401 校正=改常量一行）
  if (provider === 'zai') return MODEL_ZAI_MAIN // C1：zai 通道定值 glm-4.7（同上）
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
 *  standard=DeepSeek 端点+MODEL_MAIN（C2 09-04：zhipu 遗留清除——注册表 main 无 zhipu 格）；
 *  test(zen)=Zen 端点+mimo；zenBaseUrl 空回落 DeepSeek 端点（RA-S5 既有语义）；
 *  S3：go=go 网关端点+GLM-5.3-Flash，goBaseUrl 空同款回落（三参化由 tsc 逼出全部调用点）；
 *  C1：zai=bigmodel 官方端点+glm-4.7（zaiBaseUrl 空同款回落）。 */
export function resolveAuxCall(provider: string, zenBaseUrl: string, goBaseUrl: string, zaiBaseUrl: string): { base_url: string; model: string } {
  if (provider === 'zen') {
    return { base_url: zenBaseUrl || DEEPSEEK_BASE_URL, model: REGISTRY_MIRROR.test.main }
  }
  if (provider === 'go') {
    return { base_url: goBaseUrl || DEEPSEEK_BASE_URL, model: REGISTRY_MIRROR.go.main }
  }
  if (provider === 'zai') {
    return { base_url: zaiBaseUrl || DEEPSEEK_BASE_URL, model: REGISTRY_MIRROR.zai.main }
  }
  return { base_url: REGISTRY_MIRROR.standard.base_url, model: REGISTRY_MIRROR.standard.main }
}
