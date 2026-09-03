/**
 * 行级 LCS diff（零依赖）：资源修订确认（单步4）——修改/regen 后对上一版与新版做行级对比。
 * 任一侧超 maxLines 返回 null（熔断），调用方降级为"全文已更新"提示，避免病态 O(n·m) 开销。
 */
export interface LineDiff {
  added: string[]
  removed: string[]
  unchanged: number
}

export function lineDiff(prev: string, next: string, maxLines = 800): LineDiff | null {
  const a = (prev || '').split('\n')
  const b = (next || '').split('\n')
  if (a.length > maxLines || b.length > maxLines) return null
  const m = a.length
  const n = b.length
  // LCS 动态规划：dp[i][j] = a 前 i 行与 b 前 j 行的最长公共子序列长度
  const dp: Uint32Array[] = []
  for (let i = 0; i <= m; i++) dp.push(new Uint32Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const added: string[] = []
  const removed: string[] = []
  let unchanged = 0
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      unchanged++
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      removed.push(a[i - 1])
      i--
    } else {
      added.push(b[j - 1])
      j--
    }
  }
  while (i > 0) {
    removed.push(a[i - 1])
    i--
  }
  while (j > 0) {
    added.push(b[j - 1])
    j--
  }
  return { added: added.reverse(), removed: removed.reverse(), unchanged }
}
