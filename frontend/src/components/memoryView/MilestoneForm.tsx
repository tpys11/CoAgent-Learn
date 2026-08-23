import { useState } from 'react'

/** 新增里程碑节点表单 */
export function NewMilestoneForm({ onCancel, onAdd }: { onCancel: () => void; onAdd: (label: string, detail: string, pos: number) => void }) {
  const [label, setLabel] = useState('')
  const [detail, setDetail] = useState('')
  const [pos, setPos] = useState(50)
  return (
    <>
      <p className="text-sm font-bold">新增节点</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="节点名称"
        className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none bg-[var(--bg-input)]" autoFocus />
      <textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="节点内容（点击节点时查看）" rows={3}
        className="w-full px-3 py-2 border hairline rounded-xl text-xs outline-none resize-none bg-[var(--bg-input)]" />
      <div className="flex items-center gap-2 text-[11px] text-dim">
        <span className="flex-shrink-0">位置</span>
        <input type="range" min="0" max="100" value={pos} onChange={e => setPos(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
        <span className="w-8 text-right font-semibold">{pos}%</span>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border hairline text-[11px] text-dim hover:bg-[var(--bg-hover)]">取消</button>
        <button onClick={() => label.trim() && onAdd(label.trim(), detail.trim(), pos)}
          className="flex-1 py-2 rounded-xl bg-[#1a1a1a] text-white text-[11px] font-medium">添加</button>
      </div>
    </>
  )
}
