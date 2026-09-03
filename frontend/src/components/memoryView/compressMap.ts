/**
 * F12-S4：compress.py 五段式滚动摘要（目标/关键事实与上下文/决定与偏好/进展/待办事项）
 * → 单框「标题→要点[]」的只读映射。纯展示素材：不回写记忆、不触碰压缩预算机制。
 */
import type { MemorySection } from './memorySections'

/** compress.py prompt 声明的五个小节名（顺序即产出顺序） */
const SECTION_NAMES = ['目标', '关键事实与上下文', '决定与偏好', '进展', '待办事项']

const HEADER_RE = new RegExp(
  '^[-*•]?\\s*(?:\\*\\*)?(' + SECTION_NAMES.join('|') + ')(?:\\*\\*)?\\s*[:：]\\s*(.*)$',
)

/** 五段式摘要文本 → sections。小节行开新段，续行并入；节外裸行归「附记」；空摘要 → []（空态优雅）。 */
export function summaryToSections(summary: string): MemorySection[] {
  const lines = String(summary || '').split(/\r?\n/)
  const out: MemorySection[] = []
  const cur = (title: string) => {
    let s = out.find(x => x.title === title)
    if (!s) { s = { title, points: [] }; out.push(s) }
    return s
  }
  let open: MemorySection | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(HEADER_RE)
    if (m) {
      open = cur(m[1])
      const rest = (m[2] || '').trim()
      if (rest) open.points.push(rest)
      continue
    }
    // 去掉列表符号/序号后作为一条要点（无已开小节 → 附记）
    const point = line.replace(/^[-*•]\s+/, '').replace(/^\d+[.、)]\s*/, '').trim()
    ;(open || cur('附记')).points.push(point)
  }
  return out.filter(s => s.points.length > 0)
}
