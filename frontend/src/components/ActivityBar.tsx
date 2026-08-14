import { MessageSquare, Library, Brain, Bot, FolderOpen, Settings, GraduationCap, Github } from 'lucide-react'

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

/** 左侧导航栏（参考 deeptutor dashboard 侧栏：w-64=256px、分组小字标签、图标+文字导航项）。
 * 主页时展开加宽（deeptutor 式横排），离开主页变窄（图标在上、文字在下）。 */
export default function ActivityBar({ view, onChange, expanded, onSettings }: Props) {
  const renderBtn = (key: ViewKey, Icon: any, label: string, active: boolean) => (
    expanded ? (
      <button
        key={key}
        onClick={() => onChange(key)}
        title={label}
        className={`w-full h-9 mb-2 flex items-center gap-3 px-3 rounded-md text-sm font-medium transition-colors ${
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
        className={`w-full h-9 mb-2 px-3 flex items-center gap-2 rounded-md text-[11px] transition-colors ${
          active ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'
        }`}
      >
        <Icon size={16} strokeWidth={active ? 2 : 1.6} />
        <span className="leading-none truncate">{label}</span>
      </button>
    )
  )
  return (
    <nav className={`h-full flex-shrink-0 flex flex-col transition-all duration-300 ${expanded ? 'w-64 py-4 items-stretch' : 'w-[104px] py-4 items-stretch'}`}>
      {/* 顶部品牌区（两态等高 h-[80px]+mb-2，保证按钮起始 y 锚定） */}
      {expanded ? (
        <div className="h-[80px] px-6 pt-2 mb-2 border-b hairline flex flex-col gap-2">
          <span className="font-display text-[20px] tracking-wide select-none">CoAgent-Learn</span>
          <a href="https://github.com/tpys11/CoAgent-Learn" target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-xs text-dim hover:text-[var(--text)] transition-colors w-fit"
            title="GitHub: tpys11/CoAgent-Learn">
            <Github size={14} /> GitHub 仓库
          </a>
        </div>
      ) : (
        <div className="h-[80px] px-3 pt-4 mb-2 flex justify-start">
          <span className="font-display text-sm tracking-wide text-dim select-none">CA</span>
        </div>
      )}
      {ITEMS.map(({ key, icon, label }) => renderBtn(key, icon, label, view === key))}
      <div className="flex-1" />
      {/* 底部：使用引导（原教程界面，仅改名）挨着 设置（竖向并列） */}
      {expanded ? (
        <div className="flex flex-col gap-1.5">
          <button onClick={() => onChange('tutorial')} title="使用引导"
            className={`w-full h-9 flex items-center gap-3 px-3 rounded-md text-sm font-medium transition-colors ${view === 'tutorial' ? 'bg-[#1a1a1a] text-white' : 'text-dim hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}>
            <GraduationCap size={16} strokeWidth={1.6} />
            <span className="leading-none">使用引导</span>
          </button>
          <button onClick={onSettings} title="设置"
            className="w-full h-9 flex items-center gap-3 px-3 rounded-md text-sm font-medium text-dim transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]">
            <Settings size={16} strokeWidth={1.6} />
            <span className="leading-none">设置</span>
          </button>
        </div>
      ) : (
        <>
          <button onClick={() => onChange('tutorial')} title="使用引导"
            className={`w-full h-9 mb-2 px-3 flex items-center gap-2 rounded-md text-[11px] transition-colors ${view === 'tutorial' ? 'panel text-[#1a1a1a] shadow-soft' : 'icon-btn'}`}>
            <GraduationCap size={16} strokeWidth={1.6} />
            <span className="leading-none">引导</span>
          </button>
          <button onClick={onSettings} title="设置" className="w-full h-9 px-3 flex items-center gap-2 rounded-md text-[11px] icon-btn transition-colors">
            <Settings size={16} strokeWidth={1.6} />
            <span className="leading-none">设置</span>
          </button>
        </>
      )}
    </nav>
  )
}
