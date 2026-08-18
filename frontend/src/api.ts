/**
 * 极薄 API 封装：统一 fetch 错误处理，避免 12 个组件各自裸 fetch 且错误处理不一致。
 * SSE 长连接不在这里封装（见 sse.ts）。
 */
import type { ProjectList, DialogueList, MessagesData, ProfileData, ResourceList, StatsData, SettingsData, CapabilityList, SkillList } from './types'

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

export const api = {
  getSettings: () => apiFetch<SettingsData>('/api/settings', { cache: 'no-store' }),
  saveSettings: (body: unknown) => apiFetch<any>('/api/settings', jsonInit('PUT', body)),
  testSettings: (body: unknown) => apiFetch<any>('/api/settings/test', jsonInit('POST', body)),

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
  uploadKnowledgeUrl: (body: unknown) =>
    apiFetch<any>('/api/knowledge/upload-url?wait=true', jsonInit('POST', body)),
  uploadKnowledgeFile: (form: FormData) =>
    apiFetch<any>('/api/knowledge/upload-file', { method: 'POST', body: form }),
  listKnowledge: (projectId: string) =>
    apiFetch<any>('/api/knowledge/list?project_id=' + encodeURIComponent(projectId), { cache: 'no-store' }),
  deleteKnowledge: (projectId: string, source: string) =>
    apiFetch<any>('/api/knowledge/delete?project_id=' + encodeURIComponent(projectId) + '&source=' + encodeURIComponent(source), jsonInit('DELETE')),
  getKbNodeContent: (pid: string, source: string, path: string) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/content?source=' + encodeURIComponent(source) + '&path=' + encodeURIComponent(path), { cache: 'no-store' }),
  getKbChunkNode: (pid: string, source: string, chunk: number) =>
    apiFetch<any>('/api/kb/' + encodeURIComponent(pid) + '/chunk-node?source=' + encodeURIComponent(source) + '&chunk=' + chunk, { cache: 'no-store' }),
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
