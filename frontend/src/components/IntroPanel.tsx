import { GraduationCap, X } from 'lucide-react'

interface Props {
  onClose: () => void
}

/** 首次进入系统自动弹出的项目介绍面板：从左侧教程按钮方向张开，约占界面 60% */
export default function IntroPanel({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-start" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {/* 半透明遮罩（右侧区域，点击关闭） */}
      <div className="absolute inset-0 bg-black/20" />
      {/* 面板：贴左张开，占屏 60%，左侧留出 ActivityBar 的视觉连接 */}
      <div
        className="relative h-full bg-[#ffffff] border-r border-[#e5e5e5] shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '60%', marginLeft: 48, animation: 'introSlideIn 0.25s ease' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 来源指示：表明此面板由教程按钮弹出 */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#e5e5e5] bg-[#f5f5f5]">
          <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f0f0f0] text-[#1a1a1a]">
            <GraduationCap size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">项目介绍与基础教程</p>
            <p className="text-[10px] text-gray-400">来自左侧「教程与设计思想」，之后可随时点击该图标查看完整版</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#ededed] text-gray-400 hover:text-[#1a1a1a]" title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-xl flex flex-col gap-6">
            <section>
              <h3 className="text-base font-bold mb-2">项目基础介绍</h3>
              <div className="border border-dashed border-[#d0d0d0] rounded-xl px-4 py-6 text-center">
                <p className="text-xs text-gray-400">（待补充：CoAgent-Learn 是什么、解决什么问题、多智能体协同学习的一句话介绍）</p>
              </div>
            </section>
            <section>
              <h3 className="text-base font-bold mb-2">基础使用教程</h3>
              <div className="flex flex-col gap-2">
                {['配置 API Key', '新建项目', '输入问题', '查看生成物'].map((t, i) => (
                  <div key={t} className="flex items-center gap-4 px-4 py-3 bg-[#fafafa] border border-[#e5e5e5] rounded-xl">
                    <span className="text-lg font-bold text-gray-300 w-8 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t}</p>
                      <p className="text-xs text-gray-400 mt-0.5">（待补充：一句话说明）</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        <div className="px-8 py-4 border-t border-[#e5e5e5] flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-lg hover:bg-[#333333] transition-colors">
            开始使用
          </button>
        </div>
      </div>
      <style>{`@keyframes introSlideIn { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  )
}
