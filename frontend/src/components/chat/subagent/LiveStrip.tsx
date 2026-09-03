/**
 * 条目4·实时化 → F11-S3 改造：直播条换用共用行组件 SubAgentRunRow
 * （行式五要素：状态图标/agent 类型/标题/耗时/token 估算；点击行展开实时输出流，
 * ↗ 打开只读窗口——原 chip 行为升级，open-subagent 机制不变）。
 * 挂载点：AssistantMessage 流式区一行（历史消息不显示）。
 */
import { useSyncExternalStore } from 'react'
import { subagentStore } from '../../../stores/subagentStore'
import { SubAgentRunRow, toRowData } from './RunRow'

export function SubAgentLiveStrip() {
  useSyncExternalStore(subagentStore.subscribe, subagentStore.getVersion)
  const lives = subagentStore.listAll()
  if (lives.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 mb-1">
      {lives.map(r => (
        <SubAgentRunRow key={r.runId} data={toRowData(r)}
          onOpen={() => window.dispatchEvent(new CustomEvent('open-subagent', { detail: { runIds: [r.runId] } }))} />
      ))}
    </div>
  )
}
