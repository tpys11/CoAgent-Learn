/**
 * 条目4：子agent独立界面（抄 OpenCode session-ui 思想——同一套聊天渲染器，换数据源）。
 * 纯对话形态：主发给子的指令=右侧用户输入气泡；子agent回答=左侧 markdown 正文（直播 delta 流式 → 终稿）。
 * 无卡片/时间线/徽章。顶部「← 返回对话」/Esc 回主界面；协议级只读（无输入框）。
 * 数据：挂载 REST 拉档（回看）+ 订阅 subagentStore 直播（delta 仅直播不入库，end 后切终稿）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import MarkdownIt from 'markdown-it'
import { api } from '../../../api'
import { subagentStore } from '../../../stores/subagentStore'
import type { SubAgentRun } from '../../../types'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

/** 单次运行的对话段：右=主→子指令（输入姿态）；左=回答（直播delta流式 → 终稿markdown） */
function RunTranscript({ runId }: { runId: string }) {
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
  const input = arch?.input || live?.input || ''
  const output = arch?.output || ''
  // 直播正文：delta 增量拼接；终稿以档案 output 为准（end 后自动切换）
  const liveText = (live?.events || []).filter(e => e.event === 'delta').map(e => String(e.text || '')).join('')

  return (
    <div className="flex flex-col gap-3">
      {/* 右侧：主 Agent 发给子的指令（用户输入姿态，样式同主聊 card-surface 气泡） */}
      <div className="flex flex-col items-end">
        <span className="text-[10px] text-dim mb-0.5">主 Agent → 子agent · 指令</span>
        <div
          className="self-end max-w-[85%] card-surface px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{ borderBottomRightRadius: 6 }}
        >
          {input || '—'}
        </div>
      </div>
      {/* 左侧：子agent回答（流式纯文本 → markdown 终稿，样式同主聊 md-answer-body） */}
      <div className="self-start w-full max-w-[92%] flex flex-col gap-1">
        <span className="text-[10px] text-dim">{arch?.title || live?.title || '子agent'} · 回答</span>
        {status !== 'running' && output ? (
          <div className="w-full text-sm leading-7">
            <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: md.render(output) }} />
          </div>
        ) : (
          <div className="w-full text-sm leading-7 whitespace-pre-wrap break-words text-[var(--text)]">
            {liveText || '…'}
            <span className="inline-block w-1.5 h-4 align-middle bg-[var(--accent)] animate-pulse ml-0.5" />
          </div>
        )}
        {/* 状态微行（对话流内的轻量脚注，非徽章卡片） */}
        <span className="text-[10px] text-dim">
          {status === 'running' && <>● 整理中{liveText ? ` · 已生成 ${liveText.length} 字` : ''}…</>}
          {status === 'ok' && <>✓ 已完成{output ? ` · ${output.length} 字` : ''}</>}
          {status === 'error' && <>⚠ 异常{arch?.output ? `：${arch.output.slice(0, 120)}` : ''}</>}
          {loadErr && <>（拉档失败：{loadErr}）</>}
        </span>
      </div>
    </div>
  )
}

/** 独立界面：顶部返回条 + 纯对话滚动区；Esc=返回。由 App 经 open-subagent 事件唤起。 */
export function SubAgentPage({ runIds, onBack }: { runIds: string[]; onBack: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onBack])
  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-zinc-900 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3 border-b hairline flex-shrink-0">
        <button
          onClick={onBack}
          title="返回主界面 (Esc)"
          className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-lg border hairline row-hover transition-colors"
        >
          ← 返回对话
        </button>
        <span className="text-[13px] font-semibold">🛰 子 Agent</span>
        <span className="text-[10px] text-dim">只读 · 无法向子 Agent 发送消息</span>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {runIds.map(rid => <RunTranscript key={rid} runId={rid} />)}
        </div>
      </div>
    </div>
  )
}
