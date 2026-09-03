/**
 * 极薄 API 封装：统一 fetch 错误处理，避免 12 个组件各自裸 fetch 且错误处理不一致。
 * SSE 长连接不在这里封装（见 sse.ts）。
 */
import type { ProjectList, DialogueList, MessagesData, ProfileData, ResourceList, StatsData, SettingsData, CapabilityList, SkillList, SubAgentRun, MatchReportData } from './types'

interface ApiError extends Error {
  status?: number
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let msg = 'HTTP ' + res.status
    try {
      const data = await res.json()
      if (data && typeof data === 'object' && 'msg' in data && data.msg) {
        msg = String(data.msg)
      }
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态文案
    }
    const err = new Error(msg) as ApiError
    err.status = res.status
    throw err
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function jsonInit(method: string, body?: unknown, init?: RequestInit): RequestInit {
  return {
    method,
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: body === undefined ? init?.body : JSON.stringify(body),
  }
}

/* ---------- URL 摄取预检（probe）契约 ---------- */

/** 可勾选的摄取分区（GitHub 目录前缀 / 文档站路径前缀）。 */
interface UrlProbeGroup {
  key: string
  label: string
  count: number
  default_selected: boolean
}

/** 语言类分区的便捷镜像（其内容同样出现在 groups 中）。 */
interface UrlProbeLanguage {
  code: string
  label: string
  count: number
  key: string
}

interface UrlProbeOk {
  status: 'ok'
  kind: 'github' | 'docs'
  title_hint: string
  total_files: number
  max_files: number
  truncated: boolean
  /** 后端保证返回，但按可选处理以兼容旧版本/异常响应 */
  groups?: UrlProbeGroup[]
  languages?: UrlProbeLanguage[]
  warnings?: string[]
}

interface UrlProbeError {
  status: 'error'
}

export type UrlProbeResult = UrlProbeOk | UrlProbeError

/** 用户在预览卡片中调整后的摄取范围；空数组/未变更时不落到请求体。 */
export interface UrlIngestScope {
  includeGroups?: string[]
  excludeGroups?: string[]
}

/** 驼峰范围参数 → 后端 snake_case 字段；仅输出非空项。 */
function urlScopeBody(scope: UrlIngestScope): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (scope.includeGroups?.length) out.include_groups = scope.includeGroups
  if (scope.excludeGroups?.length) out.exclude_groups = scope.excludeGroups
  return out
}

/* ---------- F13-S1 预设资源库契约 ---------- */

export interface PresetFile {
  name: string; rel_path: string; ext: string; size: number
  pages: number | null
  url: string
}
export interface PresetResource {
  id: string; name: string; files: PresetFile[]
  publisher: string; pub_year: string; cover: string
}
export interface PresetDomain { name: string; resources: PresetResource[] }

