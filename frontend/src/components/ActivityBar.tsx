import { MessageSquare, Library, Brain, Bot, FolderOpen, Settings, GraduationCap } from 'lucide-react'

export type ViewKey = 'chat' | 'tutorial' | 'resources' | 'memory' | 'knowledge' | 'agents' | 'obsidian'

interface Props {
  view: ViewKey
  onChange: (v: ViewKey) => void
  expanded?: boolean
  onSettings?: () => void
}

const ITEMS: Array<{ key: ViewKey; icon: any; label: string }> = [
  { key: 'chat', icon: MessageSquare, label: '主页' },
  { key: 'resources', icon: Library, label: '资源' },
  { key: 'memory', icon: Brain, label: '记忆' },
  { key: 'agents', icon: Bot, label: 'Agent' },
  { key: 'obsidian', icon: FolderOpen, label: '本地文档' },
]

// 分组（参考 deeptutor 侧栏：分组小字大写标签 + 图标导航项，无分隔线）
const GROUP_LEARN: ViewKey[] = ['chat', 'resources', 'memory']
const GROUP_TOOLS: ViewKey[] = ['agents', 'obsidian']

/** 左侧导航栏（参考 deeptutor dashboard 侧栏：w-64=256px、分组小字标签、图标+文字导航项）。
 * 主页时展开加宽（deeptutor 式横排），离开主页变窄（图标在上、文字在下）。 */
export default function ActivityBar({ view, onChange, expanded, onSettings }: Props) {
  const renderBtn = (key: ViewKey, Icon: any, label: string, active: boolean) => (
    expanded ? (
      <button
        key={key}
        onClick={() => onChange(key)}
        title={label}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          active ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
        }`}
      >
        <Icon size={16} strokeWidth={active ? 2 : 1.6} />
        <span className="leading-none">{label}</span>
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
    <nav className={`h-full flex-shrink-0 flex flex-col transition-all duration-300 ${expanded ? 'w-64 px-2.5 py-4 items-stretch' : 'w-[64px] py-3 items-center'}`}>
      {expanded ? (
        <>
          <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wider text-dim">学习</p>
          {ITEMS.filter(i => GROUP_LEARN.includes(i.key)).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
          <p className="px-3 mb-2 mt-4 text-xs font-medium uppercase tracking-wider text-dim">工具</p>
          {ITEMS.filter(i => GROUP_TOOLS.includes(i.key)).map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
        </>
      ) : (
        ITEMS.map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))
      )}
      <div className="flex-1" />
      {/* 底部：使用引导（原教程界面，仅改名）挨着 设置（竖向并列） */}
      {expanded ? (
        <div className="flex flex-col gap-1.5">
          <button onClick={() => onChange('tutorial')} title="使用引导"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'tutorial' ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
            <GraduationCap size={16} strokeWidth={1.6} />
            <span className="leading-none">使用引导</span>
          </button>
          <button onClick={onSettings} title="设置"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-dim transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <Settings size={16} strokeWidth={1.6} />
            <span className="leading-none">设置</span>
          </button>
        </div>
      ) : (
        <>
          <button onClick={() => onChange('tutorial')} title="使用引导"
            className={`w-14 mb-1.5 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all ${view === 'tutorial' ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'}`}>
            <GraduationCap size={18} strokeWidth={1.6} />
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
