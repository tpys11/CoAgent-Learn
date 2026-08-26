/** 后台摄取进度轮询器（活动代码）：系统预设卡经 /upload-url 异步摄取时使用。 */
import { api } from '../../api'

/** 轮询后台摄取进度直至完成/超时；onUpdate 收到最新 done/total。 */
export async function watchIngestProgress(projectId: string, source: string,
  onUpdate: (done: number, total: number) => void,
  timeoutMs = 15 * 60_000): Promise<'done' | 'timeout'> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const d = await api.getUploadProgress(projectId, source)
      if (!d || d.status !== 'ok') continue
      onUpdate(d.done || 0, d.total || 0)
      if ((d.total || 0) > 0 && (d.done || 0) >= d.total) return 'done'
    } catch { /* 瞬时网络错误忽略 */ }
  }
  return 'timeout'
}
