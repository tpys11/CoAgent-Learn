// RB-S3：链面板草稿节点渲染守卫——重写段识别/分隔标注/生成族 markdown 管线接线。
// 断言定位（决策 24）：
// - rewriteAttemptOf/rewriteDividerLabel/isDraftBodyNode 为渲染层纯函数，改坏 → 恰这组红；
// - 结构守卫（?raw 原文导入，chainReview 同模式）钉住三条接线在位：重写段分隔标注、
//   生成族节点流式 markdown（StreamingMd）、草稿内滚容器 autoscroll 钉底。
// live 链与落库链同走 ReasoningBlock（msg.think 单一口径），无第二渲染面可漂移。
import { describe, expect, it } from 'vitest'
import {
  rewriteAttemptOf,
  rewriteDividerLabel,
  isDraftBodyNode,
} from '../../components/chat/AssistantMessage'
import assistantMessageSrc from '../../components/chat/AssistantMessage.tsx?raw'

describe('RB-S3：rewriteAttemptOf（重写段识别）', () => {
  it('学习助手·生成（重写 #N）→ N；普通生成/审核/规划 → null', () => {
    expect(rewriteAttemptOf('学习助手·生成（重写 #0）')).toBe(0)
    expect(rewriteAttemptOf('学习助手·生成（重写 #12）')).toBe(12)
    expect(rewriteAttemptOf('学习助手·生成')).toBeNull()
    expect(rewriteAttemptOf('审核')).toBeNull()
    expect(rewriteAttemptOf('学习助手·规划')).toBeNull()
    expect(rewriteAttemptOf('')).toBeNull()
  })
})

describe('RB-S3：rewriteDividerLabel（分隔标注，与后端第 N 稿同口径）', () => {
  it('重写 #N → 「审核未通过 · 第 N+1 稿」（_format_review_conclusion attempt+1 同款）', () => {
    expect(rewriteDividerLabel(0)).toBe('审核未通过 · 第 1 稿')
    expect(rewriteDividerLabel(2)).toBe('审核未通过 · 第 3 稿')
  })
})

describe('RB-S3：isDraftBodyNode（生成族=markdown 渲染面）', () => {
  it('生成条目与重写段为 true；规划/审核/检索等维持 false', () => {
    expect(isDraftBodyNode('学习助手·生成')).toBe(true)
    expect(isDraftBodyNode('学习助手·生成（重写 #1）')).toBe(true)
    expect(isDraftBodyNode('学习助手·规划')).toBe(false)
    expect(isDraftBodyNode('审核')).toBe(false)
    expect(isDraftBodyNode('知识库管理')).toBe(false)
  })
})

describe('RB-S3：结构守卫——渲染接线在位（?raw 原文）', () => {
  it('重写段渲染：分隔标注 + 顶部分隔线接进条目标题（分隔标注存在）', () => {
    expect(assistantMessageSrc).toContain('rewriteDividerLabel(rwa)')
    expect(assistantMessageSrc).toContain('rewriteAttemptOf(it.agent)')
    expect(assistantMessageSrc).toContain('border-t hairline')
  })

  it('生成族节点流式 markdown：StreamingMd 渐进管线按 isDraftBodyNode 启用（重写段渲染）', () => {
    expect(assistantMessageSrc).toContain('isDraftBodyNode(it.agent) ? (')
    expect(assistantMessageSrc).toContain('<StreamingMd text={it.content} streaming />')
  })

  it('草稿内滚容器 autoscroll：draftBodyRef 钉底接线在位（滚动跟随链容器）', () => {
    expect(assistantMessageSrc).toContain('draftBodyRef')
    expect(assistantMessageSrc).toContain('el.scrollTop = el.scrollHeight')
  })
})
