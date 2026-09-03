/**
 * F10-S1 后台上传进度观察器（从 UploadPanel.pollProgress 抽取共享）。
 *
 * 为什么要抽：UploadPanel 原有内联轮询与 F9 c4f6370 修复的完成判定
 * （enhancing 收尾 OR embedding 满载稳定两拍——KB_META_ENHANCE=0 的栈没有 enhancing 阶段）
 * 是全产品唯一正确实现；向导补传（F10-S1）需要同款判定，复制会种下双实现漂移
 * （F9 当时RetentionScopePanel 已被迫复制过一份）。UI 进度呈现经回调注入，
 * 观察器本体与组件生命周期解耦——发起组件卸载后轮询照跑、结果照返。
 */
import { api } from '../api'

export interface UploadPollResult {
  ok: boolean
  chunks: number
  msg?: string    // 后端 _set_progress_error 写入的失败原因（原因/后果/怎么办由调用方拼装）
  engine?: string // F8-S2：解析引擎标注
}

export interface UploadPollCallbacks {
  /** 进度更新（stage 已汉化）。传 undefined 表示无 UI（向导补传的静默等待）。 */
  onProgress?: (stage: string, pct: number) => void
  /** 终态（完成/失败/超时）后清 UI 进度条 */
  onSettled?: () => void
}

/** 阶段汉化单一事实源（与后端 _set_progress 的 stage 值对齐） */
const STAGE_CN: Record<string, string> = {
  parsing: '解析文档', chunking: '切分内容块', embedding: '向量化入库', enhancing: '问题增强',
}

/**
 * 轮询 /api/knowledge/upload-progress 直至完成/错误/超时。
 * 完成判定：问题增强收尾（默认链路）或向量化满载连续两拍（增强被关闭的配置）。
 * 网络抖动继续轮询（10 分钟超时兜底）——失败不影响主流程，不改变控制流。
 */
export function watchUploadProgress(
  projectId: string,
  source: string,
  callbacks: UploadPollCallbacks = {},
  intervalMs = 1200,
  timeoutMs = 10 * 60 * 1000,
): Promise<UploadPollResult> {
  const { onProgress, onSettled } = callbacks
  return new Promise<UploadPollResult>(resolve => {
    const started = Date.now()
    let lastChunks = 0
    let stable = 0
    let lastEngine: string | undefined
    const timer = setInterval(async () => {
      try {
        const p: any = await api.uploadProgress(projectId, source)
        if (p && p.status === 'error') {
          clearInterval(timer); onSettled?.(); resolve({ ok: false, chunks: 0, msg: p.msg }); return
        }
        if (p && p.status === 'ok') {
          if (p.parse_engine) lastEngine = p.parse_engine
          lastChunks = Math.max(lastChunks, p.total || 0)
          const pct = p.total ? Math.max(6, Math.min(99, Math.round(100 * p.done / p.total)))
                              : (p.stage === 'parsing' ? 12 : 40)
          onProgress?.(STAGE_CN[p.stage || ''] || '处理中', pct)
          const embDone = p.stage === 'embedding' && p.done === p.total && p.total > 0
          if (embDone) stable++; else stable = 0
          if ((p.stage === 'enhancing' && (p.done || 0) >= (p.total || 1)) || stable >= 2) {
            clearInterval(timer); onSettled?.(); resolve({ ok: true, chunks: lastChunks, engine: lastEngine }); return
          }
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer); onSettled?.(); resolve({ ok: false, chunks: 0 })
        }
      } catch { /* 网络抖动：继续轮询（超时兜底） */ }
    }, intervalMs)
  })
}
