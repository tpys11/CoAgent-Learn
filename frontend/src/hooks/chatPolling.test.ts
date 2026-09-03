/**
 * B4：断线取回轮询的收敛性守卫（假计时器，node 环境纯逻辑）。
 *
 * 断言定位（决策 24）：
 * - 全部为新行为断言：旧实现（setTimeout 递归、无上限、句柄不跟踪）在
 *   后端未落库时永久每 3 秒轮询、stop()/卸载均无法终止——达上限停止、
 *   成功即停、cancel 立即终止三条在旧代码结构下不可能成立。
 * - 变异验证记录见 step-B.md：移除上限 → 用例1 红；cancel 失效 → 用例3 红。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { startPollRecovery, type PollRecoveryOpts } from './useChatStream'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function mk(over: Partial<PollRecoveryOpts> = {}): PollRecoveryOpts {
  return {
    maxTimes: 3,
    firstDelayMs: 1000,
    intervalMs: 500,
    fetchOnce: vi.fn(async () => false),
    giveUp: vi.fn(),
    schedule: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    cancel: (id) => clearTimeout(id),
    ...over,
  }
}

describe('B4 断线轮询收敛', () => {
  it('首次延迟后开始轮询，达 maxTimes → giveUp 终态并停止（旧实现此处无限轮询）', async () => {
    const o = mk()
    const ctl = startPollRecovery(o)
    await vi.advanceTimersByTimeAsync(999)
    expect(o.fetchOnce).not.toHaveBeenCalled()          // 首延迟内不轮询
    await vi.advanceTimersByTimeAsync(1)
    expect(o.fetchOnce).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(o.fetchOnce).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(o.fetchOnce).toHaveBeenCalledTimes(3)
    expect(o.giveUp).toHaveBeenCalledTimes(1)
    expect(o.giveUp).toHaveBeenCalledWith(3)
    await vi.advanceTimersByTimeAsync(60000)            // 再等 1 分钟
    expect(o.fetchOnce).toHaveBeenCalledTimes(3)        // 不再轮询
    expect(o.giveUp).toHaveBeenCalledTimes(1)           // 终态只给一次
    ctl.cancel()
  })

  it('取回成功即停（不 giveUp、不再轮询）', async () => {
    const fetchOnce = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const o = mk({ fetchOnce })
    const ctl = startPollRecovery(o)
    await vi.advanceTimersByTimeAsync(1000 + 500 + 1)
    expect(fetchOnce).toHaveBeenCalledTimes(2)
    expect(o.giveUp).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetchOnce).toHaveBeenCalledTimes(2)
    ctl.cancel()
  })

  it('cancel() 立即终止（stop/卸载语义）；在途结果被丢弃', async () => {
    let resolve1: (v: boolean) => void = () => {}
    const o = mk({ fetchOnce: vi.fn(() => new Promise<boolean>(r => { resolve1 = r })) })
    const ctl = startPollRecovery(o)
    await vi.advanceTimersByTimeAsync(1000)
    expect(o.fetchOnce).toHaveBeenCalledTimes(1)
    ctl.cancel()                                        // stop()/卸载在此刻调用
    resolve1(false)                                     // 迟到的「未取回」——若 cancel 失效会继续排下一轮
    await vi.advanceTimersByTimeAsync(60000)
    expect(o.giveUp).not.toHaveBeenCalled()
    expect(o.fetchOnce).toHaveBeenCalledTimes(1)        // 无后续轮询
  })

  it('count 语义：fetchOnce 抛异常视为未取回，计入次数', async () => {
    const fetchOnce = vi.fn(async () => { throw new Error('network') })
    const o = mk({ fetchOnce })
    const ctl = startPollRecovery(o)
    await vi.advanceTimersByTimeAsync(1000 + 500 * 3 + 1)
    expect(o.fetchOnce).toHaveBeenCalledTimes(3)
    expect(o.giveUp).toHaveBeenCalledWith(3)
    ctl.cancel()
  })
})
