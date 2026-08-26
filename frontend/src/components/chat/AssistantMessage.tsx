import { useState, useEffect, useRef, useMemo } from 'react'
import { CheckCircle2, Image as ImageIcon, PenLine, Lightbulb } from 'lucide-react'
import type { Message, Project } from '../../types'
import MarkdownIt from 'markdown-it'
import { LS, lsGetJSON } from '../../storage'
import { SubAgentLiveStrip } from './subagent'

// ---------- 思维链渲染：markdown-it 轻量渲染（html:false 防 XSS，换行生效）----------
const mdThink = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => mdThink.render(text || '')

// 审核引用标注（5.2）：`[来源:xxx#chunk-N]` 渲染为可点击元素（data-src/data-chunk 供事件委托跳知识库）
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const annotateCitations = (html: string) => html.replace(
  /\[来源:([^\]\n]+?)#chunk-(\d+)\]/g,
  (_m, src: string, ch: string) => {
    const safe = escapeHtml(src.trim())
    return `<span class="citation-ref" data-src="${safe}" data-chunk="${ch}" title="查看资源出处">来源:${safe} #chunk-${ch}</span>`
  },
)

// markdown 渲染结果缓存：历史消息 content 不变，命中即跳过 markdown-it 全量解析
const _mdCache = new Map<string, string>()
const renderMdCached = (text: string) => {
  const key = text || ''
  let h = _mdCache.get(key)
  if (h === undefined) {
    h = annotateCitations(renderMd(key))
    if (_mdCache.size > 300) {
      const first = _mdCache.keys().next().value
      if (first !== undefined) _mdCache.delete(first)
    }
    _mdCache.set(key, h)
  }
  return h
}

/** 思维链标题净化：只显示 agent 名称，去掉内部阶段后缀与伪标题。 */
const displayAgent = (name: string) => {
  if (typeof name !== 'string') return name
  let base = name
  const m = base.match(/^(.*?)·(规划|生成)$/)
  if (m) base = m[1]
  if (base === '主 Agent' || base === '主Agent' || base === '综合概述性记忆') return '学习助手'
  return base
}

interface AssistantMessageProps {
  msg: Message
  isLoading: boolean
  isLast: boolean
  flowActiveAgent?: string | null
  flowStatus?: string
  /** 本次流式已参与的 agent 序列（step/thought_token 事件收集），标题行展示链条 */
  flowAgents?: string[]
  specialSelectedKeys: string[]
  onToggleSpecial: (key: string) => void
  specialDismissed: boolean
  onDismissSpecial: () => void
  followups: string[]
  onSendFollowup: (q: string) => void
  onManualSetup?: () => void
  currentProject: Project | null
  onGenerateSpecial?: (keys: string[], content: string) => void
}

