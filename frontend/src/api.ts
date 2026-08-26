/**
 * 极薄 API 封装：统一 fetch 错误处理，避免 12 个组件各自裸 fetch 且错误处理不一致。
 * SSE 长连接不在这里封装（见 sse.ts）。
 */
import type { ProjectList, DialogueList, MessagesData, ProfileData, ResourceList, StatsData, SettingsData, CapabilityList, SkillList, SubAgentRun, MatchReportData } from './types'

export interface ApiError extends Error {
  status?: number
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
export interface UrlProbeGroup {
  key: string
  label: string
  count: number
  default_selected: boolean
}

/** 语言类分区的便捷镜像（其内容同样出现在 groups 中）。 */
export interface UrlProbeLanguage {
  code: string
  label: string
  count: number
  key: string
}

export interface UrlProbeOk {
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

export interface UrlProbeError {
  status: 'error'
  msg?: string
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

export const api = {
  getSettings: () => apiFetch<SettingsData>('/api/settings', { cache: 'no-store' }),
  saveSettings: (body: unknown) => apiFetch<any>('/api/settings', jsonInit('PUT', body)),
  testSettings: (body: unknown) => apiFetch<any>('/api/settings/test', jsonInit('POST', body)),

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
  getDialogueProfile: (did: string) =>
    apiFetch<ProfileData>('/api/dialogues/' + encodeURIComponent(did) + '/profile'),
  getDialogueFollowups: (did: string) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/followups', { cache: 'no-store' }),
  getLearningLog: (pid?: string) =>
    apiFetch<any>('/api/learning-log' + (pid ? '?project_id=' + encodeURIComponent(pid) : ''), { cache: 'no-store' }),
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
