import { MessageSquare, GraduationCap, Library, Settings } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  onSettings: () => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '主对话' },
  { key: 'tutorial', icon: GraduationCap, label: '教程与设计思想' },
  { key: 'resources', icon: Library, label: '资源' },
]

/** 最左侧窄图标栏（VSCode Activity Bar 风格）：切换三个主界面 */
export default function ActivityBar({ view, onChange, onSettings }: Props) {
  return (
    <nav className="w-12 h-full flex-shrink-0 flex flex-col items-center py-2 bg-[#f5f5f5] border-r border-[#e5e5e5] rounded-lg overflow-hidden">
      {ITEMS.map(({ key, icon: Icon, label }) => {
        const active = view === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={`relative w-10 h-10 mb-1 flex items-center justify-center rounded-lg transition-colors ${
              active ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'text-gray-400 hover:bg-[#ededed] hover:text-[#1a1a1a]'
            }`}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded bg-[#1a1a1a]" />}
            <Icon size={20} />
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        onClick={onSettings}
        title="设置"
        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-[#ededed] hover:text-[#1a1a1a] transition-colors"
      >
        <Settings size={20} />
      </button>
    </nav>
  )
}