export const api = {
  getSettings: () => apiFetch<SettingsData>('/api/settings', { cache: 'no-store' }),
  saveSettings: (body: unknown) => apiFetch<any>('/api/settings', jsonInit('PUT', body)),
  /** RA5-S2：Zen key 专用保存通道（不经通用 saveSettings）——E-40 教训：字段存活不靠约定靠通道。
   *  通用入口 body 是 unknown 黑盒，未来表单保存路径改动时 zen_api_key 会被静默丢字段；
   *  专用函数把「该通道只发 zen_api_key」钉在类型签名上（api.test.ts PUT 体契约守卫）。 */
  saveZenKey: (key: string) => apiFetch<any>('/api/settings', jsonInit('PUT', { zen_api_key: key })),
  testSettings: (body: unknown) => apiFetch<any>('/api/settings/test', jsonInit('POST', body)),
  /** F14-S4f：拉取 Zen /models 名单（服务端代理+TTL 缓存；失败由前端 FALLBACK 兜底） */
  zenModels: () => apiFetch<{ status: string; cached?: boolean; models?: string[]; msg?: string }>(
    '/api/settings/zen/models', { cache: 'no-store' }),

  /** 答题反馈上报（闭环D）：后端落 quiz_answers 并合流 level_score，下轮策略指令随之变化 */
  submitQuizAnswers: (body: {
    dialogue_id: string
    project_id: string
    answers: { question_id: string; kp_tag: string; correct: boolean }[]
  }) => apiFetch<{
    saved: number; total: number; correct: number
    accuracy: number | null; old_score: number | null; new_score: number | null
  }>('/api/quiz/submit', jsonInit('POST', body)),

  /** 学情匹配度报告（评估体系 §五）：盲区/level曲线/kp正确率/路径树着色 */
  getMatchReport: (projectId: string, dialogueId?: string) =>
    apiFetch<MatchReportData>('/api/report/match?project_id=' + encodeURIComponent(projectId)
      + (dialogueId ? '&dialogue_id=' + encodeURIComponent(dialogueId) : ''), { cache: 'no-store' }),

  listProjects: () => apiFetch<ProjectList>('/api/projects'),
  createProject: (body: { name: string; domain?: string; simple?: boolean }) =>
    apiFetch<{ id: string }>('/api/projects', jsonInit('POST', body)),
  updateProject: (id: string, body: unknown) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(id), jsonInit('PATCH', body)),
  deleteProject: (id: string) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(id), jsonInit('DELETE')),

  listProjectDialogues: (pid: string) =>
    apiFetch<DialogueList>('/api/projects/' + encodeURIComponent(pid) + '/dialogues'),
  createDialogue: (body: unknown) => apiFetch<any>('/api/dialogues', jsonInit('POST', body)),
  getDialogueProfileStatus: (did: string) =>
    apiFetch<{ status: string }>('/api/dialogues/' + encodeURIComponent(did) + '/profile_status', { cache: 'no-store' }),
  getDialogueMessages: (did: string) =>
    apiFetch<MessagesData>('/api/dialogues/' + encodeURIComponent(did) + '/messages', { cache: 'no-store' }),

  /** 闭环六：编辑会话历史轻量版（后端跳过 think 解析，长会话挂载提速） */
  getDialogueMessagesLight: (did: string) =>
    apiFetch<MessagesData>('/api/dialogues/' + encodeURIComponent(did) + '/messages?light=true', { cache: 'no-store' }),
  /** 条目4：子agent运行档案事后拉档（回看通道） */
  getSubAgentRun: (runId: string) =>
    apiFetch<{ run: SubAgentRun }>('/api/chat/subagent/' + encodeURIComponent(runId), { cache: 'no-store' }),
  postDialogueMessage: (did: string, body: unknown) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/messages', jsonInit('POST', body)),
  updateDialogue: (did: string, body: unknown) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/update', jsonInit('POST', body)),
  deleteDialogue: (did: string) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did), jsonInit('DELETE')),

  saveProjectProfile: (pid: string, profile: unknown) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(pid) + '/profile', jsonInit('POST', { profile })),
  saveDialogueProfile: (did: string, profile: unknown) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/profile', jsonInit('POST', { profile })),
  clearProjectDialogues: (pid: string) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(pid) + '/dialogues', jsonInit('DELETE')),
  clearMemories: () => apiFetch<any>('/api/memories', jsonInit('DELETE')),
  exportData: (pid: string) =>
    apiFetch<any>('/api/export?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }),

  uploadKnowledgeText: (body: unknown) =>
    apiFetch<any>('/api/knowledge/upload?wait=true', jsonInit('POST', body)),
  uploadUrlProbe: (url: string) =>
    apiFetch<UrlProbeResult>('/api/knowledge/upload-url/probe', jsonInit('POST', { url })),
  uploadKnowledgeUrl: (body: unknown, scope?: UrlIngestScope) =>
    apiFetch<any>('/api/knowledge/upload-url',
      jsonInit('POST', scope ? { ...(body as Record<string, unknown>), ...urlScopeBody(scope) } : body)),
  uploadKnowledgeFile: (form: FormData) =>
    apiFetch<any>('/api/knowledge/upload-file', { method: 'POST', body: form }),
  uploadProgress: (projectId: string, source: string) =>
    apiFetch<{ status: string; done?: number; total?: number; stage?: string; msg?: string }>(
      `/api/knowledge/upload-progress?project_id=${encodeURIComponent(projectId)}&source=${encodeURIComponent(source)}`),
  getUploadConstraints: () =>
    apiFetch<any>('/api/knowledge/upload-constraints', { cache: 'no-store' }),
  getUploadProgress: (projectId: string, source: string) =>
    apiFetch<any>('/api/knowledge/upload-progress?project_id=' + encodeURIComponent(projectId) + '&source=' + encodeURIComponent(source), { cache: 'no-store' }),
  listKnowledge: (projectId: string) =>
    apiFetch<any>('/api/knowledge/list?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' }),
  deleteKnowledge: (projectId: string, source: string) =>
    apiFetch<any>('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId) + '&source=' + encodeURIComponent(source), jsonInit('DELETE')),
  getKbNodeContent: (pid: string, source: string, path: string) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/content?source=' + encodeURIComponent(source) + '&path=' + encodeURIComponent(path), { cache: 'no-store' }),
  getKbChunkNode: (pid: string, source: string, chunk: number) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/chunk-node?source=' + encodeURIComponent(source) + '&chunk=' + chunk, { cache: 'no-store' }),
  getKbDoc: (pid: string, source: string) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/doc?source=' + encodeURIComponent(source), { cache: 'no-store' }),
  // F9-S2：留存范围选择——按勾选章节路径（子树语义）重入库；进度复用 upload-progress 轮询
  applyKbScope: (pid: string, source: string, include: string[], apiKey: string) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/apply-scope',
      jsonInit('POST', { source, include, api_key: apiKey })),
  getKb: (projectId: string) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(projectId), { cache: 'no-store' }),
  queryKnowledge: (projectId: string, q: string, topK = 3) =>
    apiFetch<any>('/api/knowledge/query?project_id=' + encodeURIComponent(projectId) + '&q=' + encodeURIComponent(q) + '&top_k=' + topK),
  fileToText: (form: FormData) =>
    apiFetch<any>('/api/file-to-text', { method: 'POST', body: form }),

  getGlobalProfile: () => apiFetch<ProfileData>('/api/global-profile', { cache: 'no-store' }),
  saveGlobalProfile: (profile: unknown) => apiFetch<any>('/api/global-profile', jsonInit('POST', { profile })),
  getProjectMemory: (pid: string) =>
    apiFetch<ProfileData>('/api/project-memory/' + encodeURIComponent(pid), { cache: 'no-store' }),
  saveProjectMemory: (pid: string, profile: unknown) =>
    apiFetch<any>('/api/project-memory/' + encodeURIComponent(pid), jsonInit('POST', { profile })),
  // F12-S4：课程各对话的压缩滚动摘要（五段式）只读聚合——记忆单框展示素材
  getCompressedSummaries: (pid: string) =>
    apiFetch<{ summaries: Array<{ dialogue_id: string; name: string; summary: string }> }>(
      '/api/projects/' + encodeURIComponent(pid) + '/compressed-summaries', { cache: 'no-store' }),
  getDialogueProfile: (did: string) =>
    apiFetch<ProfileData>('/api/dialogues/' + encodeURIComponent(did) + '/profile'),
  getDialogueFollowups: (did: string) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/followups', { cache: 'no-store' }),
  getLearningLog: (pid?: string) =>
    apiFetch<any>('/api/learning-log' + (pid ? '?project_id=' + encodeURIComponent(pid) : ''), { cache: 'no-store' }),
  getFocusDays: (opts?: { project_id?: string; month?: string }) => {
    const qs: string[] = []
    if (opts?.project_id) qs.push('project_id=' + encodeURIComponent(opts.project_id))
    if (opts?.month) qs.push('month=' + encodeURIComponent(opts.month))
    return apiFetch<any>('/api/stats/focus-days' + (qs.length ? '?' + qs.join('&') : ''), { cache: 'no-store' })
  },
  getMemoryProgress: (pid: string) =>
    apiFetch<any>('/api/memory/progress?project_id=' + encodeURIComponent(pid), { cache: 'no-store' }),
  memoryChat: (body: unknown) => apiFetch<any>('/api/memory-chat', jsonInit('POST', body)),

  listResources: (projectId: string) =>
    apiFetch<ResourceList>('/api/resources?project_id=' + encodeURIComponent(projectId)),
  listResourcesAll: () => apiFetch<ResourceList>('/api/resources/all'),
  saveResource: (body: unknown) => apiFetch<any>('/api/resources', jsonInit('POST', body)),
  uploadResource: (form: FormData) =>
    apiFetch<any>('/api/resources/upload', { method: 'POST', body: form }),
  deleteResource: (rid: string) =>
    apiFetch<any>('/api/resources/' + encodeURIComponent(rid), jsonInit('DELETE')),
  generateDomain: (body: unknown) => apiFetch<any>('/api/generate-domain', jsonInit('POST', body)),
  generateOutline: (body: unknown) => apiFetch<any>('/api/domain/outline', jsonInit('POST', body)),
  generateChapter: (body: unknown) => apiFetch<any>('/api/domain/chapter', jsonInit('POST', body)),
  /** F13-S1：预设资源库三级清单（领域→资源→文件，含页数等元数据） */
  getPresetLibrary: () =>
    apiFetch<{ status: string; domains: PresetDomain[] }>('/api/preset-library', { cache: 'no-store' }),
  /** F13-S1：占位元数据编辑（出版社/初版时间/封面），资源级 */
  updatePresetMeta: (body: { rel_path: string; publisher: string; pub_year: string; cover: string }) =>
    apiFetch<any>('/api/preset-library/meta', jsonInit('PUT', body)),
  listCapabilities: () =>
    apiFetch<CapabilityList>('/api/resources/capabilities', { cache: 'no-store' }),
  generateResource: (body: unknown) =>
    apiFetch<any>('/api/resources/generate', jsonInit('POST', body)),
  listArtifacts: (projectId: string) =>
    apiFetch<any>('/api/artifacts?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' }),

  getStats: (projectId: string) =>
    apiFetch<StatsData>('/api/stats?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' }),
  listSkills: () => apiFetch<SkillList>('/api/skills'),
  getSkillSource: (name: string) =>
    apiFetch<any>('/api/skills/' + encodeURIComponent(name) + '/source', { cache: 'no-store' }),

  stopChat: (requestId: string) =>
    apiFetch<any>('/api/chat/stop', jsonInit('POST', { request_id: requestId })),
}
