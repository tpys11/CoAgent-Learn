/**
 * F10-S1 上传完成事件桥（kbScopeBus）纯逻辑测试。
 *
 * 为什么要有 bus：上传完成态目前锁死在 UploadPanel 组件内——配置弹窗一关（组件卸载）
 * 完成事件全丢，留存面板永不再现，「先传文档→再走向导」全链断头。
 * bus = 模块级单例 store：完成事件（ingestDone）与待选择目标（pending）双通道，
 * 活过任意组件卸载，App 订阅裁决呈现面（内联面板 / 向导步）。
 *
 * 钉住的契约（F10 复述门总领补充要求）：
 * 1. 同一 (projectId, source) 二次完成 → pending 不重复（不重复弹面板）；
 * 2. 向导侧消费后 pending 撤销 + 订阅者获通知（App 与 UploadPanel 内联互斥的单一事实源基础）。
 */
import { describe, expect, it, vi } from 'vitest'
import {
  addPendingScopeTargets,
  consumeScopeTarget,
  dedupeTargets,
  getPendingScopeTargets,
  reportIngestDone,
  resolveScopeSurface,
  subscribeIngestDone,
  subscribePending,
  type ScopeTarget,
} from './kbScopeBus'

const T1 = [{ name: '第1章', children: [] }]
const T2 = [{ name: '第1章（重提版）', children: [] }]

const t = (projectId: string, source: string, tree = T1): ScopeTarget => ({ projectId, source, tree })

/** 每个用例前清空单例（模块级状态不得跨用例泄漏） */
function resetBus() {
  for (const p of [...getPendingScopeTargets()]) consumeScopeTarget(p.projectId, p.source)
}

describe('dedupeTargets（纯函数）', () => {
  it('同一 (projectId, source) 二次完成不重复——只保留一条（总领契约①）', () => {
    const merged = dedupeTargets([t('pA', '教材.pdf')], [t('pA', '教材.pdf')])
    expect(merged).toHaveLength(1)
  })
  it('二次完成覆盖为最新树（重传场景 pending 不残留旧内容）', () => {
    const merged = dedupeTargets([t('pA', '教材.pdf', T1)], [t('pA', '教材.pdf', T2)])
    expect(merged).toHaveLength(1)
    expect(merged[0].tree).toBe(T2)
  })
  it('跨项目同 source 不去重——项目域隔离（跨项目防护精神）', () => {
    const merged = dedupeTargets([t('pA', '同名校.pdf')], [t('pB', '同名校.pdf')])
    expect(merged.map(x => x.projectId)).toEqual(['pA', 'pB'])
  })
  it('新增追加尾部、既有保序', () => {
    const merged = dedupeTargets([t('pA', 'a.pdf'), t('pA', 'b.pdf')], [t('pA', 'c.pdf')])
    expect(merged.map(x => x.source)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
  })
})

describe('pending 通道（订阅/去重/消费）', () => {
  it('addPendingScopeTargets 入列并通知订阅者', () => {
    resetBus()
    const spy = vi.fn()
    subscribePending(spy)
    addPendingScopeTargets([t('pA', 'a.pdf')])
    expect(getPendingScopeTargets()).toEqual([t('pA', 'a.pdf')])
    expect(spy).toHaveBeenCalledTimes(1)
  })
  it('同一 source 二次完成：pending 不重复弹，树覆盖为最新且通知（内容刷新）', () => {
    resetBus()
    const spy = vi.fn()
    subscribePending(spy)
    addPendingScopeTargets([t('pA', 'a.pdf', T1)])
    addPendingScopeTargets([t('pA', 'a.pdf', T2)])
    const pending = getPendingScopeTargets()
    expect(pending).toHaveLength(1)
    expect(pending[0].tree).toBe(T2)
    expect(spy).toHaveBeenCalledTimes(2)
  })
  it('consumeScopeTarget 撤销目标并通知——向导侧消费后内联面板据此消失（总领契约②）', () => {
    resetBus()
    const spy = vi.fn()
    subscribePending(spy)
    addPendingScopeTargets([t('pA', 'a.pdf')])
    consumeScopeTarget('pA', 'a.pdf')
    expect(getPendingScopeTargets()).toHaveLength(0)
    expect(spy).toHaveBeenCalledTimes(2) // 入列 + 消费各一次
  })
  it('consumeScopeTarget 不存在的目标无副作用不通知', () => {
    resetBus()
    const spy = vi.fn()
    subscribePending(spy)
    consumeScopeTarget('pX', '不存在.pdf')
    expect(spy).not.toHaveBeenCalled()
  })
  it('消费后同一 source 重新完成可再次入列（重传再选择场景）', () => {
    resetBus()
    addPendingScopeTargets([t('pA', 'a.pdf')])
    consumeScopeTarget('pA', 'a.pdf')
    addPendingScopeTargets([t('pA', 'a.pdf', T2)])
    expect(getPendingScopeTargets()).toHaveLength(1)
  })
  it('退订后不再收到通知', () => {
    resetBus()
    const spy = vi.fn()
    const unsub = subscribePending(spy)
    unsub()
    addPendingScopeTargets([t('pA', 'a.pdf')])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('ingestDone 通道（完成事件广播）', () => {
  it('reportIngestDone 广播给全部订阅者（发起点不关心谁在听）', () => {
    const s1 = vi.fn()
    const s2 = vi.fn()
    const u1 = subscribeIngestDone(s1)
    subscribeIngestDone(s2)
    reportIngestDone('pA', ['a.pdf', 'b.pdf'])
    expect(s1).toHaveBeenCalledWith('pA', ['a.pdf', 'b.pdf'])
    expect(s2).toHaveBeenCalledTimes(1)
    u1()
    reportIngestDone('pB', ['c.pdf'])
    expect(s1).toHaveBeenCalledTimes(1) // 退订后不再收
    expect(s2).toHaveBeenCalledTimes(2)
  })
})

describe('resolveScopeSurface（呈现裁决纯函数）', () => {
  it('向导开着 → wizard（S1 挂起、S2 向导步渲染）', () => {
    expect(resolveScopeSurface(true)).toBe('wizard')
  })
  it('向导没开 → inline（F9 内联面板现状保持）', () => {
    expect(resolveScopeSurface(false)).toBe('inline')
  })
})
