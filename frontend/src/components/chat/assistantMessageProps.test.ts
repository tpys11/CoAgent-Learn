/**
 * B1：AssistantMessage memo 化的 props 引用稳定性守卫。
 *
 * 断言定位（决策 24）：
 * - test_memo_wraps_assistant_message / test_special_keys_weakmap_identity /
 *   test_props_reference_stable_across_calls / test_special_selected_uses_state_ref：
 *   新行为断言——CenterPanel 退回内联数组/内联箭头、或 AssistantMessage 摘掉 memo
 *   时，恰这些条红。
 * - test_prop_value_semantics：回归控制——isLast/msgIndex/specialDismissed 的
 *   值语义由 buildMessageProps 推导函数结构保证（同文件内实现与断言同源），
 *   定位是防将来有人改推导时静默改值。
 *
 * 设计说明：仓库无 jsdom/testing-library（node 环境纯逻辑测试），故把渲染路径
 * 逐消息 props 推导抽成 CenterPanel 导出的纯函数 buildMessageProps（渲染 map
 * 内同样走它 spread 到 AssistantMessage），对「同输入两次调用」逐 prop 做
 * Object.is 比较——这正是 memo 浅比较决定是否重渲染的同一判据。
 */
import { describe, expect, it } from 'vitest'
import { buildMessageProps, specialKeysOf } from '../CenterPanel'
import AssistantMessage from './AssistantMessage'
import type { Message } from '../../types'

const mkMsg = (over: Partial<Message> = {}): Message => ({
  role: 'assistant',
  content: '回答正文',
  think: [],
  special: [{ key: 'quiz', label: '生成测验' }, { key: 'wiki', label: '生成百科' }],
  ...over,
} as Message)

const noop = () => {}

const mkCtx = (over: Record<string, unknown> = {}) => ({
  isLoading: false,
  flowActiveAgent: null,
  flowStatus: '',
  flowAgents: ['学习助手·规划'],
  specialSel: {} as Record<number, string[]>,
  dismissedSpecial: new Set<number>(),
  followups: ['追问一', '追问二'],
  onToggleSpecial: noop,
  onDismissSpecial: noop,
  onSendFollowup: noop,
  onManualSetup: noop,
  currentProject: null,
  onGenerateSpecial: noop,
  ...over,
})

describe('B1 memo 结构守卫', () => {
  it('AssistantMessage 被 React.memo 包裹（摘掉 memo 此条红）', () => {
    const flags = (AssistantMessage as unknown as Record<string, unknown>)?.$$typeof
    expect(flags).toBe(Symbol.for('react.memo'))
  })
})

describe('B1 specialKeysOf 引用稳定', () => {
  it('同一 msg 返回同一数组引用；不同 msg 各自独立', () => {
    const msg = mkMsg()
    expect(Object.is(specialKeysOf(msg), specialKeysOf(msg))).toBe(true)
    const other = mkMsg()
    expect(Object.is(specialKeysOf(msg), specialKeysOf(other))).toBe(false)
    expect(specialKeysOf(msg)).toEqual(['quiz', 'wiki'])
  })

  it('msg.special 缺省 → 空数组引用同样稳定', () => {
    const msg = mkMsg({ special: undefined })
    expect(Object.is(specialKeysOf(msg), specialKeysOf(msg))).toBe(true)
    expect(specialKeysOf(msg)).toEqual([])
  })
})

describe('B1 buildMessageProps 逐 prop 引用稳定性（memo 浅比较判据）', () => {
  it('同输入两次调用：16 个 prop 逐个 Object.is 相等', () => {
    const msg = mkMsg()
    const ctx = mkCtx()
    const a = buildMessageProps(msg, 3, 10, ctx)
    const b = buildMessageProps(msg, 3, 10, ctx)
    const unstable: string[] = []
    for (const k of Object.keys(a) as Array<keyof typeof a>) {
      if (!Object.is(a[k], b[k])) unstable.push(String(k))
    }
    expect(unstable).toEqual([])
    expect(Object.keys(a).length).toBe(16)   // 15 原有 props + msgIndex
  })

  it('specialSelectedKeys 缺省时引用 = specialKeysOf(msg)（退回内联 map 此条红）', () => {
    const msg = mkMsg()
    const p = buildMessageProps(msg, 0, 3, mkCtx())
    expect(Object.is(p.specialSelectedKeys, specialKeysOf(msg))).toBe(true)
  })

  it('specialSelectedKeys 用户勾选时引用 = specialSel[idx] 存储数组（重建数组此条红）', () => {
    const msg = mkMsg()
    const picked = ['quiz']
    const p = buildMessageProps(msg, 2, 3, mkCtx({ specialSel: { 2: picked } }))
    expect(Object.is(p.specialSelectedKeys, picked)).toBe(true)
  })
})

describe('B1 推导值语义（回归控制：结构上由 buildMessageProps 保证）', () => {
  it('msgIndex 透传全量下标；isLast 只在末条为真；specialDismissed 按 idx 查 Set', () => {
    const ctx = mkCtx({ dismissedSpecial: new Set([1]) })
    const first = buildMessageProps(mkMsg(), 0, 2, ctx)
    const last = buildMessageProps(mkMsg(), 1, 2, ctx)
    expect(first.msgIndex).toBe(0)
    expect(first.isLast).toBe(false)
    expect(last.msgIndex).toBe(1)
    expect(last.isLast).toBe(true)
    expect(first.specialDismissed).toBe(false)
    expect(last.specialDismissed).toBe(true)
  })

  it('isLoading/flow/followups 仅末条透传真实值，非末条为常量（防 step 切换/追问加载打穿 memo）', () => {
    const follows = ['追问一']
    const ctx = mkCtx({
      isLoading: true,
      flowActiveAgent: '学习助手·生成',
      flowStatus: '生成中',
      flowAgents: ['学习助手·生成'],
      followups: follows,
    })
    const first = buildMessageProps(mkMsg(), 0, 2, ctx)
    const last = buildMessageProps(mkMsg(), 1, 2, ctx)
    expect(first.isLoading).toBe(false)
    expect(first.flowActiveAgent).toBeUndefined()
    expect(first.flowStatus).toBeUndefined()
    expect(first.flowAgents).toBeUndefined()
    expect(first.followups).toEqual([])
    expect(Object.is(first.followups, buildMessageProps(mkMsg(), 0, 2, ctx).followups)).toBe(true)
    expect(last.isLoading).toBe(true)
    expect(last.flowActiveAgent).toBe('学习助手·生成')
    expect(last.flowAgents).toEqual(['学习助手·生成'])
    expect(Object.is(last.followups, follows)).toBe(true)
  })
})
