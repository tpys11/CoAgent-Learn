import { MessageSquare, GraduationCap, Library, Brain, BookOpen, Bot } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources' | 'memory' | 'knowledge' | 'agents'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '对话' },
  { key: 'tutorial', icon: GraduationCap, label: '教程' },
  { key: 'resources', icon: Library, label: '资源' },
  { key: 'memory', icon: Brain, label: '记忆' },
  { key: 'knowledge', icon: BookOpen, label: '知识库' },
  { key: 'agents', icon: Bot, label: 'Agent' },
]

/** 最左侧细轨（无边框，融入底色）：六个完整界面切换，功能界面同样带高亮态 */
export default function ActivityBar({ view, onChange }: Props) {
  return (
    <nav className="w-[64px] h-full flex-shrink-0 flex flex-col items-center py-3">
      {ITEMS.slice(0, 3).map(({ key, icon: Icon, label }) => {
        const active = view === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all ${
              active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.6} />
            <span className="text-[9px] leading-none">{label}</span>
          </button>
        )
      })}
      <div className="w-px h-3 bg-[#e5e5e5] my-1" />
      {ITEMS.slice(3).map(({ key, icon: Icon, label }) => {
        const active = view === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all ${
              active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.6} />
            <span className="text-[9px] leading-none">{label}</span>
          </button>
        )
      })}
      <div className="flex-1" />
    </nav>
  )
}
