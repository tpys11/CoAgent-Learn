import { MessageSquare, Library, Brain, Bot, FolderOpen, Settings, HelpCircle } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources' | 'memory' | 'knowledge' | 'agents' | 'obsidian'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  expanded?: boolean
  onSettings?: () => void
  onOpenGuide?: () => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '主页' },
  { key: 'resources', icon: Library, label: '资源' },
  { key: 'memory', icon: Brain, label: '记忆' },
  { key: 'agents', icon: Bot, label: 'Agent' },
  { key: 'obsidian', icon: FolderOpen, label: '本地文档' },
]

/** 最左侧细轨（无边框，融入底色）：主页时展开加宽（图标在文字前横排），离开主页变窄（图标在上、文字在下） */
export default function ActivityBar({ view, onChange, expanded, onSettings, onOpenGuide }: Props) {
  const renderBtn = (key: ViewKey, Icon: any, label: string, active: boolean) => (
    expanded ? (
      <button
        key={key}
        onClick={() => onChange(key)}
        title={label}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
          active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
        }`}
      >
        <Icon size={17} strokeWidth={active ? 2 : 1.6} />
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
        <Icon size={20} strokeWidth={active ? 2 : 1.6} />
        <span className="text-[9px] leading-none">{label}</span>
      </button>
    )
  )
  return (
    <nav className={`h-full flex-shrink-0 flex flex-col transition-all duration-300 ${expanded ? 'w-44 px-2.5 py-4 items-stretch' : 'w-[64px] py-3 items-center'}`}>
      {ITEMS.slice(0, 2).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
      <div className={`bg-[#e5e5e5] my-1 ${expanded ? 'w-full h-px' : 'w-px h-3'}`} />
      {ITEMS.slice(2).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
      <div className="flex-1" />
      {/* 底部：使用引导 挨着 设置（竖向并列：使用引导在上、设置在下） */}
      {expanded ? (
        <div className="flex flex-col gap-1.5">
          <button onClick={onOpenGuide} title="使用引导"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl icon-btn transition-all">
            <HelpCircle size={16} strokeWidth={1.6} />
            <span className="text-[11px] leading-none">使用引导</span>
          </button>
          <button onClick={onSettings} title="设置" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl icon-btn transition-all">
            <Settings size={16} strokeWidth={1.6} />
            <span className="text-[11px] leading-none">设置</span>
          </button>
        </div>
      ) : (
        <>
          <button onClick={onOpenGuide} title="使用引导" className="w-14 mb-1.5 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all">
            <HelpCircle size={18} strokeWidth={1.6} />
            <span className="text-[8px] leading-none">引导</span>
          </button>
          <button onClick={onSettings} title="设置" className="w-14 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl icon-btn transition-all">
            <Settings size={18} strokeWidth={1.6} />
            <span className="text-[8px] leading-none">设置</span>
          </button>
        </>
      )}
    </nav>
  )
}
