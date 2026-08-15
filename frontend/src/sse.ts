import type { ChatStep, MindchainItem } from './types'

/** 后端 /api/chat SSE 事件的完整类型（7 类 + start/heartbeat）。 */
export type ChatEvent =
  | { type: 'start'; request_id: string }
  | { type: 'heartbeat' }
  | { type: 'step'; agent: string }
  | { type: 'thought_token'; agent: string; chunk: string }
  | { type: 'answer_token'; chunk: string }
  | { type: 'clarify'; question: string; options: string[] }
  | {
      type: 'done'
      reply: string
      steps?: ChatStep[]
      mindchain?: MindchainItem[]
      task_stats?: Record<string, unknown>
      special_suggestions?: string[]
      retrieved_images?: Array<{ source: string; content: string; file_path: string; mime: string }>
    }
  | { type: 'error'; message: string }

interface StreamOptions {
  signal?: AbortSignal
  /** 每收到一块原始数据调用一次，用于重置空闲超时。 */
  onProgress?: () => void
}

/**
 * 消费一个 fetch Response，按 SSE 的 `\n\n` 帧切分并逐条回调 JSON 事件。
 * 这是主对话与右侧第二对话共用的唯一 SSE 解析实现，避免两处各自按行解析产生不一致。
 */
export async function streamChatResponse(
  res: Response,
  onEvent: (event: ChatEvent) => void,
  opts: StreamOptions = {},
): Promise<void> {
  if (!res.body) throw new Error('响应体为空')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  const dispatch = (frame: string) => {
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        onEvent(JSON.parse(line.slice(6)) as ChatEvent)
      } catch (err) {
        console.warn('[sse] 忽略无法解析的事件:', line.slice(0, 120), err)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    opts.onProgress?.()
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      dispatch(frame)
    }
  }
  if (buf.trim()) dispatch(buf)
}
