/**
 * 极薄 API 封装：统一 fetch 错误处理，避免 12 个组件各自裸 fetch 且错误处理不一致。
 * SSE 长连接不在这里封装（见 sse.ts）。
 */

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
  getSettings: () => apiFetch<any>('/api/settings'),
  saveSettings: (body: unknown) => apiFetch<any>('/api/settings', jsonInit('PUT', body)),
  testSettings: (body: unknown) => apiFetch<any>('/api/settings/test', jsonInit('POST', body)),

  listProjects: () => apiFetch<any>('/api/projects'),
  createProject: (body: { name: string; domain?: string; simple?: boolean }) =>
    apiFetch<any>('/api/projects', jsonInit('POST', body)),
  updateProject: (id: string, body: unknown) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(id), jsonInit('PATCH', body)),
  deleteProject: (id: string) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(id), jsonInit('DELETE')),

  listProjectDialogues: (pid: string) =>
    apiFetch<any>('/api/projects/' + encodeURIComponent(pid) + '/dialogues'),
  createDialogue: (body: unknown) => apiFetch<any>('/api/dialogues', jsonInit('POST', body)),
  getDialogueMessages: (did: string) =>
    apiFetch<any>('/api/dialogues/' + encodeURIComponent(did) + '/messages', { cache: 'no-store' }),
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

  stopChat: (requestId: string) =>
    apiFetch<any>('/api/chat/stop', jsonInit('POST', { request_id: requestId })),
}
