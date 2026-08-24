/**
 * 条目4·实时化：直播条——子agent start 事件到达即出脉冲 chip（不等 done），
 * 完成翻 ✓ / 异常翻 ⚠；点击开只读窗口看指令与实时过程。
 * 挂载点：AssistantMessage 流式区一行 <SubAgentLiveStrip />（历史消息不显示）。
 */
import { useState, useSyncExternalStore } from 'react'
import { subagentStore } from '../../../stores/subagentStore'
import { SubAgentWindow } from './SubAgentWindow'

export function SubAgentLiveStrip() {
  useSyncExternalStore(subagentStore.subscribe, subagentStore.getVersion)
  const [open, setOpen] = useState<string[] | null>(null)
  const lives = subagentStore.listAll()
  if (lives.length === 0) return null
  return (
    <>
      <div className="flex flex-wrap gap-1 mb-1">
        {lives.map(r => (
          <button
            key={r.runId}
            onClick={() => setOpen([r.runId])}
            title="查看子 Agent 实时运行"
            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10${r.status === 'running' ? ' animate-pulse' : ''}`}
          >
            🛰 {r.title || r.agent || '子agent'}
            {r.status === 'running' ? ' …' : r.status === 'error' ? ' ⚠' : ' ✓'}
          </button>
        ))}
      </div>
      {open && <SubAgentWindow runIds={open} onClose={() => setOpen(null)} />}
    </>
  )
}
