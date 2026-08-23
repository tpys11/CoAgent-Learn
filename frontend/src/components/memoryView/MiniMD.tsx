const renderInline = (s: string) => {
  const parts = s.split(/\*\*([^*]+)\*\*/g)
  return parts.map((p, i) => i % 2 === 1 ? <b key={i}>{p}</b> : p)
}

/** 轻量 Markdown 渲染（仅支持标题加粗、有序/无序列表、段落），用于记忆字段展示。 */
export function MiniMD({ text }: { text: string }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let listBuf: { ordered: boolean; items: string[] } | null = null
  const flush = (key: string) => {
    if (listBuf) {
      nodes.push(listBuf.ordered
        ? <ol key={key} className="list-decimal pl-4 flex flex-col gap-0.5">{listBuf.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
        : <ul key={key} className="list-disc pl-4 flex flex-col gap-0.5">{listBuf.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>)
      listBuf = null
    }
  }
  lines.forEach((ln, i) => {
    const ul = ln.match(/^[-*]\s+(.+)/)
    const ol = ln.match(/^\d+[.、]\s*(.+)/)
    if (ul || ol) {
      if (!listBuf || listBuf.ordered !== !!ol) { flush('l' + i); listBuf = { ordered: !!ol, items: [] } }
      listBuf.items.push((ul || ol)![1])
    } else if (ln.trim()) {
      flush('l' + i)
      nodes.push(<p key={'p' + i} className="leading-relaxed">{renderInline(ln)}</p>)
    } else flush('l' + i)
  })
  flush('end')
  return <div className="flex flex-col gap-1.5">{nodes}</div>
}
