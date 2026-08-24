/**
 * 条目4：子agent只读窗口——思维链「🛰 子agent」按钮点开。
 * 三区布局：主→子指令 / 过程时间线 / 最终报告；无输入框——协议级只读（上行通道不存在）。
 * 数据双模式：挂载时 REST 拉档（回看）；同时订阅 subagentStore 直播态，
 * 运行状态翻转（running→ok/error）时自动重拉档案拿最终 output。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import MarkdownIt from 'markdown-it'
import { X } from 'lucide-react'
import { api } from '../../../api'
import { subagentStore } from '../../../stores/subagentStore'
import type { SubAgentRun } from '../../../types'

const mdWin = new MarkdownIt({ html: false, linkify: true, breaks: true })

const EVENT_CN: Record<string, string> = {
  start: '启动',
  input: '收到指令',
  delta: '增量',
  end: '完成',
}

function StatusBadge({ status }: { status?: 'running' | 'ok' | 'error' }) {
  if (status === 'running')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] animate-pulse">运行中…</span>
  if (status === 'error')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500">异常</span>
  if (status === 'ok')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">✓ 完成</span>
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 text-dim">未知</span>
}

function RunCard({ runId }: { runId: string }) {
  // 订阅直播版本号：store 变化即重渲染；live.status 翻转作为重拉档案的依赖
  useSyncExternalStore(subagentStore.subscribe, subagentStore.getVersion)
  const live = subagentStore.get(runId)
  const [arch, setArch] = useState<SubAgentRun | null>(null)
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    let alive = true
    api.getSubAgentRun(runId)
      .then(r => { if (alive) setArch(r.run) })
      .catch(e => { if (alive) setLoadErr(String(e?.message || e)) })
    return () => { alive = false }
  }, [runId, live?.status])

  const status = live?.status ?? arch?.status ?? 'running'
  const title = arch?.title || live?.title || '子agent'
  const input = arch?.input || live?.input || ''
  const output = arch?.output || ''
  // 条目4实时化：delta 仅直播不入库——时间线=档案事件 ∪ 直播delta；字数计数供"正在整理"提示
  const liveDeltas = (live?.events || []).filter(e => e.event === 'delta')
  const baseEvents: Array<Record<string, any>> = arch ? (arch.events as any) : ((live?.events || []).filter(e => e.event !== 'delta'))
  const events = [...baseEvents, ...liveDeltas]
  const genChars = liveDeltas.reduce((s, e) => s + String(e.text || '').length, 0)

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold">{title}</span>
        <StatusBadge status={status} />
        <span className="ml-auto text-[9px] text-dim font-mono select-all">{runId}</span>
      </div>
      {/* 区1：主→子指令 */}
      <div>
        <div className="text-[10px] text-dim mb-0.5">主 Agent 发送的指令</div>
        <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words max-h-32 overflow-auto bg-black/[.03] dark:bg-white/[.04] rounded p-2">{input || '—'}</pre>
      </div>
      {/* 区2：过程时间线 */}
      <div>
        <div className="text-[10px] text-dim mb-0.5">
          过程（{events.length} 条事件{genChars > 0 ? ` · 已生成 ${genChars} 字` : ''}）
        </div>
        <div className="flex flex-col gap-0.5 max-h-40 overflow-auto text-[11px]">
          {events.length === 0 && <span className="text-dim">暂无事件</span>}
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[9px] text-dim flex-shrink-0 w-14">{EVENT_CN[String(ev.event)] || String(ev.event)}</span>
              <span className="whitespace-pre-wrap break-words min-w-0 flex-1">
                {String(ev.summary || ev.content || ev.text || '').slice(0, 200) || '—'}
              </span>
            </div>
          ))}
          {status === 'running' && genChars > 0 && (
            <div className="text-[10px] text-dim animate-pulse truncate">正在整理… {genChars} 字</div>
          )}
        </div>
      </div>
      {/* 区3：最终报告 */}
      <div>
        <div className="text-[10px] text-dim mb-0.5">最终报告</div>
        {output
          ? <div className="md-think-body max-h-64 overflow-auto rounded bg-black/[.03] dark:bg-white/[.04] p-2" dangerouslySetInnerHTML={{ __html: mdWin.render(output) }} />
          : (loadErr
              ? <div className="text-[11px] text-red-500">拉档失败：{loadErr}</div>
              : <div className="text-[11px] text-dim animate-pulse">运行中… 报告生成后自动显示</div>)}
      </div>
    </div>
  )
}

/** 独立窗口壳：遮罩点击/Esc 关闭；runIds 来自思维链条目的 run_ids。 */
export function SubAgentWindow({ runIds, onClose }: { runIds: string[]; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-xl p-4 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">🛰 子 Agent 运行窗口</span>
          <span className="text-[10px] text-dim">只读 · 无法向子 Agent 发送消息</span>
          <button onClick={onClose} className="ml-auto text-dim hover:text-[var(--text)]" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        {runIds.map(rid => <RunCard key={rid} runId={rid} />)}
      </div>
    </div>
  )
}
