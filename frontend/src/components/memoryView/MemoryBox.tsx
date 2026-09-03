import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { appendPoint, appendSection, memoryToSections, sectionsToMemory, type MemorySection } from './memorySections'

interface Props {
  /** 原始课程记忆 dict（后端契约形态）；保存时以它为 base 合并覆盖，复杂键（进度/对话概要）不丢 */
  memory: Record<string, unknown>
  /** 编辑回调：入参为「合并覆盖后的完整记忆 payload」，父级负责持久化（api.saveProjectMemory） */
  onSave: (nextMemory: Record<string, unknown>) => void
}

/**
 * F12-S2 记忆单框（S3 起三处共用）：## 标题 + 要点列表 + 每节行尾「添加要点」输入 +
 * 末尾「新建标题」输入（owner 手动补充位）。
 * 手动改/删既有要点仍走右侧「修改记忆」对话（手动改易冲突，AI 整体处理）——单框只做增补。
 */
export default function MemoryBox({ memory, onSave }: Props) {
  const [sections, setSections] = useState<MemorySection[]>(() => memoryToSections(memory))
  // 本地新添加、尚无要点的标题（空 section 保存即被省略——无数据即无持久化，刷新消失属预期）
  const [pending, setPending] = useState<string[]>([])
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({})
  const [newTitle, setNewTitle] = useState('')
  const dirtyRef = useRef(false)

  // memory 引用变化 = 外部真相更新（初次加载 / AI 记忆对话后 refreshTick 重载）；自身编辑不回声
  useEffect(() => {
    if (dirtyRef.current) return
    setSections(memoryToSections(memory))
    setPending([])
  }, [memory])

  const commit = (next: MemorySection[], nextPending: string[]) => {
    dirtyRef.current = true
    setSections(next)
    setPending(nextPending)
    onSave(sectionsToMemory(next, memory))
  }

  const addPoint = (title: string) => {
    const text = (pointDrafts[title] || '').trim()
    if (!text) return
    setPointDrafts(prev => ({ ...prev, [title]: '' }))
    const next = appendPoint(sections, title, text)
    commit(next, pending.filter(t => t !== title))  // 首条要点落库，占位标题转正
  }

  const addSection = () => {
    const t = newTitle.trim()
    if (!t) return
    setNewTitle('')
    const exists = sections.some(s => s.title === t)
    if (exists || pending.includes(t)) return  // 重复标题静默忽略（appendSection 语义）
    setPending(prev => [...prev, t])
  }

  const inputCls = 'flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-faint)]'

  // 裸内容列：外框/内边距归父级卡片（记忆界面简历框、弹窗、左栏各有自己的容器形态）
  return (
    <div className="flex flex-col gap-6">
        {sections.map(s => (
          <section key={s.title}>
            {/* ## 标题 */}
            <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
              <span className="opacity-60">##</span> {s.title}
            </h3>
            {/* 要点列表 */}
            {s.points.length > 0 ? (
              <ul className="flex flex-col gap-1.5 mb-2">
                {s.points.map((p, i) => (
                  <li key={i} className="text-[13px] leading-6 text-[var(--text)] flex gap-2">
                    <span className="text-dim flex-shrink-0 select-none">·</span>
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-dim mb-2">（暂无内容，在下方补充）</p>
            )}
            {/* 空要点行尾输入框 */}
            <div className="flex items-center gap-1.5 border border-dashed hairline rounded-lg px-3 py-1.5 bg-[var(--bg-input)]">
              <Plus size={11} className="text-dim flex-shrink-0" />
              <input value={pointDrafts[s.title] || ''} onChange={e => setPointDrafts(prev => ({ ...prev, [s.title]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addPoint(s.title) }}
                onBlur={() => addPoint(s.title)}
                placeholder={`补充「${s.title}」要点，回车添加`} className={inputCls} />
            </div>
          </section>
        ))}
        {/* owner 手动补充的新标题（占位，首条要点写入后持久化） */}
        {pending.map(t => (
          <section key={t}>
            <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
              <span className="opacity-60">##</span> {t}
            </h3>
            <div className="flex items-center gap-1.5 border border-dashed hairline rounded-lg px-3 py-1.5 bg-[var(--bg-input)]">
              <Plus size={11} className="text-dim flex-shrink-0" />
              <input value={pointDrafts[t] || ''} onChange={e => setPointDrafts(prev => ({ ...prev, [t]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addPoint(t) }}
                onBlur={() => addPoint(t)}
                placeholder={`补充「${t}」要点，回车添加`} className={inputCls} />
            </div>
          </section>
        ))}
        {/* 末尾空 ## 标题输入框：新建记忆维度（owner 手动补充位） */}
        <div className="flex items-center gap-1.5 border border-dashed hairline rounded-lg px-3 py-2 bg-[var(--bg-input)]">
          <span className="text-dim text-[11px] font-bold flex-shrink-0 select-none opacity-60">##</span>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSection() }}
            onBlur={addSection}
                placeholder="新建记忆标题（如「面试准备」），回车创建" className={inputCls} />
        </div>
      </div>
  )
}
