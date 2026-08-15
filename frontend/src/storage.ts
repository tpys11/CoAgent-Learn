/**
 * localStorage 唯一入口：集中定义 key，并提供带异常兜底的读写 helper。
 * 新代码请通过这里读写，避免在组件里散落字符串 key 和裸 try/catch。
 */
export const LS = {
  apiKey: 'coagent-apikey',
  apiKeySkipped: 'coagent-apikey-skipped',
  introSeen: 'coagent-intro-seen',
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
  rpWindows: 'coagent-rp-windows',
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
