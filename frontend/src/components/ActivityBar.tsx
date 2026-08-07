import { MessageSquare, GraduationCap, Library, Brain, Bot, Settings } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources' | 'memory' | 'knowledge' | 'agents'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  onSettings: () => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '对话' },
  { key: 'resources', icon: Library, label: '资源' },
  { key: 'memory', icon: Brain, label: '记忆' },
  { key: 'agents', icon: Bot, label: 'Agent' },
]
const GUIDE = { key: 'tutorial' as ViewKey, icon: GraduationCap, label: '使用引导' }

/** 最左侧细轨（无边框，融入底色）：主界面/功能入口切换，使用引导与设置位于最下方 */
export default function ActivityBar({ view, onChange, onSettings }: Props) {
  const renderBtn = (key: ViewKey, Icon: any, label: string) => {
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
  }
  return (
    <nav className="w-[64px] h-full flex-shrink-0 flex flex-col items-center py-3">
      {ITEMS.slice(0, 2).map(({ key, icon: Icon, label }) => renderBtn(key, Icon, label))}
      <div className="w-px h-3 bg-[#e5e5e5] my-1" />
      {ITEMS.slice(2).map(({ key, icon: Icon, label }) => renderBtn(key, Icon, label))}
      <div className="flex-1" />
      {/* 使用引导（教程）→ 设置上方 */}
      {renderBtn(GUIDE.key, GUIDE.icon, GUIDE.label)}
      {/* 最下方：设置 */}
      <button
        onClick={onSettings}
        title="设置"
        className="w-14 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all"
      >
        <Settings size={20} strokeWidth={1.6} />
        <span className="text-[9px] leading-none">设置</span>
      </button>
    </nav>
  )
}