/** AI 回复消息气泡：思考过程 + 回答正文 + 运行统计 + 资源生成建议 + 图片命中 + 审核报告 + 追问。 */
export default function AssistantMessage({
  msg, isLoading, isLast, flowActiveAgent, flowStatus, flowAgents,
  specialSelectedKeys, onToggleSpecial, specialDismissed, onDismissSpecial,
  followups, onSendFollowup, onManualSetup, currentProject, onGenerateSpecial,
}: AssistantMessageProps) {
  const streaming = isLoading && isLast
  return (
    <>
      {/* 条目4·实时化：流式期间的子agent直播条（start 即现脉冲chip，完成翻✓）；历史消息不显示 */}
      {streaming && <SubAgentLiveStrip />}
      {/* 思考过程区块（DeepSeek 式：流式展开逐字 / 完成自动折叠为一行） */}
      {msg.think && msg.think.length > 0 && (
        <div className="mb-3">
          <ReasoningBlock items={msg.think} streaming={streaming} activeAgent={flowActiveAgent} activeStatus={flowStatus} flowAgents={flowAgents} />
        </div>
      )}
      {/* 回答正文：流式逐字纯文本（绝不 markdown）/ 完成一次性 markdown 渲染 */}
      {streaming
        ? (msg.content ? <StreamingMd text={msg.content} streaming /> : null)
        : (msg.content ? <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: renderMdCached(msg.content) }} /> : null)}
      {/* 流式等待指示器（回答尚未开始流式时显示） */}
      {streaming && !msg.content && (
        <div className="flex items-center gap-2 text-dim">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
          <span className="text-xs ml-1">{flowActiveAgent ? '处理中…' : (flowStatus || '思考中…')}</span>
        </div>
      )}
      {/* 完成态附加内容 */}
      {!streaming && (
        <>
          {/* 运行统计：回答下面、追问上面，直接展开显示 */}
          {(() => {
            const stat = (msg.think || []).find(t => typeof t !== 'string' && (t as any).agent === '运行统计')
            if (!stat) return null
            return (
              <div className="mt-2.5 text-[10px] leading-relaxed text-dim border hairline rounded-lg px-3 py-2 bg-[var(--bg-panel)]">
                {(stat as any).content}
              </div>
            )
          })()}
          {/* 资源生成建议（模型判断）：弹出选项——是否生成 / 生成哪些 */}
          {msg.special && msg.special.length > 0 && !specialDismissed && (
            <div className="mt-2.5 border hairline rounded-xl px-3 py-2.5 bg-[var(--bg-panel)]">
              <p className="text-[10px] font-semibold text-dim mb-1.5">模型建议：内容可生成以下形式</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {msg.special.map(s => {
                  const sel = specialSelectedKeys.includes(s.key)
                  return (
                    <button key={s.key}
                      onClick={() => onToggleSpecial(s.key)}
                      className={"chip text-left text-[11px] px-2.5 py-1 transition-all" + (sel ? '' : ' opacity-40')}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => {
                  if (specialSelectedKeys.length) onGenerateSpecial?.(specialSelectedKeys, msg.content)
                  onDismissSpecial()
                }}
                  className="text-[10px] font-semibold text-[var(--accent)] hover:underline">生成所选</button>
                <button onClick={onDismissSpecial}
                  className="text-[10px] text-dim hover:text-[var(--text)]">忽略</button>
              </div>
            </div>
          )}
          {/* 跨模态检索命中的图片：知识库图片向量命中，回显缩略图 */}
          {msg.retrievedImages && msg.retrievedImages.length > 0 && (
            <div className="mt-2.5 border hairline rounded-xl px-3 py-2.5 bg-[var(--bg-panel)]">
              <p className="text-[10px] font-semibold text-dim mb-1.5 flex items-center gap-1">
                <ImageIcon size={11} /> 知识库图片命中
              </p>
              <div className="flex flex-wrap gap-2">
                {msg.retrievedImages.map((img, k) => (
                  <figure key={k} className="flex flex-col gap-1 max-w-[180px]">
                    {img.file_path ? (
                      <img
                        src={img.file_path}
                        alt={img.source || '检索图片'}
                        className="w-[180px] h-[120px] object-cover rounded-lg border hairline bg-white"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-[180px] h-[120px] rounded-lg border hairline bg-[var(--bg-input)] flex items-center justify-center text-[10px] text-dim">
                        图片不可用
                      </div>
                    )}
                    {img.source && (
                      <figcaption className="text-[9px] text-dim truncate" title={img.source}>
                        {img.source}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </div>
          )}
          {/* 审核报告（三维度审查结果） */}
          {msg.review && (
            <div className="mt-2.5 border hairline rounded-xl px-3 py-2.5 bg-[var(--bg-panel)]">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[10px] font-semibold text-dim flex items-center gap-1">
                  <CheckCircle2 size={11} /> 审核报告
                </p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${msg.review.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {msg.review.passed ? '通过' : '未通过'} · {msg.review.score} 分
                </span>
              </div>
              {msg.review.issues && msg.review.issues.length > 0 && (
                <div className="flex flex-col gap-1 mb-1">
                  {msg.review.issues.map((it, i) => (
                    <p key={i} className="text-[10px] text-dim">
                      <span className="text-red-500">✗</span> {it.problem}
                      {it.fix ? <span className="text-green-600"> → {it.fix}</span> : ''}
                    </p>
                  ))}
                </div>
              )}
              {msg.review.suggestion && <p className="text-[10px] text-dim">💡 {msg.review.suggestion}</p>}
            </div>
          )}
          {/* 新建课程引导消息：右下角「手动初始化」按钮（仅初次创建、未完成手动填写时显示） */}
          {msg.content.includes('课程创建成功') && onManualSetup && !(currentProject && (() => {
            return lsGetJSON<string[]>(LS.manualSetupDone, []).includes(currentProject.id)
          })()) && (
            <div className="mt-3 flex justify-end">
              <button onClick={onManualSetup}
                className="text-[11px] px-3 py-1.5 rounded-lg border hairline text-dim hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1">
                <PenLine size={11} /> 手动初始化
              </button>
            </div>
          )}
          {/* 继续追问：附着于该条 AI 输出下方（豆包样式，仅最后一条输出） */}
          {isLast && followups.length > 0 && !isLoading && (
            <div className="mt-3 flex flex-col gap-1.5 animate-[fadeIn_0.3s_ease]">
              <p className="text-[11px] text-dim font-medium flex items-center gap-1"><Lightbulb size={12} /> 继续追问 · 推进学习目标</p>
              <div className="flex flex-wrap gap-1.5">
                {followups.map((q, k) => (
                  <button key={k} onClick={() => onSendFollowup(q)}
                    className="chip text-left text-[12px] px-3 py-1.5 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

/** 流式 markdown 渐进渲染（reasonix 同款方案）。 */
function StreamingMd({ text, streaming }: { text: string; streaming?: boolean }) {
  const stableEnd = useMemo(() => {
    if (!streaming) return -1
    let e = text.lastIndexOf('\n\n')
    for (let i = text.length - 1; i > e && i >= 0; i--) {
      if (text[i] === '\n' && text[i + 1] === '#') { e = i; break }
    }
    return e < 0 ? -1 : e + 2
  }, [text, streaming])
  const stable = stableEnd > 0 ? text.slice(0, stableEnd) : ''
  const tail = stableEnd > 0 ? text.slice(stableEnd) : text
  const html = useMemo(() => {
    if (streaming) return stable ? renderMdCached(stable) : ''
    return text ? renderMdCached(text) : ''
  }, [streaming, stable, text])
  if (!streaming) {
    if (html) return <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: html }} />
    return <div className="whitespace-pre-wrap break-words">{text}</div>
  }
  return (
    <div>
      {html ? <div className="md-answer-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      {tail ? <div className="whitespace-pre-wrap break-words">{tail}</div> : null}
    </div>
  )
}

/** 思考过程区块（DeepSeek 式独立区块）。条目4：run_ids 并集保留——前端合并与后端 _merge_mindchain 同款陷阱，重建时不得剥字段。 */
function ReasoningBlock({ items, streaming, activeAgent, activeStatus, flowAgents }: { items: Array<{ agent: string; content: string; run_ids?: string[] }> | string[]; streaming?: boolean; activeAgent?: string | null; activeStatus?: string; flowAgents?: string[] }) {
  const merged = useMemo(() => {
    const list = (items || []).map(it => typeof it === 'string' ? { agent: '', content: it, run_ids: [] as string[] } : { ...it, run_ids: Array.from(new Set(it.run_ids || [])) })
      .filter(it => it.agent !== '运行统计')
      // 完成态不显示空内容占位（step 帧的"进行中"标记在流式期有意义，结束后是杂乱光杆标题）
      .filter(it => streaming || (it.content || '').trim().length > 0)
    return list.reduce<Array<{ agent: string; content: string; run_ids: string[] }>>((acc, it) => {
      const dn = displayAgent(it.agent)
      const last = acc[acc.length - 1]
      if (last && dn && displayAgent(last.agent) === dn) {
        if (it.content) last.content = (last.content ? last.content + '\n' : '') + it.content
        for (const rid of it.run_ids) if (!last.run_ids.includes(rid)) last.run_ids.push(rid)
        return acc
      }
      acc.push({ agent: it.agent, content: it.content, run_ids: [...it.run_ids] })
      return acc
    }, [])
  }, [items])
  const [open, setOpen] = useState(true)
  // 块级折叠（5.2）：流式中非当前输出的 agent 块折叠为小标题行；完成后整块折叠
  const [folded, setFolded] = useState<Record<number, boolean>>({})
  const prevStreaming = useRef(streaming)
  useEffect(() => {
    if (streaming) {
      setOpen(true)
      setFolded(prev => {
        const next: Record<number, boolean> = {}
        merged.forEach((it, i) => {
          next[i] = !(activeAgent && displayAgent(it.agent) === displayAgent(activeAgent))
        })
        return next
      })
      return
    }
    if (prevStreaming.current && !streaming) setOpen(false)
    prevStreaming.current = streaming
  }, [streaming, activeAgent, merged.length])
  if (merged.length === 0) return null
  const toggle = () => { if (!streaming) setOpen(o => !o) }
  return (
    <div className="reasoning-block">
      <button onClick={toggle} className="flex items-center gap-1 reasoning-title hover:opacity-80 transition-opacity text-left w-full">
        <span className="text-[9px] flex-shrink-0">{open ? '▾' : '▸'}</span>
        <span>思考过程</span>
        {streaming
          ? (flowAgents && flowAgents.length > 0
              ? <span className="ml-1 font-normal text-[10px] flex items-center gap-0.5">
                  {flowAgents.map((a, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {i > 0 && <span className="text-dim">→</span>}
                      <span className={activeAgent && displayAgent(a) === displayAgent(activeAgent) ? 'text-[var(--accent)]' : ''}>{displayAgent(a)}</span>
                    </span>
                  ))}
                </span>
              : <span className="ml-1 font-normal text-[10px]">{activeStatus || '思考中…'}</span>)
          : <span className="ml-1 font-normal text-[10px] text-dim">已完成</span>}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          {merged.map((it, i) => {
            const isFolded = !!folded[i]
            return (
            <div key={i} className="animate-[fadeIn_0.15s_ease]">
              {it.agent && merged.length > 1 && (
                <button onClick={() => setFolded(f => ({ ...f, [i]: !f[i] }))}
                  className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 text-[var(--text)] hover:opacity-80 text-left">
                  <span className="text-[9px] text-dim flex-shrink-0">{isFolded ? '▸' : '▾'}</span>
                  {displayAgent(it.agent)}
                  {isFolded && <span className="text-[9px] font-normal text-dim">（已折叠）</span>}
                </button>
              )}
              {/* 条目4：子agent入口按钮——点击打开只读运行窗口 */}
              {it.run_ids && it.run_ids.length > 0 && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-subagent', { detail: { runIds: it.run_ids } }))}
                  className="mb-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                  title="查看子 Agent 运行详情（主发指令/过程/报告）"
                >
                  🛰 子agent{it.run_ids.length > 1 ? ` ×${it.run_ids.length}` : ''}
                </button>
              )}
              {!isFolded && (
              <div className="text-[11px] leading-relaxed text-dim">
                {streaming ? (
                  <div className="whitespace-pre-wrap break-words">{it.content}</div>
                ) : (
                  <div className="md-think-body" dangerouslySetInnerHTML={{ __html: renderMdCached(it.content) }} />
                )}
              </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
