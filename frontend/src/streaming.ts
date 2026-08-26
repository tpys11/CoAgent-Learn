/**
 * 流式渲染纯函数库（闭环B·护栏）：从 useChatStream 抽出的两块最易回归机制，
 * 脱离 React 可直接单测——改流式行为前先看这里的测试。
 */

/** 思维链代码围栏状态：buf=跨chunk累积的反引号，inside=是否处于 ``` 围栏内 */
export interface FenceState {
  buf: string
  inside: boolean
}

export function newFenceState(): FenceState {
  return { buf: '', inside: false }
}

/**
 * 思维链 chunk 逐字扫描（围栏语义）：
 * - 反引号累积到 3 个即翻转围栏开关（跨 chunk 拆分也能正确开合）
 * - 围栏内的可见字符不外发（思维链中代码块不展示）
 * - 未成围栏的散落反引号被丢弃、且被可见字符打断后不累积（历史遗留语义，保持一致）
 *
 * 返回是否有可见字符外发；外发内容经 append(agent, text) 一次性回调。
 */
export function feedThoughtChunk(
  state: FenceState,
  chunk: string,
  agent: string,
  append: (agent: string, text: string) => void,
): boolean {
  let out = ''
  for (const ch of chunk || '') {
    if (ch === '`') {
      state.buf += '`'
      if (state.buf.length >= 3) {
        state.inside = !state.inside
        state.buf = ''
      }
      continue
    }
    state.buf = ''
    if (state.inside) continue
    out += ch
  }
  if (out) append(agent, out)
  return out.length > 0
}

/** 自适应排水窗：每帧放行量 = min(积压, max(下限, ceil(积压/6)))——≈6帧追平积压 */
export function drainTake(backlog: number, floor: number): number {
  return Math.min(backlog, Math.max(floor, Math.ceil(backlog / 6)))
}
