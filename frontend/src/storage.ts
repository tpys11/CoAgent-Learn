/**
 * localStorage 唯一入口：集中定义 key，并提供带异常兜底的读写 helper。
 * 新代码请通过这里读写，避免在组件里散落字符串 key 和裸 try/catch。
 */
export const LS = {
  apiKey: 'coagent-apikey',
  apiKeySkipped: 'coagent-apikey-skipped',
  // T53：首弹标记键已随「项目介绍」移除；introGlobal/introTiers 仍被 AgentsView 对话设定使用，保留
  introGlobal: 'coagent-intro-global',
  introTiers: 'coagent-intro-tiers',
  agents: 'coagent-agents',
  fontSize: 'coagent-fontSize',
  theme: 'coagent-theme',
  provider: 'coagent-provider',
  providerKeys: 'coagent-provider-keys',
  model: 'coagent-model',
  modelAuto: 'coagent-model-auto',
  auto: 'coagent-auto',
  template: 'coagent-template',
  contextSettings: 'coagent-context-settings',
  postActions: 'coagent-post-actions',
  lastSettings: 'coagent-last-settings',
  timeout: 'coagent-timeout',
  debug: 'coagent-debug',
  dialogueLimit: 'coagent-dialogue-limit',
  mcpServers: 'coagent-mcp-servers',
  obsidianMode: 'coagent-obsidian-mode',
  manualSetupDone: 'coagent-manual-setup-done',
  projectSidebarV: 'coagent-project-sidebar-v',
  defaultProject: 'coagent-default-project',
  tutorialCats: 'coagent-tutorial-cats',
  tutorials: 'coagent-tutorials',
  skillEnabled: 'coagent-skill-enabled',
  customTemplates: 'coagent-custom-templates',
  domains: 'coagent-domains',
  customWiki: 'coagent-custom-wiki',
  syllabus: 'coagent-syllabus',
  rpWindows: 'coagent-rp-windows',
  /** F14-S5b2/RA-S2：预设档标记（standard/test/custom） */
  preset: 'coagent-preset',
  /** RA-S2：OpenCode Zen 网关地址（测试档 LS 写集之一；S5 主链路 zen 路由读此键） */
  zenBaseUrl: 'coagent-zen-base-url',
  /** S3：go 网关地址（第二测试通道 LS 写集；与 zenBaseUrl 同构，主链路 go 路由读此键） */
  goBaseUrl: 'coagent-go-base-url',
  /** C1：Z.AI 通道地址（第三测试通道；bigmodel 官方端点由 GET 落 LS，主链路 zai 路由读此键） */
  zaiBaseUrl: 'coagent-zai-base-url',
} as const

export function lsGet(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 隐私模式 / 存储被禁时静默降级，不影响主流程
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 同上
  }
}

export function lsGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function lsSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 同上
  }
}
