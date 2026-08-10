import { MessageSquare, GraduationCap, Library, Brain, BookOpen, Bot, FolderOpen } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources' | 'memory' | 'knowledge' | 'agents' | 'obsidian'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  expanded?: boolean
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '对话' },
  { key: 'tutorial', icon: GraduationCap, label: '教程' },
  { key: 'resources', icon: Library, label: '资源' },
  { key: 'memory', icon: Brain, label: '记忆' },
  { key: 'knowledge', icon: BookOpen, label: '知识库' },
  { key: 'agents', icon: Bot, label: 'Agent' },
  { key: 'obsidian', icon: FolderOpen, label: '本地文档' },
]

/** 最左侧细轨（无边框，融入底色）：主页时展开加宽（图标在文字前横排），离开主页变窄（图标在上、文字在下） */
export default function ActivityBar({ view, onChange, expanded }: Props) {
  const renderBtn = (key: ViewKey, icon: any, label: string, active: boolean) => (
    expanded ? (
      <button
        key={key}
        onClick={() => onChange(key)}
        title={label}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
          active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
        }`}
      >
        <icon.type {...{ size: 17, strokeWidth: active ? 2 : 1.6 }} />
        <span className="text-[11px] font-medium leading-none">{label}</span>
      </button>
    ) : (
      <button
        key={key}
        onClick={() => onChange(key)}
        title={label}
        className={`w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all ${
          active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
        }`}
      >
        <icon.type {...{ size: 20, strokeWidth: active ? 2 : 1.6 }} />
        <span className="text-[9px] leading-none">{label}</span>
      </button>
    )
  )
  return (
    <nav className={`h-full flex-shrink-0 flex flex-col transition-all duration-300 ${expanded ? 'w-44 px-2.5 py-4 items-stretch' : 'w-[64px] py-3 items-center'}`}>
      {ITEMS.slice(0, 3).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
      <div className={`bg-[#e5e5e5] my-1 ${expanded ? 'w-full h-px' : 'w-px h-3'}`} />
      {ITEMS.slice(3).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
      <div className="flex-1" />
    </nav>
  )
}
