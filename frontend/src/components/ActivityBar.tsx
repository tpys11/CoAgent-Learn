import { MessageSquare, GraduationCap, Library } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '主对话' },
  { key: 'tutorial', icon: GraduationCap, label: '教程与设计思想' },
  { key: 'resources', icon: Library, label: '资源' },
]

/** 最左侧细轨（无边框，融入底色）：切换三个主界面 */
export default function ActivityBar({ view, onChange }: Props) {
  return (
    <nav className="w-[52px] h-full flex-shrink-0 flex flex-col items-center py-3">
      {ITEMS.map(({ key, icon: Icon, label }) => {
        const active = view === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`w-10 h-10 mb-2 flex items-center justify-center rounded-2xl transition-all ${
              active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
            }`}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.6} />
          </button>
        )
      })}
      <div className="flex-1" />
    </nav>
  )
}
