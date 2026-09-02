/**
 * RC2-S3：检索命中内容块卡片——观察窗展开区与思维链「知识库管理」节点共用同一组件
 * （两个渲染面数据入口不同：观察窗走 hits 事件结构化载荷，思维链走双写 markdown 解析
 * 适配——两份薄适配而非硬耦合）。每块=title+source 头 + 内容，默认收起 2 行、
 * 点击展开全文（owner「点击进去能看到具体内容」）；240 字×5 块量小，折叠无性能坑。
 * 展示解析逻辑全部抽为导出纯函数（hitBlocks.test.ts 直调）。
 */
import { useState } from 'react'
import type { HitBlock } from '../../../stores/subagentStore'
import type { RunRowEvent } from './RunRow'

/** 观察窗 events → 命中块（首个含载荷的 hits 事件为准；纯函数供测试直调） */
export const hitBlocksFromEvents = (events: RunRowEvent[]): HitBlock[] => {
  const hitEvent = (events || []).find(e => e.event === 'hits' && Array.isArray(e.hits))
  return hitEvent?.hits || []
}

/** 后端 _format_hit_blocks_md 的区段标记（双写纪律：done 权威替换后仍在此文本里） */
export const HIT_SECTION_MARK = '**命中内容块**：'

/** 思维链面薄适配：双写 markdown → 结构化命中块 + 其余正文。
 * 纯函数；无标记的内容原样返回（hits=[]，调用方走既有渲染零行为变化）。 */
export const splitHitSection = (content: string): { head: string; hits: HitBlock[] } => {
  const hits: HitBlock[] = []
  const headLines: string[] = []
  let inSection = false
  for (const ln of (content || '').split('\n')) {
    if (ln.trim() === HIT_SECTION_MARK) {
      inSection = true
      continue
    }
    // 区段行形态（后端 _format_hit_blocks_md 产出，content 已折叠单行）：
    // `1. **标题**（来源）：内容前 240 字`
    const m = inSection ? ln.match(/^\d+\.\s+\*\*(.+?)\*\*（(.+?)）：([\s\S]*)$/) : null
    if (m) {
      hits.push({ title: m[1], source: m[2], content: m[3] })
      continue
    }
    inSection = false
    headLines.push(ln)
  }
  return { head: headLines.join('\n').trim(), hits }
}

export function HitBlocks({ hits }: { hits?: HitBlock[] | null }) {
  const list = hits || []
  if (list.length === 0) return null
  return (
    <div className="flex flex-col gap-1 my-1">
      <div className="text-[10px] text-dim">📄 命中内容块 ×{list.length}（点击展开）</div>
      {list.map((h, i) => <HitCard key={i} hit={h} />)}
    </div>
  )
}

function HitCard({ hit }: { hit: HitBlock }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={() => setOpen(o => !o)} data-testid="hit-card"
      className="w-full text-left border hairline rounded-lg px-2 py-1.5 hover:bg-[var(--bg-panel)] transition-colors">
      <div className="text-[10px] leading-5 font-semibold text-[var(--text)]">
        {hit.title || hit.source || '未命名块'}
        <span className="font-normal text-dim">（{hit.source}）</span>
        <span className="float-right text-[9px] text-dim">{open ? '▾' : '▸'}</span>
      </div>
      <div className="text-[10px] leading-5 text-dim whitespace-pre-wrap break-words"
        style={open ? undefined
          : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {hit.content}
      </div>
    </button>
  )
}
