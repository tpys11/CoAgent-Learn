import { useState, useEffect } from 'react'
import { X, Sun, Moon, Monitor, Type, Key, LampDesk } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../theme'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('coagent-fontSize') || '15'))
  const [theme, setTheme] = useState<ThemePref>(() => getThemePref())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
    localStorage.setItem('coagent-fontSize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    setThemePref(theme)
  }, [theme])


  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-md mx-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad4cd]">
          <h2 className="font-display text-lg">设置</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* 字体大小 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Type size={14} /> 字体大小
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">12</span>
              <input
                type="range" min="12" max="20" value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 accent-[#1a1a1a]"
              />
              <span className="text-xs text-gray-400">20</span>
              <span className="text-xs font-semibold text-[#1a1a1a] w-8 text-right">{fontSize}px</span>
            </div>
          </div>

          {/* 主题 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">页面主题</label>
            <div className="flex gap-2">
              {[
                { value: 'light', icon: Sun, swatch: 'bg-white border border-gray-300', iconColor: 'text-gray-700' },
                { value: 'dark', icon: Moon, swatch: 'bg-gray-900 border border-gray-700', iconColor: 'text-gray-200' },
                { value: 'warm', icon: LampDesk, swatch: 'bg-[#fdf3e3] border border-amber-200', iconColor: 'text-amber-700' },
                { value: 'system', icon: Monitor, swatch: 'bg-gradient-to-r from-white via-gray-400 to-gray-900 border border-gray-300', iconColor: 'text-gray-700' },
              ].map(({ value, icon: Icon, swatch, iconColor }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value as ThemePref)}
                  title={value}
                  className={`flex-1 flex items-center justify-center aspect-[4/3] rounded-xl transition-all ${swatch} ${
                    theme === value
                      ? 'ring-2 ring-[#1a1a1a]/50 shadow-sm'
                      : 'hover:brightness-95'
                  }`}
                >
                  <Icon size={18} strokeWidth={theme === value ? 2.2 : 1.8} className={iconColor} />
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export function ApiKeyPrompt({ onClose }: { onClose: () => void }) {
  const [key, setKey] = useState('')

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('coagent-apikey', key.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-md mx-4 p-6">
        <h2 className="font-display text-lg mb-2">配置 API Key</h2>
        <p className="text-sm text-gray-500 mb-4">请输入 DeepSeek API Key 以启用 Agent 功能。后续可在设置中修改。</p>
        <input
          autoFocus
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="sk-..."
          className="w-full px-3 py-2.5 border border-[#c4beb6] rounded-lg text-sm outline-none focus:border-[#1a1a1a] mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">跳过</button>
          <button onClick={handleSave} className="px-4 py-2 bg-[#1a1a1a] text-white text-sm font-semibold rounded-lg hover:bg-[#333333]">确认</button>
        </div>
      </div>
    </div>
  )
}
