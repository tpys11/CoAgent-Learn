import { useState, useEffect, useRef, useMemo } from 'react'
import { CheckCircle2, Image as ImageIcon, PenLine, Lightbulb } from 'lucide-react'
import type { Message, Project } from '../../types'
import MarkdownIt from 'markdown-it'
import { LS, lsGetJSON } from '../../storage'

// ---------- 思维链渲染：markdown-it 轻量渲染（html:false 防 XSS，换行生效）----------
const mdThink = new MarkdownIt({ html: false, linkify: true, breaks: true })
const renderMd = (text: string) => mdThink.render(text || '')

// markdown 渲染结果缓存：历史消息 content 不变，命中即跳过 markdown-it 全量解析
const _mdCache = new Map<string, string>()
const renderMdCached = (text: string) => {
  const key = text || ''
  let h = _mdCache.get(key)
  if (h === undefined) {
    h = renderMd(key)
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
  msg, isLoading, isLast, flowActiveAgent, flowStatus,
  specialSelectedKeys, onToggleSpecial, specialDismissed, onDismissSpecial,
  followups, onSendFollowup, onManualSetup, currentProject, onGenerateSpecial,
}: AssistantMessageProps) {
  const streaming = isLoading && isLast
  return (
    <>
      {/* 思考过程区块（DeepSeek 式：流式展开逐字 / 完成自动折叠为一行） */}
      {msg.think && msg.think.length > 0 && (
        <div className="mb-3">
          <ReasoningBlock items={msg.think} streaming={streaming} activeAgent={flowActiveAgent} activeStatus={flowStatus} />
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

/** 思考过程区块（DeepSeek 式独立区块）。 */
function ReasoningBlock({ items, streaming, activeAgent, activeStatus }: { items: Array<{ agent: string; content: string }> | string[]; streaming?: boolean; activeAgent?: string | null; activeStatus?: string }) {
  const merged = useMemo(() => {
    const list = (items || []).map(it => typeof it === 'string' ? { agent: '', content: it } : it)
      .filter(it => it.agent !== '运行统计')
    return list.reduce<Array<{ agent: string; content: string }>>((acc, it) => {
      const dn = displayAgent(it.agent)
      const last = acc[acc.length - 1]
      if (last && dn && displayAgent(last.agent) === dn) {
        if (it.content) last.content = (last.content ? last.content + '\n' : '') + it.content
        return acc
      }
      acc.push({ agent: it.agent, content: it.content })
      return acc
    }, [])
  }, [items])
  const [open, setOpen] = useState(true)
  const prevStreaming = useRef(streaming)
  useEffect(() => {
    if (streaming) { setOpen(true); return }
    if (prevStreaming.current && !streaming) setOpen(false)
    prevStreaming.current = streaming
  }, [streaming])
  if (merged.length === 0) return null
  const toggle = () => { if (!streaming) setOpen(o => !o) }
  return (
    <div className="reasoning-block">
      <button onClick={toggle} className="flex items-center gap-1 reasoning-title hover:opacity-80 transition-opacity text-left w-full">
        <span className="text-[9px] flex-shrink-0">{open ? '▾' : '▸'}</span>
        <span>思考过程</span>
        {streaming
          ? <span className="ml-1 font-normal text-[10px]">{activeStatus || '思考中…'}</span>
          : <span className="ml-1 font-normal text-[10px] text-dim">已完成</span>}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-2">
          {merged.map((it, i) => (
            <div key={i} className="animate-[fadeIn_0.15s_ease]">
              {it.agent && merged.length > 1 && (
                <div className="text-[11px] font-semibold mb-0.5 text-[var(--text)]">{displayAgent(it.agent)}</div>
              )}
              <div className="text-[11px] leading-relaxed text-dim">
                {streaming ? (
                  <div className="whitespace-pre-wrap break-words">{it.content}</div>
                ) : (
                  <div className="md-think-body" dangerouslySetInnerHTML={{ __html: renderMdCached(it.content) }} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
