import { MessageSquare, GraduationCap, Library, Brain, BookOpen, Bot } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  onMemory: () => void
  onKnowledge: () => void
  onAgentSettings: () => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '对话' },
  { key: 'tutorial', icon: GraduationCap, label: '教程' },
  { key: 'resources', icon: Library, label: '资源' },
]

/** 最左侧细轨（无边框，融入底色）：切换三个主界面 + 功能入口 */
export default function ActivityBar({ view, onChange, onMemory, onKnowledge, onAgentSettings }: Props) {
  return (
    <nav className="w-[64px] h-full flex-shrink-0 flex flex-col items-center py-3">
      {ITEMS.map(({ key, icon: Icon, label }) => {
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
      <button
        onClick={onMemory}
        title="记忆系统"
        className="w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all"
      >
        <Brain size={20} strokeWidth={1.6} />
        <span className="text-[9px] leading-none">记忆</span>
      </button>
      <button
        onClick={onKnowledge}
        title="知识库"
        className="w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all"
      >
        <BookOpen size={20} strokeWidth={1.6} />
        <span className="text-[9px] leading-none">知识库</span>
      </button>
      <button
        onClick={onAgentSettings}
        title="Agent系统"
        className="w-14 mb-2 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all"
      >
        <Bot size={20} strokeWidth={1.6} />
        <span className="text-[9px] leading-none">Agent</span>
      </button>
      <div className="flex-1" />
    </nav>
  )
}
